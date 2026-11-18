// Jurnal ma'lumotlar qatlami: faqat database.js orqali (shifrlash avtomatik). Yozuvlar `journal_entries` store'ida.
// Hech narsa localStorage'ga yozilmaydi (faqat mazmunsiz "o'zgardi" hisoblagichi). Qulflangan bo'lsa barcha amal LockedError beradi.
import * as db from '../database.js';
import * as K from './journal-core.js';
import { localParts } from './dates.js';
import { createSync } from './sync.js';

export class ValidationError extends Error { constructor(errors) { super(Object.values(errors)[0] || "Noto'g'ri ma'lumot"); this.name = 'ValidationError'; this.errors = errors; } }
const sync = createSync({ channel: 'si-journal', revKey: 'si:journal-rev' }), notify = sync.notify;
export const subscribe = sync.subscribe, stopSync = sync.stop;
const todayOf = (nowMs) => localParts(nowMs).date;

export async function loadAll() { return (await db.getAll('journal_entries')).map(K.normalizeEntry); }
export async function getEntry(id) { const r = await db.get('journal_entries', id); return r ? K.normalizeEntry(r) : null; }

function validated(input, nowMs) { const v = K.validateEntry(input, { today: todayOf(nowMs) }); if (!v.ok) throw new ValidationError(v.errors); return v.value; }

export async function createEntry(input, nowMs = Date.now()) {
  const rec = await db.add('journal_entries', { ...validated(input, nowMs), schemaV: K.SCHEMA_V }); notify(); return K.normalizeEntry(rec);
}
export async function updateEntry(id, input, nowMs = Date.now()) {
  const cur = await getEntry(id); if (!cur) throw new Error('Yozuv topilmadi');
  await db.update('journal_entries', id, validated({ title: cur.title, body: cur.body, type: cur.type, date: cur.date, mood: cur.mood, ...input }, nowMs)); notify(); return getEntry(id);
}
export async function deleteEntry(id) {
  const cur = await getEntry(id); if (!cur) throw new Error('Yozuv topilmadi');
  await db.remove('journal_entries', id); notify();
  return cur; // "Bekor qilish" uchun (faqat xotirada, qulflanganda tashlanadi)
}
export async function restoreEntry(entry) { await db.add('journal_entries', { ...entry }); notify(); }
