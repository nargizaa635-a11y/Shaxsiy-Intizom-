// Odatlar ma'lumotlar qatlami: faqat database.js orqali (shifrlash avtomatik). Odatlar `habits`, bajarilish yozuvlari `habit_logs` store'ida.
// Hech narsa localStorage'ga yozilmaydi (faqat mazmunsiz "o'zgardi" hisoblagichi). Qulflangan bo'lsa barcha amal LockedError beradi.
import * as db from '../database.js';
import * as K from './habits-core.js';
import { localParts, parseDate } from './dates.js';
import { createSync } from './sync.js';

export class ValidationError extends Error { constructor(errors) { super(Object.values(errors)[0] || "Noto'g'ri ma'lumot"); this.name = 'ValidationError'; this.errors = errors; } }
const sync = createSync({ channel: 'si-habits', revKey: 'si:habits-rev' }), notify = sync.notify;
export const subscribe = sync.subscribe, stopSync = sync.stop;
const isConstraint = (e) => e && e.name === 'ConstraintError';
const FIELDS = ['title', 'description', 'categoryId', 'freq', 'weekdays', 'every', 'startDate'];
const todayOf = (nowMs) => localParts(nowMs).date;

export async function loadAll() {
  const habits = (await db.getAll('habits')).map(K.normalizeHabit), s = K.splitLogs(habits, await db.getAll('habit_logs'));
  if (s.orphans.length) purgeOrphans(s.orphans); // yetim yozuvlar (odati o'chgan) fonda tozalanadi
  return { habits, logs: s.logs };
}
export async function purgeOrphans(orphans) { for (const o of orphans) { try { await db.remove('habit_logs', o.id); } catch (_) { /* keyingi safar */ } } }
export async function getHabit(id) { const r = await db.get('habits', id); return r ? K.normalizeHabit(r) : null; }

function validated(input, nowMs) { const v = K.validateHabit(input, { today: todayOf(nowMs) }); if (!v.ok) throw new ValidationError(v.errors); return v.value; }

export async function createHabit(input, nowMs = Date.now()) {
  const rec = await db.add('habits', { ...validated(input, nowMs), status: 'active', schemaV: K.SCHEMA_V }); notify(); return K.normalizeHabit(rec);
}
// Jadval o'zgarsa ham tarix (yozuvlar) saqlanadi; jadvaldan tashqarida qolgan kunlar streak/foizga kirmaydi.
export async function updateHabit(id, input, nowMs = Date.now()) {
  const cur = await getHabit(id); if (!cur) throw new Error('Odat topilmadi');
  const value = validated({ ...Object.fromEntries(FIELDS.map((f) => [f, cur[f]])), ...input }, nowMs);
  await db.update('habits', id, value); notify(); return getHabit(id);
}
export async function setStatus(id, status) {
  if (!K.STATUSES.includes(status)) throw new Error("Holat noto'g'ri");
  if (!(await getHabit(id))) throw new Error('Odat topilmadi');
  await db.update('habits', id, { status }); notify();
}
// Belgilash: sana bugundan keyin bo'lmasin va odat jadvaliga mos bo'lsin. Qayta belgilash xato emas (idempotent).
export async function setDone(habitId, date, done, nowMs = Date.now()) {
  if (!parseDate(date)) throw new Error("Sana noto'g'ri");
  if (date > todayOf(nowMs)) throw new Error("Kelajakdagi kunni belgilab bo'lmaydi");
  const h = await getHabit(habitId); if (!h) throw new Error('Odat topilmadi');
  if (!K.isScheduled(h, date)) throw new Error("Bu sana odat jadvalida yo'q");
  const id = await K.logId(habitId, date);
  if (done) { try { await db.add('habit_logs', { id, habitId, date, doneAt: nowMs }); } catch (e) { if (!isConstraint(e)) throw e; } } else await db.remove('habit_logs', id);
  notify();
}
// Avval odat, keyin yozuvlari o'chiriladi: uzilsa yozuvlar yetim bo'lib qoladi va tozalanadi (aksincha bo'lsa tarix yo'qolardi).
export async function deleteHabit(id) {
  const { habits, logs } = await loadAll(), habit = habits.find((h) => h.id === id); if (!habit) throw new Error('Odat topilmadi');
  const mine = logs.filter((l) => l.habitId === id);
  await db.remove('habits', id); for (const l of mine) await db.remove('habit_logs', l.id); notify();
  return { habit, logs: mine }; // "Bekor qilish" uchun (faqat xotirada, qulflanganda tashlanadi)
}
export async function restoreHabit({ habit, logs }) {
  await db.add('habits', { ...habit }); for (const l of logs) { try { await db.add('habit_logs', { ...l }); } catch (e) { if (!isConstraint(e)) throw e; } } notify();
}
