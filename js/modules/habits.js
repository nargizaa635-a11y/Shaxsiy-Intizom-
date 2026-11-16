// Odatlar interfeysi: ro'yxat, forma, tafsilot (statistika va oylik kalendar), arxiv, o'chirish tasdig'i.
// Ma'lumot faqat habits-store orqali. Qulflanganda xotira, toast va bekor qilish buferi tozalanadi.
import * as lock from '../lock.js';
import * as S from './habits-store.js';
import * as K from './habits-core.js';
import { localParts, fmtDateUz } from './dates.js';
import { icon, esc, emptyState, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const $ = UI.$;
const st = { filter: 'all', data: null, undo: null, token: 0, main: null, off: null };
const nowMs = () => Date.now();
const allowed = () => lock.canAccessPersonalPages();
const goto = (h) => { location.hash = h; };
const FILTERS = [['all', 'Barchasi'], ['today', 'Bugun'], ['archived', 'Arxiv']];

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.data = null; st.undo = null; st.main = null; toaster.clear();
  if (st.off) { st.off(); st.off = null; } S.stopSync();
  document.body.classList.remove('t-form');
}
let hooked = false;
export function startHabits() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); }
  if (st.off) st.off(); st.off = S.subscribe(scheduleRefresh);
}
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: /^#\/odatlar(\/|\?|$)/, blockClass: 't-form', render: (main) => mountHabits(main, true) }), scheduleRefresh = refresher.schedule;
const toaster = UI.createToaster({ getMain: () => st.main, onExpire: () => { st.undo = null; } }), toast = toaster.toast, attachToast = toaster.attach;
const confirmDialog = (main, opts) => UI.confirmDialog(main, opts, () => { if (refresher.dirty) scheduleRefresh(); });
const setHeader = (title, back) => UI.setHeader(title, back);

// ---------- Kirish nuqtasi ----------
export async function mountHabits(main, silent = false) {
  st.main = main; const token = ++st.token; let route; try { route = K.parseHabitsHash(location.hash); } catch (_) { route = { screen: 'list' }; }
  const form = route.screen === 'new' || route.screen === 'edit'; document.body.classList.toggle('t-form', form); if (!silent) main.innerHTML = loadingState();
  try {
    const all = await S.loadAll(); if (token !== st.token || !allowed()) return;
    refresher.dirty = false;
    if (!main.__habitsFocus) { main.__habitsFocus = true; main.addEventListener('focusout', () => { if (refresher.dirty) setTimeout(scheduleRefresh, 700); }); }
    st.data = all; ({ list: renderList, new: renderForm, edit: renderForm, detail: renderDetail })[route.screen](main, route); attachToast(); if (!silent) window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}
const refreshAfter = (main, fn, btn) => async () => { if (btn) btn.disabled = true; try { await fn(); mountHabits(main, true); } catch (e) { toast(`Xatolik: ${e.message}`); if (btn) btn.disabled = false; } };

// ---------- Ro'yxat ----------
function renderList(main) {
  setHeader('Odatlar', '#/boshqalar'); const { habits, logs } = st.data, n = nowMs(), T = localParts(n).date, sm = K.summary(habits, logs, T);
  const archived = habits.filter((h) => h.status === 'archived'), active = habits.filter((h) => h.status === 'active');
  const stat = (h) => sm.per.get(h.id);
  let rows = st.filter === 'archived' ? archived : st.filter === 'today' ? active.filter((h) => stat(h).scheduledToday) : active;
  rows = [...rows].sort((a, b) => { const sa = st.filter === 'archived' ? null : stat(a), sb = st.filter === 'archived' ? null : stat(b); const ka = sa ? (sa.scheduledToday ? (sa.doneToday ? 1 : 0) : 2) : 0, kb = sb ? (sb.scheduledToday ? (sb.doneToday ? 1 : 0) : 2) : 0; return ka - kb || a.title.localeCompare(b.title); });
  const row = (h) => { const s = stat(h), arch = h.status === 'archived';
    const lead = !arch && s.scheduledToday ? `<button class="t-check" type="button" aria-pressed="${s.doneToday}" aria-label="${esc(h.title)}: ${s.doneToday ? 'bugungi belgini bekor qilish' : 'bugun bajarildi deb belgilash'}" data-id="${h.id}">${s.doneToday ? icon('check', 18) : ''}</button>` : '<span class="h-off" title="Bugun jadvalda yo\'q" aria-hidden="true">–</span>';
    const streak = !arch && s.current > 0 ? ` · ketma-ket ${s.current} kun` : '';
    return `<li class="t-row${!arch && s.doneToday ? ' done' : ''}" data-id="${h.id}">${lead}<a class="t-main" href="#/odatlar/${h.id}"><span class="t-title">${esc(h.title)}</span><span class="t-meta">${esc(K.scheduleText(h))} · ${esc(K.categoryName(h.categoryId))}${streak}</span></a></li>`; };
  const t = sm.today;
  main.innerHTML = `<section class="t-stats" aria-label="Odatlar holati"><div class="stat"><b id="h-today">${t.done}/${t.total}</b><span>Bugun</span></div><div class="stat"><b id="h-streak">${sm.bestCurrent}</b><span>Eng uzun joriy streak</span></div><div class="stat"><b id="h-rate">${sm.avgRate === null ? '—' : sm.avgRate + '%'}</b><span>${K.WINDOW_DAYS} kun</span></div><div class="stat"><b id="h-active">${active.length}</b><span>Faol</span></div></section>
    ${t.total ? `<div class="bar" role="progressbar" aria-label="Bugungi odatlar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.percent}"><i style="width:${t.percent}%"></i></div><p class="muted t-prog" id="h-prog">Bugun: ${t.done}/${t.total} bajarildi (${t.percent}%)</p>` : ''}
    <div class="chips" role="group" aria-label="Filtr">${FILTERS.map(([f, l]) => `<button type="button" class="chip${f === st.filter ? ' on' : ''}" data-f="${f}" aria-pressed="${f === st.filter}">${l}${f === 'archived' && archived.length ? ` (${archived.length})` : ''}</button>`).join('')}</div>
    ${habits.length === 0 ? emptyState("Odatlar hali yo'q", "Birinchi odatingizni qo'shing: u shifrlangan holda faqat shu qurilmada saqlanadi.") : rows.length ? `<ul class="t-list" id="h-list">${rows.map(row).join('')}</ul>` : emptyState(st.filter === 'archived' ? "Arxivda odat yo'q" : "Bugun jadvalda odat yo'q", st.filter === 'archived' ? "Arxivlangan odatlar shu yerda ko'rinadi." : "Barchasi filtrida barcha faol odatlar ko'rinadi.")}
    ${sm.cats.length ? `<section class="card" id="h-cats"><h2>Kategoriyalar bo'yicha (${K.WINDOW_DAYS} kun)</h2><ul class="hist">${sm.cats.map((c) => `<li><span>${esc(c.name)} <small>${c.count} ta odat</small></span><b>${c.rate === null ? '—' : c.rate + '%'}</b></li>`).join('')}</ul></section>` : ''}
    <a class="fab" id="h-new" href="#/odatlar/yangi">${icon('plus', 20)}<span>Yangi odat</span></a>`;
  main.querySelectorAll('.chip').forEach((b) => { b.onclick = () => { st.filter = b.dataset.f; renderList(main); }; });
  main.querySelectorAll('.t-check').forEach((b) => { b.onclick = refreshAfter(main, () => S.setDone(b.dataset.id, T, b.getAttribute('aria-pressed') !== 'true'), b); });
}

// ---------- Forma ----------
function renderForm(main, route) {
  const editing = route.screen === 'edit', T = localParts(nowMs()).date, cur = editing ? st.data.habits.find((h) => h.id === route.id) : null;
  if (editing && !cur) { setHeader('Odat', '#/odatlar'); main.innerHTML = emptyState('Odat topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const v = cur || { title: '', description: '', categoryId: 'shaxsiy', freq: 'daily', weekdays: [], every: 2, startDate: T };
  setHeader(editing ? 'Odatni tahrirlash' : 'Yangi odat', editing ? `#/odatlar/${cur.id}` : '#/odatlar');
  const err = (f) => `<p class="err" id="e-${f}" role="alert"></p>`;
  main.innerHTML = `<form id="h-form" class="t-form" novalidate>
    <label class="fld"><span>Odat nomi *</span><input id="f-title" name="title" type="text" maxlength="${K.LIMITS.title}" autocomplete="off" enterkeyhint="next" value="${esc(v.title)}">${err('title')}</label>
    <label class="fld"><span>Tavsif</span><textarea id="f-description" name="description" rows="3" maxlength="${K.LIMITS.description}" autocomplete="off">${esc(v.description)}</textarea>${err('description')}</label>
    <label class="fld"><span>Kategoriya</span><select id="f-categoryId" name="categoryId">${K.CATEGORIES.map((c) => `<option value="${c.id}"${c.id === v.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>${err('categoryId')}</label>
    <fieldset class="seg"><legend>Takrorlanish</legend>${K.FREQS.map((f) => `<label class="seg-i"><input type="radio" name="freq" value="${f}"${v.freq === f ? ' checked' : ''}><span>${K.FREQ_LABEL[f]}</span></label>`).join('')}</fieldset>${err('freq')}
    <fieldset class="seg wk h-opt" id="h-wk-box"${v.freq === 'weekly' ? '' : ' hidden'}><legend>Hafta kunlari</legend>${K.WEEKDAY_SHORT.map((s, i) => `<label class="seg-i"><input type="checkbox" name="weekdays" value="${i}"${i === 0 ? ' id="f-weekdays"' : ''} aria-label="${K.WEEKDAY_LABEL[i]}"${v.weekdays.includes(i) ? ' checked' : ''}><span>${s}</span></label>`).join('')}</fieldset>
    <div class="h-opt" id="h-wk-err"${v.freq === 'weekly' ? '' : ' hidden'}>${err('weekdays')}</div>
    <label class="fld h-opt" id="h-every-box"${v.freq === 'interval' ? '' : ' hidden'}><span>Necha kunda bir marta (${K.LIMITS.everyMin}–${K.LIMITS.everyMax})</span><input id="f-every" name="every" type="number" inputmode="numeric" min="${K.LIMITS.everyMin}" max="${K.LIMITS.everyMax}" value="${v.every == null ? 2 : v.every}">${err('every')}</label>
    <label class="fld"><span>Boshlanish sanasi *</span><input id="f-startDate" name="startDate" type="date" value="${esc(v.startDate)}">${err('startDate')}<small>Streak va foiz shu sanadan hisoblanadi.</small></label>
    <p class="err" id="e-form" role="alert"></p><button class="btn" id="f-save" type="submit">Saqlash</button><a class="btn btn-2" href="${editing ? `#/odatlar/${cur.id}` : '#/odatlar'}">Bekor qilish</a></form>`;
  const form = $('#h-form', main), sync = () => { const f = form.freq.value; $('#h-wk-box', main).hidden = f !== 'weekly'; $('#h-wk-err', main).hidden = f !== 'weekly'; $('#h-every-box', main).hidden = f !== 'interval'; };
  form.querySelectorAll('input[name=freq]').forEach((r) => { r.onchange = sync; });
  form.addEventListener('focusin', (e) => { const t = e.target; setTimeout(() => { if (t.isConnected && t.scrollIntoView) t.scrollIntoView({ block: 'center' }); }, 250); });
  form.onsubmit = async (ev) => {
    ev.preventDefault(); main.querySelectorAll('.err').forEach((e) => { e.textContent = ''; }); main.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    const fd = new FormData(form), input = Object.fromEntries(fd.entries()); input.weekdays = fd.getAll('weekdays'); const res = K.validateHabit(input, { today: T });
    const show = (errors) => { const keys = Object.keys(errors); keys.forEach((k) => { const e = $(`#e-${k}`, main); if (e) e.textContent = errors[k]; const f = $(`#f-${k}`, main); if (f) f.setAttribute('aria-invalid', 'true'); }); const first = keys.map((k) => $(`#f-${k}`, main)).find(Boolean); if (first) first.focus(); };
    if (!res.ok) return show(res.errors);
    const btn = $('#f-save', main); btn.disabled = true; btn.textContent = 'Saqlanmoqda…';
    try { if (editing) { await S.updateHabit(cur.id, input); goto(`#/odatlar/${cur.id}`); } else { await S.createHabit(input); goto('#/odatlar'); } }
    catch (e) { btn.disabled = false; btn.textContent = 'Saqlash'; if (e.name === 'ValidationError') show(e.errors); else $('#e-form', main).textContent = `Saqlab bo'lmadi: ${e.message}`; }
  };
}

// ---------- Tafsilot ----------
const STATE_LABEL = { done: 'Bajarilgan', missed: "O'tkazib yuborilgan", pending: 'Bugun, hali bajarilmagan', future: 'Kelgusi kun', off: "Jadvalda yo'q", before: 'Boshlanishdan oldin' };
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
function renderDetail(main, route) {
  const { habits, logs } = st.data, n = nowMs(), T = localParts(n).date, h = habits.find((x) => x.id === route.id);
  setHeader('Odat', '#/odatlar'); if (!h) { main.innerHTML = emptyState('Odat topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const done = K.indexLogs(logs).get(h.id) || new Set(), s = K.habitStats(h, done, T), cm = K.monthOf(T), ym = route.month || cm, grid = K.monthGrid(h, done, ym.y, ym.m, T);
  const prev = K.shiftMonth(ym.y, ym.m, -1), next = K.shiftMonth(ym.y, ym.m, 1), arch = h.status === 'archived', kv = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`, p = (x) => (x === null ? '—' : `${x}%`);
  const status = arch ? 'Arxivda' : !s.scheduledToday ? "Bugun jadvalda yo'q" : s.doneToday ? 'Bugun bajarilgan' : 'Bugun bajarilmagan';
  const cell = (c) => c === null ? '<span class="h-cell blank" aria-hidden="true"></span>' : c.canToggle && !arch
    ? `<button type="button" class="h-cell ${c.state}" data-date="${c.date}" data-done="${c.state === 'done'}" aria-label="${c.day}-${K.MONTHS_UZ[ym.m - 1]}: ${STATE_LABEL[c.state]}">${c.day}</button>`
    : `<span class="h-cell ${c.state}" role="img" aria-label="${c.day}-${K.MONTHS_UZ[ym.m - 1]}: ${STATE_LABEL[c.state]}">${c.day}</span>`;
  main.innerHTML = `<article class="card t-detail"><h2 id="d-title">${esc(h.title)}</h2><p class="badge ${s.doneToday ? 'ok' : ''}" id="d-status">${status}</p>
    <dl class="kv wide">${kv('Takrorlanish', esc(K.scheduleText(h)))}${kv('Kategoriya', esc(K.categoryName(h.categoryId)))}${kv('Boshlanish', esc(fmtDateUz(h.startDate, T)) + ` (${esc(h.startDate)})`)}</dl>
    ${h.description ? `<p class="t-desc" id="d-desc">${esc(h.description)}</p>` : ''}</article>
  <section class="card" id="d-stats"><h2>Statistika</h2><dl class="kv wide">${kv('Joriy streak', `<span id="s-current">${s.current}</span> kun`)}${kv('Eng uzun streak', `<span id="s-best">${s.best}</span> kun`)}${kv('Jami bajarilgan', `<span id="s-total">${s.total}</span> / ${s.scheduledDays}`)}${kv(`Oxirgi ${K.WINDOW_DAYS} kun`, `<span id="s-rate30">${p(s.rateWindow)}</span>`)}${kv('Butun davr', `<span id="s-rate">${p(s.rateAll)}</span>`)}</dl></section>
  ${!arch && s.scheduledToday ? `<button class="btn" id="d-toggle" type="button">${s.doneToday ? 'Bugungi belgini bekor qilish' : 'Bugun bajarildi'}</button>` : ''}<a class="btn btn-2" id="d-edit" href="#/odatlar/${h.id}/tahrir">Tahrirlash</a><button class="btn btn-2" id="d-arch" type="button">${arch ? 'Faollashtirish' : 'Arxivlash'}</button><button class="btn btn-danger-o" id="d-del" type="button">O'chirish</button>
  <section class="card" id="d-cal"><div class="h-nav"><a class="btn-link-sm" id="c-prev" href="#/odatlar/${h.id}?m=${monthKey(prev.y, prev.m)}" aria-label="Oldingi oy">${icon('back', 18)}</a><h2 id="c-title">${K.MONTHS_UZ[ym.m - 1]} ${ym.y}</h2><a class="btn-link-sm" id="c-next" href="#/odatlar/${h.id}?m=${monthKey(next.y, next.m)}" aria-label="Keyingi oy">${icon('next', 18)}</a></div>
    <div class="cal" role="group" aria-label="Oylik kalendar">${K.WEEKDAY_SHORT.map((d) => `<span class="cal-h" aria-hidden="true">${d}</span>`).join('')}${grid.cells.map(cell).join('')}</div>
    <p class="muted" id="c-sum">Bajarilgan: ${grid.done} · O'tkazib yuborilgan: ${grid.missed}</p>${arch ? '' : '<p class="muted"><small>Jadvalli kunni bosib, tarixni belgilash yoki bekor qilish mumkin.</small></p>'}</section>`;
  const tg = $('#d-toggle', main); if (tg) tg.onclick = refreshAfter(main, () => S.setDone(h.id, T, !s.doneToday), tg);
  main.querySelectorAll('.h-cell[data-date]').forEach((b) => { b.onclick = refreshAfter(main, () => S.setDone(h.id, b.dataset.date, b.dataset.done !== 'true'), b); });
  $('#d-arch', main).onclick = refreshAfter(main, () => S.setStatus(h.id, arch ? 'active' : 'archived'), $('#d-arch', main));
  $('#d-del', main).onclick = async () => {
    if (!(await confirmDialog(main, { title: "Odat o'chirilsinmi?", text: `"${h.title}" va uning barcha bajarilish tarixi o'chiriladi. Saqlab qolmoqchi bo'lsangiz, uni arxivlang.`, ok: "O'chirish" }))) return;
    try { const undo = await S.deleteHabit(h.id); st.undo = undo; toast("Odat o'chirildi", async () => { await S.restoreHabit(undo); st.undo = null; }); goto('#/odatlar'); } catch (er) { toast(`O'chirib bo'lmadi: ${er.message}`); }
  };
}
