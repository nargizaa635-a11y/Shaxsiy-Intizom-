// Vazifalar interfeysi: ro'yxat, forma, tafsilot, kategoriyalar, o'chirish tasdig'i, eslatmalar (faqat ilova ochiq paytida).
// Ma'lumot faqat tasks-store orqali. Qulflanganda xotira, toast, bekor qilish buferi va eslatma banneri tozalanadi.
import * as lock from '../lock.js';
import * as S from './tasks-store.js';
import * as K from './tasks-core.js';
import { icon, esc, emptyState, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const $ = UI.$;
const st = { filter: 'all', sort: 'date', data: null, undo: null, token: 0, main: null, fired: new Set(), rem: null, off: null };
const nowMs = () => Date.now();
const allowed = () => lock.canAccessPersonalPages();

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.data = null; st.undo = null; st.main = null; st.fired = new Set();
  toaster.clear();
  if (st.rem) { clearInterval(st.rem); st.rem = null; } if (st.off) { st.off(); st.off = null; } S.stopSync();
  document.body.classList.remove('t-form'); const b = $('#tbanner'); if (b) b.innerHTML = '';
}
let hooked = false;
export function startTasks() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkReminders(); }); }
  if (st.off) st.off(); st.off = S.subscribe(scheduleRefresh);
  if (st.rem) clearInterval(st.rem); st.rem = setInterval(checkReminders, 30000); checkReminders();
}
// Yangilanish (o'z yoki boshqa tab o'zgarishi) tasdiqlash oynasi ochiq yoki matn kiritilayotgan paytda kechiktiriladi:
// aks holda foydalanuvchi yozayotgan matn yoki ochiq oyna o'chib ketardi. Foydalanuvchi tugatgach (oyna yopilsa/maydondan chiqsa) bajariladi.
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: /^#\/reja(\/|\?|$)/, blockClass: 't-form', render: (main) => mountTasks(main, true) }), scheduleRefresh = refresher.schedule;

// ---------- Eslatmalar (hozircha faqat ilova ochiq paytida; kelajakda bildirishnoma K.reminderInstants orqali ulanadi) ----------
async function checkReminders() {
  if (!allowed()) return; const token = st.token;
  try {
    const { tasks, completions } = await S.loadAll(); if (token !== st.token || !allowed()) return;
    for (const d of K.dueReminders(K.buildRows(tasks, completions, 'undone', nowMs()), nowMs(), st.fired)) { st.fired.add(d.key); showBanner(d.row); }
  } catch (_) { /* keyingi tekshiruvda */ }
}
function showBanner(r) {
  const box = $('#tbanner'); if (!box) return; const el = document.createElement('div'); el.className = 'tb'; el.setAttribute('role', 'alert');
  el.innerHTML = `${icon('bell', 18)}<div class="tb-t"><strong>Eslatma</strong><span>${esc(r.task.title)}, ${esc(r.task.startTime)}</span></div><a class="tb-a" href="#/reja/${r.task.id}?d=${r.date}">Ko'rish</a><button class="tb-x" type="button" aria-label="Yopish">${icon('check', 16)}</button>`;
  el.querySelector('.tb-x').onclick = () => el.remove(); box.appendChild(el);
}

// ---------- Yordamchilar ----------
const setHeader = UI.setHeader;
const toaster = UI.createToaster({ getMain: () => st.main, onExpire: () => { st.undo = null; } }), toast = toaster.toast, attachToast = toaster.attach;
const confirmDialog = (main, opts) => UI.confirmDialog(main, opts, () => { if (refresher.dirty) scheduleRefresh(); });
const goto = (h) => { location.hash = h; };
const timeText = (t) => (t.startTime ? (t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime) : t.endTime ? `${t.endTime} gacha` : '');
const catOptions = (cats, sel) => cats.map((c) => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');

// ---------- Kirish nuqtasi ----------
// Jim yangilanishda foydalanuvchi yozib turgan (saqlanmagan) kategoriya matnlari saqlanadi
const draftKey = (el) => el.id || `cat:${el.closest('.cat').dataset.id}`;
const collectDrafts = (main) => Object.fromEntries([...main.querySelectorAll('#c-new, .cat-in')].map((el) => [draftKey(el), el.value]));
const restoreDrafts = (main, d) => main.querySelectorAll('#c-new, .cat-in').forEach((el) => { const k = draftKey(el); if (k in d) el.value = d[k]; });
export async function mountTasks(main, silent = false) {
  const drafts = silent ? collectDrafts(main) : null; st.main = main; const token = ++st.token; let route; try { route = K.parseTasksHash(location.hash); } catch (_) { route = { screen: 'list' }; } const form = route.screen === 'new' || route.screen === 'edit';
  document.body.classList.toggle('t-form', form); if (!silent) main.innerHTML = loadingState();
  try {
    const [all, cats] = await Promise.all([S.loadAll(), S.loadCategories()]); if (token !== st.token || !allowed()) return;
    refresher.dirty = false;
    if (!main.__tasksFocus) { main.__tasksFocus = true; main.addEventListener('focusout', () => { if (refresher.dirty) setTimeout(scheduleRefresh, 700); }); } // (`onfocusout` xossasi yo'q: faqat addEventListener) 700 ms: tugma bosilishi (pointerdown->click) ulgurishi uchun
    st.data = { ...all, cats }; ({ list: renderList, new: renderForm, edit: renderForm, detail: renderDetail, categories: renderCategories })[route.screen](main, route); attachToast(); if (drafts) restoreDrafts(main, drafts); else window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}

// ---------- Ro'yxat ----------
function renderList(main) {
  setHeader('Vazifalar'); const { tasks, completions, cats } = st.data, n = nowMs(), T = K.localParts(n).date;
  const ts = K.todayStats(tasks, completions, n), ov = K.overallStats(tasks, completions, n), up = K.upcomingDue(tasks, completions, n).slice(0, 4);
  const rows = K.sortRows(K.buildRows(tasks, completions, st.filter, n), st.sort, st.filter);
  const row = (r) => { const t = r.task, over = K.isOverdue(r, n), tm = timeText(t);
    return `<li class="t-row${r.done ? ' done' : ''}" data-key="${esc(r.key)}"><button class="t-check" type="button" aria-pressed="${r.done}" aria-label="${r.done ? 'Qayta faollashtirish' : 'Bajarildi deb belgilash'}" data-id="${t.id}" data-date="${r.date}">${r.done ? icon('check', 18) : ''}</button><a class="t-main" href="#/reja/${t.id}?d=${r.date}"><span class="t-title">${esc(t.title)}</span><span class="t-meta"><span class="${over ? 'bad' : ''}">${over ? "Muddati o'tgan · " : ''}${esc(K.fmtDateUz(r.date, T))}${tm ? ', ' + esc(tm) : ''}</span> · ${esc(K.categoryName(t.categoryId, cats))}${K.isRecurring(t) ? ` · ${icon('repeat', 12)} ${esc(K.REPEAT_LABEL[t.repeat])}` : ''}</span></a><span class="prio p-${t.priority}" title="${esc(K.PRIORITY_LABEL[t.priority])}"></span></li>`; };
  const none = tasks.length === 0;
  main.innerHTML = `<section class="t-stats" aria-label="Bugungi holat"><div class="stat"><b id="t-total">${ts.total}</b><span>Bugun</span></div><div class="stat"><b id="t-done">${ts.done}</b><span>Bajarilgan</span></div><div class="stat"><b id="t-pending">${ts.pending}</b><span>Bajarilmagan</span></div><div class="stat"><b id="t-overall">${ov.percent}%</b><span>Umumiy</span></div></section>
    <div class="bar" role="progressbar" aria-label="Bugungi progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ts.percent}"><i style="width:${ts.percent}%"></i></div><p class="muted t-prog" id="t-prog">Bugun: ${ts.done}/${ts.total} bajarildi (${ts.percent}%)</p>
    ${up.length ? `<section class="card" id="t-up"><h2>Yaqinlashayotgan muddatlar</h2><ul class="t-list">${up.map(row).join('')}</ul></section>` : ''}
    <div class="chips" role="group" aria-label="Filtr">${K.FILTERS.map((f) => `<button type="button" class="chip${f === st.filter ? ' on' : ''}" data-f="${f}" aria-pressed="${f === st.filter}">${K.FILTER_LABEL[f]}</button>`).join('')}</div>
    <div class="t-tools"><label class="fld inline"><span>Saralash</span><select id="t-sort"><option value="date"${st.sort === 'date' ? ' selected' : ''}>Sana bo'yicha</option><option value="priority"${st.sort === 'priority' ? ' selected' : ''}>Ustuvorlik bo'yicha</option></select></label><a class="btn-link-sm" href="#/reja/kategoriyalar">Kategoriyalar</a></div>
    ${none ? emptyState('Vazifalar hali yo\'q', "Birinchi vazifangizni qo'shing: u shifrlangan holda faqat shu qurilmada saqlanadi.") : rows.length ? `<ul class="t-list" id="t-list">${rows.map(row).join('')}</ul>` : emptyState('Bu filtr bo\'yicha vazifa yo\'q', "Boshqa filtrni tanlang yoki yangi vazifa qo'shing.")}
    <a class="fab" id="t-new" href="#/reja/yangi">${icon('plus', 20)}<span>Yangi vazifa</span></a>`;
  main.querySelectorAll('.chip').forEach((b) => { b.onclick = () => { st.filter = b.dataset.f; renderList(main); }; });
  $('#t-sort', main).onchange = (e) => { st.sort = e.target.value; renderList(main); };
  main.querySelectorAll('.t-check').forEach((b) => { b.onclick = async () => { b.disabled = true; try { await S.setDone(b.dataset.id, b.dataset.date, b.getAttribute('aria-pressed') !== 'true'); mountTasks(main, true); } catch (e) { toast(`Xatolik: ${e.message}`); b.disabled = false; } }; });
}

// ---------- Forma (yaratish / tahrirlash) ----------
function renderForm(main, route) {
  const editing = route.screen === 'edit', { tasks, cats } = st.data, T = K.localParts(nowMs()).date, cur = editing ? tasks.find((t) => t.id === route.id) : null;
  if (editing && !cur) { setHeader('Vazifa', '#/reja'); main.innerHTML = emptyState('Vazifa topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const v = cur || { title: '', description: '', date: T, startTime: null, endTime: null, priority: 'medium', categoryId: cats.some((c) => c.id === 'shaxsiy') ? 'shaxsiy' : K.FALLBACK_CATEGORY, repeat: 'none', reminder: null };
  const staleCat = !!cur && !cats.some((c) => c.id === cur.categoryId), catSel = staleCat ? K.FALLBACK_CATEGORY : v.categoryId; // vazifaning kategoriyasi o'chirilgan: jimgina birinchi variantga emas, "Boshqa"ga o'tadi va foydalanuvchiga aytiladi
  setHeader(editing ? 'Vazifani tahrirlash' : 'Yangi vazifa', editing ? `#/reja/${cur.id}` : '#/reja');
  const err = (f) => `<p class="err" id="e-${f}" role="alert"></p>`;
  main.innerHTML = `<form id="t-form" class="t-form" novalidate>
    <label class="fld"><span>Vazifa nomi *</span><input id="f-title" name="title" type="text" maxlength="${K.LIMITS.title}" autocomplete="off" enterkeyhint="next" value="${esc(v.title)}">${err('title')}</label>
    <label class="fld"><span>Tavsif</span><textarea id="f-description" name="description" rows="3" maxlength="${K.LIMITS.description}" autocomplete="off">${esc(v.description)}</textarea>${err('description')}</label>
    <label class="fld"><span>Sana *</span><input id="f-date" name="date" type="date" value="${esc(v.date)}">${err('date')}</label>
    <div class="two"><label class="fld"><span>Boshlanish</span><input id="f-startTime" name="startTime" type="time" value="${esc(v.startTime || '')}">${err('startTime')}</label><label class="fld"><span>Tugash</span><input id="f-endTime" name="endTime" type="time" value="${esc(v.endTime || '')}">${err('endTime')}</label></div>
    <fieldset class="seg"><legend>Ustuvorlik</legend>${K.PRIORITIES.map((p) => `<label class="seg-i p-${p}"><input type="radio" name="priority" value="${p}"${v.priority === p ? ' checked' : ''}><span>${K.PRIORITY_LABEL[p]}</span></label>`).join('')}</fieldset>${err('priority')}
    <label class="fld"><span>Kategoriya</span><select id="f-categoryId" name="categoryId">${catOptions(cats, catSel)}</select>${staleCat ? `<small id="f-cat-note">Avvalgi kategoriya o'chirilgan: «${esc(K.categoryName(K.FALLBACK_CATEGORY, cats))}» tanlandi.</small>` : ''}${err('categoryId')}</label>
    <label class="fld"><span>Takrorlanish</span><select id="f-repeat" name="repeat">${K.REPEATS.map((r) => `<option value="${r}"${v.repeat === r ? ' selected' : ''}>${K.REPEAT_LABEL[r]}</option>`).join('')}</select>${err('repeat')}</label>
    <label class="fld"><span>Eslatma</span><select id="f-reminder" name="reminder">${K.REMINDER_OPTIONS.map((r) => `<option value="${r === null ? '' : r}"${v.reminder === r ? ' selected' : ''}>${r === null ? "Yo'q" : K.REMINDER_LABEL[r]}</option>`).join('')}</select><small>Boshlanish vaqti kerak. Eslatma hozircha faqat ilova ochiq bo'lganda ko'rsatiladi.</small>${err('reminder')}</label>
    <p class="err" id="e-form" role="alert"></p><button class="btn" id="f-save" type="submit">Saqlash</button><a class="btn btn-2" href="${editing ? `#/reja/${cur.id}` : '#/reja'}">Bekor qilish</a></form>`;
  const form = $('#t-form', main);
  form.addEventListener('focusin', (e) => { const t = e.target; setTimeout(() => { if (t.isConnected && t.scrollIntoView) t.scrollIntoView({ block: 'center' }); }, 250); });
  form.onsubmit = async (ev) => {
    ev.preventDefault(); main.querySelectorAll('.err').forEach((e) => { e.textContent = ''; }); main.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    const fd = new FormData(form), input = Object.fromEntries(fd.entries()), res = K.validateTask(input, { categoryIds: cats.map((c) => c.id) });
    const show = (errors) => { const keys = Object.keys(errors); keys.forEach((k) => { const e = $(`#e-${k}`, main); if (e) e.textContent = errors[k]; const f = $(`#f-${k}`, main); if (f) f.setAttribute('aria-invalid', 'true'); }); const first = keys.map((k) => $(`#f-${k}`, main)).find(Boolean); if (first) first.focus(); };
    if (!res.ok) return show(res.errors);
    const btn = $('#f-save', main); btn.disabled = true; btn.textContent = 'Saqlanmoqda…';
    try { if (editing) { await S.updateTask(cur.id, input); goto(`#/reja/${cur.id}`); } else { await S.createTask(input); goto('#/reja'); } }
    catch (e) { btn.disabled = false; btn.textContent = 'Saqlash'; if (e.name === 'ValidationError') { if (e.errors.categoryId) { try { const fresh = await S.loadCategories(); st.data.cats = fresh; cats.splice(0, cats.length, ...fresh); const sel = $('#f-categoryId', main); if (sel) sel.innerHTML = catOptions(fresh, K.FALLBACK_CATEGORY); } catch (_) { /* ro'yxat yangilanmadi: xato matni baribir ko'rinadi */ } } show(e.errors); } else $('#e-form', main).textContent = `Saqlab bo'lmadi: ${e.message}`; }
  };
}

// ---------- Tafsilot ----------
function renderDetail(main, route) {
  const { tasks, completions, cats } = st.data, n = nowMs(), T = K.localParts(n).date, t = tasks.find((x) => x.id === route.id);
  setHeader('Vazifa', '#/reja'); if (!t) { main.innerHTML = emptyState('Vazifa topilmadi', "U o'chirilgan bo'lishi mumkin."); return; }
  const rec = K.isRecurring(t), idx = K.indexCompletions(completions), hist = rec ? [...(idx.get(t.id) || new Map()).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)) : [];
  const d = route.date && K.isOccurrence(t, route.date) ? route.date : rec ? K.latestOnOrBefore(t, T) || K.nextAfter(t, T) : t.date;
  const row = K.buildRows([t], completions, 'all', n).find((r) => r.date === d) || { key: `${t.id}@${d}`, taskId: t.id, date: d, done: rec ? (idx.get(t.id) || new Map()).has(d) : t.status === 'done', task: t };
  const over = K.isOverdue(row, n), status = row.done ? 'Bajarilgan' : over ? "Muddati o'tgan" : 'Bajarilmagan', tm = timeText(t);
  const kv = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
  main.innerHTML = `<article class="card t-detail"><h2 id="d-title">${esc(t.title)}</h2><p class="badge ${row.done ? 'ok' : over ? 'bad' : ''}" id="d-status">${status}</p>
    <dl class="kv wide">${kv('Sana', esc(K.fmtDateUz(d, T)) + (rec ? ` (${esc(d)})` : ` (${esc(d)})`))}${tm ? kv('Vaqt', esc(tm)) : ''}${kv('Ustuvorlik', esc(K.PRIORITY_LABEL[t.priority]))}${kv('Kategoriya', esc(K.categoryName(t.categoryId, cats)))}${kv('Takrorlanish', esc(K.REPEAT_LABEL[t.repeat]))}${t.reminder != null ? kv('Eslatma', esc(K.REMINDER_LABEL[t.reminder])) : ''}</dl>
    ${t.description ? `<p class="t-desc" id="d-desc">${esc(t.description)}</p>` : ''}</article>
    <button class="btn" id="d-toggle" type="button">${row.done ? 'Qayta faollashtirish' : 'Bajarildi'}</button><a class="btn btn-2" id="d-edit" href="#/reja/${t.id}/tahrir">Tahrirlash</a><button class="btn btn-danger-o" id="d-del" type="button">O'chirish</button>
    ${rec ? `<section class="card" id="d-hist"><h2>Bajarilish tarixi</h2>${hist.length ? `<ul class="hist">${hist.slice(0, 60).map(([date, at]) => `<li><span>${esc(K.fmtDateUz(date, T))} <small>${esc(date)}</small></span><button type="button" class="btn-link-sm" data-undo-date="${esc(date)}">Bekor qilish</button></li>`).join('')}</ul>` : '<p class="muted">Hali bajarilgan kun yo\'q.</p>'}</section>` : ''}`;
  $('#d-toggle', main).onclick = async (e) => { e.target.disabled = true; try { await S.setDone(t.id, d, !row.done); mountTasks(main, true); } catch (er) { toast(`Xatolik: ${er.message}`); e.target.disabled = false; } };
  main.querySelectorAll('[data-undo-date]').forEach((b) => { b.onclick = async () => { b.disabled = true; try { await S.setDone(t.id, b.dataset.undoDate, false); mountTasks(main, true); } catch (er) { toast(`Xatolik: ${er.message}`); b.disabled = false; } }; });
  $('#d-del', main).onclick = async () => {
    if (!(await confirmDialog(main, { title: "Vazifa o'chirilsinmi?", text: `"${t.title}"${rec ? " va uning bajarilish tarixi" : ''} o'chiriladi.`, ok: "O'chirish" }))) return;
    try { const undo = await S.deleteTask(t.id); st.undo = undo; toast("Vazifa o'chirildi", async () => { await S.restoreTask(undo); st.undo = null; }); goto('#/reja'); } catch (er) { toast(`O'chirib bo'lmadi: ${er.message}`); }
  };
}

// ---------- Kategoriyalar ----------
function renderCategories(main) {
  setHeader('Kategoriyalar', '#/reja'); const { cats } = st.data;
  main.innerHTML = `<ul class="list cat-list" id="c-list">${cats.map((c) => `<li class="cat" data-id="${esc(c.id)}"><input class="cat-in" type="text" maxlength="${K.LIMITS.categoryName}" autocomplete="off" aria-label="Kategoriya nomi" value="${esc(c.name)}"><button type="button" class="btn-link-sm c-save">Saqlash</button>${c.id === K.FALLBACK_CATEGORY ? '' : `<button type="button" class="btn-link-sm danger c-del" aria-label="${esc(c.name)} ni o'chirish">${icon('trash', 18)}</button>`}</li>`).join('')}</ul>
    <p class="err" id="c-err" role="alert"></p><form id="c-add" class="c-add" novalidate><label class="fld"><span>Yangi kategoriya</span><input id="c-new" type="text" maxlength="${K.LIMITS.categoryName}" autocomplete="off"></label><button class="btn" type="submit">Qo'shish</button></form>`;
  const fail = (e) => { $('#c-err', main).textContent = e.name === 'ValidationError' ? Object.values(e.errors)[0] : `Xatolik: ${e.message}`; };
  main.querySelectorAll('.cat').forEach((li) => {
    const id = li.dataset.id, name = () => $('.cat-in', li).value;
    $('.c-save', li).onclick = async () => { try { await S.renameCategory(id, name()); $('#c-err', main).textContent = ''; mountTasks(main, true); } catch (e) { fail(e); } };
    const del = $('.c-del', li); if (del) del.onclick = async () => { if (!(await confirmDialog(main, { title: "Kategoriya o'chirilsinmi?", text: `"${name()}" o'chiriladi, undagi vazifalar "Boshqa"ga ko'chadi.`, ok: "O'chirish" }))) return; try { await S.deleteCategory(id); } catch (e) { fail(e); } };
  });
  $('#c-add', main).onsubmit = async (e) => { e.preventDefault(); try { await S.addCategory($('#c-new', main).value); } catch (er) { fail(er); } };
}
