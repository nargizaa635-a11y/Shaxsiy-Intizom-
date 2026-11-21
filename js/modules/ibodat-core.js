// Ibodat: sof mantiq (DOM va IndexedDB'siz). Tekshiruv, kunlik ko'rinish, tarix, qaydlar, manzil.
// Sanalar "YYYY-MM-DD" (mahalliy kalendar). Hisob-kitoblar `today` ni parametr sifatida oladi (testlanadi).
//
// MAXFIYLIK VA BETARAFLIK QOIDALARI:
// - Barcha yozuvlar `worship_logs` store'ida, shifrlangan holda (database.js). Ochiq faqat id/createdAt/updatedAt.
//   Namoz va zikr yozuvlarining kaliti SHA-256 (tur|sana|nom): kalitdan sana yoki zikr nomi bilinmaydi; shu bilan bir kunga ikki yozuv yaratilmaydi.
// - Bu bo'lim FAQAT foydalanuvchi o'zi belgilagan narsani ko'rsatadi. Baho, ball, foiz, streak, "o'tkazib yuborilgan" yoki "qazo" tushunchasi YO'Q,
//   diniy hukm chiqarilmaydi. Statistika faqat neytral sanoq (belgilar, sahifalar, daqiqalar, zikr soni, qaydlar).
// - Ibodat ma'lumotlari Tahlil, Bosh sahifa va intizom indeksiga KIRMAYDI (maxfiy shaxsiy bo'lim).
// Yozuv turlari (`kind`): prayer {date, prayer, doneAt}; quran {date, pages, minutes, note}; dhikr {date, name, count, target}; note {date, title, body}.
import { parseDate, addDays } from './dates.js';
import { sortEntries, filterEntries, groupByDate, entryHeading, clip } from './journal-core.js';

export const PRAYERS = [['fajr', 'Bomdod'], ['dhuhr', 'Peshin'], ['asr', 'Asr'], ['maghrib', 'Shom'], ['isha', 'Xufton']].map(([id, name]) => ({ id, name }));
export const PRAYER_LABEL = Object.fromEntries(PRAYERS.map((p) => [p.id, p.name]));
export const KINDS = ['prayer', 'quran', 'dhikr', 'note'];
export const LIMITS = { pagesMax: 604, minutesMax: 720, quranNote: 200, dhikrName: 60, countMax: 1000000, targetMax: 1000000, noteTitle: 100, noteBody: 10000 };
export const SCHEMA_V = 1;
export const HISTORY_DAYS = 60;
export { sortEntries, filterEntries, groupByDate, entryHeading, clip };

const str = (v) => String(v == null ? '' : v);
const toInt = (v) => (typeof v === 'number' ? v : /^-?\d+$/.test(String(v).trim()) ? Number(v) : NaN);
const blank = (v) => v == null || String(v).trim() === '';
const dateOf = (input, today) => (blank(input.date) ? today || '' : str(input.date).trim());
function checkDate(date, today, errors) { if (!parseDate(date)) errors.date = "To'g'ri sanani kiriting."; else if (today && date > today) errors.date = "Kelajak sanasiga yozib bo'lmaydi."; }

// ---------- Kalitlar ----------
export const cleanName = (s) => str(s).replace(/\s+/g, ' ').trim();
export const nameKey = (s) => cleanName(s).toLocaleLowerCase('uz');
// Aniqlangan (deterministik) opaque kalit: SHA-256(`si:worship|<tur>|<qismlar>`) hex.
export async function recordId(kind, ...parts) {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`si:worship|${kind}|${parts.join('|')}`)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const prayerId = (date, prayer) => recordId('prayer', date, prayer);
export const dhikrId = (date, name) => recordId('dhikr', date, nameKey(name));

// ---------- Tekshiruv ----------
export function validatePrayer({ date, prayer }, { today } = {}) {
  const errors = {}; if (!PRAYER_LABEL[prayer]) errors.prayer = "Namoz turi noto'g'ri."; checkDate(str(date).trim(), today, errors);
  return { ok: Object.keys(errors).length === 0, errors, value: { date: str(date).trim(), prayer } };
}
// Qur'on o'qish: sahifa va/yoki daqiqa (kamida bittasi 0 dan katta).
export function validateQuran(input, { today } = {}) {
  const errors = {}, date = dateOf(input, today), note = str(input.note).replace(/\s+/g, ' ').trim(); let pages = 0, minutes = null;
  if (!blank(input.pages)) { const n = toInt(input.pages); if (!Number.isInteger(n) || n < 0 || n > LIMITS.pagesMax) errors.pages = `Sahifalar 0–${LIMITS.pagesMax} oralig'ida bo'lsin.`; else pages = n; }
  if (!blank(input.minutes)) { const n = toInt(input.minutes); if (!Number.isInteger(n) || n < 0 || n > LIMITS.minutesMax) errors.minutes = `Daqiqa 0–${LIMITS.minutesMax} oralig'ida bo'lsin.`; else minutes = n; }
  if (!errors.pages && !errors.minutes && pages === 0 && !minutes) errors.pages = 'Sahifa yoki daqiqani kiriting.';
  if (note.length > LIMITS.quranNote) errors.note = `Izoh ${LIMITS.quranNote} belgidan oshmasin.`;
  checkDate(date, today, errors);
  return { ok: Object.keys(errors).length === 0, errors, value: { date, pages, minutes: minutes || null, note } };
}
export function validateTarget(raw) {
  if (blank(raw)) return { ok: true, errors: {}, value: null };
  const n = toInt(raw); if (!Number.isInteger(n) || n < 1 || n > LIMITS.targetMax) return { ok: false, errors: { target: `Maqsad 1–${LIMITS.targetMax} oralig'ida bo'lsin.` }, value: null };
  return { ok: true, errors: {}, value: n };
}
export function validateDhikr(input, { today } = {}) {
  const errors = {}, name = cleanName(input.name), date = dateOf(input, today), t = validateTarget(input.target);
  if (!name) errors.name = 'Zikr nomini kiriting.'; else if (name.length > LIMITS.dhikrName) errors.name = `Nom ${LIMITS.dhikrName} belgidan oshmasin.`;
  if (!t.ok) Object.assign(errors, t.errors); checkDate(date, today, errors);
  return { ok: Object.keys(errors).length === 0, errors, value: { date, name, target: t.value } };
}
export function validateCount(raw) { const n = toInt(raw); return Number.isInteger(n) && n >= 0 && n <= LIMITS.countMax ? { ok: true, value: n } : { ok: false, value: null }; }
export function validateNote(input, { today } = {}) {
  const errors = {}, title = str(input.title).trim(), body = str(input.body).replace(/\r\n?/g, '\n').trim(), date = dateOf(input, today);
  if (title.length > LIMITS.noteTitle) errors.title = `Sarlavha ${LIMITS.noteTitle} belgidan oshmasin.`;
  if (!body) errors.body = 'Qayd matnini kiriting.'; else if (body.length > LIMITS.noteBody) errors.body = `Matn ${LIMITS.noteBody} belgidan oshmasin.`;
  checkDate(date, today, errors);
  return { ok: Object.keys(errors).length === 0, errors, value: { date, title, body } };
}

export const normalizeQuran = (r) => ({ date: '', pages: 0, minutes: null, note: '', ...r, kind: 'quran', schemaV: SCHEMA_V });
export const normalizeDhikr = (r) => ({ date: '', name: '', count: 0, target: null, ...r, kind: 'dhikr', schemaV: SCHEMA_V });
export const normalizeNote = (r) => ({ date: '', title: '', body: '', ...r, kind: 'note', schemaV: SCHEMA_V });

// `worship_logs` ni turlarga ajratadi. Noma'lum yoki buzuq yozuvlar ko'rsatilmaydi (tegilmaydi).
export function splitRecords(records) {
  const out = { prayers: [], quran: [], dhikr: [], notes: [] };
  for (const r of records) {
    if (!r || !parseDate(r.date)) continue;
    if (r.kind === 'prayer' && PRAYER_LABEL[r.prayer]) out.prayers.push({ id: r.id, date: r.date, prayer: r.prayer, doneAt: r.doneAt || null });
    else if (r.kind === 'quran') out.quran.push(normalizeQuran(r));
    else if (r.kind === 'dhikr') out.dhikr.push(normalizeDhikr(r));
    else if (r.kind === 'note') out.notes.push(normalizeNote(r));
  }
  return out;
}

// ---------- Kunlik ko'rinish ----------
export function dhikrProgress(d) {
  const target = d.target || null;
  return { count: d.count, target, percent: target ? Math.min(100, Math.round((d.count / target) * 100)) : null, reached: !!target && d.count >= target };
}
export function dayData(date, parts) {
  const prayers = new Set(parts.prayers.filter((p) => p.date === date).map((p) => p.prayer)), quran = parts.quran.filter((q) => q.date === date).sort((a, b) => a.createdAt - b.createdAt);
  const dhikr = parts.dhikr.filter((d) => d.date === date).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name)), notes = sortEntries(parts.notes.filter((n) => n.date === date));
  return { date, prayers, quran, dhikr, notes, pages: quran.reduce((a, q) => a + q.pages, 0), minutes: quran.reduce((a, q) => a + (q.minutes || 0), 0), dhikrTotal: dhikr.reduce((a, d) => a + d.count, 0) };
}
// Tez tanlash uchun avval ishlatilgan zikr nomlari: eng oxirgi ishlatilgani birinchi, takrorsiz (katta-kichik harf farqsiz).
export function recentNames(parts, limit = 8) {
  const seen = new Map(); for (const d of [...parts.dhikr].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt))) { const k = nameKey(d.name); if (!seen.has(k)) seen.set(k, d.name); }
  return [...seen.values()].slice(0, limit);
}

// ---------- Tarix va oylik sanoq (neytral: baho yo'q) ----------
export function history(parts, today, limit = HISTORY_DAYS) {
  const days = new Map(), get = (d) => { if (!days.has(d)) days.set(d, { date: d, prayers: 0, pages: 0, minutes: 0, dhikr: 0, notes: 0 }); return days.get(d); };
  for (const p of parts.prayers) if (p.date <= today) get(p.date).prayers++;
  for (const q of parts.quran) if (q.date <= today) { const x = get(q.date); x.pages += q.pages; x.minutes += q.minutes || 0; }
  for (const d of parts.dhikr) if (d.date <= today) get(d.date).dhikr += d.count;
  for (const n of parts.notes) if (n.date <= today) get(n.date).notes++;
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}
export function monthCounts(parts, today) {
  const m = today.slice(0, 7), inM = (d) => d.startsWith(m) && d <= today, days = new Set();
  const p = parts.prayers.filter((x) => inM(x.date)), q = parts.quran.filter((x) => inM(x.date)), d = parts.dhikr.filter((x) => inM(x.date)), n = parts.notes.filter((x) => inM(x.date));
  for (const r of [...p, ...q, ...d, ...n]) days.add(r.date);
  return { days: days.size, prayers: p.length, pages: q.reduce((a, x) => a + x.pages, 0), minutes: q.reduce((a, x) => a + (x.minutes || 0), 0), dhikr: d.reduce((a, x) => a + x.count, 0), notes: n.length };
}
export const dayLabelOffset = (date, today) => (parseDate(date) ? { prev: addDays(date, -1), next: date < today ? addDays(date, 1) : null } : null);

// ---------- Manzil ----------
// #/ibodat (bugun) | #/ibodat/kun/<sana> | #/ibodat/tarix | #/ibodat/zikr/<id> | #/ibodat/qayd | #/ibodat/qayd/yangi?d=<sana> | #/ibodat/qayd/<id>[/tahrir]
// Buzilgan kiritish xato bermaydi: bugungi kunga yoki ro'yxatga qaytadi.
const ID_RE = /^[0-9a-zA-Z-]{8,64}$/;
export function parseIbodatHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, ''), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi), query = qi < 0 ? '' : raw.slice(qi + 1), parts = path.split('/').filter(Boolean).slice(1);
  let d = null; for (const kv of query.split('&')) { const i = kv.indexOf('='); if (i > 0 && kv.slice(0, i) === 'd') { try { const v = decodeURIComponent(kv.slice(i + 1)); if (parseDate(v)) d = v; } catch (_) { /* e'tiborsiz */ } } }
  if (!parts.length || parts[0] === 'kun' && !parseDate(parts[1])) return { screen: 'day', date: null };
  if (parts[0] === 'kun') return { screen: 'day', date: parts[1] };
  if (parts[0] === 'tarix') return { screen: 'history' };
  if (parts[0] === 'zikr') return ID_RE.test(parts[1] || '') ? { screen: 'dhikr', id: parts[1] } : { screen: 'day', date: null };
  if (parts[0] === 'qayd') {
    if (!parts[1]) return { screen: 'notes' }; if (parts[1] === 'yangi') return { screen: 'note-new', date: d };
    if (!ID_RE.test(parts[1])) return { screen: 'notes' }; return parts[2] === 'tahrir' ? { screen: 'note-edit', id: parts[1] } : { screen: 'note', id: parts[1] };
  }
  return { screen: 'day', date: null };
}
