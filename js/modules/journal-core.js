// Jurnal: sof mantiq (DOM va IndexedDB'siz). Tekshiruv, saralash, qidiruv, statistika, manzil.
// Sanalar "YYYY-MM-DD" (mahalliy kalendar). Hisob-kitoblar `today` ni parametr sifatida oladi (testlanadi).
//
// HISOB-KITOB QOIDALARI:
// - Ketma-ket kunlar (streak): kamida bitta yozuvi bor ketma-ket kunlar. Bugun yozuv bo'lmasa, streak uzilmaydi (kun tugamagan):
//   kecha yozuv bo'lsa kechadan orqaga sanaladi. Kecha ham, bugun ham yozuv bo'lmasa streak 0.
// - O'rtacha kayfiyat: oxirgi 30 kun (bugun ham) ichidagi kayfiyat belgilangan yozuvlar bo'yicha; belgilanmagan bo'lsa `null` (soxta qiymat yo'q).
// - Yozuv sanasi kelajakda bo'lmaydi.
import { parseDate, toDays, addDays } from './dates.js';

export const TYPES = [['daily', 'Kundalik'], ['note', 'Qayd'], ['gratitude', 'Minnatdorchilik'], ['reflection', 'Mulohaza']].map(([id, name]) => ({ id, name }));
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.name]));
export const DEFAULT_TYPE = 'daily';
export const MOODS = [[1, 'Juda yomon'], [2, 'Yomon'], [3, "O'rtacha"], [4, 'Yaxshi'], [5, 'Juda yaxshi']].map(([value, label]) => ({ value, label }));
export const LIMITS = { title: 100, body: 10000 };
export const SCHEMA_V = 1;
export const MOOD_WINDOW_DAYS = 30;

export const typeName = (id) => TYPE_LABEL[id] || TYPE_LABEL[DEFAULT_TYPE];
export const moodLabel = (v) => { const m = MOODS.find((x) => x.value === v); return m ? m.label : ''; };

// ---------- Tekshiruv ----------
const toInt = (v) => (typeof v === 'number' ? v : /^-?\d+$/.test(String(v).trim()) ? Number(v) : NaN);
export function validateEntry(input, { today } = {}) {
  const errors = {}, str = (v) => String(v == null ? '' : v);
  const title = str(input.title).trim(), body = str(input.body).replace(/\r\n?/g, '\n').trim();
  const type = input.type == null || input.type === '' ? DEFAULT_TYPE : input.type;
  const date = str(input.date).trim() === '' ? (today || '') : str(input.date).trim();
  let mood = null;
  if (title.length > LIMITS.title) errors.title = `Sarlavha ${LIMITS.title} belgidan oshmasin.`;
  if (!body) errors.body = 'Yozuv matnini kiriting.'; else if (body.length > LIMITS.body) errors.body = `Matn ${LIMITS.body} belgidan oshmasin.`;
  if (!TYPES.some((t) => t.id === type)) errors.type = "Yozuv turi noto'g'ri.";
  if (!parseDate(date)) errors.date = "To'g'ri sanani kiriting.";
  else if (today && date > today) errors.date = "Kelajak sanasiga yozib bo'lmaydi.";
  if (input.mood != null && String(input.mood).trim() !== '') {
    const n = toInt(input.mood);
    if (!Number.isInteger(n) || n < 1 || n > 5) errors.mood = "Kayfiyat 1–5 oralig'ida bo'lsin."; else mood = n;
  }
  return { ok: Object.keys(errors).length === 0, errors, value: { title, body, type: TYPES.some((t) => t.id === type) ? type : DEFAULT_TYPE, date, mood } };
}

export const normalizeEntry = (rec) => ({ title: '', body: '', type: DEFAULT_TYPE, date: '', mood: null, ...rec, schemaV: SCHEMA_V });

// ---------- Saralash, filtr, guruhlash ----------
// Yangi sana birinchi; bir kunda oxirgi yozilgani birinchi; to'liq teng bo'lsa id bo'yicha (barqaror tartib).
export function sortEntries(entries) {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (b.createdAt || 0) - (a.createdAt || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
const fold = (s) => String(s).toLocaleLowerCase('uz');
export function filterEntries(entries, { type = 'all', query = '' } = {}) {
  const q = fold(String(query).trim());
  return entries.filter((e) => (type === 'all' || e.type === type) && (!q || fold(e.title).includes(q) || fold(e.body).includes(q)));
}
export function groupByDate(sorted) {
  const out = [];
  for (const e of sorted) { const last = out[out.length - 1]; if (last && last.date === e.date) last.items.push(e); else out.push({ date: e.date, items: [e] }); }
  return out;
}
// Ro'yxatda ko'rsatiladigan nom: sarlavha, bo'lmasa matnning boshi.
export const entryHeading = (e, n = 60) => (e.title || clip(e.body, n));
export function clip(text, n = 120) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n).replace(/\s+\S*$/, '') || t.slice(0, n)}…`;
}

// ---------- Statistika ----------
export function streak(entries, today) {
  const days = new Set(entries.map((e) => e.date).filter((d) => parseDate(d) && d <= today));
  let cur = days.has(today) ? today : days.has(addDays(today, -1)) ? addDays(today, -1) : null, n = 0;
  while (cur && days.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}
export function bestStreak(entries, today) {
  const ds = [...new Set(entries.map((e) => e.date).filter((d) => parseDate(d) && d <= today))].map(toDays).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of ds) { run = prev !== null && d === prev + 1 ? run + 1 : 1; if (run > best) best = run; prev = d; }
  return best;
}
export function summary(entries, today) {
  const month = today.slice(0, 7), from = addDays(today, -(MOOD_WINDOW_DAYS - 1));
  const moods = entries.filter((e) => e.mood && e.date >= from && e.date <= today).map((e) => e.mood);
  return {
    total: entries.length,
    thisMonth: entries.filter((e) => e.date.startsWith(month)).length,
    streak: streak(entries, today),
    best: bestStreak(entries, today),
    avgMood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
    moodCount: moods.length,
  };
}

// ---------- Manzil ----------
// #/jurnal -> ro'yxat; #/jurnal/yangi; #/jurnal/<id>; #/jurnal/<id>/tahrir. Buzilgan kiritish xato bermaydi, ro'yxatga qaytadi.
const ID_RE = /^[0-9a-zA-Z-]{8,64}$/;
export function parseJournalHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, ''), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi), parts = path.split('/').filter(Boolean).slice(1);
  if (!parts.length) return { screen: 'list' };
  if (parts[0] === 'yangi') return { screen: 'new' };
  if (!ID_RE.test(parts[0])) return { screen: 'list' };
  if (parts[1] === 'tahrir') return { screen: 'edit', id: parts[0] };
  return { screen: 'detail', id: parts[0] };
}
