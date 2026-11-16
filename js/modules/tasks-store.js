// Vazifalar ma'lumotlar qatlami: faqat database.js orqali (shifrlash avtomatik), kategoriyalar, bajarilish tarixi, tablararo sinxron.
// Hech narsa localStorage'ga yozilmaydi (faqat mazmunsiz "o'zgardi" hisoblagichi). Qulflangan bo'lsa barcha amal LockedError beradi.
import * as db from '../database.js';
import { uuid } from '../schema.js';
import * as K from './tasks-core.js';
import { createSync } from './sync.js';

const CAT_PREFIX = 'taskCategory:', SEEDED_KEY = 'taskCategoriesSeeded', REV_KEY = 'si:tasks-rev', CHANNEL = 'si-tasks';
export class ValidationError extends Error { constructor(errors) { super(Object.values(errors)[0] || "Noto'g'ri ma'lumot"); this.name = 'ValidationError'; this.errors = errors; } }

// ---------- Tablararo sinxron: xabarda faqat "o'zgardi" belgisi (mazmun yo'q); mantiq sync.js da ----------
const sync = createSync({ channel: CHANNEL, revKey: REV_KEY }), notify = sync.notify;
export const subscribe = sync.subscribe, stopSync = sync.stop;

// ---------- Kategoriyalar: har biri alohida `settings` yozuvi (ikki tab bir vaqtda qo'shsa, biri ikkinchisini o'chirmaydi) ----------
const isConstraint = (e) => e && e.name === 'ConstraintError';
async function ensureSeeded() {
  if (await db.getSetting(SEEDED_KEY, false)) return;
  for (const c of K.DEFAULT_CATEGORIES) { try { await db.add('settings', { key: CAT_PREFIX + c.id, value: { name: c.name, order: c.order } }); } catch (e) { if (!isConstraint(e)) throw e; } }
  try { await db.add('settings', { key: SEEDED_KEY, value: true }); } catch (e) { if (!isConstraint(e)) throw e; }
}
export async function loadCategories() {
  await ensureSeeded();
  const recs = (await db.getAll('settings')).filter((r) => r.key.startsWith(CAT_PREFIX));
  return recs.map((r) => ({ id: r.key.slice(CAT_PREFIX.length), name: r.value.name, order: r.value.order })).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
export async function addCategory(name) {
  const cats = await loadCategories(), v = K.validateCategoryName(name, cats); if (!v.ok) throw new ValidationError({ name: v.error });
  const id = uuid(), order = Math.max(-1, ...cats.map((c) => c.order)) + 1;
  await db.add('settings', { key: CAT_PREFIX + id, value: { name: v.value, order } }); notify(); return { id, name: v.value, order };
}
export async function renameCategory(id, name) {
  const cats = await loadCategories(), cur = cats.find((c) => c.id === id); if (!cur) throw new Error('Kategoriya topilmadi');
  const v = K.validateCategoryName(name, cats, id); if (!v.ok) throw new ValidationError({ name: v.error });
  await db.update('settings', CAT_PREFIX + id, { value: { name: v.value, order: cur.order } }); notify();
}
// O'chirishdan oldin vazifalar "Boshqa"ga ko'chiriladi, kategoriya eng oxirida o'chiriladi: jarayon uzilsa ham ma'lumot yo'qolmaydi.
export async function deleteCategory(id) {
  if (id === K.FALLBACK_CATEGORY) throw new Error("\"Boshqa\" kategoriyasini o'chirib bo'lmaydi");
  const { tasks } = await loadAll(); for (const t of tasks) if (t.categoryId === id) await db.update('tasks', t.id, { categoryId: K.FALLBACK_CATEGORY });
  await db.remove('settings', CAT_PREFIX + id); notify();
}

// ---------- Vazifalar ----------
export async function loadAll() {
  const s = K.splitRecords(await db.getAll('tasks'));
  if (s.orphans.length) purgeOrphans(s.orphans); // yetim bajarilish yozuvlari (vazifasi o'chgan) fonda tozalanadi
  return { tasks: s.tasks, completions: s.completions };
}
export async function purgeOrphans(orphans) { for (const o of orphans) { try { await db.remove('tasks', o.id); } catch (_) { /* keyingi safar */ } } }
export async function getTask(id) { const r = await db.get('tasks', id); return r && r.kind !== 'completion' ? K.normalizeTask(r) : null; }
const FIELDS = ['title', 'description', 'date', 'startTime', 'endTime', 'priority', 'categoryId', 'repeat', 'reminder'];
async function validated(input, cats) { cats = cats || await loadCategories(); const v = K.validateTask(input, { categoryIds: cats.map((c) => c.id) }); if (!v.ok) throw new ValidationError(v.errors); return v.value; }

export async function createTask(input) {
  const value = await validated(input);
  const rec = await db.add('tasks', { kind: 'task', ...value, status: 'active', doneAt: null, schemaV: K.SCHEMA_V }); notify(); return K.normalizeTask(rec);
}
export async function updateTask(id, input) {
  const cur = await getTask(id); if (!cur) throw new Error('Vazifa topilmadi');
  const cats = await loadCategories(), base = Object.fromEntries(FIELDS.map((f) => [f, cur[f]]));
  if (!cats.some((c) => c.id === base.categoryId)) base.categoryId = K.FALLBACK_CATEGORY; // vazifaning eski kategoriyasi o'chirilgan (boshqa tabda): foydalanuvchi tanlamagan, shuning uchun xato emas, "Boshqa"
  const value = await validated({ ...base, ...input }, cats), changes = { ...value };
  if (value.repeat !== 'none' || cur.repeat !== 'none') { changes.status = 'active'; changes.doneAt = null; } // takrorlanish rejimi o'zgarganda holat qayta boshlanadi, tarix (completion) saqlanadi
  await db.update('tasks', id, changes); notify(); return getTask(id);
}
// Bir martalik vazifa: holat/doneAt. Takroriy: har bir hodisa (sana) uchun alohida shifrlangan completion yozuvi (tarix hech qachon o'chmaydi).
export async function setDone(taskId, date, done, nowMs = Date.now()) {
  const t = await getTask(taskId); if (!t) throw new Error('Vazifa topilmadi');
  if (!K.isRecurring(t)) await db.update('tasks', taskId, done ? { status: 'done', doneAt: nowMs } : { status: 'active', doneAt: null });
  else {
    if (!K.isOccurrence(t, date)) throw new Error("Bu sana takrorlanish jadvalida yo'q");
    const existing = (await loadAll()).completions.filter((c) => c.taskId === taskId && c.date === date);
    if (done) { if (!existing.length) await db.add('tasks', { kind: 'completion', taskId, date, doneAt: nowMs }); } else for (const c of existing) await db.remove('tasks', c.id);
  }
  notify();
}
// Avval vazifa, keyin tarixi o'chiriladi: uzilsa tarix yetim bo'lib qoladi va tozalanadi (aksincha bo'lsa tarix yo'qolardi).
export async function deleteTask(id) {
  const { tasks, completions } = await loadAll(), task = tasks.find((t) => t.id === id); if (!task) throw new Error('Vazifa topilmadi');
  const comps = completions.filter((c) => c.taskId === id);
  await db.remove('tasks', id); for (const c of comps) await db.remove('tasks', c.id); notify();
  return { task, completions: comps }; // "Bekor qilish" uchun (faqat xotirada, qulflanganda tashlanadi)
}
export async function restoreTask({ task, completions }) {
  await db.add('tasks', { ...task }); for (const c of completions) await db.add('tasks', { ...c }); notify();
}
