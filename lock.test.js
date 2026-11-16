// Lock yadrosi testlari (Telegram uslubi: avtoqulf yo'q). runPure(): Node va brauzerda. runBrowser(): haqiqiy IndexedDB + Web Crypto + vault (alohida test bazalarida).
import { test, assert, eq, rejects } from './harness.js';
import * as L from '../js/lock.js';
import * as sec from '../js/security.js';
import * as db from '../js/database.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const MIN = 60000;

export async function runPure() {
  await test('Kutish jadvali bosqichma-bosqich oshadi', () => {
    eq([0, 1, 2, 3, 4, 5, 6, 7, 20].map(L.delayForFails), [0, 0, 0, 10000, 30000, 60000, 300000, 900000, 900000]);
  });
  await test('Throttle: 1-2 urinishda kutish yo\'q, 3-dan keyin 10 s, vaqt o\'tishi bilan kamayadi va tugaydi', () => {
    let t = 1000; const th = L.createThrottle({ storage: mem(), now: () => t });
    th.fail(); th.fail(); eq(th.remaining(), 0); th.fail(); eq(th.remaining(), 10000);
    t += 4000; eq(th.remaining(), 6000); t += 6000; eq(th.remaining(), 0);
    th.fail(); eq(th.remaining(), 30000); t += 30000; th.fail(); eq(th.remaining(), 60000);
  });
  await test('Throttle holati "sahifa yangilanishi" (yangi nusxa, bir xil storage) dan keyin saqlanadi; reset tiklaydi', () => {
    let t = 0; const st = mem(); const a = L.createThrottle({ storage: st, now: () => t });
    a.fail(); a.fail(); a.fail(); const b = L.createThrottle({ storage: st, now: () => t });
    eq(b.remaining(), 10000); eq(b.state().fails, 3); b.reset(); eq(L.createThrottle({ storage: st, now: () => t }).remaining(), 0);
  });
  await test('Throttle: soat orqaga surilsa kutish qisqarmaydi, keyingi bosqich chegarasidan oshmaydi; oldinga surilsa tugaydi (hujjatlashtirilgan chetlab o\'tish)', () => {
    let t = 100000; const th = L.createThrottle({ storage: mem(), now: () => t }); th.fail(); th.fail(); th.fail();
    t -= 5 * MIN; eq(th.remaining(), 10000); t += 5 * MIN + 11000; eq(th.remaining(), 0);
  });
  await test('Throttle: buzilgan storage qiymati xavfsiz o\'qiladi (xato bermaydi)', () => {
    const st = mem(); st.setItem('si:throttle', '{buzuq'); eq(L.createThrottle({ storage: st }).remaining(), 0);
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    const th = L.createThrottle({ storage: bad, now: () => 0 }); th.fail(); th.fail(); th.fail(); eq(th.remaining(), 10000); th.reset();
  });
  await test('Epoch: monoton oshadi va bir xil storage orqali ko\'rinadi', () => {
    const st = mem(), a = L.createEpoch({ storage: st }), b = L.createEpoch({ storage: st });
    eq(b.read(), 0); a.bump(); a.bump(); eq(b.read(), 2); eq(b.bump(), 3); eq(a.read(), 3);
  });
  await test('Avtomatik qulf API si olib tashlangan (faqat qo\'lda va tablararo qulf)', () => {
    for (const k of ['setAutoLock', 'getAutoLock', 'AUTOLOCK_OPTIONS', 'DEFAULT_AUTOLOCK', 'createAutoLock', 'shouldAutoLock']) assert(!(k in L), k);
    const m = L.createLockManager({ win: null, doc: null, channel: false });
    for (const k of ['setAutoLock', 'getAutoLock', 'touch', 'handlePageHide']) assert(!(k in m), k);
  });
  await test('Statik tekshiruv: hisob ma\'lumoti qabul qiluvchi har bir sec.* chaqiruvi kutish (via/guarded) ichida', async () => {
    if (typeof process === 'undefined') return; // faqat Node: manba fayl o'qiladi
    const src = (await import('node:fs')).readFileSync(new URL('../js/lock.js', import.meta.url), 'utf8').split('\n');
    const cred = /sec\.(unlock|unlockWithRecovery|resetPinWithRecovery|confirmRecovery|confirmRecoveryRotation|startRecoveryRotation|changePin|createVault)\(/;
    const hits = src.filter((l) => cred.test(l) && !l.trim().startsWith('//'));
    assert(hits.length === 8, `kutilgan 8 ta chaqiruv, topildi ${hits.length}`);
    // Faqat createVault kutishsiz (u hech qanday sirni tekshirmaydi); qolgan 7 tasi kutish (via) ichida bo'lishi shart.
    const unguarded = hits.filter((l) => !l.includes('via(()'));
    assert(unguarded.length === 1 && unguarded[0].includes('sec.createVault('), `kutishsiz chaqiruvlar: ${unguarded.map((l) => l.trim().slice(0, 70)).join(' | ')}`);
    assert(hits.filter((l) => l.includes('sec.changePin(') && l.includes('via(()')).length === 1, 'changePin kutish ichida emas');
  });
}

// ---------- Haqiqiy IndexedDB + Web Crypto ----------
const base = `test-lock-${Date.now()}`; let n = 0; const names = [];
const PIN = '482915';
const errName = async (p) => { try { await p; } catch (e) { return e.name; } return 'OK'; };
const blocked = async () => { for (const f of [() => db.getAll('tasks'), () => db.add('tasks', {}), () => db.getSetting('a')]) eq(await errName(f()), 'LockedError'); };

export async function runBrowser() {
  let T = 5_000_000; const now = () => T;
  const mk = (o = {}) => L.createLockManager({ now, throttle: L.createThrottle({ storage: mem(), now }), epoch: L.createEpoch({ storage: mem() }), win: null, doc: null, channel: false, ...o });
  const setup = async (m = mk()) => {
    sec.lock(); const nm = `${base}-${n++}`; names.push(nm); db.useDatabase(nm);
    const { recoveryKey } = await sec.createVault(PIN); await sec.confirmRecovery(recoveryKey); sec.lock();
    await m.unlock(PIN); return { m, recoveryKey };
  };
  const vis = (s) => ({ visibilityState: s });
  try {
    await test('Qo\'lda qulflash: isLocked, DB amallari rad etiladi, UI signali; PIN bilan ochilgach DB ishlaydi', async () => {
      const { m } = await setup(); const sig = []; m.onLockChange((s) => sig.push(s));
      assert(!m.isLocked() && m.canAccessPersonalPages()); const t = await db.add('tasks', { title: 'M' });
      m.lock(); assert(m.isLocked() && !m.canAccessPersonalPages()); eq(sig.map((s) => [s.locked, s.reason]), [[true, 'manual']]); await blocked();
      eq(await errName(db.get('tasks', t.id)), 'LockedError');
      eq(await m.unlock(PIN), 'unlocked'); assert(!m.isLocked()); eq(sig.map((s) => [s.locked, s.reason]).at(-1), [false, 'unlock']);
      eq((await db.get('tasks', t.id)).title, 'M'); eq((await m.getState()).status, 'ready');
    });
    await test('Qulflangan holatda getState: locked=true, status ready', async () => { const { m } = await setup(); m.lock(); const s = await m.getState(); eq([s.locked, s.status], [true, 'ready']); });
    await test('Qayta yuklash/yangi nusxa: yangi menejer qulflangan boshlanadi (xotira bo\'sh), holat bazadan', async () => {
      const { m } = await setup(); m.lock(); const m2 = mk(); assert(m2.isLocked()); eq((await m2.getState()).status, 'ready'); await blocked();
    });
    await test('Noto\'g\'ri PIN: 3 urinishgacha kutish yo\'q, 3-dan keyin 10 s, to\'g\'ri PIN ham rad etiladi; vaqt o\'tgach ochiladi; hisoblagich tiklanadi', async () => {
      const { m } = await setup(); m.lock();
      for (let i = 0; i < 3; i++) eq(await errName(m.unlock('000000')), 'WrongCredentialError');
      eq(m.throttleRemaining(), 10000); let e; try { await m.unlock(PIN); } catch (x) { e = x; }
      eq(e.name, 'ThrottledError'); eq(e.remainingMs, 10000); assert(m.isLocked()); T += 10000;
      eq(await m.unlock(PIN), 'unlocked'); eq(m.throttleRemaining(), 0); eq(m.throttleState().fails || 0, 0); m.lock();
      eq(await errName(m.unlock('111111')), 'WrongCredentialError'); eq(m.throttleState().fails, 1); // hisoblagich noldan boshlandi
    });
    await test('Kutish bosqichlari 10s -> 30s -> 60s va kutish paytidagi urinishlar hisoblanmaydi', async () => {
      const { m } = await setup(); m.lock(); for (let i = 0; i < 3; i++) await errName(m.unlock('000000'));
      eq(await errName(m.unlock('000000')), 'ThrottledError'); eq(m.throttleState().fails, 3);
      T += 10000; await errName(m.unlock('000000')); eq(m.throttleRemaining(), 30000); T += 30000; await errName(m.unlock('000000')); eq(m.throttleRemaining(), 60000);
    });
    await test('Kutish muddati "sahifa yangilanishi"dan keyin saqlanadi (yangi menejer, bir xil storage)', async () => {
      const st = mem(), mkT = () => L.createThrottle({ storage: st, now }); const { m } = await setup(mk({ throttle: mkT() })); m.lock();
      for (let i = 0; i < 3; i++) await errName(m.unlock('000000'));
      const m2 = mk({ throttle: mkT() }); let e; try { await m2.unlock(PIN); } catch (x) { e = x; } eq(e.name, 'ThrottledError'); assert(e.remainingMs > 0);
    });
    await test('Tiklash kaliti bilan ochish ham kutishga bo\'ysunadi; format xatosi urinish hisoblanmaydi', async () => {
      const { m, recoveryKey } = await setup(); m.lock();
      await errName(m.unlockWithRecovery('XXXX')); eq(m.throttleState().fails || 0, 0);
      const bad = '7777-7777-7777-7777-7777-7777-7777-7777-7777-7777-7777-7777-7777-7777'; await errName(m.unlockWithRecovery(bad)); // format/nazorat xatosi bo'lishi mumkin
      for (let i = 0; i < 3; i++) await errName(m.unlockWithRecovery(await (await import('../js/crypto.js')).formatRecoveryKey(new Uint8Array(32).fill(i + 1))));
      eq(await errName(m.unlockWithRecovery(recoveryKey)), 'ThrottledError'); T += 10000; eq(await m.unlockWithRecovery(recoveryKey), 'unlocked'); assert(!m.isLocked());
    });
    await test('Recovery-pending: PIN to\'g\'ri bo\'lsa ham DB yopiq qoladi, qulflangan hisoblanadi, hisoblagich tiklanadi', async () => {
      sec.lock(); const nm = `${base}-${n++}`; names.push(nm); db.useDatabase(nm); const m = mk();
      const { recoveryKey } = await sec.createVault(PIN); await errName(m.unlock('000000')); eq(m.throttleState().fails, 1);
      eq(await m.unlock(PIN), 'recovery-pending'); assert(m.isLocked()); await blocked(); eq((await m.getState()).status, 'pending-recovery'); eq(m.throttleState().fails || 0, 0);
      await m.unlockWithRecovery(recoveryKey); assert(!m.isLocked()); await db.add('tasks', { ok: 1 });
    });
    await test('Yangi PIN o\'rnatish (resetPin) ochadi va hisoblagichni tiklaydi; eski PIN ishlamaydi', async () => {
      const { m, recoveryKey } = await setup(); m.lock(); await errName(m.unlock('000000'));
      eq(await m.resetPin(recoveryKey, '7788'), 'unlocked'); assert(!m.isLocked()); eq(m.throttleState().fails || 0, 0); m.lock();
      eq(await errName(m.unlock(PIN)), 'WrongCredentialError'); eq(await m.unlock('7788'), 'unlocked');
    });
    await test('Tablararo xabar: faqat {t:"lock"}, PIN/DEK/kalit yo\'q; boshqa menejer epoch orqali ham qulflanadi (xabar o\'tkazib yuborilsa)', async () => {
      if (typeof BroadcastChannel === 'undefined') return;
      const { m } = await setup(); const seen = []; const spy = new BroadcastChannel('si-lock-spy'); spy.close();
      const A = mk({ channel: BroadcastChannel, channelName: 'si-lock-t' }); A.start(); const rec = new BroadcastChannel('si-lock-t'); rec.onmessage = (e) => seen.push(e.data);
      try {
        sec.lock(); await A.unlock(PIN); A.lock(); await new Promise((r) => setTimeout(r, 120));
        eq(seen, [{ t: 'lock' }]); assert(!JSON.stringify(seen).includes(PIN)); assert(A.isLocked());
      } finally { A.stop(); rec.close(); }
      // epoch catch-up: ikkinchi "tab" xabarni olmadi (channel yo'q), lekin umumiy epoch oshdi
      const ep = L.createEpoch({ storage: mem() }); const t1 = mk({ epoch: ep }), t2 = mk({ epoch: ep });
      sec.lock(); await t1.unlock(PIN); await t2.unlock(PIN); t1.lock(); sec.lock(); await sec.unlock(PIN); // t2 sessiyasi hali ochiq, t1 qulflagan edi
      const sig = []; t2.onLockChange((s) => sig.push(s.reason)); eq(t2.handleVisibilityChange(vis('visible')), true); assert(t2.isLocked()); eq(sig, ['remote']);
    });
    await test('Qulflangandan keyin ham vault holati tekshiriladi: boshqa menejer "recovery-pending" ni ko\'radi (yangi tab holatini qayta tekshirish)', async () => {
      sec.lock(); const nm = `${base}-${n++}`; names.push(nm); db.useDatabase(nm); const a = mk(), b = mk();
      eq((await a.getState()).status, 'none'); await sec.createVault(PIN); eq((await b.getState()).status, 'pending-recovery');
    });
    await test('Avtomatik qulf YO\'Q: fonga o\'tish, 24 soat o\'tishi, pagehide/pageshow, freeze/resume va faolsizlik qulflamaydi (haqiqiy window/document hodisalari)', async () => {
      await setup(); const w = mk({ win: window, doc: document }); w.start(); const sig = []; w.onLockChange((s) => sig.push(s.reason));
      try {
        sec.lock(); await w.unlock(PIN); const DAY = 24 * 60 * MIN;
        eq(w.handleVisibilityChange(), false); T += DAY; eq(w.tick(), false);
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); T += DAY; window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        window.dispatchEvent(new Event('freeze')); T += DAY; window.dispatchEvent(new Event('resume')); document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        try { document.dispatchEvent(new Event('visibilitychange')); T += DAY; assert(!w.isLocked(), 'fonga o\'tganda qulfladi'); } finally { delete document.visibilityState; }
        document.dispatchEvent(new Event('visibilitychange'));
        assert(!w.isLocked(), 'avtomatik qulfladi'); await db.add('tasks', { ok: 1 }); eq(sig, ['unlock']);
      } finally { w.stop(); }
    });
    await test('Sessiya faqat yangi nusxada (yopib qayta ochish) qulflangan: DEK xotirada yo\'q; qo\'lda qulflash hamon ishlaydi', async () => {
      const { m } = await setup(); assert(!m.isLocked()); m.lock(); assert(m.isLocked()); await blocked(); const g = await m.getState(); eq(Object.keys(g).sort(), ['locked', 'status', 'throttleRemainingMs']);
    });
    // ---- confirmRecovery / startRecoveryRotation / confirmRecoveryRotation ----
    const pend = async (m = mk()) => { sec.lock(); const nm = `${base}-${n++}`; names.push(nm); db.useDatabase(nm); const { recoveryKey } = await sec.createVault(PIN); return { m, recoveryKey }; };
    const rawVault = () => new Promise((res) => { db.open().then((d) => { const r = d.transaction('settings').objectStore('settings').get('security'); r.onsuccess = () => res(JSON.stringify(r.result)); }); });
    const fmtKey = async (b) => (await import('../js/crypto.js')).formatRecoveryKey(new Uint8Array(32).fill(b));
    await test('confirmRecovery: tasdiqlanmagan vault ochiladi, sessiya faollashadi (signal), CRUD ishlaydi, holat ready', async () => {
      const { m, recoveryKey } = await pend(); const sig = []; m.onLockChange((s) => sig.push(`${s.locked}:${s.reason}`));
      assert(m.isLocked()); await blocked(); eq(await m.confirmRecovery(recoveryKey), 'unlocked');
      assert(!m.isLocked()); eq((await m.getState()).status, 'ready'); eq(sig, ['false:unlock']); await db.add('tasks', { ok: 1 }); eq(m.throttleRemaining(), 0);
    });
    await test('confirmRecovery sessiyani faollashtiradi: tablararo qulf davri qayd etiladi (keyingi qulf shu tabni qulflaydi)', async () => {
      const ep = L.createEpoch({ storage: mem() }), a = mk({ epoch: ep }), b = mk({ epoch: ep }); const { recoveryKey } = await pend(a);
      await a.confirmRecovery(recoveryKey); b.lock(); sec.lock(); await sec.unlock(PIN); // b boshqa "tab": epoch oshdi; a ning sessiyasi hali ochiq
      eq(a.handleVisibilityChange(vis('visible')), true); assert(a.isLocked());
    });
    await test('confirmRecovery: noto\'g\'ri kalit hisoblanadi, DB yopiq qoladi, holat pending; kutish paytida to\'g\'ri kalit ham rad etiladi; vaqt o\'tgach ochiladi', async () => {
      const { m, recoveryKey } = await pend(); const before = await rawVault();
      for (let i = 1; i <= 3; i++) eq(await errName(m.confirmRecovery(await fmtKey(i))), 'WrongCredentialError');
      eq(m.throttleRemaining(), 10000); assert(m.isLocked()); await blocked(); eq((await m.getState()).status, 'pending-recovery'); eq(await rawVault(), before, 'vault o\'zgardi');
      eq(await errName(m.confirmRecovery(recoveryKey)), 'ThrottledError'); assert(m.isLocked()); T += 10000; eq(await m.confirmRecovery(recoveryKey), 'unlocked');
    });
    await test('confirmRecovery: format/nazorat xatosi urinish sifatida hisoblanmaydi', async () => {
      const { m, recoveryKey } = await pend(); for (const bad of ['', 'XXXX', recoveryKey.slice(0, -1), recoveryKey.slice(0, -4) + (recoveryKey.endsWith('AAAA') ? 'BBBB' : 'AAAA')]) eq(await errName(m.confirmRecovery(bad)), 'RecoveryFormatError');
      eq(m.throttleState().fails || 0, 0); assert(m.isLocked());
    });
    await test('Tasdiqlanmagan vaultda majburiy yangi kalit: PIN -> startRecoveryRotation -> confirmRecoveryRotation ochadi; eski kalit bekor; ma\'lumot saqlanadi', async () => {
      const { m, recoveryKey: k1 } = await pend(); const sig = []; m.onLockChange((s) => sig.push(`${s.locked}:${s.reason}`));
      eq(await m.unlock(PIN), 'recovery-pending'); assert(m.isLocked()); await blocked();
      const { recoveryKey: k2 } = await m.startRecoveryRotation(PIN); assert(k2 !== k1); assert(m.isLocked()); await blocked();
      eq(await errName(m.confirmRecoveryRotation(k1)), 'WrongCredentialError'); assert(m.isLocked()); await blocked(); eq((await m.getState()).status, 'pending-recovery');
      eq(await m.confirmRecoveryRotation(k2), 'unlocked'); assert(!m.isLocked()); eq((await m.getState()).status, 'ready'); eq(sig, ['false:unlock']);
      const t = await db.add('tasks', { title: 'M' }); m.lock(); eq(await errName(m.unlockWithRecovery(k1)), 'WrongCredentialError');
      eq(await m.unlockWithRecovery(k2), 'unlocked'); eq((await db.get('tasks', t.id)).title, 'M');
    });
    await test('confirmRecoveryRotation: vault avval tasdiqlangan va qulflangan bo\'lsa sessiya OCHILMAYDI (kalit almashadi), natija "locked"', async () => {
      const { m } = await setup(); m.lock(); const { recoveryKey: nk } = await m.startRecoveryRotation(PIN);
      eq(await m.confirmRecoveryRotation(nk), 'locked'); assert(m.isLocked()); await blocked(); eq((await m.getState()).status, 'ready');
      eq(await m.unlockWithRecovery(nk), 'unlocked');
    });
    await test('startRecoveryRotation: noto\'g\'ri PIN hisoblanadi va kutishga bo\'ysunadi (PIN oracle yo\'q); vault o\'zgarmaydi', async () => {
      const { m } = await pend(); const before = await rawVault();
      for (let i = 0; i < 3; i++) eq(await errName(m.startRecoveryRotation('000000')), 'WrongCredentialError');
      eq(m.throttleRemaining(), 10000); eq(await errName(m.startRecoveryRotation(PIN)), 'ThrottledError'); eq(await rawVault(), before);
      T += 10000; const r = await m.startRecoveryRotation(PIN); assert(r.recoveryKey && m.throttleRemaining() === 0);
    });
    await test('Kutish paytida hamma hisob ma\'lumoti metodlari rad etiladi va vaultga tegmaydi (parametrlangan)', async () => {
      const { m, recoveryKey } = await pend(); for (let i = 0; i < 3; i++) await errName(m.unlock('000000')); const before = await rawVault(); assert(m.throttleRemaining() > 0);
      const calls = { unlock: () => m.unlock(PIN), unlockWithRecovery: () => m.unlockWithRecovery(recoveryKey), resetPin: () => m.resetPin(recoveryKey, '7788'),
        confirmRecovery: () => m.confirmRecovery(recoveryKey), startRecoveryRotation: () => m.startRecoveryRotation(PIN), confirmRecoveryRotation: () => m.confirmRecoveryRotation(recoveryKey) };
      for (const [k, f] of Object.entries(calls)) eq(await errName(f()), 'ThrottledError', k);
      eq(await rawVault(), before); assert(m.isLocked()); await blocked();
    });
    await test('Xavfsiz holat: tiklash oqimidagi xatolardan keyin ham DB yopiq va vault buzilmagan', async () => {
      const { m, recoveryKey } = await pend(); const before = await rawVault();
      await errName(m.confirmRecoveryRotation(recoveryKey)); // yangilash boshlanmagan
      await errName(m.resetPin('xato', '7788')); await errName(m.resetPin(recoveryKey, '12')); // format va PIN xatosi
      assert(m.isLocked()); await blocked(); eq(await rawVault(), before); eq((await m.getState()).status, 'pending-recovery');
    });
    await test('Saqlash joylari: localStorage/sessionStorage da PIN, tiklash kaliti, DEK yo\'q; faqat kutish va qulf davri raqamlari', async () => {
      const keys = ['si:throttle', 'si:lock-epoch']; keys.forEach((k) => localStorage.removeItem(k));
      const m = mk({ throttle: L.createThrottle({ now }), epoch: L.createEpoch() });
      try {
        const { recoveryKey: k1 } = await pend(m); await m.unlock('000000').catch(() => {}); await m.confirmRecovery(k1); m.lock();
        await m.unlock('000000').catch(() => {}); const { recoveryKey: k2 } = await (async () => { await m.unlock(PIN); return m.startRecoveryRotation(PIN); })(); await m.confirmRecoveryRotation(k2); m.lock();
        const dump = JSON.stringify([...Array(localStorage.length)].map((_, i) => [localStorage.key(i), localStorage.getItem(localStorage.key(i))]).concat(Object.entries(sessionStorage)));
        for (const secret of [PIN, '000000', k1, k2, k1.replace(/-/g, ''), k2.replace(/-/g, '')]) assert(!dump.includes(secret), 'sir saqlangan');
        const stored = [...Array(localStorage.length)].map((_, i) => localStorage.key(i)).filter((k) => k.startsWith('si:')).sort();
        assert(stored.every((k) => keys.includes(k)), `kutilmagan kalit: ${stored}`);
      } finally { keys.forEach((k) => localStorage.removeItem(k)); }
    });
    // ---- changePin / createVault (lock menejeri orqali) ----
    const freshDb = () => { sec.lock(); const nm = `${base}-${n++}`; names.push(nm); db.useDatabase(nm); };
    const rawAllStores = async () => { const d = await db.open(); const out = []; for (const s of [...d.objectStoreNames]) out.push(...await new Promise((res) => { const r = d.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); })); return JSON.stringify(out); };
    await test('changePin: yangi PIN ochadi, eski ochmaydi; ma\'lumot, ochiq sessiya va tiklash kaliti (o\'ram baytlari) o\'zgarmaydi', async () => {
      const { m, recoveryKey } = await setup(); const t = await db.add('tasks', { title: 'M' }); const before = JSON.parse(await rawVault()).value;
      await m.changePin(PIN, '7788'); assert(!m.isLocked()); eq((await db.get('tasks', t.id)).title, 'M');
      const after = JSON.parse(await rawVault()).value;
      const J = JSON.stringify; // rawVault() JSON; Uint8Array lar obyektga aylanadi, shuning uchun JSON satrlari solishtiriladi
      assert(J(after.pin.salt) !== J(before.pin.salt) && J(after.pin.ct) !== J(before.pin.ct) && J(after.pin.iv) !== J(before.pin.iv), 'PIN o\'rami almashmadi');
      eq(J(after.rec), J(before.rec), 'tiklash kaliti o\'rami o\'zgardi'); eq(after.recoveryConfirmed, true); eq(after.pin.iterations, 600000);
      m.lock(); eq(await errName(m.unlock(PIN)), 'WrongCredentialError'); eq(await m.unlock('7788'), 'unlocked'); eq((await db.get('tasks', t.id)).title, 'M');
      m.lock(); eq(await m.unlockWithRecovery(recoveryKey), 'unlocked');
    });
    await test('changePin: noto\'g\'ri eski PIN hisoblanadi, 3 tadan keyin to\'g\'ri PIN ham ThrottledError, vault baytma-bayt o\'zgarmaydi', async () => {
      const { m } = await setup(); m.lock(); const v0 = await rawVault();
      for (let i = 0; i < 3; i++) eq(await errName(m.changePin('000000', '7788')), 'WrongCredentialError');
      eq(m.throttleRemaining(), 10000); eq(await rawVault(), v0);
      let e; try { await m.changePin(PIN, '7788'); } catch (x) { e = x; } eq(e.name, 'ThrottledError'); eq(e.remainingMs, 10000); eq(await rawVault(), v0);
      eq(await errName(m.unlock(PIN)), 'ThrottledError'); // unlock bilan umumiy hisoblagich
      T += 10000; await m.changePin(PIN, '7788'); eq(m.throttleState().fails || 0, 0); eq(await m.unlock('7788'), 'unlocked');
    });
    await test('changePin: unlock/unlockWithRecovery bilan bitta umumiy hisoblagich', async () => {
      const { m } = await setup(); m.lock(); await errName(m.unlock('000000')); await errName(m.changePin('000000', '7788')); eq(m.throttleState().fails, 2);
      eq(await errName(m.unlockWithRecovery(await fmtKey(9))), 'WrongCredentialError'); eq(m.throttleRemaining(), 10000);
    });
    await test('changePin: yangi PIN/iteratsiya xatosi eski PIN tekshirilishidan oldin rad etiladi: hisoblanmaydi, to\'g\'ri/noto\'g\'ri eski PIN bir xil javob (oracle yo\'q), vault o\'zgarmaydi', async () => {
      const { m } = await setup(); const v0 = await rawVault();
      for (const bad of ['12', 'abc', '123456789', '']) {
        const names2 = new Set([await errName(m.changePin(PIN, bad)), await errName(m.changePin('000000', bad))]);
        eq(names2.size, 1, `eski PIN haqida ma'lumot sizdi (${bad})`); assert(!names2.has('WrongCredentialError') && !names2.has('OK'), `${bad}: ${[...names2]}`);
      }
      const lowIt = [await errName(m.changePin(PIN, '7788', { iterations: 1000 })), await errName(m.changePin('000000', '7788', { iterations: 1000 }))];
      eq(lowIt[0], lowIt[1]); assert(lowIt[0] !== 'OK' && lowIt[0] !== 'WrongCredentialError');
      eq(m.throttleState().fails || 0, 0); eq(await rawVault(), v0);
    });
    await test('changePin qulflangan sessiyani OCHMAYDI va "unlock" signali bermaydi', async () => {
      const { m } = await setup(); m.lock(); const sig = []; m.onLockChange((s) => sig.push(s.reason));
      await m.changePin(PIN, '7788'); assert(m.isLocked()); await blocked(); eq(sig, []);
    });
    await test('changePin tasdiqlanmagan vaultda: PIN almashadi, DB yopiq qoladi, keyin yangi PIN + tiklash kaliti bilan tasdiqlash ishlaydi', async () => {
      const { m, recoveryKey } = await pend(); await m.changePin(PIN, '7788'); assert(m.isLocked()); await blocked();
      eq(await errName(m.unlock(PIN)), 'WrongCredentialError'); eq(await m.unlock('7788'), 'recovery-pending'); await blocked();
      eq(await m.confirmRecovery(recoveryKey), 'unlocked'); await db.add('tasks', { ok: 1 });
    });
    await test('changePin dan keyin mavjud tiklash/rotation oqimlari ishlaydi', async () => {
      const { m } = await setup(); await m.changePin(PIN, '7788');
      const { recoveryKey: k2 } = await m.startRecoveryRotation('7788'); eq(await errName(m.startRecoveryRotation(PIN)), 'WrongCredentialError');
      eq(await m.confirmRecoveryRotation(k2), 'unlocked'); m.lock(); eq(await m.unlockWithRecovery(k2), 'unlocked');
      m.lock(); eq(await m.resetPin(k2, '5566'), 'unlocked'); m.lock(); eq(await m.unlock('5566'), 'unlocked');
    });
    await test('createVault (menejer): vaultni yaratadi, DB ochilmaydi, tiklash kaliti formati to\'g\'ri; PIN -> recovery-pending -> confirmRecovery oqimi ishlaydi', async () => {
      freshDb(); const m = mk(); const { recoveryKey } = await m.createVault(PIN);
      assert(/^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/.test(recoveryKey)); assert(m.isLocked()); await blocked(); eq((await m.getState()).status, 'pending-recovery');
      eq(await m.unlock(PIN), 'recovery-pending'); await blocked(); eq(await m.confirmRecovery(recoveryKey), 'unlocked'); await db.add('tasks', { ok: 1 });
    });
    await test('createVault: eski (qolib ketgan) kutish faqat MUVAFFAQIYATLI yaratilgach tiklanadi; noto\'g\'ri PIN bilan urinish uni tegmaydi', async () => {
      freshDb(); const th = L.createThrottle({ storage: mem(), now }); const m = mk({ throttle: th }); th.fail(); th.fail(); th.fail(); eq(m.throttleRemaining(), 10000);
      assert((await errName(m.createVault('12'))) !== 'OK'); eq(m.throttleRemaining(), 10000); eq(await sec.getStatus(), 'none');
      await m.createVault(PIN); eq(m.throttleRemaining(), 0); eq(m.throttleState().fails || 0, 0);
    });
    await test('createVault mavjud vaultda: VaultExistsError, kutish chetlab o\'tilmaydi (hisoblagich tegilmaydi), vault baytma-bayt o\'zgarmaydi', async () => {
      const { m } = await setup(); const th = L.createThrottle({ storage: mem(), now }); const m2 = mk({ throttle: th }); m2.lock(); th.fail(); th.fail(); th.fail();
      const v0 = await rawVault(); eq(await errName(m2.createVault('654321')), 'VaultExistsError'); eq(m2.throttleRemaining(), 10000); eq(await rawVault(), v0);
      eq(await errName(m2.unlock(PIN)), 'ThrottledError'); void m;
    });
    await test('createVault poygasi (ikki menejer): faqat bittasi yaratadi; yutqazganning kutishi tegilmaydi, g\'olibniki tiklanadi', async () => {
      freshDb(); const thA = L.createThrottle({ storage: mem(), now }), thB = L.createThrottle({ storage: mem(), now }); for (const th of [thA, thB]) { th.fail(); th.fail(); th.fail(); }
      const A = mk({ throttle: thA }), B = mk({ throttle: thB }); let reached = 0, release; const gate = new Promise((r) => { release = r; });
      const hook = async (a) => { if (a > 0) return; if (++reached === 2) release(); await gate; };
      const res = await Promise.allSettled([A.createVault('111111', { beforeCommit: hook }), B.createVault('222222', { beforeCommit: hook })]);
      eq(res.filter((r) => r.status === 'fulfilled').length, 1); const w = res.findIndex((r) => r.status === 'fulfilled'); eq(res[1 - w].reason.name, 'VaultExistsError');
      eq([A, B][w].throttleRemaining(), 0); eq([A, B][1 - w].throttleRemaining(), 10000); eq((await sec.getStatus()), 'pending-recovery');
      eq(await [A, B][w].unlock(w === 0 ? '111111' : '222222'), 'recovery-pending');
    });
    await test('changePin/createVault: yangi PIN, eski PIN, tiklash kalitlari localStorage/sessionStorage/IndexedDB da ochiq yo\'q', async () => {
      const keys = ['si:throttle', 'si:lock-epoch']; keys.forEach((k) => localStorage.removeItem(k)); freshDb(); const P1 = '913572', P2 = '864209';
      const m = mk({ throttle: L.createThrottle({ now }), epoch: L.createEpoch() });
      try {
        const { recoveryKey: k } = await m.createVault(P1); await m.unlock(P1); await m.confirmRecovery(k); await errName(m.changePin('000000', P2)); await m.changePin(P1, P2);
        const { recoveryKey: k2 } = await m.startRecoveryRotation(P2); await m.confirmRecoveryRotation(k2); m.lock();
        const dump = JSON.stringify([...Array(localStorage.length)].map((_, i) => [localStorage.key(i), localStorage.getItem(localStorage.key(i))]).concat(Object.entries(sessionStorage))) + await rawAllStores();
        for (const secret of [P1, P2, '000000', k, k2, k.replace(/-/g, ''), k2.replace(/-/g, '')]) assert(!dump.includes(secret), `sir saqlangan: ${secret.slice(0, 3)}...`);
      } finally { keys.forEach((k) => localStorage.removeItem(k)); }
    });
    await test('Standart eksportlar mavjud: confirmRecovery, startRecoveryRotation, confirmRecoveryRotation, changePin, createVault', () => { for (const k of ['confirmRecovery', 'startRecoveryRotation', 'confirmRecoveryRotation', 'changePin', 'createVault']) eq(typeof L[k], 'function', k); });
  } finally { sec.lock(); for (const nm of names) await db.deleteDatabase(nm); }
}
