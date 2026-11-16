// Odatlar: sof mantiq testlari (Node va brauzerda). Haqiqiy IndexedDB + vault + interfeys: tests/e2e-habits.mjs.
import { test, assert, eq } from './harness.js';
import * as K from '../js/modules/habits-core.js';
import { addDays } from '../js/modules/dates.js';

const T = '2026-11-09'; // dushanba
let seq = 0;
const mk = (o) => K.normalizeHabit({ id: `h${++seq}`, title: `Odat ${seq}`, startDate: '2026-11-01', ...o });
const S = (...d) => new Set(d.map((x) => `2026-11-${String(x).padStart(2, '0')}`));
const D = (n) => `2026-11-${String(n).padStart(2, '0')}`;

export async function runPure() {
  await test('validateHabit: nom majburiy va uzun bo\'lmasin, tavsif cheklovi', () => {
    assert(K.validateHabit({ title: '  ' }, { today: T }).errors.title.includes('kiriting'));
    assert(K.validateHabit({ title: 'x'.repeat(61) }, { today: T }).errors.title);
    assert(K.validateHabit({ title: 'a', description: 'x'.repeat(501) }, { today: T }).errors.description);
    eq(K.validateHabit({ title: ' Suv ichish ' }, { today: T }).value.title, 'Suv ichish');
  });
  await test('validateHabit: standart qiymatlar (kundalik, bugungi sana, "Boshqa"), keraksiz maydonlar tozalanadi', () => {
    const r = K.validateHabit({ title: 'A', weekdays: ['1'], every: '5' }, { today: T });
    assert(r.ok); eq(r.value, { title: 'A', description: '', categoryId: 'boshqa', freq: 'daily', weekdays: [], every: null, startDate: T });
  });
  await test('validateHabit: hafta kunlari majburiy, matn -> son, takror olib tashlanadi, tartiblanadi, noto\'g\'ri qiymat rad etiladi', () => {
    assert(K.validateHabit({ title: 'A', freq: 'weekly', weekdays: [] }, { today: T }).errors.weekdays.includes('Kamida'));
    eq(K.validateHabit({ title: 'A', freq: 'weekly', weekdays: ['4', '0', '4', 2] }, { today: T }).value.weekdays, [0, 2, 4]);
    eq(K.validateHabit({ title: 'A', freq: 'weekly', weekdays: '3' }, { today: T }).value.weekdays, [3]);
    for (const bad of [['7'], ['-1'], ['x'], ['1.5']]) assert(K.validateHabit({ title: 'A', freq: 'weekly', weekdays: bad }, { today: T }).errors.weekdays, `rad etilmadi: ${bad}`);
  });
  await test('validateHabit: "har N kunda" 2–60, kategoriya, takrorlanish turi va boshlanish sanasi tekshiruvi', () => {
    for (const bad of ['', '1', '61', '2.5', 'abc', null]) assert(K.validateHabit({ title: 'A', freq: 'interval', every: bad }, { today: T }).errors.every, `rad etilmadi: ${bad}`);
    eq(K.validateHabit({ title: 'A', freq: 'interval', every: '60' }, { today: T }).value.every, 60);
    assert(K.validateHabit({ title: 'A', categoryId: 'yoq' }, { today: T }).errors.categoryId);
    assert(K.validateHabit({ title: 'A', freq: 'monthly' }, { today: T }).errors.freq);
    for (const bad of ['2026-02-30', '2026-13-01', 'abc', '1960-01-01']) assert(K.validateHabit({ title: 'A', startDate: bad }, { today: T }).errors.startDate, `rad etilmadi: ${bad}`);
  });
  await test('Jadval: kundalik, boshlanishdan oldin emas, hafta kunlari (dushanba = 0), har N kunda', () => {
    const d = mk({}), w = mk({ freq: 'weekly', weekdays: [0, 2, 4] }), i = mk({ freq: 'interval', every: 3 });
    assert(K.isScheduled(d, D(1)) && K.isScheduled(d, D(30)) && !K.isScheduled(d, '2026-10-31'));
    eq([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => K.isScheduled(w, D(x))), [2, 4, 6, 9]); // dush, chor, juma, dush
    eq([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((x) => K.isScheduled(i, D(x))), [1, 4, 7, 10]);
    assert(!K.isScheduled(d, 'abc') && !K.isScheduled(d, '2026-02-30'));
  });
  await test('scheduledDates: oraliq, boshlanishdan oldin kesiladi, juda uzoq tarix MAX_SPAN_DAYS bilan cheklanadi', () => {
    eq(K.scheduledDates(mk({ freq: 'weekly', weekdays: [0] }), D(1), T), [D(2), D(9)]);
    eq(K.scheduledDates(mk({ startDate: '2026-11-20' }), D(1), T), []);
    const l = K.scheduledDates(mk({ startDate: '1970-01-01' }), '1970-01-01', T); eq(l.length, K.MAX_SPAN_DAYS + 1); eq(l[l.length - 1], T);
  });
  await test('Streak (kundalik): bugun bajarilsa hisoblanadi; bugun hali bajarilmagan bo\'lsa streak uzilmaydi; o\'tkazib yuborilgan kun uzadi', () => {
    const h = mk({}); let s = K.habitStats(h, S(7, 8, 9), T);
    eq([s.current, s.best, s.total, s.scheduledDays, s.rateAll, s.doneToday], [3, 3, 3, 9, 33, true]);
    s = K.habitStats(h, S(6, 7, 8), T); eq([s.current, s.best, s.doneToday, s.scheduledToday, s.rateAll], [3, 3, false, true, 38]); // 3/8: bugun maxrajga kirmaydi
    s = K.habitStats(h, S(5, 7, 8), T); eq([s.current, s.best], [2, 2]);
    s = K.habitStats(h, S(1, 2, 3, 5, 6), T); eq([s.current, s.best], [0, 3]);
    s = K.habitStats(h, S(), T); eq([s.current, s.best, s.total, s.rateAll], [0, 0, 0, 0]);
  });
  await test('Streak (hafta kunlari): jadvaldan tashqari kunlar streakni uzmaydi; jadvaldan tashqaridagi yozuv hisobga kirmaydi', () => {
    const w = mk({ freq: 'weekly', weekdays: [0, 2, 4], startDate: '2026-11-02' });
    let s = K.habitStats(w, S(2, 4, 6), T); eq([s.current, s.best, s.total, s.scheduledDays, s.rateAll], [3, 3, 3, 4, 100]);
    eq(K.habitStats(w, S(2, 4, 6, 9), T).current, 4);
    const mon = mk({ freq: 'weekly', weekdays: [0], startDate: '2026-11-02' }); s = K.habitStats(mon, S(2, 3), T); eq([s.current, s.total], [1, 1]); // 3-noyabr seshanba jadvalda yo'q
  });
  await test('Streak (har N kunda): faqat jadvalli kunlar hisoblanadi', () => {
    const i = mk({ freq: 'interval', every: 3 }), s = K.habitStats(i, S(1, 4, 7), T); // 9-noyabr jadvalda yo'q
    eq([s.current, s.best, s.scheduledToday, s.scheduledDays], [3, 3, false, 3]);
  });
  await test('Foiz: jadvalli kun bo\'lmasa null (soxta natija yo\'q); 30 kunlik oyna va butun davr alohida', () => {
    const f = K.habitStats(mk({ startDate: '2026-11-20' }), S(), T); eq([f.rateAll, f.rateWindow, f.current, f.scheduledDays], [null, null, 0, 0]);
    const today = K.habitStats(mk({ startDate: T }), S(), T); eq([today.rateAll, today.scheduledToday], [null, true]); // faqat bugun va hali bajarilmagan: foiz yo'q
    eq(K.habitStats(mk({ startDate: T }), S(9), T).rateAll, 100);
    const h = mk({ startDate: '2026-09-01' }), done = new Set(); for (let d = addDays(T, -29); d <= T; d = addDays(d, 1)) done.add(d);
    const s = K.habitStats(h, done, T); eq([s.rateWindow, s.rateAll, s.scheduledDays, s.total], [100, 43, 70, 30]);
  });
  await test('todayStats: faqat faol va bugun jadvalli odatlar; bo\'sh bo\'lsa 0 (0 ga bo\'lish yo\'q)', () => {
    const a = mk({}), b = mk({ status: 'archived' }), c = mk({ freq: 'interval', every: 3 }), logs = [{ habitId: a.id, date: T }, { habitId: b.id, date: T }];
    eq(K.todayStats([a, b, c], logs, T), { total: 1, done: 1, pending: 0, percent: 100 });
    eq(K.todayStats([a, c], [], T), { total: 1, done: 0, pending: 1, percent: 0 });
    eq(K.todayStats([], [], T), { total: 0, done: 0, pending: 0, percent: 0 });
  });
  await test('summary: eng uzun joriy streak, o\'rtacha foiz (ma\'lumotsiz odatlar kirmaydi), kategoriyalar, arxiv hisobga olinmaydi', () => {
    const a = mk({ categoryId: 'sogliq' }), b = mk({ categoryId: 'sogliq', startDate: T }), c = mk({ categoryId: 'ish', status: 'archived' });
    const logs = [D(8), D(9)].map((date) => ({ habitId: a.id, date }));
    const s = K.summary([a, b, c], logs, T); eq([s.bestCurrent, s.avgRate, s.today.total, s.today.done], [2, 22, 2, 1]);
    eq(s.cats, [{ id: 'sogliq', name: "Sog'liq", count: 2, rate: 22 }]);
    const e = K.summary([], [], T); eq([e.bestCurrent, e.avgRate, e.cats], [0, null, []]);
  });
  await test('monthGrid: haftaning birinchi kuni dushanba, holatlar (before/done/missed/pending/future/off), canToggle', () => {
    const g = K.monthGrid(mk({ startDate: D(3) }), S(3, 4), 2026, 11, T); // 1-noyabr yakshanba -> 6 ta bo'sh katak
    eq([g.cells.length, g.cells.slice(0, 6).every((c) => c === null)], [36, true]);
    const st = (n) => g.cells[5 + n].state; eq([st(1), st(2), st(3), st(4), st(5), st(8), st(9), st(10)], ['before', 'before', 'done', 'done', 'missed', 'missed', 'pending', 'future']);
    eq([g.done, g.missed], [2, 4]); eq([g.cells[5 + 9].canToggle, g.cells[5 + 10].canToggle, g.cells[5 + 1].canToggle, g.cells[5 + 5].canToggle], [true, false, false, true]);
    const w = K.monthGrid(mk({ freq: 'weekly', weekdays: [0], startDate: D(2) }), S(), 2026, 11, T); eq([w.cells[5 + 2].state, w.cells[5 + 3].state, w.missed], ['missed', 'off', 1]);
  });
  await test('monthGrid: jadvaldan tashqari kundagi yozuv "bajarilgan" ko\'rinmaydi va hisoblanmaydi', () => {
    const g = K.monthGrid(mk({ freq: 'weekly', weekdays: [0], startDate: D(2) }), S(3), 2026, 11, T); eq([g.cells[5 + 3].state, g.done], ['off', 0]);
  });
  await test('Oy yordamchilari: monthOf, shiftMonth (yil chegarasi)', () => {
    eq(K.monthOf(T), { y: 2026, m: 11 }); eq(K.shiftMonth(2026, 1, -1), { y: 2025, m: 12 }); eq(K.shiftMonth(2026, 12, 1), { y: 2027, m: 1 }); eq(K.shiftMonth(2026, 11, -23), { y: 2024, m: 12 });
  });
  await test('parseHabitsHash: ro\'yxat, yangi, tafsilot (oy bilan), tahrirlash; buzilgan kiritish xato bermaydi', () => {
    eq(K.parseHabitsHash('#/odatlar'), { screen: 'list' }); eq(K.parseHabitsHash('#/odatlar/yangi'), { screen: 'new' });
    eq(K.parseHabitsHash('#/odatlar/abc'), { screen: 'detail', id: 'abc', month: null }); eq(K.parseHabitsHash('#/odatlar/abc?m=2026-11'), { screen: 'detail', id: 'abc', month: { y: 2026, m: 11 } });
    eq(K.parseHabitsHash('#/odatlar/abc?m=2026-13').month, null); eq(K.parseHabitsHash('#/odatlar/abc?m=x').month, null); eq(K.parseHabitsHash('#/odatlar/abc/tahrir'), { screen: 'edit', id: 'abc' });
    const r = K.parseHabitsHash('#/odatlar/%E0%A4%A?m=%'); assert(r.screen === 'detail' && r.month === null);
  });
  await test('logId: deterministik 64 belgili hex; odat/sana boshqa bo\'lsa boshqa; ochiq kalitda sana va odat id ko\'rinmaydi', async () => {
    const a = await K.logId('habit-1', T), b = await K.logId('habit-1', T);
    assert(/^[0-9a-f]{64}$/.test(a)); eq(a, b); assert(a !== await K.logId('habit-1', D(8)) && a !== await K.logId('habit-2', T));
    assert(!a.includes('habit') && !a.includes('2026'));
  });
  await test('splitLogs / indexLogs: yetim yozuvlar ajratiladi, odat bo\'yicha sanalar to\'planadi', () => {
    const h = mk({}), logs = [{ id: 'a', habitId: h.id, date: D(1) }, { id: 'b', habitId: h.id, date: D(2) }, { id: 'c', habitId: 'yoq', date: D(1) }];
    const s = K.splitLogs([h], logs); eq([s.logs.length, s.orphans.map((o) => o.id)], [2, ['c']]);
    eq([...K.indexLogs(s.logs).get(h.id)].sort(), [D(1), D(2)]);
  });
  await test('normalizeHabit: standart qiymatlar; STATUSES va CATEGORIES yaxlitligi', () => {
    const n = K.normalizeHabit({ id: 'x' }); eq([n.freq, n.status, n.categoryId, n.weekdays], ['daily', 'active', 'boshqa', []]);
    assert(K.CATEGORIES.some((c) => c.id === K.FALLBACK_CATEGORY)); eq(K.STATUSES, ['active', 'archived']); eq(K.categoryName('yoq'), 'Boshqa');
  });
}
