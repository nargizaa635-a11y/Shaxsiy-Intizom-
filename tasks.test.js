// Vazifalar: sof mantiq testlari (Node va brauzerda) va haqiqiy IndexedDB + vault testlari (faqat brauzerda).
import { test, assert, eq, rejects } from './harness.js';
import * as K from '../js/modules/tasks-core.js';
import * as sec from '../js/security.js';
import * as db from '../js/database.js';
import * as S from '../js/modules/tasks-store.js';

const NOW = new Date(2026, 10, 9, 14, 30).getTime(); // dushanba, 9-noyabr 2026, 14:30 (mahalliy)
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
let seq = 0;
const mk = (o) => K.normalizeTask({ id: `t${++seq}`, title: `Vazifa ${seq}`, date: '2026-11-09', ...o });
const comp = (taskId, date, doneAt = 1) => ({ id: `c${++seq}`, kind: 'completion', taskId, date, doneAt });
const titles = (rows) => rows.map((r) => `${r.task.title}@${r.date}${r.done ? '✓' : ''}`).sort();

export async function runPure() {
  await test('Sana: parseDate kalendar bo\'yicha (kabisa yili, noto\'g\'ri sana va format)', () => {
    assert(K.parseDate('2028-02-29')); assert(!K.parseDate('2026-02-29')); assert(!K.parseDate('2026-13-01')); assert(!K.parseDate('2026-1-1')); assert(!K.parseDate('2026-04-31')); assert(!K.parseDate('abc')); assert(!K.parseDate('0099-01-01'));
    eq(K.daysInMonth(2026, 2), 28); eq(K.daysInMonth(2028, 2), 29); eq(K.daysInMonth(2026, 12), 31);
  });
  await test('Sana: addDays oy/yil/kabisa chegaralarida, weekday (dushanba=0), solishtirish', () => {
    eq(K.addDays('2026-01-31', 1), '2026-02-01'); eq(K.addDays('2026-12-31', 1), '2027-01-01'); eq(K.addDays('2028-02-28', 1), '2028-02-29'); eq(K.addDays('2026-03-01', -1), '2026-02-28'); eq(K.addDays('2026-11-09', 0), '2026-11-09');
    eq(K.weekday('2026-11-09'), 0); eq(K.weekday('2026-11-15'), 6); eq(K.weekday('2026-11-10'), 1); eq(K.toDays('1970-01-02') - K.toDays('1970-01-01'), 1);
  });
  await test('Vaqt: parseTime, localParts/localMs aylanma yo\'li, yarim tun', () => {
    eq(K.parseTime('00:00'), 0); eq(K.parseTime('23:59'), 1439); eq(K.parseTime('24:00'), null); eq(K.parseTime('9:30'), null); eq(K.parseTime('12:60'), null);
    eq(K.localParts(NOW), { date: '2026-11-09', time: '14:30' }); eq(K.localParts(K.localMs('2026-12-31', '23:59')), { date: '2026-12-31', time: '23:59' }); eq(K.localParts(at(2026, 11, 9, 0, 0)).date, '2026-11-09');
  });
  await test('fmtDateUz: Bugun/Ertaga/Kecha, oy nomi va boshqa yil', () => {
    eq(K.fmtDateUz('2026-11-09', '2026-11-09'), 'Bugun'); eq(K.fmtDateUz('2026-11-10', '2026-11-09'), 'Ertaga'); eq(K.fmtDateUz('2026-11-08', '2026-11-09'), 'Kecha');
    eq(K.fmtDateUz('2026-12-05', '2026-11-09'), '5 dekabr'); eq(K.fmtDateUz('2027-01-05', '2026-11-09'), '5 yanvar 2027');
  });
  await test('validateTask: majburiy nom, kesish, uzunlik chegaralari', () => {
    const ok = { title: '  Sut olish  ', date: '2026-11-09' }; let r = K.validateTask(ok); assert(r.ok); eq(r.value.title, 'Sut olish');
    for (const bad of ['', '   ', null, undefined]) { r = K.validateTask({ ...ok, title: bad }); assert(!r.ok && r.errors.title, String(bad)); }
    assert(K.validateTask({ ...ok, title: 'a'.repeat(120) }).ok); assert(K.validateTask({ ...ok, title: 'a'.repeat(121) }).errors.title);
    assert(K.validateTask({ ...ok, description: 'a'.repeat(1000) }).ok); assert(K.validateTask({ ...ok, description: 'a'.repeat(1001) }).errors.description);
  });
  await test('validateTask: sana majburiy va haqiqiy bo\'lishi shart', () => {
    for (const d of ['', '2026-02-30', '2026-11-9', 'bugun', null]) assert(K.validateTask({ title: 'x', date: d }).errors.date, String(d));
  });
  await test('validateTask: vaqt formati; tugash boshlanishdan keyin; faqat tugash vaqti mumkin', () => {
    const b = { title: 'x', date: '2026-11-09' }; assert(K.validateTask({ ...b, startTime: '25:00' }).errors.startTime); assert(K.validateTask({ ...b, endTime: '9:5' }).errors.endTime);
    assert(K.validateTask({ ...b, startTime: '10:00', endTime: '10:00' }).errors.endTime, 'teng vaqt'); assert(K.validateTask({ ...b, startTime: '10:00', endTime: '09:59' }).errors.endTime);
    assert(K.validateTask({ ...b, startTime: '10:00', endTime: '10:01' }).ok); assert(K.validateTask({ ...b, endTime: '10:00' }).ok); assert(K.validateTask({ ...b, startTime: '', endTime: '' }).ok);
    eq(K.validateTask({ ...b, startTime: '', endTime: '' }).value.startTime, null);
  });
  await test('validateTask: ustuvorlik, takrorlanish, kategoriya (noma\'lum -> xato, berilmasa Boshqa), standart qiymatlar', () => {
    const b = { title: 'x', date: '2026-11-09' }; const d = K.validateTask(b).value; eq([d.priority, d.repeat, d.categoryId, d.reminder], ['medium', 'none', 'boshqa', null]);
    for (const p of K.PRIORITIES) assert(K.validateTask({ ...b, priority: p }).ok); assert(K.validateTask({ ...b, priority: 'urgent' }).errors.priority);
    for (const r of K.REPEATS) assert(K.validateTask({ ...b, repeat: r }).ok); assert(K.validateTask({ ...b, repeat: 'yearly' }).errors.repeat);
    eq(K.validateTask({ ...b, categoryId: 'ish' }).value.categoryId, 'ish'); { const u = K.validateTask({ ...b, categoryId: 'yoq' }); eq(u.ok, false); assert(typeof u.errors.categoryId === 'string' && u.errors.categoryId.length > 0, 'noma\'lum kategoriya xato bermadi'); eq(Object.keys(u.errors), ['categoryId']); }
    for (const empty of [undefined, null, '']) { const e = K.validateTask({ ...b, categoryId: empty }); eq([e.ok, e.value.categoryId], [true, 'boshqa']); } // berilmasa: standart "Boshqa"
    eq(K.validateTask({ ...b, categoryId: 'yoq' }, { categoryIds: ['yoq'] }).ok, true); eq(K.validateTask({ ...b, categoryId: 'boshqa' }).value.categoryId, 'boshqa'); eq(K.validateTask({ ...b, categoryId: 'custom' }, { categoryIds: ['custom'] }).value.categoryId, 'custom');
  });
  await test('validateTask: eslatma boshlanish vaqtini talab qiladi va faqat ruxsat etilgan qiymatlar', () => {
    const b = { title: 'x', date: '2026-11-09' }; assert(K.validateTask({ ...b, reminder: 15 }).errors.reminder, 'vaqtsiz'); assert(K.validateTask({ ...b, startTime: '10:00', reminder: 15 }).ok);
    eq(K.validateTask({ ...b, startTime: '10:00', reminder: '0' }).value.reminder, 0); assert(K.validateTask({ ...b, startTime: '10:00', reminder: 7 }).errors.reminder); eq(K.validateTask({ ...b, reminder: '' }).value.reminder, null);
  });
  await test('Kategoriya nomi: bo\'sh, uzun, takror (registrsiz), o\'zini tahrirlash', () => {
    const ex = [{ id: 'a', name: 'Ish' }, { id: 'b', name: "O'qish" }]; assert(!K.validateCategoryName('  ', ex).ok); assert(!K.validateCategoryName('x'.repeat(31), ex).ok); assert(K.validateCategoryName('x'.repeat(30), ex).ok);
    assert(!K.validateCategoryName('ish', ex).ok); assert(K.validateCategoryName('ish', ex, 'a').ok); eq(K.validateCategoryName('  Yangi ', ex).value, 'Yangi');
    eq(K.categoryName('a', ex), 'Ish'); eq(K.categoryName('yoq', [{ id: 'boshqa', name: 'Boshqa' }]), 'Boshqa'); eq(K.DEFAULT_CATEGORIES.map((c) => c.id), ['shaxsiy', 'ish', 'oqish', 'sogliq', 'oila', 'boshqa']);
  });
  await test('Takrorlanish "har kuni": hodisa, eng so\'nggi, keyingi', () => {
    const t = mk({ repeat: 'daily', date: '2026-11-05' });
    assert(K.isOccurrence(t, '2026-11-05')); assert(K.isOccurrence(t, '2027-03-01')); assert(!K.isOccurrence(t, '2026-11-04'));
    eq(K.latestOnOrBefore(t, '2026-11-09'), '2026-11-09'); eq(K.latestOnOrBefore(t, '2026-11-04'), null); eq(K.nextAfter(t, '2026-11-09'), '2026-11-10'); eq(K.nextAfter(t, '2026-11-01'), '2026-11-05'); eq(K.nextAfter(t, '2026-12-31'), '2027-01-01');
  });
  await test('Takrorlanish "har hafta": faqat shu hafta kuni, eng so\'nggi/keyingi', () => {
    const t = mk({ repeat: 'weekly', date: '2026-11-02' }); // dushanba
    assert(K.isOccurrence(t, '2026-11-09')); assert(!K.isOccurrence(t, '2026-11-10')); assert(!K.isOccurrence(t, '2026-10-26'));
    eq(K.latestOnOrBefore(t, '2026-11-12'), '2026-11-09'); eq(K.latestOnOrBefore(t, '2026-11-09'), '2026-11-09'); eq(K.latestOnOrBefore(t, '2026-11-01'), null);
    eq(K.nextAfter(t, '2026-11-09'), '2026-11-16'); eq(K.nextAfter(t, '2026-11-12'), '2026-11-16'); eq(K.nextAfter(t, '2026-10-01'), '2026-11-02'); eq(K.nextAfter(t, '2026-12-28'), '2027-01-04');
  });
  await test('Takrorlanish "har oy": oy oxiri (31 -> 28/29 -> yana 31), 30 va 29 kunlar', () => {
    const t = mk({ repeat: 'monthly', date: '2026-01-31' }); const seq2 = []; let d = '2026-01-31'; for (let i = 0; i < 5; i++) { seq2.push(d); d = K.nextAfter(t, d); }
    eq(seq2, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    const lp = mk({ repeat: 'monthly', date: '2028-01-31' }); eq(K.nextAfter(lp, '2028-01-31'), '2028-02-29'); eq(K.nextAfter(lp, '2028-02-29'), '2028-03-31');
    const t30 = mk({ repeat: 'monthly', date: '2026-01-30' }); eq(K.nextAfter(t30, '2026-01-30'), '2026-02-28'); eq(K.nextAfter(t30, '2026-02-28'), '2026-03-30');
    const t15 = mk({ repeat: 'monthly', date: '2026-12-15' }); eq(K.nextAfter(t15, '2026-12-15'), '2027-01-15'); assert(K.isOccurrence(t, '2026-02-28')); assert(!K.isOccurrence(t, '2026-02-27')); assert(!K.isOccurrence(t, '2026-03-30'));
    eq(K.latestOnOrBefore(t, '2026-03-30'), '2026-02-28'); eq(K.latestOnOrBefore(t, '2026-03-31'), '2026-03-31'); eq(K.latestOnOrBefore(t, '2026-01-30'), null); eq(K.latestOnOrBefore(t15, '2027-01-14'), '2026-12-15');
  });
  await test('Takrorlanmaydigan vazifa: faqat o\'z sanasi', () => {
    const t = mk({ date: '2026-11-09' }); assert(K.isOccurrence(t, '2026-11-09')); assert(!K.isOccurrence(t, '2026-11-10')); eq(K.latestOnOrBefore(t, '2026-11-20'), '2026-11-09'); eq(K.latestOnOrBefore(t, '2026-11-08'), null);
    eq(K.nextAfter(t, '2026-11-08'), '2026-11-09'); eq(K.nextAfter(t, '2026-11-09'), null);
  });
  await test('occurrencesBetween: kunlik, haftalik, oylik (yil chegarasi), chegara va limit', () => {
    eq(K.occurrencesBetween(mk({ repeat: 'daily', date: '2026-11-01' }), '2026-11-08', '2026-11-11'), ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']);
    eq(K.occurrencesBetween(mk({ repeat: 'weekly', date: '2026-11-02' }), '2026-11-03', '2026-11-30'), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    eq(K.occurrencesBetween(mk({ repeat: 'monthly', date: '2026-10-31' }), '2026-11-01', '2027-02-28'), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
    eq(K.occurrencesBetween(mk({ repeat: 'daily', date: '2026-11-20' }), '2026-11-01', '2026-11-22'), ['2026-11-20', '2026-11-21', '2026-11-22']); eq(K.occurrencesBetween(mk({ repeat: 'daily', date: '2026-01-01' }), '2026-01-01', '2030-01-01', 10).length, 10);
    eq(K.occurrencesBetween(mk({ date: '2026-11-09' }), '2026-11-01', '2026-11-30'), ['2026-11-09']);
  });
  await test('Yozuvlar: normalizeTask standart qiymatlari, splitRecords (yetim va takroriy bajarilishlar), indexCompletions', () => {
    const n = K.normalizeTask({ id: 'a', title: 'x', date: '2026-11-09' }); eq([n.priority, n.repeat, n.status, n.kind, n.schemaV, n.reminder], ['medium', 'none', 'active', 'task', 1, null]);
    const t = mk({}), recs = [t, comp(t.id, '2026-11-08'), comp(t.id, '2026-11-08', 5), comp('yoq', '2026-11-08'), { id: 'old', title: 'eski', date: '2026-11-09' }];
    const s = K.splitRecords(recs); eq(s.tasks.length, 2); eq(s.completions.length, 2); eq(s.orphans.length, 1); eq(s.tasks[1].priority, 'medium');
    const idx = K.indexCompletions(s.completions); eq(idx.get(t.id).size, 1); eq(idx.get(t.id).get('2026-11-08'), 1);
  });

  // ---- Filtrlar va hodisa qatorlari (yagona, aniq ma'lumotlar to'plami) ----
  const A = mk({ title: 'A', date: '2026-11-09', startTime: '10:00', endTime: '11:00' }), B = mk({ title: 'B', date: '2026-11-09' }), C = mk({ title: 'C', date: '2026-11-10' }), D = mk({ title: 'D', date: '2026-11-08' });
  const E = mk({ title: 'E', date: '2026-11-08', status: 'done', doneAt: 5 }), F = mk({ title: 'F', date: '2026-11-19' }), G = mk({ title: 'G', date: '2026-11-01', repeat: 'daily' }), H = mk({ title: 'H', date: '2026-11-02', repeat: 'weekly' });
  const all = [A, B, C, D, E, F, G, H], cs = [comp(G.id, '2026-11-07'), comp(G.id, '2026-11-08'), comp(G.id, '2026-11-09')];
  const rows = (f, n = NOW) => titles(K.buildRows(all, cs, f, n));
  await test('Filtr "Bugun": bir martalik va takroriy hodisalar, bajarilgan holati bilan', () => eq(rows('today'), ['A@2026-11-09', 'B@2026-11-09', 'G@2026-11-09✓', 'H@2026-11-09']));
  await test('Filtr "Ertaga"', () => eq(rows('tomorrow'), ['C@2026-11-10', 'G@2026-11-10']));
  await test('Filtr "Kelgusi": bir martalik kelajak va takroriylarning keyingi hodisasi', () => eq(rows('upcoming'), ['C@2026-11-10', 'F@2026-11-19', 'G@2026-11-10', 'H@2026-11-16']));
  await test('Filtr "Bajarilgan": bir martalik + takroriy vazifaning har bir bajarilgan kuni (tarix)', () => eq(rows('done'), ['E@2026-11-08✓', 'G@2026-11-07✓', 'G@2026-11-08✓', 'G@2026-11-09✓']));
  await test('Filtr "Muddati o\'tgan": o\'tgan sana + bugungi tugash vaqti o\'tgani + takroriyning o\'tkazib yuborilgani; bajarilganlar kirmaydi', () => eq(rows('overdue'), ['A@2026-11-09', 'D@2026-11-08', 'H@2026-11-02']));
  await test('Filtr "Bajarilmagan": bajarilganlar kirmaydi, takroriydan faqat bajarilmagan hodisalar', () => eq(rows('undone'), ['A@2026-11-09', 'B@2026-11-09', 'C@2026-11-10', 'D@2026-11-08', 'F@2026-11-19', 'G@2026-11-10', 'H@2026-11-02', 'H@2026-11-09', 'H@2026-11-16']));
  await test('Filtr "Barchasi": takroriydan tarix qatorlari kirmaydi (faqat tarixiy "Bajarilgan" da)', () => eq(rows('all'), ['A@2026-11-09', 'B@2026-11-09', 'C@2026-11-10', 'D@2026-11-08', 'E@2026-11-08✓', 'F@2026-11-19', 'G@2026-11-09✓', 'G@2026-11-10', 'H@2026-11-02', 'H@2026-11-09', 'H@2026-11-16']));
  await test('Bajarilish tarixi: keyingi kunga o\'tganda oldingi kunning bajarilganligi yo\'qolmaydi', () => {
    const next = at(2026, 11, 10, 9, 0); const done = titles(K.buildRows(all, cs, 'done', next)), today = titles(K.buildRows(all, cs, 'today', next));
    assert(['G@2026-11-07✓', 'G@2026-11-08✓', 'G@2026-11-09✓'].every((x) => done.includes(x)), done.join()); assert(today.includes('G@2026-11-10') && !today.some((x) => x.startsWith('G@2026-11-09')), today.join());
    const week = at(2026, 11, 20, 9, 0); assert(K.buildRows(all, cs, 'done', week).filter((r) => r.taskId === G.id).length === 3, 'bir hafta keyin ham tarix saqlangan');
  });
  await test('Muddati o\'tgan: bugungi vazifa tugash vaqti o\'tmaguncha o\'tgan emas; chegarada (14:30 = 14:30) o\'tgan emas, 14:31 o\'tgan', () => {
    const t = mk({ date: '2026-11-09', endTime: '14:30' }); const o = (h, m) => K.isOverdue(K.buildRows([t], [], 'today', at(2026, 11, 9, h, m))[0], at(2026, 11, 9, h, m));
    eq(o(14, 29), false); eq(o(14, 30), false); eq(o(14, 31), true); const nt = mk({ date: '2026-11-09' }); eq(K.isOverdue(K.buildRows([nt], [], 'today', at(2026, 11, 9, 23, 59))[0], at(2026, 11, 9, 23, 59)), false);
    const done = mk({ date: '2026-11-01', status: 'done' }); eq(K.isOverdue(K.buildRows([done], [], 'all', NOW)[0], NOW), false);
  });
  await test('Takroriy vazifada bir necha kun o\'tkazib yuborilsa: faqat eng so\'nggisi "muddati o\'tgan" (eskilari to\'planmaydi)', () => {
    const t = mk({ repeat: 'daily', date: '2026-10-01' }); const o = K.buildRows([t], [], 'overdue', NOW); eq(o.length, 1); eq(o[0].date, '2026-11-08');
  });
  await test('Saralash: sana, vaqt, ustuvorlik; ustuvorlik rejimi; "Bajarilgan"da sana teskari', () => {
    const a = mk({ title: 'a', date: '2026-11-12', priority: 'low' }), b = mk({ title: 'b', date: '2026-11-10', priority: 'low' }), c = mk({ title: 'c', date: '2026-11-10', priority: 'high', startTime: '12:00' }), d = mk({ title: 'd', date: '2026-11-10', priority: 'high', startTime: '08:00' }), e = mk({ title: 'e', date: '2026-11-11', priority: 'medium' });
    const rs = K.buildRows([a, b, c, d, e], [], 'all', NOW); const ord = (m, f) => K.sortRows(rs, m, f).map((r) => r.task.title).join('');
    eq(ord('date'), 'dcbea'); eq(ord('priority'), 'dceba'); eq(ord('date', 'done'), 'aedcb'); // sana: o'sish tartibida, vaqti yo'qlari oxirida; ustuvorlik: yuqori -> past; Bajarilgan: yangi birinchi
    eq(rs.length, 5); const before = rs.map((r) => r.key).join(); K.sortRows(rs, 'priority'); eq(rs.map((r) => r.key).join(), before, 'asl massiv o\'zgarmaydi');
  });
  await test('todayStats: bugungi soni, bajarilgan, bajarilmagan, foiz (0 ga bo\'lish yo\'q)', () => {
    eq(K.todayStats(all, cs, NOW), { total: 4, done: 1, pending: 3, percent: 25 }); eq(K.todayStats([], [], NOW), { total: 0, done: 0, pending: 0, percent: 0 });
    eq(K.todayStats([mk({ status: 'done', date: '2026-11-09' }), mk({ status: 'done', date: '2026-11-09' }), mk({ date: '2026-11-09' })], [], NOW).percent, 67);
  });
  await test('overallStats: barcha bir martalik vazifalar + bugungi takroriy hodisalar', () => eq(K.overallStats(all, cs, NOW), { total: 8, done: 2, pending: 6, percent: 25 }));
  await test('upcomingDue: 7 kun ichida bajarilmagan, muddati o\'tmagan; takroriydan bittadan; sanaga ko\'ra', () => {
    const u = K.upcomingDue(all, cs, NOW, 7).map((r) => `${r.task.title}@${r.date}`); eq(u, ['B@2026-11-09', 'H@2026-11-09', 'C@2026-11-10', 'G@2026-11-10']);
    assert(!u.some((x) => x.startsWith('F@')), '10 kundan keyingi kirmaydi'); assert(!u.some((x) => x.startsWith('A@')), 'tugash vaqti o\'tgan kirmaydi');
  });
  await test('Eslatma: vaqti, ruxsat oynasi (boshlanishdan 1 soat keyingacha), bajarilgan/takror ko\'rsatilmaydi', () => {
    const t = mk({ date: '2026-11-09', startTime: '15:00', reminder: 30 }); const r = K.buildRows([t], [], 'today', NOW);
    eq(K.reminderAt(r[0]), at(2026, 11, 9, 14, 30)); const due = (ms, fired) => K.dueReminders(K.buildRows([t], [], 'today', ms), ms, fired).length;
    eq(due(at(2026, 11, 9, 14, 29)), 0); eq(due(at(2026, 11, 9, 14, 30)), 1); eq(due(at(2026, 11, 9, 15, 59)), 1); eq(due(at(2026, 11, 9, 16, 1)), 0);
    const fired = new Set([K.dueReminders(r, at(2026, 11, 9, 14, 30))[0].key]); eq(due(at(2026, 11, 9, 14, 40), fired), 0);
    eq(K.dueReminders(K.buildRows([{ ...t, status: 'done' }], [], 'today', NOW), NOW).length, 0); eq(K.reminderAt({ task: { reminder: null, startTime: '10:00' }, date: '2026-11-09' }), null);
  });
  await test('Eslatma kelajak uchun: reminderInstants takroriy hodisalarni kengaytiradi, bajarilganini tashlaydi, tartiblaydi', () => {
    const t = mk({ repeat: 'daily', date: '2026-11-01', startTime: '09:00', reminder: 15 }); const c = [comp(t.id, '2026-11-10')];
    const ins = K.reminderInstants([t], c, at(2026, 11, 9, 0, 0), at(2026, 11, 12, 23, 59)); eq(ins.map((x) => x.date), ['2026-11-09', '2026-11-11', '2026-11-12']);
    eq(ins[0].at, at(2026, 11, 9, 8, 45)); assert(ins.every((x, i) => i === 0 || ins[i - 1].at < x.at)); eq(K.reminderInstants([mk({ date: '2026-11-09', startTime: '09:00' })], [], at(2026, 11, 8), at(2026, 11, 10)).length, 0);
  });
  await test('parseTasksHash: ro\'yxat, yangi, tafsilot (sana bilan), tahrirlash, kategoriyalar', () => {
    eq(K.parseTasksHash('#/reja'), { screen: 'list' }); eq(K.parseTasksHash(''), { screen: 'list' }); eq(K.parseTasksHash('#/reja/yangi'), { screen: 'new' }); eq(K.parseTasksHash('#/reja/kategoriyalar'), { screen: 'categories' });
    eq(K.parseTasksHash('#/reja/abc-1?d=2026-11-09'), { screen: 'detail', id: 'abc-1', date: '2026-11-09' }); eq(K.parseTasksHash('#/reja/abc-1?d=bad'), { screen: 'detail', id: 'abc-1', date: null }); eq(K.parseTasksHash('#/reja/abc-1/tahrir'), { screen: 'edit', id: 'abc-1', date: null });
  });
  await test('parseTasksHash: buzilgan foiz-kodlash va g\'alati manzillar xato bermaydi (URIError yo\'q), natija har doim to\'g\'ri ko\'rinishda', () => {
    const bad = ['#/reja?d=%', '#/reja?d=%E0%A4%A', '#/reja?d=%zz', '#/reja?%=%&&d', '#/reja?d', '#/reja?=', '#/reja??d=2026-11-09', '#/reja?d=2026-11-09&d=%zz', '#/reja/%', '#/reja/%E0%A4%A', '#/reja/%E0%A4%A/tahrir?d=%', '#/reja/%00?d=%00', '#/reja/' + '%'.repeat(10000), '#/reja?d=' + '%E0'.repeat(5000), '#/reja//?//', '%', '#%', null, undefined, 123];
    for (const h of bad) { let r; try { r = K.parseTasksHash(h); } catch (e) { throw new Error(`${String(h).slice(0, 30)} xato berdi: ${e.name}`); } assert(['list', 'new', 'edit', 'detail', 'categories'].includes(r.screen), `noto'g'ri screen: ${String(h).slice(0, 30)}`); assert(r.date === undefined || r.date === null || /^\d{4}-\d{2}-\d{2}$/.test(r.date), 'noto\'g\'ri sana'); }
    eq(K.parseTasksHash('#/reja?d=%'), { screen: 'list' }); eq(K.parseTasksHash('#/reja/abc-1?d=%E0%A4%A'), { screen: 'detail', id: 'abc-1', date: null });
    eq(K.parseTasksHash('#/reja/abc-1?d=2026-11-09&d=%zz'), { screen: 'detail', id: 'abc-1', date: null }); eq(K.parseTasksHash('#/reja/abc-1?x=%zz&d=2026-11-09'), { screen: 'detail', id: 'abc-1', date: '2026-11-09' });
    eq(K.parseTasksHash('#/reja/abc-1?d=2026%2D11%2D09'), { screen: 'detail', id: 'abc-1', date: '2026-11-09' }); // to'g'ri foiz-kodlash avvalgidek ishlaydi
  });
}

// ---------- Haqiqiy IndexedDB + Web Crypto + vault: ma'lumotlar qatlami ----------
const base = `test-tasks-${Date.now()}`; let n = 0; const names = []; const PIN = '482915';
const errName = async (p) => { try { await p; } catch (e) { return e.name; } return 'OK'; };
const rawStores = async () => { const d = await db.open(); const out = []; for (const st of [...d.objectStoreNames]) out.push(...await new Promise((res) => { const r = d.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result); })); return out; };
const rawTasks = async () => { const d = await db.open(); return new Promise((res) => { const r = d.transaction('tasks').objectStore('tasks').getAll(); r.onsuccess = () => res(r.result); }); };
const base1 = (o = {}) => ({ title: 'Sinov', date: '2026-11-09', ...o });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBrowser() {
  const fresh = () => { sec.lock(); const nm = `${base}-${n++}`; names.push(nm); db.useDatabase(nm); return nm; };
  const setup = async () => { fresh(); const { recoveryKey } = await sec.createVault(PIN); await sec.confirmRecovery(recoveryKey); return recoveryKey; };
  try {
    await test('Qulflangan, PIN yaratilmagan va tiklash kaliti tasdiqlanmagan holatda barcha vazifa amallari rad etiladi', async () => {
      const ops = () => [S.loadAll(), S.loadCategories(), S.createTask(base1()), S.getTask('x'), S.setDone('x', '2026-11-09', true), S.deleteTask('x')];
      fresh(); for (const p of ops()) eq(await errName(p), 'LockedError', 'vault yo\'q');
      const { recoveryKey } = await sec.createVault(PIN); for (const p of ops()) eq(await errName(p), 'LockedError', 'tasdiqlanmagan');
      await sec.confirmRecovery(recoveryKey); eq((await S.loadAll()).tasks.length, 0); sec.lock(); for (const p of ops()) eq(await errName(p), 'LockedError', 'qulflangan');
    });
    await test('createTask: bazada ochiq mazmun yo\'q (faqat id/createdAt/updatedAt/v/iv/ct), qaytarilganda to\'liq deshifrlanadi', async () => {
      await setup(); const M = 'MAXFIY-VAZIFA-4471';
      const t = await S.createTask(base1({ title: M, description: M + '-tavsif', startTime: '09:30', endTime: '10:15', priority: 'high', categoryId: 'ish', reminder: 15, repeat: 'weekly' }));
      assert(t.id && t.createdAt); eq([t.status, t.kind, t.schemaV, t.doneAt], ['active', 'task', 1, null]);
      for (const r of (await rawStores()).filter((x) => x.key !== 'security')) { assert(!JSON.stringify(r).includes(M), 'ochiq nom'); assert(!JSON.stringify(r).includes('2026-11-09') && !JSON.stringify(r).includes('09:30'), 'ochiq sana/vaqt'); assert(Object.keys(r).every((k) => ['id', 'key', 'createdAt', 'updatedAt', 'v', 'iv', 'ct'].includes(k)), Object.keys(r).join()); }
      const l = (await S.loadAll()).tasks[0]; eq([l.title, l.description, l.date, l.startTime, l.endTime, l.priority, l.categoryId, l.reminder, l.repeat], [M, M + '-tavsif', '2026-11-09', '09:30', '10:15', 'high', 'ish', 15, 'weekly']);
    });
    await test('createTask tekshiruvi: noto\'g\'ri ma\'lumot ValidationError beradi va hech narsa yozilmaydi', async () => {
      await setup();
      for (const bad of [{ title: '' }, { title: 'x', date: '2026-02-30' }, { title: 'x', startTime: '10:00', endTime: '09:00' }, { title: 'x', reminder: 15 }, { title: 'x', priority: 'zo\'r' }, { title: 'x', repeat: 'yillik' }]) {
        try { await S.createTask(base1(bad)); assert(false, 'qabul qilindi'); } catch (e) { eq(e.name, 'ValidationError'); assert(Object.keys(e.errors).length >= 1); }
      }
      eq((await rawTasks()).length, 0);
    });
    await test('Kategoriya: noma\'lum categoryId yozishda ValidationError (categoryId) beradi va hech narsa yozilmaydi; berilmasa "Boshqa"', async () => {
      await setup(); try { await S.createTask(base1({ categoryId: 'yoq-kategoriya' })); assert(false, 'qabul qilindi'); } catch (e) { eq(e.name, 'ValidationError'); eq(Object.keys(e.errors), ['categoryId']); } eq((await rawTasks()).length, 0);
      eq((await S.createTask(base1())).categoryId, 'boshqa');
      const k = await S.addCategory('Vaqtinchalik'), t = await S.createTask(base1({ categoryId: k.id })); await S.deleteCategory(k.id); // boshqa tabda o'chirilgan kategoriya: forma eski ro'yxat bilan yuboradi
      eq(await errName(S.updateTask(t.id, { categoryId: k.id })), 'ValidationError'); eq((await S.getTask(t.id)).categoryId, 'boshqa'); eq(await errName(S.createTask(base1({ categoryId: k.id }))), 'ValidationError');
    });
    await test('updateTask: eskirgan (o\'chirilgan) kategoriyali yozuvni tahrirlash "Boshqa"ga o\'tkazadi, foydalanuvchi tanlamagan bo\'lsa xato bermaydi', async () => {
      await setup(); const rec = await db.add('tasks', { kind: 'task', title: 'Eski', date: '2026-11-09', categoryId: 'ochirilgan', priority: 'medium', repeat: 'none', status: 'active', doneAt: null, schemaV: 1 });
      const u = await S.updateTask(rec.id, { title: 'Yangi nom' }); eq([u.title, u.categoryId], ['Yangi nom', 'boshqa']); eq((await S.getTask(rec.id)).categoryId, 'boshqa');
      const rec2 = await db.add('tasks', { kind: 'task', title: 'Eski2', date: '2026-11-09', categoryId: 'ochirilgan', priority: 'medium', repeat: 'none', status: 'active', doneAt: null, schemaV: 1 });
      eq(await errName(S.updateTask(rec2.id, { categoryId: 'ochirilgan' })), 'ValidationError'); eq((await S.getTask(rec2.id)).title, 'Eski2'); eq((await S.loadAll()).tasks.find((x) => x.id === rec2.id).categoryId, 'ochirilgan'); // o'qishda hamon ko'rinadi, nom "Boshqa"
    });
    await test('updateTask: qisman o\'zgartirish qolganini saqlaydi; noto\'g\'ri qiymat rad etiladi va yozuv o\'zgarmaydi; noma\'lum id xato', async () => {
      await setup(); const t = await S.createTask(base1({ title: 'A', description: 'tavsif', priority: 'low', startTime: '08:00' })); await wait(3);
      const u = await S.updateTask(t.id, { title: 'B', priority: 'high' }); eq([u.title, u.priority, u.description, u.startTime, u.date], ['B', 'high', 'tavsif', '08:00', '2026-11-09']); assert(u.updatedAt > t.updatedAt); eq(u.createdAt, t.createdAt);
      eq(await errName(S.updateTask(t.id, { title: '  ' })), 'ValidationError'); eq(await errName(S.updateTask(t.id, { endTime: '07:00' })), 'ValidationError'); eq((await S.getTask(t.id)).title, 'B');
      assert((await errName(S.updateTask('yoq', { title: 'x' }))) !== 'OK');
    });
    await test('setDone (bir martalik): bajarildi -> qayta faollashtirish, doneAt, filtrlarda aks etadi', async () => {
      await setup(); const t = await S.createTask(base1()); const NOWD = at(2026, 11, 9, 10, 0);
      await S.setDone(t.id, t.date, true, NOWD); let a = await S.loadAll(); eq([a.tasks[0].status, a.tasks[0].doneAt], ['done', NOWD]); eq(K.buildRows(a.tasks, a.completions, 'done', NOWD).length, 1); eq(K.buildRows(a.tasks, a.completions, 'undone', NOWD).length, 0);
      await S.setDone(t.id, t.date, false); a = await S.loadAll(); eq([a.tasks[0].status, a.tasks[0].doneAt], ['active', null]); eq(K.buildRows(a.tasks, a.completions, 'undone', NOWD).length, 1);
    });
    await test('Takroriy vazifa: har bir kun alohida shifrlangan completion yozuvi, tarix saqlanadi, bekor qilish faqat tanlangan kunni o\'chiradi', async () => {
      await setup(); const t = await S.createTask(base1({ title: 'Kunlik', date: '2026-11-01', repeat: 'daily' }));
      for (const d of ['2026-11-07', '2026-11-08', '2026-11-09']) await S.setDone(t.id, d, true, at(2026, 11, 9, 8, 0));
      let a = await S.loadAll(); eq(a.tasks.length, 1); eq(a.completions.length, 3); eq(a.tasks[0].status, 'active');
      const next = at(2026, 11, 10, 9, 0); eq(K.buildRows(a.tasks, a.completions, 'done', next).map((r) => r.date).sort(), ['2026-11-07', '2026-11-08', '2026-11-09']);
      eq(K.buildRows(a.tasks, a.completions, 'today', next).map((r) => [r.date, r.done]), [['2026-11-10', false]]);
      const recs = await rawTasks(); eq(recs.length, 4); const dump = JSON.stringify(recs.filter((r) => r.id !== t.id)); // 3 ta bajarilish yozuvi: ularda sana, belgi va vazifa id si ochiq bo'lmasin (vazifaning o'z id si ochiq metama'lumot)
      eq(recs.filter((r) => r.id !== t.id).length, 3); for (const x of ['2026-11-07', '2026-11-08', '2026-11-09', 'completion', 'taskId', t.id]) assert(!dump.includes(x), `ochiq: ${x}`); assert(!JSON.stringify(recs.find((r) => r.id === t.id)).includes('Kunlik'), 'vazifa nomi ochiq');
      await S.setDone(t.id, '2026-11-08', false); a = await S.loadAll(); eq(a.completions.map((c) => c.date).sort(), ['2026-11-07', '2026-11-09']);
    });
    await test('Takroriy vazifa: jadvalda yo\'q sana rad etiladi (boshlanishdan oldin, noto\'g\'ri hafta kuni)', async () => {
      await setup(); const w = await S.createTask(base1({ date: '2026-11-02', repeat: 'weekly' }));
      for (const d of ['2026-10-26', '2026-11-03', '2026-11-08']) assert((await errName(S.setDone(w.id, d, true))) !== 'OK', d); eq((await S.loadAll()).completions.length, 0);
      await S.setDone(w.id, '2026-11-09', true); eq((await S.loadAll()).completions.length, 1);
    });
    await test('Bajarish idempotent: ikki marta va bir vaqtda bajarilsa tarixda bitta kun; bekor qilish hammasini o\'chiradi', async () => {
      await setup(); const t = await S.createTask(base1({ date: '2026-11-01', repeat: 'daily' }));
      await S.setDone(t.id, '2026-11-09', true); await S.setDone(t.id, '2026-11-09', true); eq((await S.loadAll()).completions.length, 1);
      const t2 = await S.createTask(base1({ date: '2026-11-01', repeat: 'daily' })); await Promise.all([S.setDone(t2.id, '2026-11-09', true), S.setDone(t2.id, '2026-11-09', true)]);
      const a = await S.loadAll(); const idx = K.indexCompletions(a.completions.filter((c) => c.taskId === t2.id)); eq(idx.get(t2.id).size, 1, 'dublikat sanalar tarixda bir marta');
      eq(K.buildRows(a.tasks.filter((x) => x.id === t2.id), a.completions, 'done', at(2026, 11, 9, 12, 0)).length, 1);
      await S.setDone(t2.id, '2026-11-09', false); eq((await S.loadAll()).completions.filter((c) => c.taskId === t2.id).length, 0);
    });
    await test('Takrorlanish rejimi o\'zgarganda: tarix saqlanadi; bir martalik bajarilgan vazifa takroriyga aylansa faol bo\'ladi', async () => {
      await setup(); const d = await S.createTask(base1({ date: '2026-11-01', repeat: 'daily' })); await S.setDone(d.id, '2026-11-08', true);
      await S.updateTask(d.id, { repeat: 'none' }); eq((await S.loadAll()).completions.length, 1); await S.updateTask(d.id, { repeat: 'daily' }); eq((await S.loadAll()).completions.length, 1);
      const o = await S.createTask(base1()); await S.setDone(o.id, o.date, true); await S.updateTask(o.id, { repeat: 'weekly' }); const g = await S.getTask(o.id); eq([g.status, g.doneAt], ['active', null]);
    });
    await test('deleteTask: vazifa va butun tarixi o\'chadi, qaytarish (undo) xuddi shu id va tarix bilan tiklaydi', async () => {
      await setup(); const t = await S.createTask(base1({ title: 'O\'chiriladi', date: '2026-11-01', repeat: 'daily', startTime: '09:00', reminder: 5 })); const keep = await S.createTask(base1({ title: 'Qoladi' }));
      for (const d of ['2026-11-07', '2026-11-08', '2026-11-09']) await S.setDone(t.id, d, true);
      const undo = await S.deleteTask(t.id); eq(undo.completions.length, 3); eq((await rawTasks()).length, 1); eq((await S.loadAll()).tasks.map((x) => x.title), ['Qoladi']);
      await S.restoreTask(undo); const a = await S.loadAll(); eq(a.tasks.length, 2); eq(a.completions.length, 3); const r = a.tasks.find((x) => x.id === t.id);
      eq([r.title, r.repeat, r.startTime, r.reminder, r.date], ["O'chiriladi", 'daily', '09:00', 5, '2026-11-01']); assert((await errName(S.deleteTask('yoq'))) !== 'OK'); void keep;
    });
    await test('Yetim bajarilish yozuvlari (vazifasi yo\'q) ko\'rinmaydi va tozalanadi; vazifa o\'chib tarix qolsa (uzilgan o\'chirish) ham xavfsiz', async () => {
      await setup(); const t = await S.createTask(base1({ date: '2026-11-01', repeat: 'daily' })); await S.setDone(t.id, '2026-11-09', true);
      await db.remove('tasks', t.id); // faqat vazifa o'chdi (o'chirish jarayoni uzildi)
      const a = await S.loadAll(); eq([a.tasks.length, a.completions.length], [0, 0]); await wait(300); eq((await rawTasks()).length, 0, 'yetim yozuv tozalanmadi');
    });
    await test('Kategoriyalar: 6 ta boshlang\'ich bir marta yaratiladi; o\'chirilgan qayta paydo bo\'lmaydi; "Boshqa" himoyalangan', async () => {
      await setup(); let c = await S.loadCategories(); eq(c.map((x) => x.name), ['Shaxsiy', 'Ish', "O'qish", "Sog'liq", 'Oila', 'Boshqa']); c = await S.loadCategories(); eq(c.length, 6);
      await S.deleteCategory('ish'); eq((await S.loadCategories()).map((x) => x.id).includes('ish'), false); eq((await S.loadCategories()).length, 5);
      assert((await errName(S.deleteCategory('boshqa'))) !== 'OK'); eq((await S.loadCategories()).some((x) => x.id === 'boshqa'), true);
    });
    await test('Kategoriya: yaratish, tahrirlash, takror/bo\'sh nom rad etiladi, o\'chirilganda vazifalar "Boshqa"ga o\'tadi', async () => {
      await setup(); const k = await S.addCategory('  Sayohat '); eq(k.name, 'Sayohat'); eq(await errName(S.addCategory('sayohat')), 'ValidationError'); eq(await errName(S.addCategory('  ')), 'ValidationError');
      await S.renameCategory(k.id, 'Safar'); eq((await S.loadCategories()).find((x) => x.id === k.id).name, 'Safar'); eq(await errName(S.renameCategory(k.id, 'Ish')), 'ValidationError'); await S.renameCategory(k.id, 'safar');
      const t = await S.createTask(base1({ categoryId: k.id })); eq(t.categoryId, k.id); await S.deleteCategory(k.id); eq((await S.getTask(t.id)).categoryId, 'boshqa'); eq((await S.loadCategories()).some((x) => x.id === k.id), false);
      const raw = JSON.stringify(await rawStores()); assert(!raw.includes('Safar') && !raw.includes('Sayohat'), 'kategoriya nomi ochiq');
    });
    await test('Kategoriyalar: ikki tab bir vaqtda qo\'shsa ikkalasi ham saqlanadi (bir-birini o\'chirmaydi)', async () => {
      await setup(); await S.loadCategories(); await Promise.all([S.addCategory('Bir'), S.addCategory('Ikki'), S.addCategory('Uch')]);
      const names2 = (await S.loadCategories()).map((x) => x.name); for (const x of ['Bir', 'Ikki', 'Uch']) assert(names2.includes(x), x);
    });
    await test('Eski/to\'liq bo\'lmagan yozuv (kind, holat, schemaV yo\'q) normallashtiriladi va tahrirlanadi', async () => {
      await setup(); const rec = await db.add('tasks', { title: 'Eski', date: '2026-11-09' }); const t = await S.getTask(rec.id); eq([t.kind, t.priority, t.repeat, t.status, t.schemaV, t.categoryId], ['task', 'medium', 'none', 'active', 1, 'boshqa']);
      const u = await S.updateTask(rec.id, { title: 'Yangi' }); eq(u.title, 'Yangi'); eq((await S.loadAll()).tasks.length, 1);
    });
    await test('Tablararo sinxron: o\'zgarishda faqat {t:"changed"} yuboriladi (mazmunsiz), uzoq tabdan xabar tinglovchini ishga tushiradi, localStorage da vazifa matni yo\'q', async () => {
      await setup(); let calls = 0; const off = S.subscribe(() => { calls++; }); const got = []; const spy = new BroadcastChannel('si-tasks'); spy.onmessage = (e) => got.push(e.data);
      try {
        const M = 'SIR-VAZIFA-9921'; await S.createTask(base1({ title: M })); await wait(150); assert(calls >= 1, 'tinglovchi chaqirilmadi'); eq(got, [{ t: 'changed' }]); assert(!JSON.stringify(got).includes(M));
        const before = calls; const remote = new BroadcastChannel('si-tasks'); remote.postMessage({ t: 'changed' }); await wait(150); remote.close(); assert(calls > before, 'uzoq tab xabari qabul qilinmadi');
        const ls = JSON.stringify(Object.entries(localStorage)); assert(!ls.includes(M), 'localStorage da matn'); assert(ls.includes('si:tasks-rev'));
      } finally { off(); spy.close(); S.stopSync(); }
    });
  } finally { sec.lock(); for (const nm of names) await db.deleteDatabase(nm); }
}
