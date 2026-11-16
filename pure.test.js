// Brauzersiz testlar: sxema, migratsiya, UUID, router, ro'yxatdan o'tkazish.
import { test, assert, eq } from './harness.js';
import { STORES, STORE_NAMES, MIGRATIONS, DB_VERSION, migrate, uuid, stamp } from '../js/schema.js';
import { resolve } from '../js/router.js';
import { ROUTES, TABS, OTHERS } from '../js/modules/registry.js';
import { pinProblem, weakPin, normGroup, fullNorm, checkFullKey, KEY_INPUT_MAX, pickGroups, fmtWait, explain, GROUPS, CONFIRM_GROUPS } from '../js/modules/security-ui.js';

const fakeDb = () => {
  const made = {}, stores = {};
  const mk = (n, o) => { made[n] = { opts: o, indexes: new Map() };
    return { createIndex: (i, p, op) => made[n].indexes.set(i, [p, op]), get indexNames() { return [...made[n].indexes.keys()]; }, deleteIndex: (i) => made[n].indexes.delete(i) }; };
  return { made, tx: { objectStore: (n) => stores[n] },
    get objectStoreNames() { const a = Object.keys(made); a.contains = (n) => n in made; return a; },
    createObjectStore(n, o) { stores[n] = mk(n, o); return stores[n]; } };
};

export async function run() {
  await test('14 ta store belgilangan', () => eq(STORE_NAMES.length, 14));
  await test('Spetsifikatsiyadagi barcha store nomlari bor', () => {
    const need = ['tasks','habits','habit_logs','goals','milestones','focus_sessions','books','learning_logs','worship_logs','transactions','projects','journal_entries','settings','analytics_snapshots'];
    need.forEach((n) => assert(STORES[n], `${n} yo'q`));
  });
  await test('Migratsiya 0 -> 1: store va (tarixiy) indekslar yaratiladi', () => {
    const db = fakeDb(); eq(migrate(db, db.tx, 0, 1), [1]); eq(Object.keys(db.made).length, 14);
    eq(db.made.tasks.opts, { keyPath: 'id' }); eq(db.made.settings.opts, { keyPath: 'key' });
    assert(db.made.habit_logs.indexes.get('habitDate')[1].unique, 'habitDate unikal emas');
  });
  await test('Migratsiya 0 -> 2: barcha indekslar olib tashlanadi, store\'lar saqlanadi', () => {
    const db = fakeDb(); eq(migrate(db, db.tx, 0, 2), [1, 2]);
    eq(Object.keys(db.made).length, 14); Object.values(db.made).forEach((s) => eq(s.indexes.size, 0));
  });
  await test('Migratsiya 1 -> 2: faqat v2 ishlaydi', () => {
    const db = fakeDb(); migrate(db, db.tx, 0, 1); eq(migrate(db, db.tx, 1, 2), [2]); eq(db.made.tasks.indexes.size, 0);
  });
  await test('Migratsiya qayta ishlamaydi (oldVersion=DB_VERSION)', () => { const db = fakeDb(); eq(migrate(db, db.tx, DB_VERSION, DB_VERSION), []); });
  await test('Migratsiyalar ketma-ket (0->3) va faqat yangilari (1->3)', () => {
    const order = []; const ms = [1, 2, 3].map((v) => ({ version: v, up: () => order.push(v) }));
    eq(migrate(null, null, 0, 3, ms), [1, 2, 3]); order.length = 0;
    eq(migrate(null, null, 1, 3, ms), [2, 3]);
  });
  await test('Migratsiya versiyalari tartibli va DB_VERSION ga teng', () => {
    eq(MIGRATIONS.map((m) => m.version), MIGRATIONS.map((_, i) => i + 1)); eq(MIGRATIONS.at(-1).version, DB_VERSION);
  });
  await test('uuid: v4 formati va noyobligi', () => {
    const set = new Set(Array.from({ length: 500 }, uuid));
    eq(set.size, 500); assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test([...set][0]));
  });
  await test('uuid: getRandomValues zaxira yo\'li', () => {
    const real = globalThis.crypto; const rv = real.getRandomValues.bind(real);
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: rv }, configurable: true });
    try { assert(/^[0-9a-f-]{36}$/.test(uuid())); } finally { Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true }); }
  });
  await test('stamp: id, createdAt, updatedAt; mavjud id saqlanadi', () => {
    const r = stamp({ a: 1 }, 5); eq([r.createdAt, r.updatedAt, r.a], [5, 5, 1]); assert(r.id);
    eq(stamp({ id: 'x' }).id, 'x');
  });
  await test('Router: to\'g\'ri, noma\'lum va bo\'sh hash', () => {
    eq(resolve('#/reja', ROUTES), 'reja'); eq(resolve('#/odatlar', ROUTES), 'odatlar');
    eq(resolve('#/nomalum', ROUTES), 'bosh'); eq(resolve('', ROUTES), 'bosh'); eq(resolve('#/', ROUTES), 'bosh');
    eq(resolve('#/__proto__', ROUTES), 'bosh'); eq(resolve('#/reja?x=1', ROUTES), 'reja');
  });
  await test('Ro\'yxat: 5 ta tab, har bir tab marshruti mavjud, ichki bo\'limlar boshqalarda', () => {
    eq(TABS.length, 5); TABS.forEach((t) => assert(ROUTES[t.id], t.id));
    eq(OTHERS.length, 8); OTHERS.forEach((o) => eq(ROUTES[o.id].tab, 'boshqalar'));
    Object.entries(ROUTES).forEach(([id, r]) => assert(id === 'boshqalar' || (r.empty && r.empty.length === 2), `${id} bo'sh holati yo'q`));
  });
  await test('PIN siyosati: zaif PIN\'lar rad etiladi (qaror ro\'yxati va qoidalar)', () => {
    for (const w of ['111111', '123456', '000000', '654321', '222222', '987654', '012345', '121212', '123123', '12345678', '87654321', '11111111', '00000000', '112233', '696969', '12341234'])
      assert(pinProblem(w, w).includes('oson'), `${w} rad etilmadi`);
  });
  await test('PIN siyosati: kuchli PIN\'lar (6–8 raqam) qabul qilinadi', () => {
    for (const ok of ['482915', '739204', '5081726', '49271638', '135792', '246801']) eq(pinProblem(ok, ok), '', ok);
  });
  await test('PIN siyosati: format, uzunlik va mos kelmaslik xabarlari', () => {
    assert(pinProblem('12345', '12345').includes('6–8')); assert(pinProblem('123456789', '123456789').includes('6–8')); assert(pinProblem('', '').includes('6–8'));
    assert(pinProblem('48a915', '48a915').includes('raqam')); assert(pinProblem('482915', '482916').includes('bir xil emas')); eq(pinProblem('482915'), '');
    eq(weakPin('482915'), false); eq(weakPin('111111'), true);
  });
  await test('Tiklash kaliti guruhlari: normallashtirish va 3 ta tasodifiy guruh tanlash', () => {
    eq(normGroup(' o1il-xy9 '), '0111XY9'); eq(normGroup('ab cd'), 'ABCD');
    { const key = ['A1B2', 'C3D4', 'E5F6', 'G7H8', 'J9K0', 'M1N2', 'P3Q4', 'R5S6', 'T7V8', 'W9X0', 'Y1Z2', 'A3B4', 'C5D6', 'E7F8'].join('-'); // to'liq kalitni qayta kiritish (14 guruh x 4 = 56 belgi)
      eq(fullNorm(key).length, 56); eq(checkFullKey(key, key), { ok: true }); eq(checkFullKey(key.toLowerCase(), key).ok, true); eq(checkFullKey(key.replace(/-/g, ' '), key).ok, true); eq(checkFullKey(key.replace(/-/g, ''), key).ok, true); eq(checkFullKey('  ' + key + '\n', key).ok, true);
      eq(checkFullKey(key.replace(/1/g, 'l').replace(/0/g, 'o'), key).ok, true); // O/0 va I,L/1 ko'chirishda adashish tuzatiladi (crypto.parseRecoveryKey kabi)
      for (const bad of ['', '   ', key.slice(0, -1), key + 'A', key.split('-').slice(0, 13).join('-'), key.replace('A1B2', 'A1B3'), key.replace('E7F8', 'E7F9')]) assert(checkFullKey(bad, key).ok === false && checkFullKey(bad, key).error.length > 5, `qabul qilindi: ${bad.slice(0, 12)}`);
      assert(checkFullKey(key.replace('R5S6', 'R5S7'), key).error.includes('8-guruh')); assert(checkFullKey(key.slice(0, 40), key).error.includes('56')); assert(KEY_INPUT_MAX >= 69 && KEY_INPUT_MAX <= 120, 'maydon chegarasi kalit uzunligiga mos emas'); }
    let a = 7; const rnd = (n) => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n); }; const seen = new Set(); // mulberry32
    for (let i = 0; i < 200; i++) { const g = pickGroups(GROUPS, CONFIRM_GROUPS, rnd); eq(g.length, 3); eq(new Set(g).size, 3); assert(g.every((x) => x >= 0 && x < 14)); assert(g[0] < g[1] && g[1] < g[2]); g.forEach((x) => seen.add(x)); }
    eq(seen.size, 14, 'barcha guruhlar tanlanishi mumkin');
  });
  await test('Kutish vaqti formati va xato matnlari', () => {
    eq(fmtWait(10000), '10 s'); eq(fmtWait(9001), '10 s'); eq(fmtWait(65000), '1 daq 05 s'); eq(fmtWait(900000), '15 daq 00 s');
    eq(explain({ name: 'WrongCredentialError' }), "PIN noto'g'ri."); eq(explain({ name: 'WrongCredentialError' }, 'recovery'), 'Bu tiklash kaliti mos kelmadi.');
    assert(explain({ name: 'ThrottledError', remainingMs: 30000 }).includes('30 s')); assert(explain(new Error('x')).includes('x'));
  });
}
