// Loyihalar: sof mantiq (DOM va IndexedDB'siz). Tekshiruv, qadamlar, progress, muddat, saralash, manzil.
// Loyiha `projects` store'ida, qadamlari (bosqichlar) `milestones` store'ida (`projectId` bilan). Sanalar "YYYY-MM-DD".
//
// HISOB-KITOB QOIDALARI:
// - Progress = bajarilgan qadamlar / jami qadamlar. Qadam bo'lmasa foiz `null` (soxta 0% yoki 100% ko'rsatilmaydi).
// - Muddat holati faqat tugallanmagan loyihada: 'overdue' (muddat bugundan oldin), 'today', 'soon' (keyingi 7 kun ichida), 'later', 'none'.
//   Yakunlangan loyiha hech qachon "muddati o'tgan" bo'lmaydi.
// - Saralash: holat tartibi (faol, kutilmoqda, yakunlangan), keyin muddat (yaqini birinchi, muddatsiz oxirida), keyin nom.
import { parseDate, toDays } from './dates.js';

export const STATUSES = ['active', 'waiting', 'done'];
export const STATUS_LABEL = { active: 'Faol', waiting: 'Kutilmoqda', done: 'Yakunlangan' };
export const DEFAULT_STATUS = 'active';
export const LIMITS = { title: 80, description: 1000, step: 120, steps: 100 };
export const SCHEMA_V = 1;
export const SOON_DAYS = 7;

// ---------- Tekshiruv ----------
export function validateProject(input) {
  const errors = {}, str = (v) => String(v == null ? '' : v).trim();
  const title = str(input.title), description = str(input.description).replace(/\r\n?/g, '\n');
  const status = input.status == null || input.status === '' ? DEFAULT_STATUS : input.status, deadline = str(input.deadline);
  if (!title) errors.title = 'Loyiha nomini kiriting.'; else if (title.length > LIMITS.title) errors.title = `Nom ${LIMITS.title} belgidan oshmasin.`;
  if (description.length > LIMITS.description) errors.description = `Tavsif ${LIMITS.description} belgidan oshmasin.`;
  if (!STATUSES.includes(status)) errors.status = "Holat noto'g'ri.";
  if (deadline && !parseDate(deadline)) errors.deadline = "To'g'ri sanani kiriting.";
  return { ok: Object.keys(errors).length === 0, errors, value: { title, description: description.trim(), status: STATUSES.includes(status) ? status : DEFAULT_STATUS, deadline: deadline && parseDate(deadline) ? deadline : null } };
}
export function validateStep(input) {
  const title = String(input == null ? '' : input).trim();
  if (!title) return { ok: false, error: 'Qadam nomini kiriting.', value: '' };
  if (title.length > LIMITS.step) return { ok: false, error: `Qadam nomi ${LIMITS.step} belgidan oshmasin.`, value: title };
  return { ok: true, error: '', value: title };
}

export const normalizeProject = (rec) => ({ title: '', description: '', status: DEFAULT_STATUS, deadline: null, completedAt: null, ...rec, schemaV: SCHEMA_V });
export const normalizeStep = (rec) => ({ title: '', done: false, doneAt: null, n: 0, ...rec, schemaV: SCHEMA_V });

// ---------- Qadamlar ----------
// `milestones` store'i keyinchalik maqsadlar uchun ham ishlatiladi: faqat `projectId` li yozuvlar loyiha qadami hisoblanadi.
// Loyihasi o'chgan qadamlar (yetim) alohida qaytariladi va fonda tozalanadi.
export function splitSteps(projects, records) {
  const ids = new Set(projects.map((p) => p.id)), by = new Map(), orphans = [];
  for (const r of records) {
    if (!r || !r.projectId) continue;
    if (!ids.has(r.projectId)) { orphans.push(r); continue; }
    const s = normalizeStep(r); if (!by.has(s.projectId)) by.set(s.projectId, []); by.get(s.projectId).push(s);
  }
  for (const list of by.values()) list.sort((a, b) => a.n - b.n || (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
  return { byProject: by, orphans };
}
export const nextStepNumber = (steps) => steps.reduce((m, s) => Math.max(m, s.n || 0), 0) + 1;
export function progress(steps) {
  const total = steps.length, done = steps.filter((s) => s.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : null };
}

// ---------- Muddat ----------
export function deadlineInfo(project, today) {
  if (project.status === 'done' || !project.deadline || !parseDate(project.deadline)) return { state: 'none', days: null };
  const days = toDays(project.deadline) - toDays(today);
  return { state: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= SOON_DAYS ? 'soon' : 'later', days };
}

// ---------- Saralash va umumiy ko'rsatkichlar ----------
const ORDER = { active: 0, waiting: 1, done: 2 };
export function sortProjects(projects) {
  return [...projects].sort((a, b) => (ORDER[a.status] - ORDER[b.status])
    || (a.deadline && b.deadline ? (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0) : a.deadline ? -1 : b.deadline ? 1 : 0)
    || a.title.localeCompare(b.title, 'uz') || (a.id < b.id ? -1 : 1));
}
export function summary(projects, byProject, today) {
  const count = { active: 0, waiting: 0, done: 0 }; let overdue = 0; const per = new Map();
  for (const p of projects) {
    count[p.status] = (count[p.status] || 0) + 1;
    const d = deadlineInfo(p, today); if (d.state === 'overdue') overdue++;
    per.set(p.id, { progress: progress(byProject.get(p.id) || []), deadline: d });
  }
  return { count, overdue, per };
}

// ---------- Manzil ----------
// #/loyihalar; #/loyihalar/yangi; #/loyihalar/<id>; #/loyihalar/<id>/tahrir
const ID_RE = /^[0-9a-zA-Z-]{8,64}$/;
export function parseProjectsHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, ''), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi), parts = path.split('/').filter(Boolean).slice(1);
  if (!parts.length) return { screen: 'list' };
  if (parts[0] === 'yangi') return { screen: 'new' };
  if (!ID_RE.test(parts[0])) return { screen: 'list' };
  if (parts[1] === 'tahrir') return { screen: 'edit', id: parts[0] };
  return { screen: 'detail', id: parts[0] };
}
