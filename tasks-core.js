// Vazifalar: sof mantiq (DOM va IndexedDB'siz). Sana/vaqt, tekshiruv, takrorlanish, bajarilish tarixi, filtr, saralash, hisob-kitob, eslatma.
// Sanalar "YYYY-MM-DD" (mahalliy kalendar), vaqtlar "HH:MM". Barcha funksiyalar `nowMs` ni parametr sifatida oladi (testlanadi).

import { daysInMonth, fmtDate, parseDate, toDays, addDays, parseTime, localParts, localMs } from './dates.js';
export { daysInMonth, fmtDate, parseDate, toDays, fromDays, addDays, weekday, parseTime, localParts, localMs, fmtDateUz } from './dates.js'; // tashqi kod uchun avvalgi API saqlanadi

export const PRIORITIES = ['low', 'medium', 'high'];
export const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
export const PRIORITY_LABEL = { low: 'Past', medium: "O'rta", high: 'Yuqori' };
export const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
export const REPEAT_LABEL = { none: "Yo'q", daily: 'Har kuni', weekly: 'Har hafta', monthly: 'Har oy' };
export const REMINDER_OPTIONS = [null, 0, 5, 15, 30, 60, 1440];
export const REMINDER_LABEL = { 0: 'Boshlanish vaqtida', 5: '5 daqiqa oldin', 15: '15 daqiqa oldin', 30: '30 daqiqa oldin', 60: '1 soat oldin', 1440: '1 kun oldin' };
export const FILTERS = ['all', 'today', 'tomorrow', 'upcoming', 'done', 'undone', 'overdue'];
export const FILTER_LABEL = { all: 'Barchasi', today: 'Bugun', tomorrow: 'Ertaga', upcoming: 'Kelgusi', done: 'Bajarilgan', undone: 'Bajarilmagan', overdue: "Muddati o'tgan" };
export const FALLBACK_CATEGORY = 'boshqa';
export const DEFAULT_CATEGORIES = [['shaxsiy', 'Shaxsiy'], ['ish', 'Ish'], ['oqish', "O'qish"], ['sogliq', "Sog'liq"], ['oila', 'Oila'], ['boshqa', 'Boshqa']].map(([id, name], order) => ({ id, name, order }));
export const LIMITS = { title: 120, description: 1000, categoryName: 30 };
export const REMINDER_GRACE_MS = 60 * 60000; // boshlanishdan keyin 1 soatgacha o'tkazib yuborilgan eslatma ko'rsatiladi
export const SCHEMA_V = 1;

// ---------- Tekshiruv ----------
export function validateTask(input, { categoryIds = DEFAULT_CATEGORIES.map((c) => c.id) } = {}) {
  const errors = {}, str = (v) => String(v == null ? '' : v).trim(), time = (v) => { const s = str(v); return s === '' ? null : s; };
  const title = str(input.title), description = str(input.description), date = str(input.date), startTime = time(input.startTime), endTime = time(input.endTime);
  const priority = input.priority == null || input.priority === '' ? 'medium' : input.priority, repeat = input.repeat == null || input.repeat === '' ? 'none' : input.repeat;
  const reminder = input.reminder == null || input.reminder === '' ? null : Number(input.reminder);
  if (!title) errors.title = 'Vazifa nomini kiriting.'; else if (title.length > LIMITS.title) errors.title = `Nom ${LIMITS.title} belgidan oshmasin.`;
  if (description.length > LIMITS.description) errors.description = `Tavsif ${LIMITS.description} belgidan oshmasin.`;
  if (!parseDate(date)) errors.date = "To'g'ri sanani kiriting.";
  if (startTime && parseTime(startTime) == null) errors.startTime = "Boshlanish vaqti noto'g'ri.";
  if (endTime && parseTime(endTime) == null) errors.endTime = "Tugash vaqti noto'g'ri.";
  if (!errors.startTime && !errors.endTime && startTime && endTime && parseTime(endTime) <= parseTime(startTime)) errors.endTime = "Tugash vaqti boshlanishdan keyin bo'lsin.";
  if (!PRIORITIES.includes(priority)) errors.priority = "Ustuvorlik noto'g'ri.";
  if (!REPEATS.includes(repeat)) errors.repeat = "Takrorlanish noto'g'ri.";
  if (reminder !== null && !REMINDER_OPTIONS.includes(reminder)) errors.reminder = "Eslatma vaqti noto'g'ri.";
  else if (reminder !== null && !startTime && !errors.startTime) errors.reminder = 'Eslatma uchun boshlanish vaqtini kiriting.';
  const hasCat = input.categoryId != null && input.categoryId !== '';
  if (hasCat && !categoryIds.includes(input.categoryId)) errors.categoryId = "Tanlangan kategoriya topilmadi (o'chirilgan bo'lishi mumkin). Ro'yxatdan boshqasini tanlang.";
  const categoryId = hasCat && categoryIds.includes(input.categoryId) ? input.categoryId : FALLBACK_CATEGORY; // kategoriya umuman berilmasa: standart "Boshqa"
  return { ok: Object.keys(errors).length === 0, errors, value: { title, description, date, startTime, endTime, priority, categoryId, repeat, reminder } };
}
export function validateCategoryName(name, existing = [], selfId = null) {
  const n = String(name == null ? '' : name).trim();
  if (!n) return { ok: false, error: 'Kategoriya nomini kiriting.' };
  if (n.length > LIMITS.categoryName) return { ok: false, error: `Nom ${LIMITS.categoryName} belgidan oshmasin.` };
  if (existing.some((c) => c.id !== selfId && c.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'Bunday kategoriya bor.' };
  return { ok: true, value: n };
}
export const categoryName = (id, cats) => (cats.find((c) => c.id === id) || cats.find((c) => c.id === FALLBACK_CATEGORY) || { name: 'Boshqa' }).name;

// ---------- Yozuvlar: vazifa va bajarilish tarixi (completion) bitta store'da, `kind` bilan ajratiladi ----------
export function normalizeTask(rec) {
  return { title: '', description: '', date: '', startTime: null, endTime: null, priority: 'medium', categoryId: FALLBACK_CATEGORY, reminder: null, repeat: 'none', status: 'active', doneAt: null, ...rec, kind: 'task', schemaV: SCHEMA_V };
}
export function splitRecords(records) {
  const tasks = [], completions = [];
  for (const r of records) (r.kind === 'completion' ? completions : tasks).push(r.kind === 'completion' ? r : normalizeTask(r));
  const ids = new Set(tasks.map((t) => t.id));
  return { tasks, completions: completions.filter((c) => ids.has(c.taskId)), orphans: completions.filter((c) => !ids.has(c.taskId)) };
}
// (taskId, sana) bo'yicha takrorlar bitta deb hisoblanadi (ikki tab bir vaqtda bajarsa ham tarix buzilmaydi)
export function indexCompletions(completions) {
  const idx = new Map();
  for (const c of completions) { if (!idx.has(c.taskId)) idx.set(c.taskId, new Map()); const m = idx.get(c.taskId); if (!m.has(c.date) || (c.doneAt || 0) < (m.get(c.date) || 0)) m.set(c.date, c.doneAt || 0); }
  return idx;
}

// ---------- Takrorlanish ----------
export const isRecurring = (t) => t.repeat !== 'none';
export function isOccurrence(t, d) {
  if (!parseDate(d) || d < t.date) return false;
  switch (t.repeat) {
    case 'daily': return true;
    case 'weekly': return (toDays(d) - toDays(t.date)) % 7 === 0;
    case 'monthly': { const a = parseDate(t.date), p = parseDate(d); return p.d === Math.min(a.d, daysInMonth(p.y, p.m)); }
    default: return d === t.date;
  }
}
export function latestOnOrBefore(t, d) {
  if (d < t.date) return null;
  switch (t.repeat) {
    case 'daily': return d;
    case 'weekly': return addDays(d, -((toDays(d) - toDays(t.date)) % 7));
    case 'monthly': {
      const a = parseDate(t.date); let { y, m } = parseDate(d);
      for (let i = 0; i < 2; i++) { const c = fmtDate(y, m, Math.min(a.d, daysInMonth(y, m))); if (c <= d && c >= t.date) return c; m--; if (m < 1) { m = 12; y--; } }
      return null;
    }
    default: return t.date <= d ? t.date : null;
  }
}
export function nextAfter(t, d) {
  if (t.repeat === 'none') return t.date > d ? t.date : null;
  if (d < t.date) return t.date;
  switch (t.repeat) {
    case 'daily': return addDays(d, 1);
    case 'weekly': return addDays(d, 7 - ((toDays(d) - toDays(t.date)) % 7));
    default: { // monthly
      const a = parseDate(t.date); let { y, m } = parseDate(d);
      for (let i = 0; i < 3; i++) { const c = fmtDate(y, m, Math.min(a.d, daysInMonth(y, m))); if (c > d) return c; m++; if (m > 12) { m = 1; y++; } }
      return null;
    }
  }
}
export function occurrencesBetween(t, from, to, limit = 400) {
  const out = []; let d = isOccurrence(t, from) ? from : nextAfter(t, from);
  while (d && d <= to && out.length < limit) { out.push(d); d = nextAfter(t, d); }
  return out;
}

// ---------- Hodisa (occurrence) qatorlari ----------
function occDone(t, idx, date) {
  if (!isRecurring(t)) return t.status === 'done' && date === t.date ? { done: true, doneAt: t.doneAt || null } : { done: false, doneAt: null };
  const m = idx.get(t.id); return m && m.has(date) ? { done: true, doneAt: m.get(date) || null } : { done: false, doneAt: null };
}
const mkRow = (t, d, idx) => { const o = occDone(t, idx, d); return { key: `${t.id}@${d}`, taskId: t.id, date: d, done: o.done, doneAt: o.doneAt, task: t }; };
export function isOverdue(row, nowMs) {
  if (row.done) return false;
  const { date, time } = localParts(nowMs);
  return row.date < date || (row.date === date && !!row.task.endTime && row.task.endTime < time);
}
export function buildRows(tasks, completions, filter, nowMs) {
  const T = localParts(nowMs).date, tomorrow = addDays(T, 1), idx = indexCompletions(completions), rows = [], seen = new Set();
  const push = (r) => { if (!seen.has(r.key)) { seen.add(r.key); rows.push(r); } };
  for (const t of tasks) {
    const rec = isRecurring(t), mk = (d) => mkRow(t, d, idx);
    const missed = rec ? latestOnOrBefore(t, addDays(T, -1)) : (t.date < T ? t.date : null); // eng so'nggi o'tkazib yuborilgan hodisa
    const cur = rec ? (isOccurrence(t, T) ? T : null) : (t.date === T ? T : null), nxt = rec ? nextAfter(t, T) : (t.date > T ? t.date : null);
    switch (filter) {
      case 'today': if (cur) push(mk(cur)); break;
      case 'tomorrow': if (isOccurrence(t, tomorrow)) push(mk(tomorrow)); break;
      case 'upcoming': if (nxt) push(mk(nxt)); break;
      case 'done': if (!rec) { if (t.status === 'done') push(mk(t.date)); } else for (const d of (idx.get(t.id) || new Map()).keys()) push(mk(d)); break;
      case 'overdue': for (const d of [missed, cur]) if (d) { const r = mk(d); if (isOverdue(r, nowMs)) push(r); } break;
      case 'undone': for (const d of [missed, cur, nxt]) if (d) { const r = mk(d); if (!r.done) push(r); } break;
      default: // all
        if (!rec) push(mk(t.date));
        else { if (missed) { const r = mk(missed); if (!r.done) push(r); } if (cur) push(mk(cur)); if (nxt) push(mk(nxt)); }
    }
  }
  return rows;
}
const tkey = (r) => r.task.startTime || r.task.endTime || '99:99';
export function sortRows(rows, mode = 'date', filter = 'all') {
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0), byTime = (a, b) => (tkey(a) < tkey(b) ? -1 : tkey(a) > tkey(b) ? 1 : 0);
  const byPrio = (a, b) => PRIORITY_RANK[b.task.priority] - PRIORITY_RANK[a.task.priority], byTitle = (a, b) => a.task.title.localeCompare(b.task.title);
  const dir = mode === 'date' && filter === 'done' ? -1 : 1;
  return [...rows].sort(mode === 'priority' ? (a, b) => byPrio(a, b) || byDate(a, b) || byTime(a, b) || byTitle(a, b) : (a, b) => dir * byDate(a, b) || byTime(a, b) || byPrio(a, b) || byTitle(a, b));
}

// ---------- Hisob-kitob (to'liq statistika emas: faqat bosh sahifa ko'rsatkichlari) ----------
const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);
export function todayStats(tasks, completions, nowMs) {
  const rows = buildRows(tasks, completions, 'today', nowMs), done = rows.filter((r) => r.done).length;
  return { total: rows.length, done, pending: rows.length - done, percent: pct(done, rows.length) };
}
// Umumiy: barcha bir martalik vazifalar + bugungi takroriy hodisalar
export function overallStats(tasks, completions, nowMs) {
  const T = localParts(nowMs).date, idx = indexCompletions(completions); let total = 0, done = 0;
  for (const t of tasks) { const d = isRecurring(t) ? (isOccurrence(t, T) ? T : null) : t.date; if (!d) continue; total++; if (occDone(t, idx, d).done) done++; }
  return { total, done, pending: total - done, percent: pct(done, total) };
}
export function upcomingDue(tasks, completions, nowMs, days = 7) {
  const T = localParts(nowMs).date, end = addDays(T, days), idx = indexCompletions(completions), out = [];
  for (const t of tasks) {
    const cands = isRecurring(t) ? [isOccurrence(t, T) ? T : null, nextAfter(t, T)] : [t.date >= T ? t.date : null];
    for (const d of cands) { if (!d || d > end) continue; const r = mkRow(t, d, idx); if (!r.done && !isOverdue(r, nowMs)) { out.push(r); break; } }
  }
  return sortRows(out, 'date');
}

// ---------- Eslatmalar (hozir faqat ilova ochiq paytida; Android bildirishnomasi uchun `reminderInstants` tayyor) ----------
export function reminderAt(row) { const { reminder, startTime } = row.task; return reminder == null || !startTime ? null : localMs(row.date, startTime) - reminder * 60000; }
export function dueReminders(rows, nowMs, fired = new Set()) {
  const out = [];
  for (const r of rows) {
    if (r.done) continue; const at = reminderAt(r); if (at == null) continue;
    const key = `${r.key}#${r.task.reminder}`, start = localMs(r.date, r.task.startTime);
    if (!fired.has(key) && nowMs >= at && nowMs <= start + REMINDER_GRACE_MS) out.push({ key, row: r, at });
  }
  return out.sort((a, b) => a.at - b.at);
}
// Kelajak (bildirishnoma) uchun: [fromMs, toMs] oralig'idagi barcha bajarilmagan eslatma vaqtlari (takroriy hodisalar ham)
export function reminderInstants(tasks, completions, fromMs, toMs) {
  const idx = indexCompletions(completions), out = [], f = localParts(fromMs).date, to = addDays(localParts(toMs).date, 2);
  for (const t of tasks) {
    if (t.reminder == null || !t.startTime) continue;
    for (const d of occurrencesBetween(t, addDays(f, -1), to)) { const r = mkRow(t, d, idx); const at = reminderAt(r); if (!r.done && at != null && at >= fromMs && at <= toMs) out.push({ key: `${r.key}#${t.reminder}`, at, taskId: t.id, date: d }); }
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------- Manzil (#/reja/...) ----------
// Buzilgan foiz-kodlash (masalan "%", "%E0%A4%A") xato bermaydi: qiymat o'zgartirilmagan holda qoladi va keyingi tekshiruvlardan o'tmaydi.
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
export function parseTasksHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, ''), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi), query = qi < 0 ? '' : raw.slice(qi + 1), parts = path.split('/').filter(Boolean).slice(1);
  let d = null; for (const kv of query.split('&')) { const i = kv.indexOf('='); if (i > 0 && safeDecode(kv.slice(0, i)) === 'd') d = safeDecode(kv.slice(i + 1)); }
  const date = d && parseDate(d) ? d : null;
  if (!parts.length) return { screen: 'list' };
  if (parts[0] === 'yangi') return { screen: 'new' };
  if (parts[0] === 'kategoriyalar') return { screen: 'categories' };
  if (parts[1] === 'tahrir') return { screen: 'edit', id: parts[0], date };
  return { screen: 'detail', id: parts[0], date };
}
