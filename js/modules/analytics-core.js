// Tahlil: sof hisob-kitob (DOM va IndexedDB'siz). Mavjud modullarning funksiyalaridan davr bo'yicha statistika yig'adi.
// Har manba alohida: biri yuklanmasa (`null`), shu bo'lim `null` bo'ladi va indeksga kirmaydi; qolganlari hisoblanaveradi.
//
// HISOB-KITOB QOIDALARI (foydalanuvchiga ham ko'rsatiladi):
// - Davr: bugun va undan oldingi (days-1) kun, bugun ham kiradi. Oldingi davr: undan oldingi shuncha kun (taqqoslash uchun).
// - Vazifa/odat foizi = bajarilgan / jadvaldagi hodisalar. BUGUNGI hali bajarilmagan hodisalar maxrajga kirmaydi (kun tugamagan),
//   bajarilganlari kiradi. Maxraj 0 bo'lsa foiz `null` (soxta 0% yoki 100% yo'q).
// - Vazifa: bir martalik vazifa o'z sanasida, takroriy vazifa har hodisa sanasida sanaladi. Odatlar: faqat faol odatlar.
// - Intizom indeksi (0–100) = odatlar va vazifalar foizlarining oddiy o'rtachasi (mavjud bo'lganlari). Hech biri bo'lmasa `null`.
//   Jurnal indeksga KIRMAYDI (u majburiy odat emas), alohida ko'rsatiladi.
// - Kayfiyat: kun ichida o'rtacha; davr o'rtachasi barcha kayfiyatli yozuvlar bo'yicha.
// - 90 kunlik grafik haftalik (7 kunlik) guruhlanadi, oxirgi guruh to'liq bo'ladi (guruhlash oxiridan boshlanadi).
// - Xulosalar faqat yetarli ma'lumot bo'lganda chiqadi (kam ma'lumotdan xulosa chiqarilmaydi).
import * as T from './tasks-core.js';
import * as H from './habits-core.js';
import * as G from './goals-core.js';
import * as P from './projects-core.js';
import * as J from './journal-core.js';
import { localParts, addDays, weekday } from './dates.js';

export const PERIODS = [7, 30, 90];
export const DEFAULT_PERIOD = 30;
export const LIMITS = { habits: 8, insights: 4 };
export const THRESHOLDS = { weakHabitRate: 50, weakHabitMinDays: 3, weekdayMinDays: 2, weekdayMinKinds: 3, weekdayGap: 15, moodGap: 0.3, moodMinDays: 3, streakMin: 3 };
const EMPTY = new Set();

const pct = (done, den) => (den > 0 ? Math.round((done / den) * 100) : null);
export const periodDates = (today, days) => Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i)));
export const indexLabel = (v) => (v === null ? '' : v >= 80 ? "A'lo" : v >= 60 ? 'Yaxshi' : v >= 40 ? "O'rtacha" : 'Past');

// ---------- Kunlik hisob ----------
function taskDay(tasks, idx, d) {
  let total = 0, done = 0;
  for (const t of tasks) {
    if (T.isRecurring(t) ? !T.isOccurrence(t, d) : t.date !== d) continue;
    total++; if (T.occDone(t, idx, d).done) done++;
  }
  return { total, done };
}
function habitDay(active, idx, d) {
  let total = 0, done = 0;
  for (const h of active) { if (!H.isScheduled(h, d)) continue; total++; if ((idx.get(h.id) || EMPTY).has(d)) done++; }
  return { total, done };
}
// Bugungi bajarilmagan hodisalar maxrajdan chiqariladi (kun tugamagan).
const den = (x, d, today) => (d === today ? x.done : x.total);

function moodByDay(entries, dates) {
  const set = new Set(dates), by = new Map();
  for (const e of entries) { if (!e.mood || !set.has(e.date)) continue; const m = by.get(e.date) || { sum: 0, n: 0 }; m.sum += e.mood; m.n++; by.set(e.date, m); }
  return by;
}

export function buildSeries(src, dates, today) {
  const tIdx = src.tasks ? T.indexCompletions(src.tasks.completions) : null, hIdx = src.habits ? H.indexLogs(src.habits.logs) : null;
  const active = src.habits ? src.habits.habits.filter((h) => h.status === 'active') : [], moods = src.journal ? moodByDay(src.journal, dates) : new Map();
  return dates.map((date) => {
    const t = tIdx ? taskDay(src.tasks.tasks, tIdx, date) : { total: 0, done: 0 }, h = hIdx ? habitDay(active, hIdx, date) : { total: 0, done: 0 }, m = moods.get(date) || { sum: 0, n: 0 };
    return { date, tasks: t, habits: h, planned: t.total + h.total, done: t.done + h.done, tDen: den(t, date, today), hDen: den(h, date, today), moodSum: m.sum, moodN: m.n };
  });
}
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
function rates(series) {
  const tDen = sum(series, (s) => s.tDen), hDen = sum(series, (s) => s.hDen);
  return { tasks: pct(sum(series, (s) => s.tasks.done), tDen), habits: pct(sum(series, (s) => s.habits.done), hDen), tasksDen: tDen, habitsDen: hDen };
}
export function indexOf(r) { const v = [r.tasks, r.habits].filter((x) => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; }

// ---------- Grafik guruhlari ----------
// size=1: kunlik; size=7: haftalik (oxiridan boshlab, shuning uchun birinchi guruh qisqaroq bo'lishi mumkin).
export function bucketize(series, size) {
  const groups = [];
  if (size <= 1) series.forEach((s) => groups.push([s])); else for (let end = series.length; end > 0; end -= size) groups.unshift(series.slice(Math.max(0, end - size), end));
  return groups.map((g) => { const n = sum(g, (s) => s.moodN); return { from: g[0].date, to: g[g.length - 1].date, planned: sum(g, (s) => s.planned), done: sum(g, (s) => s.done), mood: n ? Math.round((sum(g, (s) => s.moodSum) / n) * 10) / 10 : null, moodN: n }; });
}

// ---------- Bo'limlar ----------
function habitsModel(src, from, today, series) {
  if (!src) return null;
  const idx = H.indexLogs(src.logs), active = src.habits.filter((h) => h.status === 'active');
  const items = active.map((h) => {
    const done = idx.get(h.id) || EMPTY, dates = H.scheduledDates(h, from, today), d = dates.filter((x) => done.has(x)).length, dn = dates.filter((x) => done.has(x) || x !== today).length;
    return { habit: h, done: d, total: dn, rate: pct(d, dn), streak: H.habitStats(h, done, today).current };
  }).filter((x) => x.total > 0);
  items.sort((a, b) => b.rate - a.rate || b.streak - a.streak || a.habit.title.localeCompare(b.habit.title, 'uz'));
  const r = rates(series);
  return { items: items.slice(0, LIMITS.habits), hidden: Math.max(0, items.length - LIMITS.habits), all: items, rate: r.habits, activeCount: active.length };
}
function tasksModel(src, series, nowMs) {
  if (!src) return null;
  const r = rates(series), total = sum(series, (s) => s.tasks.total), done = sum(series, (s) => s.tasks.done);
  return { total, done, rate: r.tasks, overdueNow: T.buildRows(src.tasks, src.completions, 'overdue', nowMs).length, empty: src.tasks.length === 0 };
}
function journalModel(entries, from, today, days) {
  if (!entries) return null;
  const inP = entries.filter((e) => e.date >= from && e.date <= today), moods = inP.filter((e) => e.mood).map((e) => e.mood), daysWritten = new Set(inP.map((e) => e.date)).size;
  return { entries: inP.length, daysWritten, writingRate: pct(daysWritten, days), avgMood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null, moodCount: moods.length, streak: J.streak(entries, today) };
}
const inRange = (ms, from, today) => { if (!ms) return false; const d = localParts(ms).date; return d >= from && d <= today; };
function goalsModel(src, from, today) {
  if (!src) return null;
  const sm = G.summary(src.goals, src.milestones, today), act = src.goals.filter((g) => g.status === 'active').map((g) => sm.per.get(g.id).progress.percent).filter((x) => x !== null);
  return { active: sm.count.active, doneInPeriod: src.goals.filter((g) => g.status === 'done' && inRange(g.completedAt, from, today)).length, doneTotal: sm.count.done, overdue: sm.overdue, avgProgress: act.length ? Math.round(act.reduce((a, b) => a + b, 0) / act.length) : null, empty: src.goals.length === 0 };
}
function projectsModel(src, from, today) {
  if (!src) return null;
  const sm = P.summary(src.projects, src.steps, today), act = src.projects.filter((p) => p.status === 'active').map((p) => sm.per.get(p.id).progress.percent).filter((x) => x !== null);
  return { active: sm.count.active, doneInPeriod: src.projects.filter((p) => p.status === 'done' && inRange(p.completedAt, from, today)).length, doneTotal: sm.count.done, overdue: sm.overdue, avgProgress: act.length ? Math.round(act.reduce((a, b) => a + b, 0) / act.length) : null, empty: src.projects.length === 0 };
}

// ---------- Xulosalar ----------
// Har xulosa: { kind: 'good'|'warn'|'info', text }. Faqat yetarli ma'lumot bo'lganda.
function weekdayStats(series, today) {
  const by = Array.from({ length: 7 }, () => ({ done: 0, den: 0, days: 0 }));
  for (const s of series) { const dn = s.tDen + s.hDen; if (dn === 0) continue; const w = by[weekday(s.date)]; w.done += s.tasks.done + s.habits.done; w.den += dn; w.days++; }
  return by.map((w, i) => ({ day: i, rate: pct(w.done, w.den), days: w.days })).filter((w) => w.rate !== null && w.days >= THRESHOLDS.weekdayMinDays);
}
export function buildInsights(m, series, today) {
  const out = [], TH = THRESHOLDS;
  if (m.habits) {
    const weak = m.habits.all.filter((x) => x.total >= TH.weakHabitMinDays && x.rate < TH.weakHabitRate).sort((a, b) => a.rate - b.rate)[0];
    if (weak) out.push({ kind: 'warn', text: `Diqqat: "${weak.habit.title}" odati ${weak.rate}% bajarildi (${weak.done}/${weak.total} kun).` });
    const best = [...m.habits.all].sort((a, b) => b.streak - a.streak)[0];
    if (best && best.streak >= TH.streakMin) out.push({ kind: 'good', text: `Eng uzun joriy seriya: "${best.habit.title}", ${best.streak} kun ketma-ket.` });
  }
  const wd = weekdayStats(series, today);
  if (wd.length >= TH.weekdayMinKinds) {
    const hi = wd.reduce((a, b) => (b.rate > a.rate ? b : a)), lo = wd.reduce((a, b) => (b.rate < a.rate ? b : a));
    if (hi.rate - lo.rate >= TH.weekdayGap) out.push({ kind: 'info', text: `Eng samarali kun: ${H.WEEKDAY_LABEL[hi.day].toLowerCase()} (${hi.rate}%), eng sust: ${H.WEEKDAY_LABEL[lo.day].toLowerCase()} (${lo.rate}%).` });
  }
  const md = series.filter((s) => s.moodN > 0), half = Math.floor(series.length / 2), a = series.slice(0, half).filter((s) => s.moodN > 0), b = series.slice(half).filter((s) => s.moodN > 0);
  if (md.length && a.length >= TH.moodMinDays && b.length >= TH.moodMinDays) {
    const avg = (arr) => sum(arr, (s) => s.moodSum) / sum(arr, (s) => s.moodN), x = avg(a), y = avg(b), r = (v) => Math.round(v * 10) / 10;
    if (Math.abs(y - x) >= TH.moodGap) out.push({ kind: y > x ? 'good' : 'warn', text: `Kayfiyat davr ikkinchi yarmida ${y > x ? 'yaxshilandi' : 'pasaydi'}: ${r(x)} → ${r(y)}.` });
  }
  if (m.tasks && m.tasks.overdueNow > 0) out.push({ kind: 'warn', text: `Hozir ${m.tasks.overdueNow} ta vazifa muddati o'tib bajarilmagan.` });
  return out.slice(0, LIMITS.insights);
}

// ---------- Yig'ish ----------
// src: { tasks: {tasks, completions}|null, habits: {habits, logs}|null, goals: {goals, milestones}|null, projects: {projects, steps}|null, journal: entries[]|null }
export function buildAnalytics(src, days, nowMs) {
  if (!PERIODS.includes(days)) days = DEFAULT_PERIOD;
  const today = localParts(nowMs).date, dates = periodDates(today, days), from = dates[0], series = buildSeries(src, dates, today);
  const cur = rates(series), value = indexOf(cur);
  const prevDates = periodDates(addDays(from, -1), days), prevR = rates(buildSeries(src, prevDates, today)), prev = indexOf(prevR);
  const size = days >= 90 ? 7 : 1, buckets = bucketize(series, size);
  const m = { habits: habitsModel(src.habits, from, today, series), tasks: tasksModel(src.tasks, series, nowMs) };
  return {
    today, days, from, size,
    index: { value, label: indexLabel(value), prev, delta: value !== null && prev !== null ? value - prev : null, tasks: cur.tasks, habits: cur.habits },
    chart: { buckets, maxPlanned: Math.max(1, ...buckets.map((b) => b.planned)), hasData: buckets.some((b) => b.planned > 0) },
    mood: { buckets, count: sum(series, (s) => s.moodN), hasData: buckets.some((b) => b.mood !== null) },
    habits: m.habits, tasks: m.tasks, journal: journalModel(src.journal, from, today, days), goals: goalsModel(src.goals, from, today), projects: projectsModel(src.projects, from, today),
    insights: buildInsights(m, series, today),
  };
}
