// Ibodat interfeysi: kunlik ko'rinish (namoz belgilari, Qur'on o'qish, zikr, qaydlar), zikr hisoblagichi, tarix, qaydlar.
// Ma'lumot faqat ibodat-store orqali (shifrlangan). Qulflanganda xotira, qidiruv, toast, bekor qilish buferi va saqlanmagan sanoq tashlanadi.
// Matn va sonlar hech qachon localStorage/sessionStorage/konsolga yozilmaydi; qoralama saqlanmaydi. Baho, foiz, streak va hukm yo'q (ibodat-core.js ga qarang).
import * as lock from '../lock.js';
import * as S from './ibodat-store.js';
import * as K from './ibodat-core.js';
import { localParts, fmtDateUz } from './dates.js';
import { icon, esc, emptyState, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const $ = UI.$;
const st = { q: '', data: null, undo: null, token: 0, main: null, off: null };
const nowMs = () => Date.now();
const today = () => localParts(nowMs()).date;
const allowed = () => lock.canAccessPersonalPages();
const goto = (h) => { location.hash = h; };
const dayHref = (d) => (d === today() ? '#/ibodat' : `#/ibodat/kun/${d}`);

// Zikr hisoblagichi: bosishlar xotirada sanaladi va qisqa pauzadan so'ng (yoki sahifa yashirilganda) bir yozuvga saqlanadi.
let pend = null, ftimer = null;
async function flush() {
  clearTimeout(ftimer); if (!pend) return; const p = pend; pend = null;
  try { await S.setDhikrCount(p.id, p.count); } catch (e) { toast(`Sanoq saqlanmadi: ${e.message}`); }
}
const queue = (id, count) => { pend = { id, count }; clearTimeout(ftimer); ftimer = setTimeout(flush, 500); };

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.data = null; st.undo = null; st.main = null; st.q = ''; pend = null; clearTimeout(ftimer); toaster.clear();
  if (st.off) { st.off(); st.off = null; } S.stopSync();
  document.body.classList.remove('t-form');
}
let hooked = false;
export function startIbodat() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); }); window.addEventListener('pagehide', () => { flush(); }); }
  if (st.off) st.off(); st.off = S.subscribe(scheduleRefresh);
}
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: /^#\/ibodat(\/|\?|$)/, blockClass: 't-form', render: async (main) => { if (pend) return; const had = document.activeElement && document.activeElement.id === 'z-tap'; await mountIbodat(main, true); if (had) { const b = $('#z-tap', main); if (b) b.focus(); } } }), scheduleRefresh = refresher.schedule;
const toaster = UI.createToaster({ getMain: () => st.main, onExpire: () => { st.undo = null; } }), toast = toaster.toast, attachToast = toaster.attach;
const confirmDialog = (main, opts) => UI.confirmDialog(main, opts, () => { if (refresher.dirty) scheduleRefresh(); });
const setHeader = (title, back) => UI.setHeader(title, back);
const refreshAfter = (main, fn, btn) => async () => { if (btn) btn.disabled = true; try { await fn(); mountIbodat(main, true); } catch (e) { toast(`Xatolik: ${e.message}`); if (btn) btn.disabled = false; } };
const showErrors = (main, errors) => { const keys = Object.keys(errors); keys.forEach((k) => { const e = $(`#e-${k}`, main); if (e) e.textContent = errors[k]; const f = $(`#f-${k}`, main); if (f) f.setAttribute('aria-invalid', 'true'); }); const first = keys.map((k) => $(`#f-${k}`, main)).find(Boolean); if (first) first.focus(); };
const clearErrors = (main) => { main.querySelectorAll('.err').forEach((e) => { e.textContent = ''; }); main.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid')); };
const err = (f) => `<p class="err" id="e-${f}" role="alert"></p>`;

// ---------- Kirish nuqtasi ----------
export async function mountIbodat(main, silent = false) {
  if (!silent) await flush();
  st.main = main; const token = ++st.token; let route; try { route = K.parseIbodatHash(location.hash); } catch (_) { route = { screen: 'day', date: null }; }
  document.body.classList.toggle('t-form', route.screen === 'note-new' || route.screen === 'note-edit'); if (!silent) main.innerHTML = loadingState();
  try {
    const parts = await S.loadAll(); if (token !== st.token || !allowed()) return;
    refresher.dirty = false;
    if (!main.__ibodatFocus) { main.__ibodatFocus = true; main.addEventListener('focusout', () => { if (refresher.dirty) setTimeout(scheduleRefresh, 700); }); }
    st.data = parts; ({ day: renderDay, history: renderHistory, dhikr: renderDhikr, notes: renderNotes, 'note-new': renderNoteForm, 'note-edit': renderNoteForm, note: renderNote })[route.screen](main, route); attachToast(); if (!silent) window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}

// ---------- Kunlik ko'rinish ----------
function renderDay(main, route) {
  const T = today(), date = route.date && route.date <= T ? route.date : T, d = K.dayData(date, st.data), nav = K.dayLabelOffset(date, T), isToday = date === T, rn = K.recentNames(st.data).filter((n) => !d.dhikr.some((x) => K.nameKey(x.name) === K.nameKey(n)));
  setHeader('Ibodat', '#/boshqalar');
  const qRow = (q) => `<li><span>${q.pages ? `${q.pages} sahifa` : ''}${q.pages && q.minutes ? ' · ' : ''}${q.minutes ? `${q.minutes} daqiqa` : ''}${q.note ? ` <small>${esc(q.note)}</small>` : ''}</span><button class="btn-link-sm q-del" type="button" data-id="${q.id}" aria-label="Qur'on yozuvini o'chirish">${icon('trash', 18)}</button></li>`;
  main.innerHTML = `<aside class="card i-priv" role="note"><small>Bu bo'lim maxfiy: yozuvlar shifrlangan holda faqat shu qurilmada saqlanadi. Bu yerda baho yoki hukm yuritilmaydi, faqat o'zingiz belgilagan narsa ko'rinadi.</small></aside>
  <div class="h-nav"><a class="btn-link-sm" id="i-prev" href="${dayHref(nav.prev)}" aria-label="Oldingi kun">${icon('back', 18)}</a><h2 id="i-date">${esc(fmtDateUz(date, T))} <small>${esc(date)}</small></h2>${nav.next ? `<a class="btn-link-sm" id="i-next" href="${dayHref(nav.next)}" aria-label="Keyingi kun">${icon('next', 18)}</a>` : '<span class="h-off" aria-hidden="true"></span>'}</div>
  ${isToday ? '' : '<a class="btn btn-2" id="i-today" href="#/ibodat">Bugunga qaytish</a>'}
  <section class="card" aria-labelledby="i-h-pr"><h2 id="i-h-pr">Namoz</h2><div class="i-pr" role="group" aria-label="Namoz belgilari">${K.PRAYERS.map((p) => `<button type="button" class="i-p" data-p="${p.id}" aria-pressed="${d.prayers.has(p.id)}">${esc(p.name)}</button>`).join('')}</div><p class="muted" id="i-pr-n">Belgilangan: ${d.prayers.size}</p></section>
  <section class="card" id="i-quran" aria-labelledby="i-h-q"><h2 id="i-h-q">Qur'on o'qish</h2>${d.quran.length ? `<p class="muted" id="i-q-sum">Jami: ${d.pages} sahifa${d.minutes ? ` · ${d.minutes} daqiqa` : ''}</p><ul class="hist" id="i-q-list">${d.quran.map(qRow).join('')}</ul>` : '<p class="muted" id="i-q-sum">Bu kunga yozuv yo\'q.</p>'}
    <form id="q-form" novalidate><div class="two"><label class="fld"><span>Sahifa</span><input id="f-pages" name="pages" type="number" inputmode="numeric" min="0" max="${K.LIMITS.pagesMax}">${err('pages')}</label><label class="fld"><span>Daqiqa</span><input id="f-minutes" name="minutes" type="number" inputmode="numeric" min="0" max="${K.LIMITS.minutesMax}">${err('minutes')}</label></div>
    <label class="fld"><span>Izoh (ixtiyoriy)</span><input id="f-note" name="note" type="text" maxlength="${K.LIMITS.quranNote}" autocomplete="off">${err('note')}</label><button class="btn btn-2" id="q-add" type="submit">Qo'shish</button></form></section>
  <section class="card" id="i-dhikr" aria-labelledby="i-h-z"><h2 id="i-h-z">Zikr</h2>${d.dhikr.length ? `<ul class="t-list" id="i-z-list">${d.dhikr.map((z) => { const p = K.dhikrProgress(z); return `<li class="t-row"><a class="t-main" href="#/ibodat/zikr/${z.id}"><span class="t-title">${esc(z.name)}</span><span class="t-meta">${p.count}${p.target ? ` / ${p.target}` : ''}</span></a></li>`; }).join('')}</ul>` : '<p class="muted">Bu kunga zikr hisoblagichi yo\'q.</p>'}
    ${rn.length ? `<div class="chips" role="group" aria-label="Avvalgi zikrlar">${rn.map((n) => `<button type="button" class="chip z-quick" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    <form id="z-new" novalidate><label class="fld"><span>Yangi zikr nomi</span><input id="f-name" name="name" type="text" maxlength="${K.LIMITS.dhikrName}" autocomplete="off" enterkeyhint="next">${err('name')}</label><label class="fld"><span>Maqsad miqdori (ixtiyoriy)</span><input id="f-target" name="target" type="number" inputmode="numeric" min="1" max="${K.LIMITS.targetMax}">${err('target')}</label><button class="btn btn-2" id="z-add" type="submit">Hisoblagich qo'shish</button></form></section>
  <section class="card" id="i-notes" aria-labelledby="i-h-n"><h2 id="i-h-n">Qaydlar</h2>${d.notes.length ? `<ul class="t-list" id="i-n-list">${d.notes.map((n) => `<li class="t-row"><a class="t-main" href="#/ibodat/qayd/${n.id}"><span class="t-title">${esc(K.entryHeading(n))}</span></a></li>`).join('')}</ul>` : '<p class="muted">Bu kunga qayd yo\'q.</p>'}<a class="btn-link" id="i-n-new" href="#/ibodat/qayd/yangi?d=${date}">Yangi qayd</a> <a class="btn-link" id="i-n-all" href="#/ibodat/qayd">Barcha qaydlar</a></section>
  <a class="btn btn-2" id="i-hist" href="#/ibodat/tarix">Tarix</a>`;
  main.querySelectorAll('.i-p').forEach((b) => { b.onclick = refreshAfter(main, () => S.setPrayer(date, b.dataset.p, b.getAttribute('aria-pressed') !== 'true'), b); });
  main.querySelectorAll('.q-del').forEach((b) => { b.onclick = async () => { try { const rec = await S.deleteQuran(b.dataset.id); st.undo = rec; toast("Yozuv o'chirildi", async () => { await S.restore(rec); st.undo = null; }); mountIbodat(main, true); } catch (e) { toast(`Xatolik: ${e.message}`); } }; });
  main.querySelectorAll('.z-quick').forEach((b) => { b.onclick = async () => { try { const r = await S.createDhikr({ name: b.dataset.n, date }); goto(`#/ibodat/zikr/${r.record.id}`); } catch (e) { toast(`Xatolik: ${e.message}`); } }; });
  const submit = (formSel, btnSel, run) => { const form = $(formSel, main); form.onsubmit = async (ev) => { ev.preventDefault(); clearErrors(main); const btn = $(btnSel, main), label = btn.textContent; btn.disabled = true; try { await run(Object.fromEntries(new FormData(form).entries())); } catch (e) { btn.disabled = false; btn.textContent = label; if (e.name === 'ValidationError') showErrors(main, e.errors); else toast(`Saqlab bo'lmadi: ${e.message}`); } }; };
  submit('#q-form', '#q-add', async (input) => { await S.addQuran({ ...input, date }); mountIbodat(main, true); });
  submit('#z-new', '#z-add', async (input) => { const r = await S.createDhikr({ ...input, date }); goto(`#/ibodat/zikr/${r.record.id}`); });
}

// ---------- Zikr hisoblagichi ----------
function renderDhikr(main, route) {
  const z = st.data.dhikr.find((x) => x.id === route.id), T = today(); setHeader('Zikr', z ? dayHref(z.date) : '#/ibodat');
  if (!z) { main.innerHTML = emptyState('Zikr topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  let cnt = pend && pend.id === z.id ? pend.count : z.count; const bar = () => { const p = K.dhikrProgress({ ...z, count: cnt }); return p; };
  main.innerHTML = `<article class="card t-detail"><h2 id="z-title">${esc(z.name)}</h2><p class="muted" id="z-date">${esc(fmtDateUz(z.date, T))} · ${esc(z.date)}</p>
    <button class="i-tap" id="z-tap" type="button" aria-label="Sanash: bir qo'shish. Hozirgi son ${cnt}"><span id="z-count">${cnt}</span></button>
    <p class="muted" id="z-target"></p><div class="bar" id="z-bar" role="progressbar" aria-label="Maqsad miqdori" aria-valuemin="0" aria-valuemax="100" hidden><i></i></div><p id="z-reached" class="muted"></p><span class="sr" id="z-live" role="status" aria-live="polite"></span>
    <div class="i-ctl"><button class="btn btn-2" id="z-minus" type="button">−1</button><button class="btn btn-2" id="z-reset" type="button">Nolga qaytarish</button></div>
    <form id="z-tf" novalidate><label class="fld"><span>Maqsad miqdori (bo'sh = maqsadsiz)</span><input id="f-target" name="target" type="number" inputmode="numeric" min="1" max="${K.LIMITS.targetMax}" value="${z.target || ''}">${err('target')}</label><button class="btn btn-2" id="z-tsave" type="submit">Maqsadni saqlash</button></form>
    <button class="btn btn-danger-o" id="z-del" type="button">Hisoblagichni o'chirish</button></article>`;
  const paint = (announce) => { const p = bar(), live = $('#z-live', main); $('#z-count', main).textContent = cnt; $('#z-tap', main).setAttribute('aria-label', `Sanash: bir qo'shish. Hozirgi son ${cnt}`); $('#z-target', main).textContent = p.target ? `Maqsad: ${p.target}` : 'Maqsad belgilanmagan'; const b = $('#z-bar', main); b.hidden = !p.target; if (p.target) { b.setAttribute('aria-valuenow', p.percent); b.firstElementChild.style.width = `${p.percent}%`; } $('#z-reached', main).textContent = p.reached ? 'Maqsad miqdoriga yetildi.' : ''; if (announce && live) live.textContent = p.reached ? `${cnt}. Maqsad miqdoriga yetildi.` : String(cnt); };
  paint(false);
  const set = (n, announce) => { cnt = n; queue(z.id, cnt); paint(announce); };
  $('#z-tap', main).onclick = () => { if (cnt < K.LIMITS.countMax) { if (navigator.vibrate) navigator.vibrate(10); set(cnt + 1, cnt + 1 === z.target || (cnt + 1) % 100 === 0); } };
  $('#z-minus', main).onclick = () => { if (cnt > 0) set(cnt - 1, false); };
  $('#z-reset', main).onclick = async () => { if (cnt === 0) return; if (!(await confirmDialog(main, { title: 'Hisoblagich nolga qaytarilsinmi?', text: `Hozirgi son (${cnt}) 0 ga tushadi.`, ok: 'Nolga qaytarish' }))) return; set(0, true); await flush(); };
  $('#z-tf', main).onsubmit = async (ev) => { ev.preventDefault(); clearErrors(main); try { await S.setDhikrTarget(z.id, new FormData(ev.target).get('target')); await flush(); mountIbodat(main, true); } catch (e) { if (e.name === 'ValidationError') showErrors(main, e.errors); else toast(`Saqlab bo'lmadi: ${e.message}`); } };
  $('#z-del', main).onclick = async () => {
    if (!(await confirmDialog(main, { title: "Hisoblagich o'chirilsinmi?", text: `"${z.name}" hisoblagichi va uning soni o'chiriladi. O'chirgandan keyin qisqa vaqt ichida bekor qilishingiz mumkin.`, ok: "O'chirish" }))) return;
    try { pend = null; clearTimeout(ftimer); const rec = await S.deleteDhikr(z.id); st.undo = rec; toast("Hisoblagich o'chirildi", async () => { await S.restore(rec); st.undo = null; }); goto(dayHref(z.date)); } catch (e) { toast(`O'chirib bo'lmadi: ${e.message}`); }
  };
}

// ---------- Tarix ----------
function renderHistory(main) {
  setHeader('Ibodat tarixi', '#/ibodat'); const T = today(), days = K.history(st.data, T), m = K.monthCounts(st.data, T);
  const meta = (x) => [x.prayers ? `Namoz: ${x.prayers}` : '', x.pages || x.minutes ? `Qur'on: ${[x.pages ? `${x.pages} sahifa` : '', x.minutes ? `${x.minutes} daqiqa` : ''].filter(Boolean).join(', ')}` : '', x.dhikr ? `Zikr: ${x.dhikr}` : '', x.notes ? `Qayd: ${x.notes}` : ''].filter(Boolean).join(' · ');
  main.innerHTML = `<section class="t-stats" aria-label="Shu oy (belgilangan sanoq)"><div class="stat"><b id="h-days">${m.days}</b><span>Yozuvli kun</span></div><div class="stat"><b id="h-pr">${m.prayers}</b><span>Namoz belgisi</span></div><div class="stat"><b id="h-pg">${m.pages}</b><span>Qur'on sahifa</span></div><div class="stat"><b id="h-dh">${m.dhikr}</b><span>Zikr soni</span></div></section>
    <p class="muted">Shu oyda belgilanganlar sanog'i. Bu baho emas: faqat o'zingiz yozgan narsa.</p>
    ${days.length ? `<ul class="t-list" id="h-list">${days.map((x) => `<li class="t-row"><a class="t-main" href="${dayHref(x.date)}"><span class="t-title">${esc(fmtDateUz(x.date, T))} <small>${esc(x.date)}</small></span><span class="t-meta">${esc(meta(x))}</span></a></li>`).join('')}</ul>` : emptyState("Tarix bo'sh", "Namoz, Qur'on, zikr yoki qayd belgilangan kunlar shu yerda ko'rinadi.")}`;
}

// ---------- Qaydlar ----------
const noteList = (T) => { const rows = K.groupByDate(K.sortEntries(K.filterEntries(st.data.notes, { query: st.q }))); if (!rows.length) return st.data.notes.length ? emptyState('Hech narsa topilmadi', "Qidiruvni o'zgartirib ko'ring.") : ''; return rows.map((g) => `<h3 class="j-day">${esc(fmtDateUz(g.date, T))}<small>${esc(g.date)}</small></h3><ul class="t-list">${g.items.map((n) => `<li class="t-row"><a class="t-main" href="#/ibodat/qayd/${n.id}"><span class="t-title">${esc(K.entryHeading(n))}</span>${n.title ? `<span class="t-meta j-prev">${esc(K.clip(n.body, 90))}</span>` : ''}</a></li>`).join('')}</ul>`).join(''); };
function renderNotes(main) {
  setHeader('Qaydlar', '#/ibodat'); const T = today(), notes = st.data.notes;
  main.innerHTML = `${notes.length ? `<label class="fld j-search"><span class="sr">Qaydlardan qidirish</span><input id="n-q" type="search" placeholder="Qidirish…" maxlength="100" autocomplete="off" enterkeyhint="search" value="${esc(st.q)}"></label>` : ''}<div id="n-list">${notes.length ? noteList(T) : emptyState("Qaydlar yo'q", "Birinchi qaydingizni qo'shing: u shifrlangan holda faqat shu qurilmada saqlanadi.")}</div><a class="fab" id="n-new" href="#/ibodat/qayd/yangi">${icon('plus', 20)}<span>Yangi qayd</span></a>`;
  const q = $('#n-q', main); if (q) q.oninput = () => { st.q = q.value; $('#n-list', main).innerHTML = noteList(T); };
}
function renderNoteForm(main, route) {
  const editing = route.screen === 'note-edit', T = today(), cur = editing ? st.data.notes.find((n) => n.id === route.id) : null;
  if (editing && !cur) { setHeader('Qayd', '#/ibodat/qayd'); main.innerHTML = emptyState('Qayd topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const v = cur || { title: '', body: '', date: route.date && route.date <= T ? route.date : T }, back = editing ? `#/ibodat/qayd/${cur.id}` : '#/ibodat/qayd';
  setHeader(editing ? 'Qaydni tahrirlash' : 'Yangi qayd', back);
  main.innerHTML = `<form id="n-form" class="t-form" novalidate><label class="fld"><span>Sarlavha</span><input id="f-title" name="title" type="text" maxlength="${K.LIMITS.noteTitle}" autocomplete="off" enterkeyhint="next" value="${esc(v.title)}">${err('title')}</label>
    <label class="fld"><span>Qayd *</span><textarea id="f-body" name="body" rows="10" maxlength="${K.LIMITS.noteBody}" autocomplete="off" autocapitalize="sentences">${esc(v.body)}</textarea>${err('body')}</label>
    <label class="fld"><span>Sana *</span><input id="f-date" name="date" type="date" max="${T}" value="${esc(v.date)}">${err('date')}</label>
    <p class="err" id="e-form" role="alert"></p><button class="btn" id="f-save" type="submit">Saqlash</button><a class="btn btn-2" href="${back}">Bekor qilish</a></form>`;
  const form = $('#n-form', main); form.addEventListener('focusin', (e) => { const t = e.target; setTimeout(() => { if (t.isConnected && t.scrollIntoView) t.scrollIntoView({ block: 'center' }); }, 250); });
  form.onsubmit = async (ev) => {
    ev.preventDefault(); clearErrors(main); const input = Object.fromEntries(new FormData(form).entries()), res = K.validateNote(input, { today: T }); if (!res.ok) return showErrors(main, res.errors);
    const btn = $('#f-save', main); btn.disabled = true; btn.textContent = 'Saqlanmoqda…';
    try { if (editing) { await S.updateNote(cur.id, input); goto(`#/ibodat/qayd/${cur.id}`); } else { await S.createNote(input); goto('#/ibodat/qayd'); } }
    catch (e) { btn.disabled = false; btn.textContent = 'Saqlash'; if (e.name === 'ValidationError') showErrors(main, e.errors); else $('#e-form', main).textContent = `Saqlab bo'lmadi: ${e.message}`; }
  };
}
function renderNote(main, route) {
  const T = today(), n = st.data.notes.find((x) => x.id === route.id), kv = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`; setHeader('Qayd', '#/ibodat/qayd');
  if (!n) { main.innerHTML = emptyState('Qayd topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  main.innerHTML = `<article class="card t-detail"><h2 id="d-title">${esc(K.entryHeading(n, 100))}</h2><dl class="kv wide">${kv('Sana', `${esc(fmtDateUz(n.date, T))} (${esc(n.date)})`)}</dl><p class="t-desc j-body" id="d-body">${esc(n.body)}</p></article>
    <a class="btn btn-2" id="d-edit" href="#/ibodat/qayd/${n.id}/tahrir">Tahrirlash</a><button class="btn btn-danger-o" id="d-del" type="button">O'chirish</button>`;
  $('#d-del', main).onclick = async () => {
    if (!(await confirmDialog(main, { title: "Qayd o'chirilsinmi?", text: "Bu qayd butunlay o'chiriladi. O'chirgandan keyin qisqa vaqt ichida bekor qilishingiz mumkin.", ok: "O'chirish" }))) return;
    try { const rec = await S.deleteNote(n.id); st.undo = rec; toast("Qayd o'chirildi", async () => { await S.restore(rec); st.undo = null; }); goto('#/ibodat/qayd'); } catch (e) { toast(`O'chirib bo'lmadi: ${e.message}`); }
  };
}
