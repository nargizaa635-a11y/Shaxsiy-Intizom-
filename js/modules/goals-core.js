// Maqsadlar: sof mantiq (DOM va IndexedDB'siz). Tekshiruv, bosqichlar, progress, saralash, manzil.
// Maqsad `goals` store'ida, oraliq bosqichlari `milestones` store'ida (`goalId` bilan; loyiha qadamlari esa `projectId` bilan, ular aralashmaydi).
//
// HISOB-KITOB QOIDALARI:
// - Progress = bajarilgan bosqichlar / jami bosqichlar. Bosqich bo'lmasa foiz `null` (soxta 0% yoki 100% ko'rsatilmaydi).
// - Muddat holati loyihalardagi bilan bir xil (projects-core.deadlineInfo): faqat "erishilgan" bo'lmagan maqsadda hisoblanadi.
// - Saralash: holat tartibi (faol, pauzada, erishilgan), keyin muddat (yaqini birinchi, muddatsiz oxirida), keyin nom.
// - Muddatlilik (term): qisqa (taxminan 3 oygacha), o'rta (3–12 oy), uzoq (1 yildan ortiq). Bu foydalanuvchi tanlovi, muddatdan avtomatik chiqarilmaydi.
import { parseDate } from './dates.js';
import { deadlineInfo, progress } from './projects-core.js';

export { deadlineInfo, progress };
export const TERMS = [['short', 'Qisqa', '3 oygacha'], ['medium', "O'rta", '3–12 oy'], ['long', 'Uzoq', '1 yildan ortiq']].map(([id, name, hint]) => ({ id, name, hint }));
export const TERM_LABEL = Object.fromEntries(TERMS.map((t) => [t.id, `${t.name} muddatli`]));
export const DEFAULT_TERM = 'short';
export const STATUSES = ['active', 'paused', 'done'];
export const STATUS_LABEL = { active: 'Faol', paused: 'Pauzada', done: 'Erishilgan' };
export const DEFAULT_STATUS = 'active';
export const LIMITS = { title: 80, description: 1000, why: 300, step: 120, steps: 50 };
export const SCHEMA_V = 1;

// ---------- Tekshiruv ----------
export function validateGoal(input) {
  const errors = {}, str = (v) => String(v == null ? '' : v).trim(), nl = (v) => str(v).replace(/\r\n?/g, '\n');
  const title = str(input.title), description = nl(input.description), why = nl(input.why), deadline = str(input.deadline);
  const term = input.term == null || input.term === '' ? DEFAULT_TERM : input.term, status = input.status == null || input.status === '' ? DEFAULT_STATUS : input.status;
  if (!title) errors.title = 'Maqsad nomini kiriting.'; else if (title.length > LIMITS.title) errors.title = `Nom ${LIMITS.title} belgidan oshmasin.`;
  if (description.length > LIMITS.description) errors.description = `Tavsif ${LIMITS.description} belgidan oshmasin.`;
  if (why.length > LIMITS.why) errors.why = `Sabab ${LIMITS.why} belgidan oshmasin.`;
  if (!TERMS.some((t) => t.id === term)) errors.term = "Muddat turi noto'g'ri.";
  if (!STATUSES.includes(status)) errors.status = "Holat noto'g'ri.";
  if (deadline && !parseDate(deadline)) errors.deadline = "To'g'ri sanani kiriting.";
  return { ok: Object.keys(errors).length === 0, errors, value: { title, description, why, term: TERMS.some((t) => t.id === term) ? term : DEFAULT_TERM, status: STATUSES.includes(status) ? status : DEFAULT_STATUS, deadline: deadline && parseDate(deadline) ? deadline : null } };
}
export function validateMilestone(input) {
  const title = String(input == null ? '' : input).trim();
  if (!title) return { ok: false, error: 'Bosqich nomini kiriting.', value: '' };
  if (title.length > LIMITS.step) return { ok: false, error: `Bosqich nomi ${LIMITS.step} belgidan oshmasin.`, value: title };
  return { ok: true, error: '', value: title };
}

export const normalizeGoal = (rec) => ({ title: '', description: '', why: '', term: DEFAULT_TERM, status: DEFAULT_STATUS, deadline: null, completedAt: null, ...rec, schemaV: SCHEMA_V });
export const normalizeMilestone = (rec) => ({ title: '', done: false, doneAt: null, n: 0, ...rec, schemaV: SCHEMA_V });

// ---------- Bosqichlar ----------
// Faqat `goalId` li yozuvlar maqsad bosqichi hisoblanadi (`projectId` lilar loyihalarniki). Maqsadi o'chgan bosqichlar (yetim) alohida qaytariladi.
export function splitMilestones(goals, records) {
  const ids = new Set(goals.map((g) => g.id)), by = new Map(), orphans = [];
  for (const r of records) {
    if (!r || !r.goalId || r.projectId) continue;
    if (!ids.has(r.goalId)) { orphans.push(r); continue; }
    const m = normalizeMilestone(r); if (!by.has(m.goalId)) by.set(m.goalId, []); by.get(m.goalId).push(m);
  }
  for (const list of by.values()) list.sort((a, b) => a.n - b.n || (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
  return { byGoal: by, orphans };
}
export const nextMilestoneNumber = (items) => items.reduce((m, s) => Math.max(m, s.n || 0), 0) + 1;

// ---------- Saralash, guruhlash, ko'rsatkichlar ----------
const ORDER = { active: 0, paused: 1, done: 2 };
export function sortGoals(goals) {
  return [...goals].sort((a, b) => (ORDER[a.status] - ORDER[b.status])
    || (a.deadline && b.deadline ? (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0) : a.deadline ? -1 : b.deadline ? 1 : 0)
    || a.title.localeCompare(b.title, 'uz') || (a.id < b.id ? -1 : 1));
}
// Qisqa -> o'rta -> uzoq tartibida guruhlaydi; bo'sh guruhlar chiqarilmaydi; guruh ichida tartib saqlanadi.
export function groupByTerm(sorted) { return TERMS.map((t) => ({ term: t.id, name: TERM_LABEL[t.id], items: sorted.filter((g) => g.term === t.id) })).filter((g) => g.items.length); }
export function summary(goals, byGoal, today) {
  const count = { active: 0, paused: 0, done: 0 }; let overdue = 0; const per = new Map();
  for (const g of goals) {
    count[g.status] = (count[g.status] || 0) + 1;
    const d = deadlineInfo(g, today); if (d.state === 'overdue') overdue++;
    per.set(g.id, { progress: progress(byGoal.get(g.id) || []), deadline: d });
  }
  return { count, overdue, per };
}

// ---------- Manzil ----------
// #/maqsadlar; #/maqsadlar/yangi; #/maqsadlar/<id>; #/maqsadlar/<id>/tahrir
const ID_RE = /^[0-9a-zA-Z-]{8,64}$/;
export function parseGoalsHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, ''), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi), parts = path.split('/').filter(Boolean).slice(1);
  if (!parts.length) return { screen: 'list' };
  if (parts[0] === 'yangi') return { screen: 'new' };
  if (!ID_RE.test(parts[0])) return { screen: 'list' };
  if (parts[1] === 'tahrir') return { screen: 'edit', id: parts[0] };
  return { screen: 'detail', id: parts[0] };
}
