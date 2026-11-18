// Jurnal interfeysi: ro'yxat (qidiruv, tur filtri), forma, tafsilot, o'chirish tasdig'i va "Bekor qilish".
// Ma'lumot faqat journal-store orqali. Qulflanganda xotira, qidiruv matni, toast va bekor qilish buferi tozalanadi.
// Yozuv matni hech qachon localStorage/sessionStorage/konsolga yozilmaydi; qoralama ham saqlanmaydi (maxfiylik).
import * as lock from '../lock.js';
import * as S from './journal-store.js';
import * as K from './journal-core.js';
import { localParts, fmtDateUz } from './dates.js';
import { icon, esc, emptyState, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const $ = UI.$;
const st = { type: 'all', q: '', data: null, undo: null, token: 0, main: null, off: null };
const nowMs = () => Date.now();
const allowed = () => lock.canAccessPersonalPages();
const goto = (h) => { location.hash = h; };

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.data = null; st.undo = null; st.main = null; st.q = ''; st.type = 'all'; toaster.clear();
  if (st.off) { st.off(); st.off = null; } S.stopSync();
  document.body.classList.remove('t-form');
}
let hooked = false;
export function startJournal() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); }
  if (st.off) st.off(); st.off = S.subscribe(scheduleRefresh);
}
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: /^#\/jurnal(\/|\?|$)/, blockClass: 't-form', render: (main) => mountJournal(main, true) }), scheduleRefresh = refresher.schedule;
const toaster = UI.createToaster({ getMain: () => st.main, onExpire: () => { st.undo = null; } }), toast = toaster.toast, attachToast = toaster.attach;
const confirmDialog = (main, opts) => UI.confirmDialog(main, opts, () => { if (refresher.dirty) scheduleRefresh(); });
const setHeader = (title, back) => UI.setHeader(title, back);

// ---------- Kirish nuqtasi ----------
export async function mountJournal(main, silent = false) {
  st.main = main; const token = ++st.token; let route; try { route = K.parseJournalHash(location.hash); } catch (_) { route = { screen: 'list' }; }
  const form = route.screen === 'new' || route.screen === 'edit'; document.body.classList.toggle('t-form', form); if (!silent) main.innerHTML = loadingState();
  try {
    const entries = await S.loadAll(); if (token !== st.token || !allowed()) return;
    refresher.dirty = false;
    if (!main.__journalFocus) { main.__journalFocus = true; main.addEventListener('focusout', () => { if (refresher.dirty) setTimeout(scheduleRefresh, 700); }); }
    st.data = entries; ({ list: renderList, new: renderForm, edit: renderForm, detail: renderDetail })[route.screen](main, route); attachToast(); if (!silent) window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}

// ---------- Ro'yxat ----------
const moodText = (m) => (m ? `${K.moodLabel(m)} (${m}/5)` : '');
function listHtml(T) {
  const rows = K.groupByDate(K.sortEntries(K.filterEntries(st.data, { type: st.type, query: st.q })));
  if (!rows.length) return st.data.length ? emptyState('Hech narsa topilmadi', "Qidiruv yoki filtrni o'zgartirib ko'ring.") : '';
  const item = (e) => `<li class="t-row" data-id="${e.id}"><a class="t-main" href="#/jurnal/${e.id}"><span class="t-title">${esc(K.entryHeading(e))}</span><span class="t-meta">${esc(K.typeName(e.type))}${e.mood ? ` · ${esc(moodText(e.mood))}` : ''}</span>${e.title ? `<span class="t-meta j-prev">${esc(K.clip(e.body, 90))}</span>` : ''}</a></li>`;
  return rows.map((g) => `<h3 class="j-day">${esc(fmtDateUz(g.date, T))}<small>${esc(g.date)}</small></h3><ul class="t-list">${g.items.map(item).join('')}</ul>`).join('');
}
function renderList(main) {
  setHeader('Jurnal', '#/boshqalar'); const T = localParts(nowMs()).date, sm = K.summary(st.data, T), entries = st.data;
  main.innerHTML = `<section class="t-stats" aria-label="Jurnal holati"><div class="stat"><b id="j-total">${sm.total}</b><span>Jami</span></div><div class="stat"><b id="j-month">${sm.thisMonth}</b><span>Bu oy</span></div><div class="stat"><b id="j-streak">${sm.streak}</b><span>Ketma-ket kun</span></div><div class="stat"><b id="j-mood">${sm.avgMood === null ? '—' : sm.avgMood}</b><span>Kayfiyat (${K.MOOD_WINDOW_DAYS} kun)</span></div></section>
    ${entries.length ? `<label class="fld j-search"><span class="sr">Yozuvlardan qidirish</span><input id="j-q" type="search" placeholder="Qidirish…" maxlength="100" autocomplete="off" enterkeyhint="search" value="${esc(st.q)}"></label>
    <div class="chips" role="group" aria-label="Tur filtri"><button type="button" class="chip${st.type === 'all' ? ' on' : ''}" data-t="all" aria-pressed="${st.type === 'all'}">Barchasi</button>${K.TYPES.map((t) => `<button type="button" class="chip${st.type === t.id ? ' on' : ''}" data-t="${t.id}" aria-pressed="${st.type === t.id}">${esc(t.name)}</button>`).join('')}</div>` : ''}
    <div id="j-list">${entries.length ? listHtml(T) : emptyState("Yozuvlar yo'q", "Birinchi yozuvingizni qo'shing: u shifrlangan holda faqat shu qurilmada saqlanadi.")}</div>
    <a class="fab" id="j-new" href="#/jurnal/yangi">${icon('plus', 20)}<span>Yangi yozuv</span></a>`;
  const redraw = () => { $('#j-list', main).innerHTML = listHtml(T); };
  const q = $('#j-q', main); if (q) q.oninput = () => { st.q = q.value; redraw(); }; // faqat ro'yxat qayta chiziladi: kiritish maydoni fokusini yo'qotmaydi
  main.querySelectorAll('.chip').forEach((b) => { b.onclick = () => { st.type = b.dataset.t; renderList(main); }; });
}

// ---------- Forma ----------
function renderForm(main, route) {
  const editing = route.screen === 'edit', T = localParts(nowMs()).date, cur = editing ? st.data.find((e) => e.id === route.id) : null;
  if (editing && !cur) { setHeader('Yozuv', '#/jurnal'); main.innerHTML = emptyState('Yozuv topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const v = cur || { title: '', body: '', type: K.DEFAULT_TYPE, date: T, mood: null };
  setHeader(editing ? 'Yozuvni tahrirlash' : 'Yangi yozuv', editing ? `#/jurnal/${cur.id}` : '#/jurnal');
  const err = (f) => `<p class="err" id="e-${f}" role="alert"></p>`;
  main.innerHTML = `<form id="j-form" class="t-form" novalidate>
    <fieldset class="seg j-types"><legend>Turi</legend>${K.TYPES.map((t) => `<label class="seg-i"><input type="radio" name="type" value="${t.id}"${v.type === t.id ? ' checked' : ''}><span>${esc(t.name)}</span></label>`).join('')}</fieldset>${err('type')}
    <label class="fld"><span>Sarlavha</span><input id="f-title" name="title" type="text" maxlength="${K.LIMITS.title}" autocomplete="off" enterkeyhint="next" value="${esc(v.title)}">${err('title')}</label>
    <label class="fld"><span>Yozuv *</span><textarea id="f-body" name="body" rows="10" maxlength="${K.LIMITS.body}" autocomplete="off" autocapitalize="sentences">${esc(v.body)}</textarea>${err('body')}</label>
    <div class="two"><label class="fld"><span>Sana *</span><input id="f-date" name="date" type="date" max="${T}" value="${esc(v.date)}">${err('date')}</label>
    <label class="fld"><span>Kayfiyat</span><select id="f-mood" name="mood"><option value="">Belgilanmagan</option>${K.MOODS.map((m) => `<option value="${m.value}"${v.mood === m.value ? ' selected' : ''}>${m.value} — ${esc(m.label)}</option>`).join('')}</select>${err('mood')}</label></div>
    <p class="err" id="e-form" role="alert"></p><button class="btn" id="f-save" type="submit">Saqlash</button><a class="btn btn-2" href="${editing ? `#/jurnal/${cur.id}` : '#/jurnal'}">Bekor qilish</a></form>`;
  const form = $('#j-form', main);
  form.addEventListener('focusin', (e) => { const t = e.target; setTimeout(() => { if (t.isConnected && t.scrollIntoView) t.scrollIntoView({ block: 'center' }); }, 250); });
  form.onsubmit = async (ev) => {
    ev.preventDefault(); main.querySelectorAll('.err').forEach((e) => { e.textContent = ''; }); main.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    const input = Object.fromEntries(new FormData(form).entries()), res = K.validateEntry(input, { today: T });
    const show = (errors) => { const keys = Object.keys(errors); keys.forEach((k) => { const e = $(`#e-${k}`, main); if (e) e.textContent = errors[k]; const f = $(`#f-${k}`, main); if (f) f.setAttribute('aria-invalid', 'true'); }); const first = keys.map((k) => $(`#f-${k}`, main)).find(Boolean); if (first) first.focus(); };
    if (!res.ok) return show(res.errors);
    const btn = $('#f-save', main); btn.disabled = true; btn.textContent = 'Saqlanmoqda…';
    try { if (editing) { await S.updateEntry(cur.id, input); goto(`#/jurnal/${cur.id}`); } else { await S.createEntry(input); goto('#/jurnal'); } }
    catch (e) { btn.disabled = false; btn.textContent = 'Saqlash'; if (e.name === 'ValidationError') show(e.errors); else $('#e-form', main).textContent = `Saqlab bo'lmadi: ${e.message}`; }
  };
}

// ---------- Tafsilot ----------
function renderDetail(main, route) {
  const T = localParts(nowMs()).date, e = st.data.find((x) => x.id === route.id), kv = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
  setHeader('Yozuv', '#/jurnal'); if (!e) { main.innerHTML = emptyState('Yozuv topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const stamp = (ms) => { const p = localParts(ms); return `${esc(p.date)} ${esc(p.time)}`; };
  main.innerHTML = `<article class="card t-detail"><h2 id="d-title">${esc(K.entryHeading(e, 100))}</h2><p class="badge" id="d-type">${esc(K.typeName(e.type))}</p>
    <dl class="kv wide">${kv('Sana', `${esc(fmtDateUz(e.date, T))} (${esc(e.date)})`)}${e.mood ? kv('Kayfiyat', esc(moodText(e.mood))) : ''}${kv('Yozilgan', stamp(e.createdAt))}${e.updatedAt - e.createdAt > 1000 ? kv("O'zgartirilgan", stamp(e.updatedAt)) : ''}</dl>
    <p class="t-desc j-body" id="d-body">${esc(e.body)}</p></article>
    <a class="btn btn-2" id="d-edit" href="#/jurnal/${e.id}/tahrir">Tahrirlash</a><button class="btn btn-danger-o" id="d-del" type="button">O'chirish</button>`;
  $('#d-del', main).onclick = async () => {
    if (!(await confirmDialog(main, { title: "Yozuv o'chirilsinmi?", text: "Bu yozuv butunlay o'chiriladi. O'chirgandan keyin qisqa vaqt ichida bekor qilishingiz mumkin.", ok: "O'chirish" }))) return;
    try { const undo = await S.deleteEntry(e.id); st.undo = undo; toast("Yozuv o'chirildi", async () => { await S.restoreEntry(undo); st.undo = null; }); goto('#/jurnal'); } catch (er) { toast(`O'chirib bo'lmadi: ${er.message}`); }
  };
}
