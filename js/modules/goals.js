// Maqsadlar interfeysi: ro'yxat (holat va muddat turi filtri), forma, tafsilot (bosqichlar, progress, holat), o'chirish tasdig'i va "Bekor qilish".
// Ma'lumot faqat goals-store orqali. Qulflanganda xotira, toast va bekor qilish buferi tozalanadi.
import * as lock from '../lock.js';
import * as S from './goals-store.js';
import * as K from './goals-core.js';
import { localParts, fmtDateUz } from './dates.js';
import { icon, esc, emptyState, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const $ = UI.$;
const st = { filter: 'active', term: 'all', data: null, undo: null, token: 0, main: null, off: null };
const nowMs = () => Date.now();
const allowed = () => lock.canAccessPersonalPages();
const goto = (h) => { location.hash = h; };
const FILTERS = K.STATUSES.map((s) => [s, K.STATUS_LABEL[s]]);

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.data = null; st.undo = null; st.main = null; st.filter = 'active'; st.term = 'all'; toaster.clear();
  if (st.off) { st.off(); st.off = null; } S.stopSync();
  document.body.classList.remove('t-form');
}
let hooked = false;
export function startGoals() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); }
  if (st.off) st.off(); st.off = S.subscribe(scheduleRefresh);
}
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: /^#\/maqsadlar(\/|\?|$)/, blockClass: 't-form', render: (main) => mountGoals(main, true) }), scheduleRefresh = refresher.schedule;
const toaster = UI.createToaster({ getMain: () => st.main, onExpire: () => { st.undo = null; } }), toast = toaster.toast, attachToast = toaster.attach;
const confirmDialog = (main, opts) => UI.confirmDialog(main, opts, () => { if (refresher.dirty) scheduleRefresh(); });
const setHeader = (title, back) => UI.setHeader(title, back);

// ---------- Kirish nuqtasi ----------
export async function mountGoals(main, silent = false) {
  st.main = main; const token = ++st.token; let route; try { route = K.parseGoalsHash(location.hash); } catch (_) { route = { screen: 'list' }; }
  const form = route.screen === 'new' || route.screen === 'edit'; document.body.classList.toggle('t-form', form); if (!silent) main.innerHTML = loadingState();
  try {
    const all = await S.loadAll(); if (token !== st.token || !allowed()) return;
    refresher.dirty = false;
    if (!main.__goalsFocus) { main.__goalsFocus = true; main.addEventListener('focusout', () => { if (refresher.dirty) setTimeout(scheduleRefresh, 700); }); }
    st.data = all; ({ list: renderList, new: renderForm, edit: renderForm, detail: renderDetail })[route.screen](main, route); attachToast(); if (!silent) window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}
const refreshAfter = (main, fn, btn) => async () => { if (btn) btn.disabled = true; try { await fn(); mountGoals(main, true); } catch (e) { toast(`Xatolik: ${e.message}`); if (btn) btn.disabled = false; } };

const bar = (pr, label) => (pr.percent === null ? '' : `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.percent}"><i style="width:${pr.percent}%"></i></div>`);
function deadlineText(d, goal, T) {
  if (!goal.deadline) return '';
  const when = fmtDateUz(goal.deadline, T).toLowerCase();
  return d.state === 'overdue' ? `<span class="bad">muddati o'tgan: ${esc(when)}</span>` : d.state === 'today' ? '<span class="bad">muddat: bugun</span>' : d.state === 'soon' ? `muddat: ${esc(when)} (${d.days} kun qoldi)` : `muddat: ${esc(when)}`;
}

// ---------- Ro'yxat ----------
function renderList(main) {
  setHeader('Maqsadlar'); const { goals, milestones } = st.data, T = localParts(nowMs()).date, sm = K.summary(goals, milestones, T);
  const shown = K.sortGoals(goals.filter((g) => g.status === st.filter && (st.term === 'all' || g.term === st.term)));
  const row = (g) => { const x = sm.per.get(g.id), pr = x.progress, meta = [K.TERMS.find((t) => t.id === g.term).name, pr.total ? `${pr.done}/${pr.total} bosqich` : "bosqichlar yo'q", deadlineText(x.deadline, g, T)].filter(Boolean).join(' · ');
    return `<li class="t-row p-row" data-id="${g.id}"><a class="t-main" href="#/maqsadlar/${g.id}"><span class="t-title">${esc(g.title)}</span><span class="t-meta">${meta}</span>${bar(pr, `${g.title}: progress`)}</a></li>`; };
  const emptyFor = { active: ["Faol maqsad yo'q", "Yangi maqsad qo'shing yoki boshqa holatdagilarini ko'ring."], paused: ["Pauzadagi maqsad yo'q", "Vaqtincha to'xtatilgan maqsadlar shu yerda ko'rinadi."], done: ["Erishilgan maqsad yo'q", "Erishgan maqsadlaringiz shu yerda saqlanadi."] }[st.filter];
  const body = goals.length === 0 ? emptyState("Maqsadlar hali yo'q", "Birinchi maqsadingizni qo'shing: u shifrlangan holda faqat shu qurilmada saqlanadi.")
    : !shown.length ? emptyState(...(st.term === 'all' ? emptyFor : ["Bu muddatda maqsad yo'q", "Boshqa muddat yoki holatni tanlab ko'ring."]))
    : st.term === 'all' ? K.groupByTerm(shown).map((g) => `<h3 class="j-day">${esc(g.name)}</h3><ul class="t-list">${g.items.map(row).join('')}</ul>`).join('') : `<ul class="t-list">${shown.map(row).join('')}</ul>`;
  main.innerHTML = `<section class="t-stats" aria-label="Maqsadlar holati"><div class="stat"><b id="g-active">${sm.count.active}</b><span>Faol</span></div><div class="stat"><b id="g-paused">${sm.count.paused}</b><span>Pauzada</span></div><div class="stat"><b id="g-done">${sm.count.done}</b><span>Erishilgan</span></div><div class="stat"><b id="g-overdue"${sm.overdue ? ' class="bad"' : ''}>${sm.overdue}</b><span>Muddati o'tgan</span></div></section>
    <div class="chips" role="group" aria-label="Holat filtri">${FILTERS.map(([f, l]) => `<button type="button" class="chip${f === st.filter ? ' on' : ''}" data-f="${f}" aria-pressed="${f === st.filter}">${l}${sm.count[f] ? ` (${sm.count[f]})` : ''}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Muddat filtri"><button type="button" class="chip${st.term === 'all' ? ' on' : ''}" data-t="all" aria-pressed="${st.term === 'all'}">Barchasi</button>${K.TERMS.map((t) => `<button type="button" class="chip${st.term === t.id ? ' on' : ''}" data-t="${t.id}" aria-pressed="${st.term === t.id}">${esc(t.name)}</button>`).join('')}</div>
    <div id="g-list">${body}</div>
    <a class="fab" id="g-new" href="#/maqsadlar/yangi">${icon('plus', 20)}<span>Yangi maqsad</span></a>`;
  main.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { st.filter = b.dataset.f; renderList(main); }; });
  main.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { st.term = b.dataset.t; renderList(main); }; });
}

// ---------- Forma ----------
function renderForm(main, route) {
  const editing = route.screen === 'edit', cur = editing ? st.data.goals.find((g) => g.id === route.id) : null;
  if (editing && !cur) { setHeader('Maqsad', '#/maqsadlar'); main.innerHTML = emptyState('Maqsad topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const v = cur || { title: '', description: '', why: '', term: K.DEFAULT_TERM, status: K.DEFAULT_STATUS, deadline: '' };
  setHeader(editing ? 'Maqsadni tahrirlash' : 'Yangi maqsad', editing ? `#/maqsadlar/${cur.id}` : '#/maqsadlar');
  const err = (f) => `<p class="err" id="e-${f}" role="alert"></p>`;
  main.innerHTML = `<form id="g-form" class="t-form" novalidate>
    <label class="fld"><span>Maqsad nomi *</span><input id="f-title" name="title" type="text" maxlength="${K.LIMITS.title}" autocomplete="off" enterkeyhint="next" value="${esc(v.title)}">${err('title')}</label>
    <fieldset class="seg g-terms"><legend>Muddat turi</legend>${K.TERMS.map((t) => `<label class="seg-i"><input type="radio" name="term" value="${t.id}"${v.term === t.id ? ' checked' : ''}><span>${esc(t.name)}<small>${esc(t.hint)}</small></span></label>`).join('')}</fieldset>${err('term')}
    <label class="fld"><span>Nima uchun bu maqsad?</span><textarea id="f-why" name="why" rows="3" maxlength="${K.LIMITS.why}" autocomplete="off">${esc(v.why)}</textarea>${err('why')}<small>Qiyin paytda shu sabab motivatsiya beradi.</small></label>
    <label class="fld"><span>Tavsif</span><textarea id="f-description" name="description" rows="3" maxlength="${K.LIMITS.description}" autocomplete="off">${esc(v.description)}</textarea>${err('description')}</label>
    <div class="two"><label class="fld"><span>Holat</span><select id="f-status" name="status">${K.STATUSES.map((s) => `<option value="${s}"${v.status === s ? ' selected' : ''}>${K.STATUS_LABEL[s]}</option>`).join('')}</select>${err('status')}</label>
    <label class="fld"><span>Muddat</span><input id="f-deadline" name="deadline" type="date" value="${esc(v.deadline || '')}">${err('deadline')}</label></div>
    <p class="err" id="e-form" role="alert"></p><button class="btn" id="f-save" type="submit">Saqlash</button><a class="btn btn-2" href="${editing ? `#/maqsadlar/${cur.id}` : '#/maqsadlar'}">Bekor qilish</a></form>`;
  const form = $('#g-form', main);
  form.addEventListener('focusin', (e) => { const t = e.target; setTimeout(() => { if (t.isConnected && t.scrollIntoView) t.scrollIntoView({ block: 'center' }); }, 250); });
  form.onsubmit = async (ev) => {
    ev.preventDefault(); main.querySelectorAll('.err').forEach((e) => { e.textContent = ''; }); main.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    const input = Object.fromEntries(new FormData(form).entries()), res = K.validateGoal(input);
    const show = (errors) => { const keys = Object.keys(errors); keys.forEach((k) => { const e = $(`#e-${k}`, main); if (e) e.textContent = errors[k]; const f = $(`#f-${k}`, main); if (f) f.setAttribute('aria-invalid', 'true'); }); const first = keys.map((k) => $(`#f-${k}`, main)).find(Boolean); if (first) first.focus(); };
    if (!res.ok) return show(res.errors);
    const btn = $('#f-save', main); btn.disabled = true; btn.textContent = 'Saqlanmoqda…';
    try { if (editing) { await S.updateGoal(cur.id, input); goto(`#/maqsadlar/${cur.id}`); } else { const g = await S.createGoal(input); goto(`#/maqsadlar/${g.id}`); } }
    catch (e) { btn.disabled = false; btn.textContent = 'Saqlash'; if (e.name === 'ValidationError') show(e.errors); else $('#e-form', main).textContent = `Saqlab bo'lmadi: ${e.message}`; }
  };
}

// ---------- Tafsilot ----------
function renderDetail(main, route) {
  const { goals, milestones: byGoal } = st.data, T = localParts(nowMs()).date, g = goals.find((x) => x.id === route.id), kv = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
  setHeader('Maqsad', '#/maqsadlar'); if (!g) { main.innerHTML = emptyState('Maqsad topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const items = byGoal.get(g.id) || [], pr = K.progress(items), dl = K.deadlineInfo(g, T), done = g.status === 'done';
  const msRow = (m) => `<li class="t-row${m.done ? ' done' : ''}" data-ms="${m.id}"><button class="t-check" type="button" aria-pressed="${m.done}" aria-label="${esc(m.title)}: ${m.done ? 'bajarilgan belgisini olib tashlash' : 'bajarildi deb belgilash'}" data-ms-toggle="${m.id}">${m.done ? icon('check', 18) : ''}</button><span class="t-main"><span class="t-title">${esc(m.title)}</span></span><button class="btn-link-sm danger" type="button" data-ms-del="${m.id}" aria-label="Bosqichni o'chirish: ${esc(m.title)}">${icon('trash', 18)}</button></li>`;
  const left = dl.state === 'soon' ? ` (${dl.days} kun qoldi)` : dl.state === 'today' ? ' (bugun)' : '';
  main.innerHTML = `<article class="card t-detail"><h2 id="d-title">${esc(g.title)}</h2><p class="badge ${done ? 'ok' : dl.state === 'overdue' ? 'bad' : ''}" id="d-status">${K.STATUS_LABEL[g.status]}${dl.state === 'overdue' ? " · muddati o'tgan" : ''}</p>
    <dl class="kv wide">${kv('Muddat turi', `<span id="d-term">${esc(K.TERM_LABEL[g.term])}</span>`)}${g.deadline ? kv('Muddat', `${esc(fmtDateUz(g.deadline, T))} (${esc(g.deadline)})${esc(left)}`) : ''}${g.completedAt ? kv('Erishilgan', esc(localParts(g.completedAt).date)) : ''}${kv('Bosqichlar', pr.total ? `<span id="d-count">${pr.done}/${pr.total}</span>` : "yo'q")}</dl>
    ${g.why ? `<h3 class="g-sub">Nima uchun?</h3><p class="t-desc" id="d-why">${esc(g.why)}</p>` : ''}${g.description ? `<p class="t-desc" id="d-desc">${esc(g.description)}</p>` : ''}</article>
  <section class="card" id="d-steps"><h2>Bosqichlar</h2>${pr.total ? `${bar(pr, 'Maqsad progressi')}<p class="muted" id="d-prog">Bajarildi: ${pr.done}/${pr.total} (${pr.percent}%)</p>` : ''}
    ${items.length ? `<ul class="t-list" id="d-steplist">${items.map(msRow).join('')}</ul>` : '<p class="muted" id="d-nosteps">Hozircha bosqich yo\'q. Maqsadni oraliq natijalarga bo\'ling: progress shundan hisoblanadi.</p>'}
    <form id="g-step-form" class="c-add" novalidate><label class="fld"><span class="sr">Yangi bosqich nomi</span><input id="f-step" name="step" type="text" placeholder="Yangi bosqich…" maxlength="${K.LIMITS.step}" autocomplete="off" enterkeyhint="done"></label><p class="err" id="e-step" role="alert"></p><button class="btn btn-2" id="d-addstep" type="submit">${icon('plus', 18)}Bosqich qo'shish</button></form></section>
  <section class="card"><h2>Holat</h2><div class="chips" role="group" aria-label="Holatni o'zgartirish">${K.STATUSES.map((s) => `<button type="button" class="chip${g.status === s ? ' on' : ''}" data-status="${s}" aria-pressed="${g.status === s}">${K.STATUS_LABEL[s]}</button>`).join('')}</div></section>
  <a class="btn btn-2" id="d-edit" href="#/maqsadlar/${g.id}/tahrir">Tahrirlash</a><button class="btn btn-danger-o" id="d-del" type="button">O'chirish</button>`;
  main.querySelectorAll('[data-ms-toggle]').forEach((b) => { b.onclick = refreshAfter(main, () => S.setMilestoneDone(b.dataset.msToggle, b.getAttribute('aria-pressed') !== 'true'), b); });
  main.querySelectorAll('[data-ms-del]').forEach((b) => { b.onclick = async () => { try { const undo = await S.removeMilestone(b.dataset.msDel); st.undo = undo; toast("Bosqich o'chirildi", async () => { await S.restoreMilestone(undo); st.undo = null; }); mountGoals(main, true); } catch (er) { toast(`O'chirib bo'lmadi: ${er.message}`); } }; });
  main.querySelectorAll('[data-status]').forEach((b) => { if (b.dataset.status !== g.status) b.onclick = refreshAfter(main, () => S.setStatus(g.id, b.dataset.status), b); });
  const sf = $('#g-step-form', main); sf.onsubmit = async (ev) => {
    ev.preventDefault(); const input = $('#f-step', main), e = $('#e-step', main), v = K.validateMilestone(input.value); e.textContent = ''; input.removeAttribute('aria-invalid');
    if (!v.ok) { e.textContent = v.error; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    const btn = $('#d-addstep', main); btn.disabled = true;
    try { await S.addMilestone(g.id, v.value); await mountGoals(main, true); const n = $('#f-step', main); if (n) n.focus(); } catch (er) { btn.disabled = false; e.textContent = er.name === 'ValidationError' ? er.message : `Saqlab bo'lmadi: ${er.message}`; }
  };
  $('#d-del', main).onclick = async () => {
    if (!(await confirmDialog(main, { title: "Maqsad o'chirilsinmi?", text: `"${g.title}" va uning barcha bosqichlari o'chiriladi. Saqlab qolmoqchi bo'lsangiz, holatini "Pauzada" yoki "Erishilgan" qiling.`, ok: "O'chirish" }))) return;
    try { const undo = await S.deleteGoal(g.id); st.undo = undo; toast("Maqsad o'chirildi", async () => { await S.restoreGoal(undo); st.undo = null; }); goto('#/maqsadlar'); } catch (er) { toast(`O'chirib bo'lmadi: ${er.message}`); }
  };
}
