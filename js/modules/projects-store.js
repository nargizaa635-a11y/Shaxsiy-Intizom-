// Loyihalar ma'lumotlar qatlami: faqat database.js orqali (shifrlash avtomatik). Loyihalar `projects`, qadamlari `milestones` store'ida.
// Hech narsa localStorage'ga yozilmaydi (faqat mazmunsiz "o'zgardi" hisoblagichi). Qulflangan bo'lsa barcha amal LockedError beradi.
import * as db from '../database.js';
import * as K from './projects-core.js';
import { createSync } from './sync.js';

export class ValidationError extends Error { constructor(errors) { super(Object.values(errors)[0] || "Noto'g'ri ma'lumot"); this.name = 'ValidationError'; this.errors = errors; } }
const sync = createSync({ channel: 'si-projects', revKey: 'si:projects-rev' }), notify = sync.notify;
export const subscribe = sync.subscribe, stopSync = sync.stop;

export async function loadAll() {
  const projects = (await db.getAll('projects')).map(K.normalizeProject), s = K.splitSteps(projects, await db.getAll('milestones'));
  if (s.orphans.length) purgeOrphans(s.orphans); // yetim qadamlar (loyihasi o'chgan) fonda tozalanadi
  return { projects, steps: s.byProject };
}
export async function purgeOrphans(orphans) { for (const o of orphans) { try { await db.remove('milestones', o.id); } catch (_) { /* keyingi safar */ } } }
export async function getProject(id) { const r = await db.get('projects', id); return r ? K.normalizeProject(r) : null; }

function validated(input) { const v = K.validateProject(input); if (!v.ok) throw new ValidationError(v.errors); return v.value; }

export async function createProject(input) {
  const v = validated(input), rec = await db.add('projects', { ...v, completedAt: v.status === 'done' ? Date.now() : null, schemaV: K.SCHEMA_V }); notify(); return K.normalizeProject(rec);
}
export async function updateProject(id, input) {
  const cur = await getProject(id); if (!cur) throw new Error('Loyiha topilmadi');
  const v = validated({ title: cur.title, description: cur.description, status: cur.status, deadline: cur.deadline, ...input });
  await db.update('projects', id, { ...v, completedAt: v.status === 'done' ? (cur.completedAt || Date.now()) : null }); notify(); return getProject(id);
}
export async function setStatus(id, status, nowMs = Date.now()) {
  if (!K.STATUSES.includes(status)) throw new Error("Holat noto'g'ri");
  if (!(await getProject(id))) throw new Error('Loyiha topilmadi');
  await db.update('projects', id, { status, completedAt: status === 'done' ? nowMs : null }); notify();
}

// ---------- Qadamlar ----------
async function stepsOf(projectId) { return (await db.getAll('milestones')).filter((r) => r.projectId === projectId).map(K.normalizeStep); }
export async function addStep(projectId, title) {
  const v = K.validateStep(title); if (!v.ok) throw new ValidationError({ step: v.error });
  if (!(await getProject(projectId))) throw new Error('Loyiha topilmadi');
  const steps = await stepsOf(projectId); if (steps.length >= K.LIMITS.steps) throw new ValidationError({ step: `Bir loyihada ${K.LIMITS.steps} tadan ortiq qadam bo'lmasin.` });
  const rec = await db.add('milestones', { projectId, title: v.value, done: false, doneAt: null, n: K.nextStepNumber(steps), schemaV: K.SCHEMA_V }); notify(); return K.normalizeStep(rec);
}
export async function setStepDone(stepId, done, nowMs = Date.now()) {
  const cur = await db.get('milestones', stepId); if (!cur || !cur.projectId) throw new Error('Qadam topilmadi');
  await db.update('milestones', stepId, { done: !!done, doneAt: done ? nowMs : null }); notify();
}
export async function removeStep(stepId) {
  const cur = await db.get('milestones', stepId); if (!cur || !cur.projectId) throw new Error('Qadam topilmadi');
  await db.remove('milestones', stepId); notify(); return K.normalizeStep(cur);
}
export async function restoreStep(step) { await db.add('milestones', { ...step }); notify(); }

// Avval loyiha, keyin qadamlari o'chiriladi: uzilsa qadamlar yetim bo'lib qoladi va tozalanadi (aksincha bo'lsa ro'yxat yo'qolardi).
export async function deleteProject(id) {
  const project = await getProject(id); if (!project) throw new Error('Loyiha topilmadi');
  const steps = await stepsOf(id);
  await db.remove('projects', id); for (const s of steps) await db.remove('milestones', s.id); notify();
  return { project, steps }; // "Bekor qilish" uchun (faqat xotirada, qulflanganda tashlanadi)
}
export async function restoreProject({ project, steps }) {
  await db.add('projects', { ...project }); for (const s of steps) await db.add('milestones', { ...s }); notify();
}
