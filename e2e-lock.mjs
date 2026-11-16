// Haqiqiy brauzerda lock yadrosi: ko'p tab, BroadcastChannel yo'q holat, kutish muddati, fon/qaytish, navigatsiya (BFCache), brauzerni qayta ochish.
// Ishga tushirish: HTTP server (python3 -m http.server 8123) va `PW=<playwright/index.mjs yo'li> node tests/e2e-lock.mjs`
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import(process.env.PW || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8123/tests/tab.html'; const PIN = '482915';
let pass = 0; const fails = [], notes = [];
const check = (name, cond, extra = '') => { if (cond) pass++; else fails.push(name); console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${cond ? '' : extra}`); };
const open = async (ctx, db) => { const p = await ctx.newPage(); await p.goto(`${BASE}?db=${db}`); await p.waitForFunction(() => window.__ready); return p; };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const until = async (p, f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(p, f)) return true; await p.waitForTimeout(25); } return false; };
const dbBlocked = async (p) => { const r = await ev(p, () => api.all()), a = await ev(p, () => api.add('x')); return !r.ok && r.error === 'LockedError' && !a.ok && a.error === 'LockedError'; };
async function newVault(ctx, db) { // PIN yaratadi, kalitni tasdiqlaydi, sahifalarni qulflangan holatda qoldiradi
  const p = await open(ctx, db); const cr = await ev(p, (x) => api.create(x), PIN); await ev(p, (k) => api.unlockRec(k), cr.value.recoveryKey); await ev(p, () => api.add('Saqlanadi')); await ev(p, () => api.lock());
  return { p, key: cr.value.recoveryKey };
}
const unlock = async (p) => (await ev(p, (x) => api.mUnlock(x), PIN)).value;

const browser = await chromium.launch();
try {
  { // 1. Ko'p tab: bir tabdan qulflash hammasini qulflaydi, yangi tab qulflangan
    const db = `lk-${Date.now()}`, ctx = await browser.newContext(); const { p: A } = await newVault(ctx, db); const B = await open(ctx, db);
    check('[ko\'p tab] ikkala tab alohida PIN bilan ochiladi', (await unlock(A)) === 'unlocked' && (await unlock(B)) === 'unlocked' && !(await ev(A, () => api.mIsLocked())) && !(await ev(B, () => api.mIsLocked())));
    check('[ko\'p tab] ochiq tabda DB ishlaydi', (await ev(B, () => api.all())).value.length === 1);
    const t0 = Date.now(); await ev(A, () => api.mLock());
    check('[ko\'p tab] A qulflasa B darhol qulflanadi', await until(B, () => api.mIsLocked(), 1500), `${Date.now() - t0}ms`);
    check('[ko\'p tab] B da DB amallari rad etiladi va UI signali keldi', await dbBlocked(B) && (await ev(B, () => api.signals())).includes('locked:remote'));
    const C = await open(ctx, db); check('[ko\'p tab] yangi tab qulflangan, vault holati ready', await ev(C, () => api.mIsLocked()) && (await ev(C, () => api.mState())).status === 'ready' && await dbBlocked(C));
    await unlock(C); await ev(C, () => api.mLock()); check('[ko\'p tab] C qulflasa A, B (qayta ochilgan bo\'lsa ham) qulflanadi', await until(A, () => api.mIsLocked(), 1500));
    await unlock(A); await unlock(B); await ev(A, () => api.mLock()); check('[ko\'p tab] A qulflasa B ham qulflanadi (ikkinchi marta)', await until(B, () => api.mIsLocked(), 1500));
    await A.reload(); await A.waitForFunction(() => window.__ready);
    check('[reload] sahifa yangilangach qulflangan, DB yopiq', await ev(A, () => api.mIsLocked()) && await dbBlocked(A));
    await ctx.close();
  }
  { // 2. BroadcastChannel yo'q: storage hodisasi/epoch orqali
    const db = `lk-nobc-${Date.now()}`, ctx = await browser.newContext(); await ctx.addInitScript(() => { delete window.BroadcastChannel; });
    const { p: A } = await newVault(ctx, db); const B = await open(ctx, db);
    check('[BC yo\'q] BroadcastChannel haqiqatan mavjud emas', !(await ev(A, () => api.hasBC())) && !(await ev(B, () => api.hasBC())));
    await unlock(A); await unlock(B); await ev(A, () => api.mLock());
    check('[BC yo\'q] A qulflasa B zaxira mexanizm (storage) orqali qulflanadi', await until(B, () => api.mIsLocked(), 2000) && await dbBlocked(B));
    await ctx.close();
  }
  { // 3. Noto'g'ri urinishlar: kutish, reload dan keyin saqlanishi, real vaqt o'tishi, tiklanish
    const db = `lk-thr-${Date.now()}`, ctx = await browser.newContext(); const { p: A } = await newVault(ctx, db);
    for (let i = 0; i < 3; i++) await ev(A, () => api.mUnlock('000000'));
    const w = await ev(A, () => api.mThrottle()); check('[kutish] 3 noto\'g\'ri urinishdan keyin ~10 s kutish', w > 8000 && w <= 10000, String(w));
    const r = await ev(A, (x) => api.mUnlock(x), PIN); check('[kutish] kutish paytida to\'g\'ri PIN ham rad etiladi', !r.ok && r.error === 'ThrottledError' && await ev(A, () => api.mIsLocked()));
    await A.reload(); await A.waitForFunction(() => window.__ready); const w2 = await ev(A, () => api.mThrottle());
    check('[kutish] sahifa yangilanganda kutish muddati saqlanadi', w2 > 0 && w2 <= w, String(w2));
    const B = await open(ctx, db); check('[kutish] yangi tab ham kutishni ko\'radi (umumiy holat)', (await ev(B, () => api.mThrottle())) > 0);
    await A.waitForTimeout(w2 + 300); const ok = await ev(A, (x) => api.mUnlock(x), PIN);
    check('[kutish] vaqt o\'tgach to\'g\'ri PIN ochadi va hisoblagich tiklanadi', ok.ok && ok.value === 'unlocked' && (await ev(A, () => api.mThrottle())) === 0 && (await ev(A, () => localStorage.getItem('si:throttle'))) === null);
    await ctx.close();
  }
  { // 4. Telegram uslubi: fonga o'tish, boshqa tabga o'tish, uzoq vaqt va navigatsiya avtomatik qulflamaydi
    const db = `lk-vis-${Date.now()}`, ctx = await browser.newContext(); const { p: A } = await newVault(ctx, db);
    await unlock(A); const B = await open(ctx, db); await B.bringToFront(); await A.waitForTimeout(400);
    const real = (await ev(A, () => api.vis())) === 'hidden'; notes.push(real ? 'Boshqa tabga o\'tilganda A haqiqatan hidden bo\'ldi.' : "Headless Chromium'da bringToFront A ni 'hidden' qilmadi: fon holati sun'iy visibilitychange bilan sinaldi.");
    await ev(A, () => api.fakeHidden()); await A.waitForTimeout(6000); await ev(A, () => api.fakeVisible()); await A.waitForTimeout(300);
    check('[fon] fonga o\'tib qaytish (6 s, tick o\'tib ketdi) qulflamaydi, DB ishlaydi', !(await ev(A, () => api.mIsLocked())) && (await ev(A, () => api.all())).ok);
    check('[fon] signal ro\'yxatida avtomatik qulf yo\'q', !(await ev(A, () => api.signals())).some((s) => s === 'locked:auto'));
    await ev(A, () => { window.__marker = 'tirik'; }); await A.goto('about:blank'); await A.goBack(); await A.waitForFunction(() => window.__ready);
    const restored = (await ev(A, () => window.__marker)) === 'tirik'; notes.push(`Orqaga navigatsiya: sahifa ${restored ? 'BFCache dan tiklandi' : 'qayta yuklandi (ochiq BroadcastChannel BFCache ga yo\'l qo\'ymaydi)'}.`);
    const lockedNow = await ev(A, () => api.mIsLocked());
    check('[sessiya] qayta yuklangan sahifa yangi sessiya: qulflangan; BFCache dan tiklansa ochiq qoladi', restored ? !lockedNow : lockedNow && await dbBlocked(A));
    await ctx.close();
  }
  { // 5. Brauzerni yopib qayta ochish; tasdiqlanmagan vault: majburiy yangi kalit oqimi (lock.js metodlari)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-lk-')), db = `lk-persist-${Date.now()}`;
    let ctx = await chromium.launchPersistentContext(dir); let { p } = await newVault(ctx, db); await unlock(p);
    await ev(p, () => api.mLock()); for (let i = 0; i < 3; i++) await ev(p, () => api.mUnlock('000000')); await ctx.close();
    ctx = await chromium.launchPersistentContext(dir); p = await open(ctx, db);
    check('[qayta ochish] brauzer yopilib ochilgach qulflangan, DB yopiq', await ev(p, () => api.mIsLocked()) && await dbBlocked(p));
    check('[qayta ochish] kutish muddati saqlangan', (await ev(p, () => api.mThrottle())) > 0);
    await p.waitForTimeout((await ev(p, () => api.mThrottle())) + 300); const ok = await ev(p, (x) => api.mUnlock(x), PIN);
    check('[qayta ochish] kutishdan keyin PIN ochadi, ma\'lumot saqlangan', ok.value === 'unlocked' && (await ev(p, () => api.all())).value[0].title === 'Saqlanadi');
    await ctx.close();
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'si-lk-')), db2 = `lk-pend-${Date.now()}`;
    ctx = await chromium.launchPersistentContext(dir2); p = await open(ctx, db2); const cr = await ev(p, (x) => api.create(x), PIN); await ctx.close();
    ctx = await chromium.launchPersistentContext(dir2); p = await open(ctx, db2); const q = await ev(p, (x) => api.mUnlock(x), PIN);
    check('[recovery-pending] qayta ochilgach PIN to\'g\'ri bo\'lsa ham DB yopiq, qulflangan hisoblanadi', q.value === 'recovery-pending' && await ev(p, () => api.mIsLocked()) && await dbBlocked(p) && (await ev(p, () => api.mState())).status === 'pending-recovery');
    const rot = await ev(p, (x) => api.mStartRot(x), PIN); check('[recovery-pending] startRecoveryRotation yangi kalit beradi, DB hali yopiq', rot.ok && rot.value.recoveryKey !== cr.value.recoveryKey && await dbBlocked(p));
    const bad = await ev(p, (k) => api.mConfirmRot(k), cr.value.recoveryKey); check('[recovery-pending] eski kalit bilan tasdiqlab bo\'lmaydi (kutish hisobi), DB yopiq', !bad.ok && bad.error === 'WrongCredentialError' && await dbBlocked(p));
    const good = await ev(p, (k) => api.mConfirmRot(k), rot.value.recoveryKey); check('[recovery-pending] yangi kalit tasdiqlaydi: sessiya ochiladi, CRUD ishlaydi, holat ready', good.ok && good.value === 'unlocked' && !(await ev(p, () => api.mIsLocked())) && (await ev(p, () => api.add('Yangi'))).ok && (await ev(p, () => api.mState())).status === 'ready');
    await p.reload(); await p.waitForFunction(() => window.__ready); check('[recovery-pending] tasdiqdan keyin sahifa yangilansa qulflangan, kalit bilan ochiladi', await ev(p, () => api.mIsLocked()) && (await ev(p, (k) => api.mConfirm(k), rot.value.recoveryKey)).value === 'unlocked');
    await ctx.close();
  }
  { // 6. changePin va createVault menejer orqali: tablar o'rtasida umumiy kutish, yaxlitlik, poyga
    const db = `lk-cp-${Date.now()}`, ctx = await browser.newContext(); const { p: A, key } = await newVault(ctx, db); const B = await open(ctx, db);
    for (let i = 0; i < 3; i++) await ev(A, () => api.mChangePin('000000', '7788'));
    const w = await ev(A, () => api.mThrottle()); check('[changePin] 3 noto\'g\'ri eski PIN: ~10 s kutish', w > 8000 && w <= 10000, String(w));
    const rb = await ev(B, (x) => api.mChangePin(x, '7788'), PIN); check('[changePin] boshqa tabda to\'g\'ri eski PIN ham rad etiladi (umumiy kutish)', !rb.ok && rb.error === 'ThrottledError', JSON.stringify(rb));
    const ub = await ev(B, (x) => api.mUnlock(x), PIN); check('[changePin] unlock ham xuddi shu kutishga bo\'ysunadi, DB yopiq', ub.error === 'ThrottledError' && await dbBlocked(B));
    await A.reload(); await A.waitForFunction(() => window.__ready); const w2 = await ev(A, () => api.mThrottle()); check('[changePin] sahifa yangilangach kutish saqlanadi', w2 > 0, String(w2));
    await A.waitForTimeout(w2 + 300); const ok = await ev(B, (x) => api.mChangePin(x, '7788'), PIN);
    check('[changePin] kutishdan keyin PIN almashadi va hisoblagich tiklanadi', ok.ok && (await ev(B, () => api.mThrottle())) === 0 && (await ev(B, () => api.throttleRaw())) === null);
    const C = await open(ctx, db); const oldTry = await ev(C, (x) => api.mUnlock(x), PIN);
    check('[changePin] yangi tabda eski PIN ochmaydi', !oldTry.ok && oldTry.error === 'WrongCredentialError');
    const newTry = await ev(C, () => api.mUnlock('7788')); check('[changePin] yangi PIN ochadi, ma\'lumot saqlangan', newTry.value === 'unlocked' && (await ev(C, () => api.all())).value[0].title === 'Saqlanadi');
    await ev(C, () => api.mLock()); const D = await open(ctx, db); check('[changePin] tiklash kaliti PIN almashgandan keyin ham ishlaydi', (await ev(D, (k) => api.mUnlockRec(k), key)).value === 'unlocked');
    await ctx.close();
    const db2 = `lk-cv-${Date.now()}`, ctx2 = await browser.newContext(); const A2 = await open(ctx2, db2), B2 = await open(ctx2, db2); await ev(A2, () => api.seedThrottle());
    check('[createVault] boshlang\'ich "qolib ketgan" kutish mavjud', (await ev(B2, () => api.mThrottle())) > 0);
    const [r1, r2] = await Promise.all([ev(A2, () => api.mCreate('111111', true)), ev(B2, () => api.mCreate('222222', true))]);
    check('[createVault] ikki tab menejer orqali bir vaqtda: faqat bittasi yaratadi', [r1, r2].filter((r) => r.ok).length === 1 && [r1, r2].find((r) => !r.ok).error === 'VaultExistsError', JSON.stringify([r1, r2]));
    check('[createVault] muvaffaqiyatli yaratilgach qolib ketgan kutish tiklandi, ikkala tabda DB yopiq, holat pending', (await ev(A2, () => api.throttleRaw())) === null && await dbBlocked(A2) && await dbBlocked(B2) && (await ev(A2, () => api.status())) === 'pending-recovery');
    await ev(A2, () => api.seedThrottle()); const again = await ev(B2, () => api.mCreate('333333', false));
    check('[createVault] mavjud vaultda: VaultExistsError va kutish chetlab o\'tilmaydi', again.error === 'VaultExistsError' && (await ev(B2, () => api.mThrottle())) > 0);
    const wp = [r1, r2].findIndex((r) => r.ok) === 0 ? '111111' : '222222'; const T3 = await open(ctx2, db2);
    check('[createVault] yangi tabda qayta qo\'yilgan kutish g\'olib PIN uchun ham amal qiladi (ThrottledError)', (await ev(T3, (x) => api.mUnlock(x), wp)).error === 'ThrottledError');
    await ctx2.close();
  }
} finally { await browser.close(); }
notes.forEach((n) => console.log('ESLATMA:', n)); console.log(`\n${pass} o'tdi, ${fails.length} muvaffaqiyatsiz`); process.exit(fails.length ? 1 : 0);
