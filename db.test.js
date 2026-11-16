// Brauzer testlari: IndexedDB + vault (alohida test bazalarida, ilova ma'lumotiga tegmaydi).
import { test, assert, eq, rejects } from './harness.js';
import * as db from '../js/database.js';
import * as sec from '../js/security.js';
import { DB_VERSION, STORE_NAMES, MIGRATIONS, migrate } from '../js/schema.js';

const base = `test-intizom-${Date.now()}`; let n = 0; const names = [];
const fresh = () => { sec.lock(); const nm = `${base}-${n++}`; names.push(nm); db.useDatabase(nm); return nm; };
const PIN = '482915';
const rawAll = async (s) => (await db.open()).transaction(s).objectStore(s).getAll();
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const rawGetAll = async (s) => req((await db.open()).transaction(s).objectStore(s).getAll());
const rawPut = async (s, rec) => { const t = (await db.open()).transaction(s, 'readwrite'); t.objectStore(s).put(rec); await new Promise((r) => { t.oncomplete = r; }); };
const errName = async (p) => { try { await p; } catch (e) { return e.name; } return 'OK'; };
const vault = async () => { fresh(); const { recoveryKey } = await sec.createVault(PIN); await sec.confirmRecovery(recoveryKey); return recoveryKey; };
const OPS = [() => db.get('tasks', 'x'), () => db.getAll('tasks'), () => db.query('tasks', () => true), () => db.count('tasks'), () => db.add('tasks', { a: 1 }), () => db.update('tasks', 'x', {}), () => db.remove('tasks', 'x'), () => db.getSetting('a'), () => db.setSetting('a', 1)];
const allBlocked = async (msg) => { for (const f of OPS) eq(await errName(f()), 'LockedError', msg); };

export async function run() {
  try {
    await test('Baza: 14 store, versiya 2, indekslar yo\'q', async () => {
      fresh(); const d = await db.open(); eq(d.version, DB_VERSION); eq([...d.objectStoreNames].sort(), [...STORE_NAMES].sort());
      for (const s of STORE_NAMES) eq(d.transaction(s).objectStore(s).indexNames.length, 0, s);
    });
    await test('v1 -> v2 migratsiya: mavjud ma\'lumot saqlanadi, indekslar o\'chadi', async () => {
      const nm = `${base}-mig`; names.push(nm);
      const d1 = await db.open(nm, 1, [MIGRATIONS[0]]);
      const t = d1.transaction('tasks', 'readwrite'); t.objectStore('tasks').put({ id: 'a', title: 'Saqlanadi', date: '2026-11-07' }); await new Promise((r) => { t.oncomplete = r; }); d1.close();
      const d2 = await db.open(nm, 2, MIGRATIONS); eq(d2.version, 2);
      eq(d2.transaction('tasks').objectStore('tasks').indexNames.length, 0);
      eq((await req(d2.transaction('tasks').objectStore('tasks').get('a'))).title, 'Saqlanadi'); d2.close();
    });
    await test('PIN yo\'q bo\'lganda ma\'lumot yozish/o\'qish rad etiladi (ochiq saqlanmaydi)', async () => {
      fresh(); eq(await sec.getStatus(), 'none'); eq(await errName(db.add('tasks', { title: 'x' })), 'LockedError'); eq(await errName(db.getAll('tasks')), 'LockedError');
      eq((await rawGetAll('tasks')).length, 0);
    });
    await test('PIN yaratish: 4-8 raqam, noto\'g\'ri formatlar rad etiladi', async () => {
      fresh(); for (const bad of ['123', '123456789', 'abcd12', '12 34', '']) await rejects(sec.createVault(bad));
      eq(await sec.getStatus(), 'none');
    });
    await test('Vault yaratish: DEK ochilmaydi, holat pending-recovery, tasdiqlanmaguncha hamma DB amali rad etiladi', async () => {
      fresh(); await rawPut('tasks', { id: 't1', title: 'Eski ochiq', createdAt: 1, updatedAt: 1 });
      const { recoveryKey } = await sec.createVault(PIN);
      eq(await sec.getStatus(), 'pending-recovery'); assert(!sec.isUnlocked()); await allBlocked('createVault dan keyin');
      try { await db.add('tasks', {}); } catch (e) { assert(e.message.includes('tasdiqlanmagan'), e.message); }
      eq(await sec.unlock(PIN), 'recovery-pending'); assert(!sec.isUnlocked()); await allBlocked('PIN bilan');
      await rejects(sec.unlock('000000'));
      const typo = recoveryKey.slice(0, -4) + (recoveryKey.endsWith('AAAA') ? 'BBBB' : 'AAAA');
      await rejects(sec.confirmRecovery(typo)); await allBlocked('xato kalitdan keyin');
      await rejects(sec.confirmRecovery(await (await import('../js/crypto.js')).formatRecoveryKey(new Uint8Array(32)))); await allBlocked('mos kelmagan kalitdan keyin');
      eq(await sec.getStatus(), 'pending-recovery');
      await sec.confirmRecovery(recoveryKey); eq(await sec.getStatus(), 'ready'); assert(sec.isUnlocked());
      eq((await db.get('tasks', 't1')).title, 'Eski ochiq'); // tasdiqlangach CRUD ochiladi
      const t = await db.add('tasks', { title: 'Yangi' }); await db.update('tasks', t.id, { title: 'Y2' }); eq((await db.get('tasks', t.id)).title, 'Y2');
      eq(await db.count('tasks'), 2); await db.remove('tasks', t.id); await db.setSetting('a', 1); eq(await db.getSetting('a'), 1);
    });
    await test('Tasdiqlanmagan holat qayta ochilganda/ilovadan chiqilganda saqlanadi; yangi kalit bilan tasdiqlash', async () => {
      fresh(); const { recoveryKey: k1 } = await sec.createVault(PIN);
      sec.lock(); // ilova yopildi: xotira tozalandi, holat bazada
      eq(await sec.getStatus(), 'pending-recovery'); await allBlocked('qayta ochilgach');
      eq(await sec.unlock(PIN), 'recovery-pending'); await allBlocked('PIN dan keyin');
      const { recoveryKey: k2 } = await sec.startRecoveryRotation(PIN); await allBlocked('yangilash boshlangach');
      eq(await sec.getStatus(), 'pending-recovery');
      await rejects(sec.confirmRecoveryRotation(k1)); await allBlocked('eski kalit bilan tasdiqlanmadi');
      await sec.confirmRecoveryRotation(k2); eq(await sec.getStatus(), 'ready'); assert(sec.isUnlocked());
      await db.add('tasks', { title: 'M' }); sec.lock(); eq(await errName(sec.unlockWithRecovery(k1)), 'WrongCredentialError'); await sec.unlockWithRecovery(k2);
    });
    await test("Tasdiqlanmagan holatda Recovery Key bilan yangi PIN o'rnatish kalitni tasdiqlaydi", async () => {
      fresh(); const { recoveryKey } = await sec.createVault(PIN); await allBlocked('oldin');
      await sec.resetPinWithRecovery(recoveryKey, '7788'); eq(await sec.getStatus(), 'ready'); assert(sec.isUnlocked());
      await db.add('tasks', { title: 'M' }); sec.lock(); eq(await errName(sec.unlock(PIN)), 'WrongCredentialError'); eq(await sec.unlock('7788'), 'unlocked');
    });
    await test("Ikki vault bir vaqtda (bitta jarayon): faqat bittasi yaratiladi, mavjud vault almashtirilmaydi", async () => {
      fresh(); let reached = 0, release; const gate = new Promise((r) => { release = r; });
      const hook = async (a) => { if (a > 0) return; if (++reached === 2) release(); await gate; };
      const res = await Promise.allSettled([sec.createVault('111111', { beforeCommit: hook }), sec.createVault('222222', { beforeCommit: hook })]);
      eq(res.filter((r) => r.status === 'fulfilled').length, 1); const w = res.findIndex((r) => r.status === 'fulfilled'), l = 1 - w;
      eq(res[l].reason.name, 'VaultExistsError'); const winPin = w === 0 ? '111111' : '222222', losePin = w === 0 ? '222222' : '111111';
      eq((await rawGetAll('settings')).filter((r) => r.key === 'security').length, 1);
      assert(!sec.isUnlocked()); eq(await errName(sec.unlock(losePin)), 'WrongCredentialError'); eq(await sec.unlock(winPin), 'recovery-pending');
      await sec.confirmRecovery(res[w].value.recoveryKey); assert(sec.isUnlocked()); await db.add('tasks', { ok: 1 }); // g'olib vault buzilmagan
    });
    await test("Vault boshqa joyda yaratilsa (yakuniy tranzaksiya tekshiruvi): bekor qilinadi, mavjud vault va ma'lumot tegilmaydi", async () => {
      fresh(); await rawPut('tasks', { id: 'a', title: 'A', createdAt: 1, updatedAt: 1 });
      const injected = { key: 'security', value: { marker: 'boshqa-tab' }, createdAt: 5, updatedAt: 5 };
      eq(await errName(sec.createVault(PIN, { beforeCommit: async () => { await rawPut('settings', injected); } })), 'VaultExistsError');
      const sv = await rawGetAll('settings'); eq(sv.length, 1); eq(sv[0].value.marker, 'boshqa-tab');
      const ts = await rawGetAll('tasks'); assert(!ts[0].ct && ts[0].title === 'A', 'yarim shifrlash qoldi'); assert(!sec.isUnlocked());
    });
    await test('Vault metama\'lumoti: PBKDF2 iteratsiyasi, salt/iv wrap\'larda alohida, PIN/kalit ochiq emas', async () => {
      const rk = await vault(); const v = (await rawGetAll('settings')).find((r) => r.key === 'security').value;
      eq(v.pin.iterations, 600000); eq(v.pin.kdf, 'PBKDF2-SHA256'); eq(v.rec.kdf, 'HKDF-SHA256');
      assert(v.pin.salt.join() !== v.rec.salt.join() && v.pin.iv.join() !== v.rec.iv.join());
      const json = JSON.stringify(v); assert(!json.includes(PIN) && !json.includes(rk.replace(/-/g, '')));
      const snap = JSON.stringify(v); eq(await errName(sec.createVault('654321')), 'VaultExistsError'); // ikkinchi marta yaratib bo'lmaydi
      eq(JSON.stringify((await rawGetAll('settings')).find((r) => r.key === 'security').value), snap, 'vault o\'zgardi');
    });
    await test('Past iteratsiya rad etiladi (avtomatik pasaytirish yo\'q)', async () => { fresh(); await rejects(sec.createVault(PIN, { iterations: 1000 })); eq(await sec.getStatus(), 'none'); });
    await test('To\'g\'ri PIN ochadi, noto\'g\'ri PIN ochmaydi, qulf kalitni tozalaydi', async () => {
      await vault(); sec.lock(); assert(!sec.isUnlocked());
      eq(await errName(sec.unlock('000000')), 'WrongCredentialError'); assert(!sec.isUnlocked());
      await sec.unlock(PIN); assert(sec.isUnlocked()); sec.lock(); assert(!sec.isUnlocked());
    });
    await test('Qulflangan holatda hamma amal LockedError beradi', async () => {
      await vault(); const r = await db.add('tasks', { title: 'x' }); sec.lock();
      for (const f of [() => db.get('tasks', r.id), () => db.getAll('tasks'), () => db.add('tasks', {}), () => db.update('tasks', r.id, {}), () => db.remove('tasks', r.id), () => db.count('tasks'), () => db.getSetting('a'), () => db.setSetting('a', 1)]) eq(await errName(f()), 'LockedError');
      await sec.unlock(PIN); eq((await db.get('tasks', r.id)).id, r.id); // qulflash ma'lumotni o'chirmagan
    });
    await test('CRUD shifrlangan: add/get/update/getAll/query/count/remove', async () => {
      await vault(); const t = await db.add('tasks', { title: 'Sinov', status: 'open' });
      assert(t.id && t.createdAt === t.updatedAt); eq((await db.get('tasks', t.id)).title, 'Sinov');
      await new Promise((r) => setTimeout(r, 3));
      const u = await db.update('tasks', t.id, { title: 'Yangi', id: 'hack', createdAt: 1 });
      eq([u.title, u.id, u.createdAt, u.status], ['Yangi', t.id, t.createdAt, 'open']); assert(u.updatedAt > t.updatedAt);
      await db.add('tasks', { title: 'B', status: 'done' });
      eq((await db.query('tasks', (x) => x.status === 'done')).map((x) => x.title), ['B']); eq(await db.count('tasks'), 2); eq((await db.getAll('tasks')).length, 2);
      await db.remove('tasks', t.id); eq(await db.get('tasks', t.id), undefined); eq(await db.count('tasks'), 1);
      await rejects(db.update('tasks', 'yoq', {}));
    });
    await test('Bazada ochiq shaxsiy ma\'lumot yo\'q (faqat id/createdAt/updatedAt/v/iv/ct)', async () => {
      await vault(); const M = 'MAXFIY-BELGI-7731';
      for (const s of STORE_NAMES.filter((x) => x !== 'settings')) await db.add(s, { title: M, note: M, amount: 12345, date: '2026-11-07', status: 'done' });
      await db.setSetting('valyuta', M);
      for (const s of STORE_NAMES) for (const r of await rawGetAll(s)) {
        if (r.key === 'security') continue;
        assert(JSON.stringify(r).indexOf(M) < 0, `${s}: ochiq matn`);
        assert(Object.keys(r).every((k) => ['id', 'key', 'createdAt', 'updatedAt', 'v', 'iv', 'ct'].includes(k)), `${s}: ortiqcha maydon ${Object.keys(r)}`);
      }
      eq((await db.getAll('journal_entries'))[0].title, M); eq(await db.getSetting('valyuta'), M);
    });
    await test('Sozlamalar: yangilash createdAt ni saqlaydi, "security" kaliti himoyalangan', async () => {
      await vault(); eq(await db.getSetting('yoq', 'zaxira'), 'zaxira');
      await db.setSetting('til', 'uz'); const c = (await db.get('settings', 'til')).createdAt; await db.setSetting('til', 'ru');
      const r = await db.get('settings', 'til'); eq([r.value, r.createdAt], ['ru', c]);
      for (const f of [() => db.get('settings', 'security'), () => db.setSetting('security', 1), () => db.remove('settings', 'security'), () => db.update('settings', 'security', {})]) await rejects(f());
      eq((await db.getAll('settings')).map((x) => x.key), ['til']);
    });
    await test('Parallel yangilashlar: hech biri yo\'qolmaydi (optimistik versiya tekshiruvi)', async () => {
      await vault(); const t = await db.add('tasks', {});
      await Promise.all(Array.from({ length: 8 }, (_, i) => db.update('tasks', t.id, { [`f${i}`]: i })));
      const r = await db.get('tasks', t.id); for (let i = 0; i < 8; i++) eq(r[`f${i}`], i, `f${i}`);
    });
    await test('Buzilgan ciphertext, almashtirilgan yozuv va ochiq (shifrlanmagan) yozuv aniqlanadi', async () => {
      await vault(); const a = await db.add('tasks', { title: 'A' }), b = await db.add('tasks', { title: 'B' });
      const [ra, rb] = await rawGetAll('tasks'); const A = ra.id === a.id ? ra : rb, B = ra.id === a.id ? rb : ra;
      const bad = { ...A, ct: A.ct.slice() }; bad.ct[3] ^= 1; await rawPut('tasks', bad); eq(await errName(db.get('tasks', a.id)), 'DecryptError');
      await rawPut('tasks', { ...B, id: a.id }); eq(await errName(db.get('tasks', a.id)), 'DecryptError'); // ct B ning id si bilan bog'langan
      await rawPut('tasks', { id: 'plain', title: 'ochiq', createdAt: 1, updatedAt: 1 }); eq(await errName(db.get('tasks', 'plain')), 'IntegrityError');
      await rejects(db.getAll('tasks')); // bitta buzilgan yozuv butun o'qishni to'xtatadi, jimgina o'tkazib yuborilmaydi
    });
    await test('Mavjud ochiq ma\'lumot vault yaratilganda to\'liq shifrlanadi, aralashmaydi', async () => {
      fresh(); await rawPut('tasks', { id: 't1', title: 'Eski ochiq', createdAt: 1, updatedAt: 1 }); await rawPut('settings', { key: 'x', value: 'ochiq-qiymat', createdAt: 1, updatedAt: 1 });
      const ck = (await sec.createVault(PIN)).recoveryKey; await sec.confirmRecovery(ck);
      for (const r of await rawGetAll('tasks')) assert(!JSON.stringify(r).includes('Eski') && r.ct);
      eq((await db.get('tasks', 't1')).title, 'Eski ochiq'); eq(await db.getSetting('x'), 'ochiq-qiymat');
    });
    await test('Jarayon o\'rtasida xato: hech narsa o\'zgarmaydi (yarim shifrlash yo\'q)', async () => {
      fresh(); await rawPut('tasks', { id: 'a', title: 'A', createdAt: 1, updatedAt: 1 }); await rawPut('tasks', { id: 'b', big: 1n, createdAt: 1, updatedAt: 1 }); // BigInt JSON'ga o'tmaydi
      await rejects(sec.createVault(PIN)); assert(!sec.isUnlocked()); eq(await sec.getStatus(), 'none');
      const rows = await rawGetAll('tasks'); eq(rows.length, 2); assert(rows.every((r) => !r.ct && r.v === undefined)); eq(rows.find((r) => r.id === 'a').title, 'A');
    });
    await test('Vault yaratish paytida boshqa yozuv o\'zgarsa: qayta urinadi, yangi qiymat yo\'qolmaydi', async () => {
      fresh(); await rawPut('tasks', { id: 'a', title: 'eski', createdAt: 1, updatedAt: 1 }); let calls = 0;
      const cv = await sec.createVault(PIN, { beforeCommit: async () => { if (calls++ === 0) await rawPut('tasks', { id: 'a', title: 'yangi', createdAt: 1, updatedAt: 2 }); } });
      eq(calls, 2); await sec.confirmRecovery(cv.recoveryKey); eq((await db.get('tasks', 'a')).title, 'yangi');
    });
    await test('Tiklash kaliti bilan ochish; noto\'g\'ri/buzilgan kalit rad etiladi', async () => {
      const rk = await vault(); const t = await db.add('tasks', { title: 'M' }); sec.lock();
      await rejects(sec.unlockWithRecovery(rk.slice(0, -1))); eq(await errName(sec.unlockWithRecovery(await (await import('../js/crypto.js')).formatRecoveryKey(new Uint8Array(32).fill(7)))), 'WrongCredentialError');
      assert(!sec.isUnlocked()); await sec.unlockWithRecovery(rk.toLowerCase()); eq((await db.get('tasks', t.id)).title, 'M');
    });
    await test('PIN almashtirish: ma\'lumot qayta shifrlanmaydi va saqlanadi; eski PIN ishlamaydi', async () => {
      await vault(); const t = await db.add('tasks', { title: 'M' }); const before = (await rawGetAll('tasks'))[0].ct.join();
      await rejects(sec.changePin('111111', '654321')); sec.lock(); await sec.unlock(PIN); // xato urinish hech narsani o'zgartirmadi
      await sec.changePin(PIN, '654321'); eq((await rawGetAll('tasks'))[0].ct.join(), before); sec.lock();
      eq(await errName(sec.unlock(PIN)), 'WrongCredentialError'); await sec.unlock('654321'); eq((await db.get('tasks', t.id)).title, 'M');
    });
    await test('Recovery orqali yangi PIN: ma\'lumot saqlanadi, eski PIN ishlamaydi, kalit o\'zgarmaydi', async () => {
      const rk = await vault(); const t = await db.add('tasks', { title: 'M' }); sec.lock();
      await rejects(sec.resetPinWithRecovery(rk, '12')); eq(await errName(sec.unlock(PIN)), 'OK'); sec.lock();
      await sec.resetPinWithRecovery(rk, '7788'); assert(sec.isUnlocked()); sec.lock();
      eq(await errName(sec.unlock(PIN)), 'WrongCredentialError'); await sec.unlock('7788'); eq((await db.get('tasks', t.id)).title, 'M');
      await sec.unlockWithRecovery(rk);
    });
    await test('Recovery Key yangilash: tasdiqlanguncha eskisi ishlaydi, tasdiqdan keyin faqat yangisi', async () => {
      const old = await vault(); const t = await db.add('tasks', { title: 'M' });
      await rejects(sec.startRecoveryRotation('000000')); await rejects(sec.confirmRecoveryRotation(old)); // boshlanmagan
      const { recoveryKey: nw } = await sec.startRecoveryRotation(PIN); assert(nw !== old);
      await rejects(sec.confirmRecoveryRotation(old)); // eski kalit bilan tasdiqlab bo'lmaydi
      sec.lock(); await sec.unlockWithRecovery(old); sec.lock(); // hali eskisi ishlaydi
      await sec.confirmRecoveryRotation(nw);
      sec.lock(); eq(await errName(sec.unlockWithRecovery(old)), 'WrongCredentialError'); await sec.unlockWithRecovery(nw); eq((await db.get('tasks', t.id)).title, 'M');
      eq(await sec.getStatus(), 'ready');
    });
    await test('Xotira: DEK non-extractable, tashqariga chiqmaydi', async () => {
      await vault(); assert(!('dek' in sec) && !('getKey' in sec)); const r = await db.add('tasks', { a: 1 }); assert(r.id);
    });
    // Ohirgisi: modulning yangi nusxasi (brauzer qayta ochilishini taqlid qiladi). Kalit provayderini almashtiradi.
    await test('Qayta ochilganda ilova qulflangan: kalit xotirada yo\'q, ma\'lumot o\'qilmaydi', async () => {
      await vault(); const t = await db.add('tasks', { title: 'M' }); assert(sec.isUnlocked());
      const re = await import('../js/security.js?reopen=1'); assert(!re.isUnlocked());
      eq(await errName(db.get('tasks', t.id)), 'LockedError'); eq(await re.unlock(PIN), 'unlocked'); eq((await db.get('tasks', t.id)).title, 'M');
      re.lock(); sec.registerKeyProvider(); // keyingi testlar uchun asl nusxaga qaytariladi
    });
    // ---- Ulanish hodisalari: parallel oynalar, bloklangan baza, kutilmagan yopilish, qayta ulanish ----
    const rawOpen = (nm, v, up) => new Promise((res, rej) => { const r = indexedDB.open(nm, v); if (up) r.onupgradeneeded = up; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const withSchema = (extra) => (e) => migrate(e.target.result, e.target.transaction, e.oldVersion, e.newVersion, extra ? [...MIGRATIONS, { version: extra, up: () => {} }] : MIGRATIONS);
    const collect = () => { const ev = []; const off = db.onConnectionEvent((e) => ev.push(e.type)); return { ev, off }; };
    const isClosed = (d) => { try { d.transaction('tasks'); return false; } catch (e) { return e.name === 'InvalidStateError'; } };
    const TIMEOUT = Symbol('timeout'); const settled = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(TIMEOUT), ms))]);
    const putOnce = async (rec) => { const d = await db.open(); return new Promise((res, rej) => { const t = d.transaction('tasks', 'readwrite'); t.objectStore('tasks').put(rec); t.oncomplete = res; t.onabort = () => rej(t.error || new Error('Tranzaksiya bekor qilindi')); t.onerror = () => rej(t.error); }); };
    const keysOf = (d) => req(d.transaction('tasks').objectStore('tasks').getAllKeys());

    await test('Parallel oyna yangilasa: eski ulanish yopiladi, "stale" hodisa keladi, yangi oyna bloklanmaydi, ma\'lumot saqlanadi, qayta ochish aniq xato beradi va keshda qolmaydi', async () => {
      const nm = fresh(); const d = await db.open(); await rawPut('tasks', { id: 'saqlanadi', title: 'x', updatedAt: 1 }); const { ev, off } = collect();
      const other = await rawOpen(nm, DB_VERSION + 1, withSchema(DB_VERSION + 1)); // "yangi versiya oynasi": bloklanmasdan ochiladi
      eq(other.version, DB_VERSION + 1); eq(ev, ['stale']); assert(isClosed(d), 'eski ulanish yopilmadi'); eq(await keysOf(other), ['saqlanadi']); other.close(); off();
      const p1 = db.open(), e1 = await errName(p1), p2 = db.open(), e2 = await errName(p2); eq([e1, e2], ['VersionError', 'VersionError']); assert(p1 !== p2, 'rad etilgan va\'da keshda qolgan');
    });
    await test('Boshqa oyna bazani o\'chirsa: "stale", keyin open() qayta ulanadi (yangi ulanish, hamma store)', async () => {
      const nm = fresh(); const d = await db.open(); const { ev, off } = collect();
      await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(nm); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('o\'chirish bloklandi')); });
      eq(ev, ['stale']); assert(isClosed(d)); const d2 = await db.open(); assert(d2 !== d, 'yangi ulanish ochilmadi'); eq([...d2.objectStoreNames].length, STORE_NAMES.length); off();
    });
    await test('Bloklangan baza: "blocked" hodisa, so\'rov rad etilmaydi va boshqa oyna yopilgach o\'zi davom etadi ("unblocked"), keyingi open() shu ulanishni beradi', async () => {
      const nm = fresh(); const holder = await rawOpen(nm, DB_VERSION, withSchema()); // versionchange'ga javob bermaydigan eski oyna
      const { ev, off } = collect(); const mig3 = [...MIGRATIONS, { version: DB_VERSION + 1, up: () => {} }];
      const p = db.open(nm, DB_VERSION + 1, mig3); p.catch(() => {});
      assert((await settled(p, 700)) === TIMEOUT, 'bloklanganda so\'rov yakunlanib qoldi (rad etildi yoki ochildi)'); eq(ev, ['blocked']);
      holder.close(); const d = await p; eq(d.version, DB_VERSION + 1); eq(ev, ['blocked', 'unblocked']); assert((await db.open(nm, DB_VERSION + 1, mig3)) === d, 'kesh ishlamadi'); off();
    });
    await test('Ochish xatosi keshda qolmaydi: sabab bartaraf etilgach qayta urinish ishlaydi', async () => {
      const nm = fresh(); (await rawOpen(nm, DB_VERSION + 1, withSchema(DB_VERSION + 1))).close();
      eq(await errName(db.open()), 'VersionError'); await db.deleteDatabase(nm); const d = await db.open(); eq(d.version, DB_VERSION);
    });
    await test('Kutilmagan yopilish (onclose): "closed" hodisa, ulanish yopiladi, keyingi open() qayta ulanadi va ma\'lumot o\'qiladi', async () => {
      fresh(); const d = await db.open(); await rawPut('tasks', { id: 'a', title: 'y', updatedAt: 1 }); const { ev, off } = collect();
      d.dispatchEvent(new Event('close')); // brauzer ulanishni majburan yopganini taqlid qiladi (haqiqiy yopilish e2e da sinaladi)
      eq(ev, ['closed']); assert(isClosed(d)); const d2 = await db.open(); assert(d2 !== d); eq((await rawGetAll('tasks')).map((r) => r.title), ['y']); off();
    });
    await test('Hodisa takrorlanmaydi: yangilash va yopilish ketma-ket kelsa ham tinglovchi bir marta xabar oladi', async () => {
      const nm = fresh(); const d = await db.open(); const { ev, off } = collect(); const o = await rawOpen(nm, DB_VERSION + 1, withSchema(DB_VERSION + 1)); d.dispatchEvent(new Event('close')); o.close(); eq(ev, ['stale']); off();
    });
    await test('Tinglovchilar: xato qilgan tinglovchi boshqalarga va bazaga xalaqit bermaydi; o\'chirilgani chaqirilmaydi; joriy bo\'lmagan baza hodisa bermaydi (lekin yopiladi)', async () => {
      const nm = fresh(); await db.open(); const seen = [];
      const offBad = db.onConnectionEvent(() => { throw new Error('tinglovchi xatosi'); }), offA = db.onConnectionEvent((e) => seen.push(`A:${e.type}`)), offB = db.onConnectionEvent((e) => seen.push(`B:${e.type}`)); offB();
      (await rawOpen(nm, DB_VERSION + 1, withSchema(DB_VERSION + 1))).close(); eq(seen, ['A:stale']);
      const other = `${nm}-boshqa`; names.push(other); const od = await db.open(other, DB_VERSION); (await rawOpen(other, DB_VERSION + 1, withSchema(DB_VERSION + 1))).close();
      eq(seen, ['A:stale']); assert(isClosed(od), 'ulanish baribir yopilishi kerak (yangilanishni to\'smaslik uchun)'); offBad(); offA();
    });
    await test('Yozish paytida boshqa oyna yangilasa: so\'rovlar osilib qolmaydi (muvaffaqiyat yoki aniq xato), muvaffaqiyatlilari saqlanadi', async () => {
      const nm = fresh(); await db.open(); const writes = Array.from({ length: 30 }, (_, i) => putOnce({ id: `w${i}`, title: String(i), updatedAt: 1 }).then(() => 'ok', (e) => e.name));
      const other = await rawOpen(nm, DB_VERSION + 1, withSchema(DB_VERSION + 1)); const res = await settled(Promise.all(writes), 5000); assert(res !== TIMEOUT, 'yozish so\'rovlari osilib qoldi');
      assert(res.every((r) => r === 'ok' || ['InvalidStateError', 'AbortError', 'VersionError'].includes(r)), `kutilmagan xato: ${res.filter((r) => r !== 'ok')}`);
      eq((await keysOf(other)).length, res.filter((r) => r === 'ok').length); other.close();
    });
  } finally { sec.lock(); for (const nm of names) await db.deleteDatabase(nm); }
}
