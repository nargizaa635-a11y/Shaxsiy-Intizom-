// Ibodat ma'lumotlar qatlami: faqat database.js orqali (shifrlash avtomatik). Hamma yozuv `worship_logs` store'ida (tur `kind` maydonida).
// Hech narsa localStorage'ga yozilmaydi (faqat mazmunsiz "o'zgardi" hisoblagichi). Qulflangan bo'lsa barcha amal LockedError beradi.
import * as db from '../database.js';
import * as K from './ibodat-core.js';
import { localParts } from './dates.js';
import { createSync } from './sync.js';

const STORE = 'worship_logs';
export class ValidationError extends Error { constructor(errors) { super(Object.values(errors)[0] || "Noto'g'ri ma'lumot"); this.name = 'ValidationError'; this.errors = errors; } }
const sync = createSync({ channel: 'si-ibodat', revKey: 'si:ibodat-rev' }), notify = sync.notify;
export const subscribe = sync.subscribe, stopSync = sync.stop;
const isConstraint = (e) => e && e.name === 'ConstraintError';
const todayOf = (nowMs) => localParts(nowMs).date;
const bad = (v) => { if (!v.ok) throw new ValidationError(v.errors); return v.value; };
const take = async (id, kind, label) => { const r = await db.get(STORE, id); if (!r || r.kind !== kind) throw new Error(`${label} topilmadi`); return r; };

export async function loadAll() { return K.splitRecords(await db.getAll(STORE)); }

// ---------- Namoz belgilari (har biri alohida yozuv: ikki tabda bir vaqtda bosilsa ham bitta qoladi) ----------
export async function setPrayer(date, prayer, done, nowMs = Date.now()) {
  const v = bad(K.validatePrayer({ date, prayer }, { today: todayOf(nowMs) })), id = await K.prayerId(v.date, v.prayer);
  if (done) { try { await db.add(STORE, { id, kind: 'prayer', date: v.date, prayer: v.prayer, doneAt: nowMs, schemaV: K.SCHEMA_V }); } catch (e) { if (!isConstraint(e)) throw e; } } else await db.remove(STORE, id);
  notify();
}

// ---------- Qur'on o'qish ----------
export async function addQuran(input, nowMs = Date.now()) {
  const rec = await db.add(STORE, { ...bad(K.validateQuran(input, { today: todayOf(nowMs) })), kind: 'quran', schemaV: K.SCHEMA_V }); notify(); return K.normalizeQuran(rec);
}
export async function deleteQuran(id) { const r = K.normalizeQuran(await take(id, 'quran', 'Yozuv')); await db.remove(STORE, id); notify(); return r; }

// ---------- Zikr / tasbeh ----------
// Bir kunda bir nom = bitta hisoblagich (kalit sana va nomdan). Mavjud bo'lsa yangisi yaratilmaydi, mavjudi qaytariladi.
export async function createDhikr(input, nowMs = Date.now()) {
  const v = bad(K.validateDhikr(input, { today: todayOf(nowMs) })), id = await K.dhikrId(v.date, v.name);
  try { return { record: K.normalizeDhikr(await db.add(STORE, { id, kind: 'dhikr', ...v, count: 0, schemaV: K.SCHEMA_V })), existed: false }; }
  catch (e) { if (!isConstraint(e)) throw e; return { record: K.normalizeDhikr(await take(id, 'dhikr', 'Zikr')), existed: true }; } finally { notify(); }
}
export async function getDhikr(id) { const r = await db.get(STORE, id); return r && r.kind === 'dhikr' ? K.normalizeDhikr(r) : null; }
export async function setDhikrCount(id, count) {
  const c = K.validateCount(count); if (!c.ok) throw new ValidationError({ count: `Son 0–${K.LIMITS.countMax} oralig'ida bo'lsin.` });
  await take(id, 'dhikr', 'Zikr'); await db.update(STORE, id, { count: c.value }); notify();
}
export async function setDhikrTarget(id, target) { const t = K.validateTarget(target); if (!t.ok) throw new ValidationError(t.errors); await take(id, 'dhikr', 'Zikr'); await db.update(STORE, id, { target: t.value }); notify(); }
export async function deleteDhikr(id) { const r = K.normalizeDhikr(await take(id, 'dhikr', 'Zikr')); await db.remove(STORE, id); notify(); return r; }

// ---------- Qaydlar ----------
export async function createNote(input, nowMs = Date.now()) {
  const rec = await db.add(STORE, { ...bad(K.validateNote(input, { today: todayOf(nowMs) })), kind: 'note', schemaV: K.SCHEMA_V }); notify(); return K.normalizeNote(rec);
}
export async function updateNote(id, input, nowMs = Date.now()) {
  const cur = K.normalizeNote(await take(id, 'note', 'Qayd'));
  await db.update(STORE, id, bad(K.validateNote({ title: cur.title, body: cur.body, date: cur.date, ...input }, { today: todayOf(nowMs) }))); notify();
}
export async function deleteNote(id) { const r = K.normalizeNote(await take(id, 'note', 'Qayd')); await db.remove(STORE, id); notify(); return r; }

// "Bekor qilish": o'chirilgan yozuv o'z id va ma'lumoti bilan qaytariladi (faqat xotirada, qulflanganda tashlanadi).
export async function restore(rec) { try { await db.add(STORE, { ...rec }); } catch (e) { if (!isConstraint(e)) throw e; } notify(); }
