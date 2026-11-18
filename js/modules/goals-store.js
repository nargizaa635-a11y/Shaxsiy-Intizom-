// Maqsadlar ma'lumotlar qatlami: faqat database.js orqali (shifrlash avtomatik). Maqsadlar `goals`, bosqichlari `milestones` store'ida (`goalId` bilan).
// Hech narsa localStorage'ga yozilmaydi (faqat mazmunsiz "o'zgardi" hisoblagichi). Qulflangan bo'lsa barcha amal LockedError beradi.
import * as db from '../database.js';
import * as K from './goals-core.js';
import { createSync } from './sync.js';

export class ValidationError extends Error { constructor(errors) { super(Object.values(errors)[0] || "Noto'g'ri ma'lumot"); this.name = 'ValidationError'; this.errors = errors; } }
const sync = createSync({ channel: 'si-goals', revKey: 'si:goals-rev' }), notify = sync.notify;
export const subscribe = sync.subscribe, stopSync = sync.stop;

export async function loadAll() {
  const goals = (await db.getAll('goals')).map(K.normalizeGoal), s = K.splitMilestones(goals, await db.getAll('milestones'));
  if (s.orphans.length) purgeOrphans(s.orphans); // yetim bosqichlar (maqsadi o'chgan) fonda tozalanadi
  return { goals, milestones: s.byGoal };
}
export async function purgeOrphans(orphans) { for (const o of orphans) { try { await db.remove('milestones', o.id); } catch (_) { /* keyingi safar */ } } }
export async function getGoal(id) { const r = await db.get('goals', id); return r ? K.normalizeGoal(r) : null; }

function validated(input) { const v = K.validateGoal(input); if (!v.ok) throw new ValidationError(v.errors); return v.value; }

export async function createGoal(input) {
  const v = validated(input), rec = await db.add('goals', { ...v, completedAt: v.status === 'done' ? Date.now() : null, schemaV: K.SCHEMA_V }); notify(); return K.normalizeGoal(rec);
}
export async function updateGoal(id, input) {
  const cur = await getGoal(id); if (!cur) throw new Error('Maqsad topilmadi');
  const v = validated({ title: cur.title, description: cur.description, why: cur.why, term: cur.term, status: cur.status, deadline: cur.deadline, ...input });
  await db.update('goals', id, { ...v, completedAt: v.status === 'done' ? (cur.completedAt || Date.now()) : null }); notify(); return getGoal(id);
}
export async function setStatus(id, status, nowMs = Date.now()) {
  if (!K.STATUSES.includes(status)) throw new Error("Holat noto'g'ri");
  if (!(await getGoal(id))) throw new Error('Maqsad topilmadi');
  await db.update('goals', id, { status, completedAt: status === 'done' ? nowMs : null }); notify();
}

// ---------- Bosqichlar ----------
async function milestonesOf(goalId) { return (await db.getAll('milestones')).filter((r) => r.goalId === goalId && !r.projectId).map(K.normalizeMilestone); }
export async function addMilestone(goalId, title) {
  const v = K.validateMilestone(title); if (!v.ok) throw new ValidationError({ step: v.error });
  if (!(await getGoal(goalId))) throw new Error('Maqsad topilmadi');
  const items = await milestonesOf(goalId); if (items.length >= K.LIMITS.steps) throw new ValidationError({ step: `Bir maqsadda ${K.LIMITS.steps} tadan ortiq bosqich bo'lmasin.` });
  const rec = await db.add('milestones', { goalId, title: v.value, done: false, doneAt: null, n: K.nextMilestoneNumber(items), schemaV: K.SCHEMA_V }); notify(); return K.normalizeMilestone(rec);
}
async function ownMilestone(id) { const cur = await db.get('milestones', id); if (!cur || !cur.goalId || cur.projectId) throw new Error('Bosqich topilmadi'); return cur; }
export async function setMilestoneDone(id, done, nowMs = Date.now()) {
  await ownMilestone(id); await db.update('milestones', id, { done: !!done, doneAt: done ? nowMs : null }); notify();
}
export async function removeMilestone(id) { const cur = await ownMilestone(id); await db.remove('milestones', id); notify(); return K.normalizeMilestone(cur); }
export async function restoreMilestone(m) { await db.add('milestones', { ...m }); notify(); }

// Avval maqsad, keyin bosqichlari o'chiriladi: uzilsa bosqichlar yetim bo'lib qoladi va tozalanadi (aksincha bo'lsa ro'yxat yo'qolardi).
export async function deleteGoal(id) {
  const goal = await getGoal(id); if (!goal) throw new Error('Maqsad topilmadi');
  const items = await milestonesOf(id);
  await db.remove('goals', id); for (const m of items) await db.remove('milestones', m.id); notify();
  return { goal, milestones: items }; // "Bekor qilish" uchun (faqat xotirada, qulflanganda tashlanadi)
}
export async function restoreGoal({ goal, milestones }) {
  await db.add('goals', { ...goal }); for (const m of milestones) await db.add('milestones', { ...m }); notify();
}
