// Bosh sahifa: sof mantiq (DOM va IndexedDB'siz). Boshqa modullarning mavjud funksiyalaridan bugungi ko'rinish modelini yig'adi.
// Har bir manba alohida: biri yuklanmasa (`null`), qolganlari ko'rsatilaveradi, buzilgan bo'lim "yuklab bo'lmadi" deb belgilanadi.
//
// HISOB-KITOB QOIDALARI:
// - "Bugun" mahalliy kalendar sanasi (localParts). Vazifalar: bugungi hodisalar + muddati o'tib bajarilmay qolganlari; bajarilmaganlari birinchi,
//   ichida eski sana birinchi. Odatlar: faqat faol va bugun jadvalda bor odatlar; bajarilmaganlari birinchi.
// - Bugungi kun foizi = (bajarilgan vazifalar + odatlar) / (bugungi vazifalar + odatlar). Reja bo'sh bo'lsa foiz `null` (soxta 0% yoki 100% yo'q).
//   Muddati o'tgan eski vazifalar foizga kirmaydi (ular alohida ogohlantirishda).
// - Muddati o'tganlar: o'tib ketgan bajarilmagan vazifalar + muddati o'tgan maqsadlar va loyihalar (erishilgan/yakunlangan hisoblanmaydi).
// - Ro'yxatlar qisqartiriladi (LIMITS); yashirin qolganlar soni `hidden` da.
import * as T from './tasks-core.js';
import * as H from './habits-core.js';
import * as G from './goals-core.js';
import * as P from './projects-core.js';
import * as J from './journal-core.js';
import { localParts } from './dates.js';

export const LIMITS = { tasks: 6, habits: 6, goals: 3, projects: 3 };

// ---------- Vazifalar ----------
function tasksModel(src, nowMs) {
  if (!src) return null;
  const { tasks, completions } = src, today = T.buildRows(tasks, completions, 'today', nowMs), overdue = T.buildRows(tasks, completions, 'overdue', nowMs);
  const missed = overdue.filter((r) => r.date < localParts(nowMs).date);
  const seen = new Set(), rows = [];
  for (const r of [...today, ...missed]) if (!seen.has(r.key)) { seen.add(r.key); rows.push({ ...r, overdue: T.isOverdue(r, nowMs) }); }
  const sorted = T.sortRows(rows, 'date'), ordered = [...sorted.filter((r) => !r.done), ...sorted.filter((r) => r.done)];
  const st = T.todayStats(tasks, completions, nowMs);
  return { rows: ordered.slice(0, LIMITS.tasks), hidden: Math.max(0, ordered.length - LIMITS.tasks), total: st.total, done: st.done, overdueCount: overdue.length, empty: tasks.length === 0 };
}

// ---------- Odatlar ----------
function habitsModel(src, today) {
  if (!src) return null;
  const { habits, logs } = src, idx = H.indexLogs(logs), st = H.todayStats(habits, logs, today);
  const items = habits.filter((h) => h.status === 'active' && H.isScheduled(h, today)).map((h) => {
    const done = idx.get(h.id) || new Set(), s = H.habitStats(h, done, today);
    return { habit: h, done: done.has(today), streak: s.current };
  }).sort((a, b) => (a.done === b.done ? a.habit.title.localeCompare(b.habit.title, 'uz') : a.done ? 1 : -1));
  return { items: items.slice(0, LIMITS.habits), hidden: Math.max(0, items.length - LIMITS.habits), total: st.total, done: st.done, empty: habits.filter((h) => h.status === 'active').length === 0 };
}

// ---------- Maqsadlar va loyihalar ----------
function goalsModel(src, today) {
  if (!src) return null;
  const sm = G.summary(src.goals, src.milestones, today), active = G.sortGoals(src.goals.filter((g) => g.status === 'active'));
  return { items: active.slice(0, LIMITS.goals).map((g) => ({ goal: g, ...sm.per.get(g.id) })), hidden: Math.max(0, active.length - LIMITS.goals), active: sm.count.active, overdue: sm.overdue, empty: src.goals.length === 0 };
}
function projectsModel(src, today) {
  if (!src) return null;
  const sm = P.summary(src.projects, src.steps, today), active = P.sortProjects(src.projects.filter((p) => p.status === 'active'));
  return { items: active.slice(0, LIMITS.projects).map((p) => ({ project: p, ...sm.per.get(p.id) })), hidden: Math.max(0, active.length - LIMITS.projects), active: sm.count.active, overdue: sm.overdue, empty: src.projects.length === 0 };
}

// ---------- Jurnal ----------
function journalModel(entries, today) {
  if (!entries) return null;
  return { wroteToday: entries.some((e) => e.date === today), streak: J.streak(entries, today), total: entries.length };
}

// ---------- Yig'ish ----------
// src: { tasks: {tasks, completions}|null, habits: {habits, logs}|null, goals: {goals, milestones}|null, projects: {projects, steps}|null, journal: entries[]|null }
export function buildHome(src, nowMs) {
  const today = localParts(nowMs).date;
  const tasks = tasksModel(src.tasks, nowMs), habits = habitsModel(src.habits, today), goals = goalsModel(src.goals, today), projects = projectsModel(src.projects, today), journal = journalModel(src.journal, today);
  const parts = [tasks, habits].filter(Boolean), total = parts.reduce((a, p) => a + p.total, 0), done = parts.reduce((a, p) => a + p.done, 0);
  const overdue = { tasks: tasks ? tasks.overdueCount : 0, goals: goals ? goals.overdue : 0, projects: projects ? projects.overdue : 0 };
  overdue.total = overdue.tasks + overdue.goals + overdue.projects;
  return { today, tasks, habits, goals, projects, journal, day: { total, done, percent: total ? Math.round((done / total) * 100) : null }, overdue };
}

// "Ogohlantirish" matni: faqat nolga teng bo'lmagan qismlar, o'zbekcha.
export function overdueText(o) {
  const parts = [];
  if (o.tasks) parts.push(`${o.tasks} ta vazifa`); if (o.projects) parts.push(`${o.projects} ta loyiha`); if (o.goals) parts.push(`${o.goals} ta maqsad`);
  return parts.length ? `Muddati o'tgan: ${parts.join(', ')}.` : '';
}
