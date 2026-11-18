// Loyihalar interfeysi: ro'yxat (holat filtri), forma, tafsilot (qadamlar, progress, holat), o'chirish tasdig'i va "Bekor qilish".
// Ma'lumot faqat projects-store orqali. Qulflanganda xotira, toast va bekor qilish buferi tozalanadi.
import * as lock from '../lock.js';
import * as S from './projects-store.js';
import * as K from './projects-core.js';
import { localParts, fmtDateUz } from './dates.js';
import { icon, esc, emptyState, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const $ = UI.$;
const st = { filter: 'active', data: null, undo: null, token: 0, main: null, off: null };
const nowMs = () => Date.now();
const allowed = () => lock.canAccessPersonalPages();
const goto = (h) => { location.hash = h; };
const FILTERS = [['active', 'Faol'], ['waiting', 'Kutilmoqda'], ['done', 'Yakunlangan']];

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.data = null; st.undo = null; st.main = null; st.filter = 'active'; toaster.clear();
  if (st.off) { st.off(); st.off = null; } S.stopSync();
  document.body.classList.remove('t-form');
}
let hooked = false;
export function startProjects() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); }
  if (st.off) st.off(); st.off = S.subscribe(scheduleRefresh);
}
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: /^#\/loyihalar(\/|\?|$)/, blockClass: 't-form', render: (main) => mountProjects(main, true) }), scheduleRefresh = refresher.schedule;
const toaster = UI.createToaster({ getMain: () => st.main, onExpire: () => { st.undo = null; } }), toast = toaster.toast, attachToast = toaster.attach;
const confirmDialog = (main, opts) => UI.confirmDialog(main, opts, () => { if (refresher.dirty) scheduleRefresh(); });
const setHeader = (title, back) => UI.setHeader(title, back);

// ---------- Kirish nuqtasi ----------
export async function mountProjects(main, silent = false) {
  st.main = main; const token = ++st.token; let route; try { route = K.parseProjectsHash(location.hash); } catch (_) { route = { screen: 'list' }; }
  const form = route.screen === 'new' || route.screen === 'edit'; document.body.classList.toggle('t-form', form); if (!silent) main.innerHTML = loadingState();
  try {
    const all = await S.loadAll(); if (token !== st.token || !allowed()) return;
    refresher.dirty = false;
    if (!main.__projectsFocus) { main.__projectsFocus = true; main.addEventListener('focusout', () => { if (refresher.dirty) setTimeout(scheduleRefresh, 700); }); }
    st.data = all; ({ list: renderList, new: renderForm, edit: renderForm, detail: renderDetail })[route.screen](main, route); attachToast(); if (!silent) window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}
const refreshAfter = (main, fn, btn) => async () => { if (btn) btn.disabled = true; try { await fn(); mountProjects(main, true); } catch (e) { toast(`Xatolik: ${e.message}`); if (btn) btn.disabled = false; } };

const bar = (pr, label) => (pr.percent === null ? '' : `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.percent}"><i style="width:${pr.percent}%"></i></div>`);
function deadlineText(d, project, T) {
  if (!project.deadline) return '';
  const when = fmtDateUz(project.deadline, T).toLowerCase();
  return d.state === 'overdue' ? `<span class="bad">muddati o'tgan: ${esc(when)}</span>` : d.state === 'today' ? '<span class="bad">muddat: bugun</span>' : `muddat: ${esc(when)}`;
}

// ---------- Ro'yxat ----------
function renderList(main) {
  setHeader('Loyihalar', '#/boshqalar'); const { projects, steps } = st.data, T = localParts(nowMs()).date, sm = K.summary(projects, steps, T);
  const rows = K.sortProjects(projects.filter((p) => p.status === st.filter));
  const row = (p) => { const x = sm.per.get(p.id), pr = x.progress, meta = [pr.total ? `${pr.done}/${pr.total} qadam` : 'Qadamlar yo\'q', deadlineText(x.deadline, p, T)].filter(Boolean).join(' · ');
    return `<li class="t-row p-row" data-id="${p.id}"><a class="t-main" href="#/loyihalar/${p.id}"><span class="t-title">${esc(p.title)}</span><span class="t-meta">${meta}</span>${bar(pr, `${p.title}: progress`)}</a></li>`; };
  const emptyFor = { active: ["Faol loyiha yo'q", "Yangi loyiha qo'shing yoki boshqa holatdagilarini ko'ring."], waiting: ["Kutilayotgan loyiha yo'q", "Pauzaga qo'yilgan loyihalar shu yerda ko'rinadi."], done: ["Yakunlangan loyiha yo'q", "Tugatilgan loyihalar shu yerda saqlanadi."] }[st.filter];
  main.innerHTML = `<section class="t-stats" aria-label="Loyihalar holati"><div class="stat"><b id="p-active">${sm.count.active}</b><span>Faol</span></div><div class="stat"><b id="p-waiting">${sm.count.waiting}</b><span>Kutilmoqda</span></div><div class="stat"><b id="p-done">${sm.count.done}</b><span>Yakunlangan</span></div><div class="stat"><b id="p-overdue"${sm.overdue ? ' class="bad"' : ''}>${sm.overdue}</b><span>Muddati o'tgan</span></div></section>
    <div class="chips" role="group" aria-label="Holat filtri">${FILTERS.map(([f, l]) => `<button type="button" class="chip${f === st.filter ? ' on' : ''}" data-f="${f}" aria-pressed="${f === st.filter}">${l}${sm.count[f] ? ` (${sm.count[f]})` : ''}</button>`).join('')}</div>
    ${projects.length === 0 ? emptyState("Loyihalar hali yo'q", "Birinchi loyihangizni qo'shing: u shifrlangan holda faqat shu qurilmada saqlanadi.") : rows.length ? `<ul class="t-list" id="p-list">${rows.map(row).join('')}</ul>` : emptyState(...emptyFor)}
    <a class="fab" id="p-new" href="#/loyihalar/yangi">${icon('plus', 20)}<span>Yangi loyiha</span></a>`;
  main.querySelectorAll('.chip').forEach((b) => { b.onclick = () => { st.filter = b.dataset.f; renderList(main); }; });
}

// ---------- Forma ----------
function renderForm(main, route) {
  const editing = route.screen === 'edit', cur = editing ? st.data.projects.find((p) => p.id === route.id) : null;
  if (editing && !cur) { setHeader('Loyiha', '#/loyihalar'); main.innerHTML = emptyState('Loyiha topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const v = cur || { title: '', description: '', status: K.DEFAULT_STATUS, deadline: '' };
  setHeader(editing ? 'Loyihani tahrirlash' : 'Yangi loyiha', editing ? `#/loyihalar/${cur.id}` : '#/loyihalar');
  const err = (f) => `<p class="err" id="e-${f}" role="alert"></p>`;
  main.innerHTML = `<form id="p-form" class="t-form" novalidate>
    <label class="fld"><span>Loyiha nomi *</span><input id="f-title" name="title" type="text" maxlength="${K.LIMITS.title}" autocomplete="off" enterkeyhint="next" value="${esc(v.title)}">${err('title')}</label>
    <label class="fld"><span>Tavsif</span><textarea id="f-description" name="description" rows="4" maxlength="${K.LIMITS.description}" autocomplete="off">${esc(v.description)}</textarea>${err('description')}</label>
    <label class="fld"><span>Holat</span><select id="f-status" name="status">${K.STATUSES.map((s) => `<option value="${s}"${v.status === s ? ' selected' : ''}>${K.STATUS_LABEL[s]}</option>`).join('')}</select>${err('status')}</label>
    <label class="fld"><span>Muddat</span><input id="f-deadline" name="deadline" type="date" value="${esc(v.deadline || '')}">${err('deadline')}<small>Majburiy emas. Muddatsiz loyiha ro'yxatda oxirida turadi.</small></label>
    <p class="err" id="e-form" role="alert"></p><button class="btn" id="f-save" type="submit">Saqlash</button><a class="btn btn-2" href="${editing ? `#/loyihalar/${cur.id}` : '#/loyihalar'}">Bekor qilish</a></form>`;
  const form = $('#p-form', main);
  form.addEventListener('focusin', (e) => { const t = e.target; setTimeout(() => { if (t.isConnected && t.scrollIntoView) t.scrollIntoView({ block: 'center' }); }, 250); });
  form.onsubmit = async (ev) => {
    ev.preventDefault(); main.querySelectorAll('.err').forEach((e) => { e.textContent = ''; }); main.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    const input = Object.fromEntries(new FormData(form).entries()), res = K.validateProject(input);
    const show = (errors) => { const keys = Object.keys(errors); keys.forEach((k) => { const e = $(`#e-${k}`, main); if (e) e.textContent = errors[k]; const f = $(`#f-${k}`, main); if (f) f.setAttribute('aria-invalid', 'true'); }); const first = keys.map((k) => $(`#f-${k}`, main)).find(Boolean); if (first) first.focus(); };
    if (!res.ok) return show(res.errors);
    const btn = $('#f-save', main); btn.disabled = true; btn.textContent = 'Saqlanmoqda…';
    try { if (editing) { await S.updateProject(cur.id, input); goto(`#/loyihalar/${cur.id}`); } else { const p = await S.createProject(input); goto(`#/loyihalar/${p.id}`); } }
    catch (e) { btn.disabled = false; btn.textContent = 'Saqlash'; if (e.name === 'ValidationError') show(e.errors); else $('#e-form', main).textContent = `Saqlab bo'lmadi: ${e.message}`; }
  };
}

// ---------- Tafsilot ----------
function renderDetail(main, route) {
  const { projects, steps: byProject } = st.data, T = localParts(nowMs()).date, p = projects.find((x) => x.id === route.id), kv = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
  setHeader('Loyiha', '#/loyihalar'); if (!p) { main.innerHTML = emptyState('Loyiha topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const steps = byProject.get(p.id) || [], pr = K.progress(steps), dl = K.deadlineInfo(p, T), done = p.status === 'done';
  const stepRow = (s) => `<li class="t-row${s.done ? ' done' : ''}" data-step="${s.id}"><button class="t-check" type="button" aria-pressed="${s.done}" aria-label="${esc(s.title)}: ${s.done ? 'bajarilgan belgisini olib tashlash' : 'bajarildi deb belgilash'}" data-step-toggle="${s.id}">${s.done ? icon('check', 18) : ''}</button><span class="t-main"><span class="t-title">${esc(s.title)}</span></span><button class="btn-link-sm danger" type="button" data-step-del="${s.id}" aria-label="Qadamni o'chirish: ${esc(s.title)}">${icon('trash', 18)}</button></li>`;
  main.innerHTML = `<article class="card t-detail"><h2 id="d-title">${esc(p.title)}</h2><p class="badge ${done ? 'ok' : dl.state === 'overdue' ? 'bad' : ''}" id="d-status">${K.STATUS_LABEL[p.status]}${dl.state === 'overdue' ? " · muddati o'tgan" : ''}</p>
    <dl class="kv wide">${p.deadline ? kv('Muddat', `${esc(fmtDateUz(p.deadline, T))} (${esc(p.deadline)})`) : ''}${p.completedAt ? kv('Yakunlangan', esc(localParts(p.completedAt).date)) : ''}${kv('Qadamlar', pr.total ? `<span id="d-count">${pr.done}/${pr.total}</span>` : "yo'q")}</dl>
    ${p.description ? `<p class="t-desc" id="d-desc">${esc(p.description)}</p>` : ''}</article>
  <section class="card" id="d-steps"><h2>Qadamlar</h2>${pr.total ? `${bar(pr, 'Loyiha progressi')}<p class="muted" id="d-prog">Bajarildi: ${pr.done}/${pr.total} (${pr.percent}%)</p>` : ''}
    ${steps.length ? `<ul class="t-list" id="d-steplist">${steps.map(stepRow).join('')}</ul>` : '<p class="muted" id="d-nosteps">Hozircha qadam yo\'q. Loyihani kichik bosqichlarga bo\'lib, progressni kuzating.</p>'}
    <form id="p-step-form" class="c-add" novalidate><label class="fld"><span class="sr">Yangi qadam nomi</span><input id="f-step" name="step" type="text" placeholder="Yangi qadam…" maxlength="${K.LIMITS.step}" autocomplete="off" enterkeyhint="done"></label><p class="err" id="e-step" role="alert"></p><button class="btn btn-2" id="d-addstep" type="submit">${icon('plus', 18)}Qadam qo'shish</button></form></section>
  <section class="card"><h2>Holat</h2><div class="chips" role="group" aria-label="Holatni o'zgartirish">${K.STATUSES.map((s) => `<button type="button" class="chip${p.status === s ? ' on' : ''}" data-status="${s}" aria-pressed="${p.status === s}">${K.STATUS_LABEL[s]}</button>`).join('')}</div></section>
  <a class="btn btn-2" id="d-edit" href="#/loyihalar/${p.id}/tahrir">Tahrirlash</a><button class="btn btn-danger-o" id="d-del" type="button">O'chirish</button>`;
  main.querySelectorAll('[data-step-toggle]').forEach((b) => { b.onclick = refreshAfter(main, () => S.setStepDone(b.dataset.stepToggle, b.getAttribute('aria-pressed') !== 'true'), b); });
  main.querySelectorAll('[data-step-del]').forEach((b) => { b.onclick = async () => { try { const undo = await S.removeStep(b.dataset.stepDel); st.undo = undo; toast("Qadam o'chirildi", async () => { await S.restoreStep(undo); st.undo = null; }); mountProjects(main, true); } catch (er) { toast(`O'chirib bo'lmadi: ${er.message}`); } }; });
  main.querySelectorAll('[data-status]').forEach((b) => { if (b.dataset.status !== p.status) b.onclick = refreshAfter(main, () => S.setStatus(p.id, b.dataset.status), b); });
  const sf = $('#p-step-form', main); sf.onsubmit = async (ev) => {
    ev.preventDefault(); const input = $('#f-step', main), e = $('#e-step', main), v = K.validateStep(input.value); e.textContent = ''; input.removeAttribute('aria-invalid');
    if (!v.ok) { e.textContent = v.error; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    const btn = $('#d-addstep', main); btn.disabled = true;
    try { await S.addStep(p.id, v.value); await mountProjects(main, true); const n = $('#f-step', main); if (n) n.focus(); } catch (er) { btn.disabled = false; e.textContent = er.name === 'ValidationError' ? er.message : `Saqlab bo'lmadi: ${er.message}`; }
  };
  $('#d-del', main).onclick = async () => {
    if (!(await confirmDialog(main, { title: "Loyiha o'chirilsinmi?", text: `"${p.title}" va uning barcha qadamlari o'chiriladi. Saqlab qolmoqchi bo'lsangiz, holatini "Yakunlangan" yoki "Kutilmoqda" qiling.`, ok: "O'chirish" }))) return;
    try { const undo = await S.deleteProject(p.id); st.undo = undo; toast("Loyiha o'chirildi", async () => { await S.restoreProject(undo); st.undo = null; }); goto('#/loyihalar'); } catch (er) { toast(`O'chirib bo'lmadi: ${er.message}`); }
  };
}
