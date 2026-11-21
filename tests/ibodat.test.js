// Ibodat: sof mantiq testlari (Node va brauzerda). Haqiqiy IndexedDB + vault + interfeys: tests/e2e-ibodat.mjs.
import { test, assert, eq } from './harness.js';
import * as K from '../js/modules/ibodat-core.js';

const T = '2026-11-09';

export async function runPure() {
  await test('validatePrayer: faqat 5 ta namoz turi, sana to\'g\'ri va kelajakda emas', () => {
    assert(K.validatePrayer({ date: T, prayer: 'fajr' }, { today: T }).ok);
    assert(K.validatePrayer({ date: T, prayer: 'vitr' }, { today: T }).errors.prayer);
    assert(K.validatePrayer({ date: '2026-11-10', prayer: 'asr' }, { today: T }).errors.date.includes('Kelajak'));
    assert(K.validatePrayer({ date: '2026-02-30', prayer: 'asr' }, { today: T }).errors.date);
    eq(K.PRAYERS.map((p) => p.id), ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
  });
  await test('validateQuran: sahifa yoki daqiqa kerak; chegaralar, matn -> son, izoh tozalanadi, standart sana', () => {
    eq(K.validateQuran({ pages: '5' }, { today: T }).value, { date: T, pages: 5, minutes: null, note: '' });
    eq(K.validateQuran({ minutes: 20, note: '  Baqara   ' }, { today: T }).value, { date: T, pages: 0, minutes: 20, note: 'Baqara' });
    assert(K.validateQuran({}, { today: T }).errors.pages.includes('kiriting'));
    assert(K.validateQuran({ pages: 0, minutes: 0 }, { today: T }).errors.pages);
    for (const bad of ['-1', '605', '1.5', 'x']) assert(K.validateQuran({ pages: bad }, { today: T }).errors.pages, `rad etilmadi: ${bad}`);
    for (const bad of ['-1', '721', 'x']) assert(K.validateQuran({ pages: 1, minutes: bad }, { today: T }).errors.minutes, `rad etilmadi: ${bad}`);
    assert(K.validateQuran({ pages: 1, note: 'x'.repeat(201) }, { today: T }).errors.note);
    assert(K.validateQuran({ pages: 1, date: '2026-11-10' }, { today: T }).errors.date);
    assert(K.validateQuran({ pages: 604 }, { today: T }).ok);
  });
  await test('validateDhikr / validateTarget: nom majburiy va bo\'shliqlar tozalanadi, maqsad ixtiyoriy 1–1 000 000', () => {
    eq(K.validateDhikr({ name: '  Subhanalloh   ', target: '33' }, { today: T }).value, { date: T, name: 'Subhanalloh', target: 33 });
    eq(K.validateDhikr({ name: 'A', target: '' }, { today: T }).value.target, null);
    assert(K.validateDhikr({ name: ' ' }, { today: T }).errors.name); assert(K.validateDhikr({ name: 'x'.repeat(61) }, { today: T }).errors.name);
    for (const bad of ['0', '-5', '1000001', 'abc', '1.5']) assert(K.validateDhikr({ name: 'A', target: bad }, { today: T }).errors.target, `rad etilmadi: ${bad}`);
    eq(K.validateTarget('').value, null); eq(K.validateTarget(null).ok, true); eq(K.validateTarget(1000000).value, 1000000);
  });
  await test('validateCount: 0 dan 1 000 000 gacha butun son', () => {
    eq([K.validateCount(0).ok, K.validateCount('33').value, K.validateCount(1000000).ok], [true, 33, true]);
    for (const bad of [-1, 1000001, 1.5, 'x', '', null]) assert(!K.validateCount(bad).ok, `rad etilmadi: ${bad}`);
  });
  await test('validateNote: matn majburiy, sarlavha ixtiyoriy, chegaralar, kelajak sana rad etiladi', () => {
    eq(K.validateNote({ body: '  Matn \r\n qator ' }, { today: T }).value, { date: T, title: '', body: 'Matn \n qator' });
    assert(K.validateNote({ body: ' ' }, { today: T }).errors.body); assert(K.validateNote({ body: 'x'.repeat(10001) }, { today: T }).errors.body);
    assert(K.validateNote({ body: 'a', title: 'x'.repeat(101) }, { today: T }).errors.title); assert(K.validateNote({ body: 'a', date: '2026-11-10' }, { today: T }).errors.date);
  });
  await test('nameKey / cleanName: katta-kichik harf va ortiqcha bo\'shliq farqsiz', () => {
    eq(K.cleanName('  Al   hamdulillah '), 'Al hamdulillah'); eq(K.nameKey(' ALHAMDULILLAH '), K.nameKey('alhamdulillah')); assert(K.nameKey('A B') === K.nameKey('a  b'));
  });
  await test('recordId: deterministik 64 belgili hex; bir kunda bir nom = bitta kalit; kalitdan sana va nom ko\'rinmaydi', async () => {
    const a = await K.prayerId(T, 'fajr'), b = await K.prayerId(T, 'fajr'); assert(/^[0-9a-f]{64}$/.test(a)); eq(a, b);
    assert(a !== await K.prayerId(T, 'asr') && a !== await K.prayerId('2026-11-08', 'fajr'));
    const z1 = await K.dhikrId(T, 'Subhanalloh'), z2 = await K.dhikrId(T, '  SUBHANALLOH '); eq(z1, z2); assert(z1 !== await K.dhikrId('2026-11-08', 'Subhanalloh') && z1 !== a);
    assert(!z1.includes('2026') && !a.includes('2026'));
  });
  const rec = (o) => ({ id: `r${Math.random()}`, createdAt: 1, updatedAt: 1, date: T, ...o });
  await test('splitRecords: turlarga ajratiladi; noma\'lum tur, buzuq sana va noto\'g\'ri namoz turi e\'tiborsiz', () => {
    const s = K.splitRecords([rec({ kind: 'prayer', prayer: 'fajr' }), rec({ kind: 'prayer', prayer: 'xxx' }), rec({ kind: 'quran', pages: 3 }), rec({ kind: 'dhikr', name: 'A', count: 5 }), rec({ kind: 'note', body: 'm' }), rec({ kind: 'boshqa' }), rec({ kind: 'note', body: 'x', date: 'bad' }), null]);
    eq([s.prayers.length, s.quran.length, s.dhikr.length, s.notes.length], [1, 1, 1, 1]); eq([s.quran[0].minutes, s.dhikr[0].target, s.notes[0].title], [null, null, '']);
  });
  await test('dhikrProgress: maqsadsiz foiz null; maqsad bilan foiz va "yetildi" (100% dan oshmaydi)', () => {
    eq(K.dhikrProgress({ count: 5, target: null }), { count: 5, target: null, percent: null, reached: false });
    eq(K.dhikrProgress({ count: 33, target: 100 }), { count: 33, target: 100, percent: 33, reached: false });
    eq(K.dhikrProgress({ count: 150, target: 100 }), { count: 150, target: 100, percent: 100, reached: true }); eq(K.dhikrProgress({ count: 100, target: 100 }).reached, true);
  });
  const parts = () => K.splitRecords([
    rec({ kind: 'prayer', prayer: 'fajr' }), rec({ kind: 'prayer', prayer: 'isha' }), rec({ kind: 'prayer', prayer: 'asr', date: '2026-11-08' }),
    rec({ kind: 'quran', pages: 3, minutes: 10, createdAt: 2 }), rec({ kind: 'quran', pages: 2, createdAt: 3 }), rec({ kind: 'quran', pages: 9, date: '2026-10-30' }),
    rec({ kind: 'dhikr', name: 'Subhanalloh', count: 33, target: 100, createdAt: 2 }), rec({ kind: 'dhikr', name: 'Alhamdulillah', count: 10, createdAt: 3, updatedAt: 9 }), rec({ kind: 'dhikr', name: 'Subhanalloh', count: 7, date: '2026-11-08' }),
    rec({ kind: 'note', body: 'Birinchi', title: '', createdAt: 5 }), rec({ kind: 'note', body: 'Kechagi', date: '2026-11-08' }), rec({ kind: 'note', body: 'Kelajak', date: '2026-11-12' }),
  ]);
  await test('dayData: bir kunning namozlari, Qur\'on jami, zikrlar va qaydlari; boshqa kunlar aralashmaydi', () => {
    const d = K.dayData(T, parts()); eq([[...d.prayers].sort(), d.pages, d.minutes, d.quran.length, d.dhikr.map((z) => z.name), d.dhikrTotal, d.notes.length], [['fajr', 'isha'], 5, 10, 2, ['Subhanalloh', 'Alhamdulillah'], 43, 1]);
    const e = K.dayData('2026-01-01', parts()); eq([e.prayers.size, e.pages, e.minutes, e.quran.length, e.dhikr.length, e.notes.length, e.dhikrTotal], [0, 0, 0, 0, 0, 0, 0]);
  });
  await test('recentNames: oxirgi ishlatilgani birinchi, takrorsiz, limit', () => {
    eq(K.recentNames(parts()), ['Alhamdulillah', 'Subhanalloh']); eq(K.recentNames(parts(), 1), ['Alhamdulillah']); eq(K.recentNames({ dhikr: [] }), []);
  });
  await test('history: faqat belgilangan kunlar, yangisi birinchi, kelajak kunlar kirmaydi, sanoqlar to\'g\'ri', () => {
    const h = K.history(parts(), T); eq(h.map((x) => x.date), [T, '2026-11-08', '2026-10-30']);
    eq(h[0], { date: T, prayers: 2, pages: 5, minutes: 10, dhikr: 43, notes: 1 }); eq(h[1], { date: '2026-11-08', prayers: 1, pages: 0, minutes: 0, dhikr: 7, notes: 1 });
    eq(K.history(parts(), T, 1).length, 1); eq(K.history({ prayers: [], quran: [], dhikr: [], notes: [] }, T), []);
  });
  await test('monthCounts: faqat shu oy va bugungacha; bo\'sh bo\'lsa nollar (baho yo\'q)', () => {
    eq(K.monthCounts(parts(), T), { days: 2, prayers: 3, pages: 5, minutes: 10, dhikr: 50, notes: 2 });
    eq(K.monthCounts({ prayers: [], quran: [], dhikr: [], notes: [] }, T), { days: 0, prayers: 0, pages: 0, minutes: 0, dhikr: 0, notes: 0 });
  });
  await test('Neytrallik: modul foiz, streak, ball yoki "o\'tkazib yuborilgan" eksport qilmaydi', () => {
    const names = Object.keys(K).join(' ').toLowerCase(); for (const w of ['streak', 'score', 'rate', 'missed', 'qazo', 'grade', 'index']) assert(!names.includes(w), `kutilmagan eksport: ${w}`);
    const h = K.history(parts(), T)[0]; assert(!('percent' in h) && !('streak' in h));
  });
  await test('dayLabelOffset: oldingi/keyingi kun, bugundan keyin keyingi kun yo\'q', () => {
    eq(K.dayLabelOffset(T, T), { prev: '2026-11-08', next: null }); eq(K.dayLabelOffset('2026-11-08', T), { prev: '2026-11-07', next: T }); eq(K.dayLabelOffset('xx', T), null);
  });
  await test('parseIbodatHash: kun, tarix, zikr, qaydlar; buzilgan kiritish xato bermaydi', () => {
    eq(K.parseIbodatHash('#/ibodat'), { screen: 'day', date: null }); eq(K.parseIbodatHash('#/ibodat/kun/2026-11-08'), { screen: 'day', date: '2026-11-08' });
    eq(K.parseIbodatHash('#/ibodat/kun/xx'), { screen: 'day', date: null }); eq(K.parseIbodatHash('#/ibodat/tarix'), { screen: 'history' });
    eq(K.parseIbodatHash('#/ibodat/zikr/abcdef12-3456'), { screen: 'dhikr', id: 'abcdef12-3456' }); eq(K.parseIbodatHash('#/ibodat/zikr/!!'), { screen: 'day', date: null });
    eq(K.parseIbodatHash('#/ibodat/qayd'), { screen: 'notes' }); eq(K.parseIbodatHash('#/ibodat/qayd/yangi?d=2026-11-08'), { screen: 'note-new', date: '2026-11-08' });
    eq(K.parseIbodatHash('#/ibodat/qayd/yangi?d=zzz'), { screen: 'note-new', date: null }); eq(K.parseIbodatHash('#/ibodat/qayd/abcdef12-3456'), { screen: 'note', id: 'abcdef12-3456' });
    eq(K.parseIbodatHash('#/ibodat/qayd/abcdef12-3456/tahrir'), { screen: 'note-edit', id: 'abcdef12-3456' }); eq(K.parseIbodatHash('#/ibodat/qayd/<>'), { screen: 'notes' });
    eq(K.parseIbodatHash('#/ibodat/nimadir'), { screen: 'day', date: null }); eq(K.parseIbodatHash('#/ibodat/qayd/yangi?d=%'), { screen: 'note-new', date: null });
  });
}
