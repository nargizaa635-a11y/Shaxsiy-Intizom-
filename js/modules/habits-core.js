// Odatlar: sof mantiq (DOM va IndexedDB'siz). Tekshiruv, jadval, streak, foiz, oylik kalendar.
// Sanalar "YYYY-MM-DD" (mahalliy kalendar). Barcha hisob-kitoblar `today` (yoki nowMs) ni parametr sifatida oladi (testlanadi).
//
// HISOB-KITOB QOIDALARI (Tahlil moduli ham shularga tayanadi):
// - "Jadvalli kun": odat boshlanish sanasidan (startDate) bugungacha, takrorlanish qoidasiga mos kun.
// - Bajarilgan kun: jadvalli kunda yozuv (log) bor. Jadvaldan tashqari kundagi yozuv (jadval keyin o'zgargan bo'lsa) streak va foizga kirmaydi.
// - Joriy streak: bugundan orqaga qarab ketma-ket bajarilgan JADVALLI kunlar. Bugun jadvalli, lekin hali bajarilmagan bo'lsa, streak uzilmaydi
//   (kun tugamagan), bugun hisobga qo'shilmaydi. Jadvaldan tashqari kunlar streakni uzmaydi.
// - Eng uzun streak: butun tarix bo'yicha shu qoidalar.
// - Bajarilish foizi = bajarilgan jadvalli kunlar / jadvalli kunlar. Bugun bajarilmagan bo'lsa mukammal emas deb sanalmaydi (maxrajga kirmaydi).
//   Jadvalli kun bo'lmasa foiz `null` (soxta 0% yoki 100% ko'rsatilmaydi).
import { parseDate, toDays, addDays, weekday, daysInMonth, fmtDate } from './dates.js';

export const FREQS = ['daily', 'weekly', 'interval'];
export const FREQ_LABEL = { daily: 'Har kuni', weekly: 'Hafta kunlari', interval: 'Har N kunda' };
export const WEEKDAY_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']; // dushanba = 0 (dates.weekday bilan bir xil)
export const WEEKDAY_LABEL = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
export const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const CATEGORIES = [['sogliq', "Sog'liq"], ['oqish', "O'qish"], ['ish', 'Ish'], ['shaxsiy', 'Shaxsiy'], ['boshqa', 'Boshqa']].map(([id, name]) => ({ id, name }));
export const FALLBACK_CATEGORY = 'boshqa';
export const LIMITS = { title: 60, description: 500, everyMin: 2, everyMax: 60 };
export const STATUSES = ['active', 'archived'];
export const SCHEMA_V = 1;
export const MAX_SPAN_DAYS = 3660; // hisob-kitob uchun eng ko'pi bilan ~10 yil orqaga
export const WINDOW_DAYS = 30;

export const categoryName = (id) => (CATEGORIES.find((c) => c.id === id) || CATEGORIES.find((c) => c.id === FALLBACK_CATEGORY)).name;

// ---------- Tekshiruv ----------
const toInt = (v) => (typeof v === 'number' ? v : /^-?\d+$/.test(String(v).trim()) ? Number(v) : NaN);
export function validateHabit(input, { today } = {}) {
  const errors = {}, str = (v) => String(v == null ? '' : v).trim();
  const title = str(input.title), description = str(input.description);
  const freq = input.freq == null || input.freq === '' ? 'daily' : input.freq;
  const startDate = str(input.startDate) === '' ? (today || '') : str(input.startDate);
  const hasCat = input.categoryId != null && input.categoryId !== '';
  if (!title) errors.title = 'Odat nomini kiriting.'; else if (title.length > LIMITS.title) errors.title = `Nom ${LIMITS.title} belgidan oshmasin.`;
  if (description.length > LIMITS.description) errors.description = `Tavsif ${LIMITS.description} belgidan oshmasin.`;
  if (hasCat && !CATEGORIES.some((c) => c.id === input.categoryId)) errors.categoryId = "Kategoriya noto'g'ri.";
  if (!FREQS.includes(freq)) errors.freq = "Takrorlanish noto'g'ri.";
  if (!parseDate(startDate)) errors.startDate = "To'g'ri sanani kiriting.";
  let weekdays = [], every = null;
  if (freq === 'weekly') {
    const raw = Array.isArray(input.weekdays) ? input.weekdays : input.weekdays == null || input.weekdays === '' ? [] : [input.weekdays];
    const ints = raw.map(toInt);
    if (ints.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) errors.weekdays = "Hafta kuni noto'g'ri.";
    else if (!ints.length) errors.weekdays = 'Kamida bitta hafta kunini tanlang.';
    else weekdays = [...new Set(ints)].sort((a, b) => a - b);
  }
  if (freq === 'interval') {
    const n = toInt(input.every);
    if (!Number.isInteger(n) || n < LIMITS.everyMin || n > LIMITS.everyMax) errors.every = `Kunlar sonini ${LIMITS.everyMin}–${LIMITS.everyMax} oralig'ida kiriting.`;
    else every = n;
  }
  return { ok: Object.keys(errors).length === 0, errors, value: { title, description, categoryId: hasCat && CATEGORIES.some((c) => c.id === input.categoryId) ? input.categoryId : FALLBACK_CATEGORY, freq, weekdays, every, startDate } };
}

export const normalizeHabit = (rec) => ({ title: '', description: '', categoryId: FALLBACK_CATEGORY, freq: 'daily', weekdays: [], every: null, startDate: '', status: 'active', ...rec, schemaV: SCHEMA_V });

// Yozuv kaliti ochiq saqlanadi, shuning uchun sana va odat identifikatori undan ko'rinmasligi kerak: SHA-256(habitId|date) hex.
// Aniqlangan kalit (deterministik) bir kunga ikki yozuv yaratilishiga yo'l qo'ymaydi (ikki tab bir vaqtda bossa ham ConstraintError).
export async function logId(habitId, date) {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`si:habit-log|${habitId}|${date}`)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Jadval ----------
export function isScheduled(h, date) {
  if (!parseDate(date) || !parseDate(h.startDate) || date < h.startDate) return false;
  switch (h.freq) {
    case 'weekly': return h.weekdays.includes(weekday(date));
    case 'interval': return h.every >= 1 && (toDays(date) - toDays(h.startDate)) % h.every === 0;
    default: return true;
  }
}
export function scheduledDates(h, from, to) {
  if (!parseDate(h.startDate) || !parseDate(from) || !parseDate(to)) return [];
  let a = from < h.startDate ? h.startDate : from;
  if (a > to) return [];
  if (toDays(to) - toDays(a) > MAX_SPAN_DAYS) a = addDays(to, -MAX_SPAN_DAYS);
  const out = [];
  for (let d = a; d <= to; d = addDays(d, 1)) if (isScheduled(h, d)) out.push(d);
  return out;
}
export function scheduleText(h) {
  if (h.freq === 'weekly') return h.weekdays.map((i) => WEEKDAY_SHORT[i]).join(', ');
  if (h.freq === 'interval') return `Har ${h.every} kunda`;
  return FREQ_LABEL.daily;
}

// ---------- Yozuvlar (logs) ----------
// Har bir yozuv: { id, habitId, date, doneAt }. Natija: habitId -> Set(sana)
export function indexLogs(logs) {
  const m = new Map();
  for (const l of logs) { if (!m.has(l.habitId)) m.set(l.habitId, new Set()); m.get(l.habitId).add(l.date); }
  return m;
}
export function splitLogs(habits, logs) {
  const ids = new Set(habits.map((h) => h.id));
  return { logs: logs.filter((l) => ids.has(l.habitId)), orphans: logs.filter((l) => !ids.has(l.habitId)) };
}

// ---------- Statistika ----------
const pct = (done, den) => (den === 0 ? null : Math.round((done / den) * 100));
export function habitStats(h, done, today, windowDays = WINDOW_DAYS) {
  const dates = scheduledDates(h, h.startDate, today), has = (d) => done.has(d);
  let current = 0, best = 0, run = 0, total = 0;
  for (let i = dates.length - 1; i >= 0; i--) { const d = dates[i]; if (has(d)) current++; else if (d === today) continue; else break; }
  for (const d of dates) { if (has(d)) { run++; total++; if (run > best) best = run; } else if (d !== today) run = 0; }
  const rate = (list) => pct(list.filter(has).length, list.filter((d) => has(d) || d !== today).length);
  const from = addDays(today, -(windowDays - 1));
  const scheduledToday = isScheduled(h, today);
  return { current, best, total, scheduledDays: dates.length, rateAll: rate(dates), rateWindow: rate(dates.filter((d) => d >= from)), scheduledToday, doneToday: scheduledToday && has(today) };
}

// Bugungi holat (faqat faol odatlar): Bosh sahifa va Tahlil uchun ham shu funksiya.
export function todayStats(habits, logs, today) {
  const idx = indexLogs(logs); let total = 0, done = 0;
  for (const h of habits) { if (h.status !== 'active' || !isScheduled(h, today)) continue; total++; if ((idx.get(h.id) || new Set()).has(today)) done++; }
  return { total, done, pending: total - done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function summary(habits, logs, today) {
  const idx = indexLogs(logs), active = habits.filter((h) => h.status === 'active');
  const per = new Map(active.map((h) => [h.id, habitStats(h, idx.get(h.id) || new Set(), today)]));
  const rates = [...per.values()].map((s) => s.rateWindow).filter((r) => r !== null);
  const cats = CATEGORIES.map((c) => {
    const list = active.filter((h) => h.categoryId === c.id), r = list.map((h) => per.get(h.id).rateWindow).filter((x) => x !== null);
    return { id: c.id, name: c.name, count: list.length, rate: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null };
  }).filter((c) => c.count > 0);
  return { per, today: todayStats(habits, logs, today), bestCurrent: Math.max(0, ...[...per.values()].map((s) => s.current)), avgRate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null, cats };
}

// ---------- Oylik kalendar ----------
// Holat: done | missed | pending (bugun, hali bajarilmagan) | future (jadvalli, kelajak) | off (jadvalda yo'q) | before (boshlanishdan oldin)
export function monthGrid(h, done, y, m, today) {
  const n = daysInMonth(y, m), lead = weekday(fmtDate(y, m, 1)), cells = Array(lead).fill(null); let d = 0, x = 0;
  for (let day = 1; day <= n; day++) {
    const date = fmtDate(y, m, day), sch = isScheduled(h, date);
    const state = done.has(date) && sch ? 'done' : date < h.startDate ? 'before' : !sch ? 'off' : date > today ? 'future' : date === today ? 'pending' : 'missed';
    if (state === 'done') d++; if (state === 'missed') x++;
    cells.push({ date, day, state, scheduled: sch, canToggle: sch && date <= today });
  }
  return { y, m, cells, done: d, missed: x };
}
export const monthOf = (date) => { const p = parseDate(date); return { y: p.y, m: p.m }; };
export const shiftMonth = (y, m, delta) => { const t = y * 12 + (m - 1) + delta; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; };

// ---------- Manzil ----------
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
export function parseHabitsHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, ''), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi), query = qi < 0 ? '' : raw.slice(qi + 1), parts = path.split('/').filter(Boolean).slice(1);
  let month = null; for (const kv of query.split('&')) { const i = kv.indexOf('='); if (i > 0 && safeDecode(kv.slice(0, i)) === 'm') { const mm = /^(\d{4})-(\d{2})$/.exec(safeDecode(kv.slice(i + 1))); if (mm && +mm[2] >= 1 && +mm[2] <= 12 && +mm[1] >= 1970 && +mm[1] <= 2200) month = { y: +mm[1], m: +mm[2] }; } }
  if (!parts.length) return { screen: 'list' };
  if (parts[0] === 'yangi') return { screen: 'new' };
  if (parts[1] === 'tahrir') return { screen: 'edit', id: parts[0] };
  return { screen: 'detail', id: parts[0], month };
}
