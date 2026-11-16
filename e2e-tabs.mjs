// Haqiqiy brauzer testlari: parallel tablar, sahifa yangilanishi, brauzerni yopib qayta ochish.
// Ishga tushirish: HTTP server (python3 -m http.server 8123) va `PW=<playwright yo'li> node tests/e2e-tabs.mjs`
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import(process.env.PW || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8123/tests/tab.html';
let pass = 0; const fails = [];
const check = (name, cond, extra = '') => { if (cond) pass++; else fails.push(`${name} ${extra}`); console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${cond ? '' : extra}`); };
const open = async (ctx, db) => { const p = await ctx.newPage(); await p.goto(`${BASE}?db=${db}`); await p.waitForFunction(() => window.__ready); return p; };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const blocked = async (p) => { const r = await ev(p, () => api.all()); const a = await ev(p, () => api.add('x')); return !r.ok && r.error === 'LockedError' && !a.ok && a.error === 'LockedError'; };

const browser = await chromium.launch();
try {
  for (const mode of ['to\'siq poyga (barrier)', 'tabiiy poyga']) {
    const barrier = mode.startsWith('to');
    const db = `e2e-${barrier ? 'b' : 'n'}-${Date.now()}`; const ctx = await browser.newContext();
    const A = await open(ctx, db), B = await open(ctx, db);
    const [ra, rb] = await Promise.all([ev(A, (b) => api.create('111111', b), barrier), ev(B, (b) => api.create('222222', b), barrier)]);
    const wins = [ra, rb].filter((r) => r.ok).length;
    check(`[${mode}] ikki tab bir vaqtda PIN yaratsa, faqat bittasi muvaffaqiyatli`, wins === 1, JSON.stringify([ra, rb]));
    const loser = ra.ok ? rb : ra; check(`[${mode}] yutqazgan VaultExistsError oladi`, loser.error === 'VaultExistsError', JSON.stringify(loser));
    const [winPage, winPin, losePin, win] = ra.ok ? [A, '111111', '222222', ra] : [B, '222222', '111111', rb];
    for (const [n, p] of [['A', A], ['B', B]]) check(`[${mode}] tab ${n}: pending-recovery, DB amallari rad etiladi`, (await ev(p, () => api.status())) === 'pending-recovery' && (await ev(p, () => api.unlocked())) === false && await blocked(p));
    const C = await open(ctx, db);
    check(`[${mode}] yangi tab: pending-recovery va bloklangan`, (await ev(C, () => api.status())) === 'pending-recovery' && await blocked(C));
    const lu = await ev(C, (p) => api.unlock(p), losePin); check(`[${mode}] yutqazgan PIN ochmaydi`, !lu.ok && lu.error === 'WrongCredentialError');
    const wu = await ev(C, (p) => api.unlock(p), winPin); check(`[${mode}] g'olib PIN 'recovery-pending' beradi, DB baribir yopiq`, wu.ok && wu.value === 'recovery-pending' && await blocked(C));
    await winPage.reload(); await winPage.waitForFunction(() => window.__ready);
    check(`[${mode}] sahifa yangilangach pending holat tiklandi, DB yopiq`, (await ev(winPage, () => api.status())) === 'pending-recovery' && await blocked(winPage));
    const cf = await ev(C, (k) => api.unlockRec(k), win.value.recoveryKey); check(`[${mode}] g'olibning tiklash kaliti tasdiqlaydi`, cf.ok);
    check(`[${mode}] tasdiqdan keyin CRUD ishlaydi (tab C)`, (await ev(C, () => api.status())) === 'ready' && (await ev(C, () => api.add('Sinov'))).ok && (await ev(C, () => api.all())).value.length === 1);
    check(`[${mode}] boshqa ochiq tablar (A, B) o'z xotirasida qulflangan qoladi`, await blocked(A) && await blocked(B));
    await C.reload(); await C.waitForFunction(() => window.__ready);
    check(`[${mode}] yangilangach qulf: kalit xotirada yo'q, DB yopiq, holat ready`, (await ev(C, () => api.unlocked())) === false && await blocked(C) && (await ev(C, () => api.status())) === 'ready');
    const D = await open(ctx, db); check(`[${mode}] yangi tab doim qulflangan boshlanadi`, await blocked(D));
    check(`[${mode}] PIN bilan ochilgach ma'lumot saqlangan`, (await ev(D, (p) => api.unlock(p), winPin)).value === 'unlocked' && (await ev(D, () => api.all())).value[0].title === 'Sinov');
    await ctx.close();
  }
  // Brauzerni to'liq yopib qayta ochish (doimiy profil)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-prof-')); const db = `e2e-persist-${Date.now()}`;
  let ctx = await chromium.launchPersistentContext(dir); let p = await open(ctx, db);
  const cr = await ev(p, () => api.create('482915')); await ev(p, (k) => api.unlockRec(k), cr.value.recoveryKey); await ev(p, () => api.add('Saqlanadi'));
  await ctx.close();
  ctx = await chromium.launchPersistentContext(dir); p = await open(ctx, db);
  check('Brauzer yopilib qayta ochilgach: qulflangan, DB yopiq, holat ready', (await ev(p, () => api.unlocked())) === false && await blocked(p) && (await ev(p, () => api.status())) === 'ready');
  const ru = await ev(p, (x) => api.unlock(x), '482915'); const all = await ev(p, () => api.all());
  check('Qayta ochilgach PIN bilan ochiladi, ma\'lumot saqlangan', ru.value === 'unlocked' && all.value[0].title === 'Saqlanadi');
  await ctx.close();
  // Tasdiqlanmagan holatda brauzer yopilsa
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'si-prof-')); const db2 = `e2e-pend-${Date.now()}`;
  ctx = await chromium.launchPersistentContext(dir2); p = await open(ctx, db2); await ev(p, () => api.create('482915')); await ctx.close();
  ctx = await chromium.launchPersistentContext(dir2); p = await open(ctx, db2);
  check('Tasdiqlanmagan holatda brauzer yopilsa: qayta ochilganda pending va DB yopiq', (await ev(p, () => api.status())) === 'pending-recovery' && await blocked(p) && (await ev(p, (x) => api.unlock(x), '482915')).value === 'recovery-pending' && await blocked(p));
  await ctx.close();
} finally { await browser.close(); }
console.log(`\n${pass} o'tdi, ${fails.length} muvaffaqiyatsiz`); process.exit(fails.length ? 1 : 0);
