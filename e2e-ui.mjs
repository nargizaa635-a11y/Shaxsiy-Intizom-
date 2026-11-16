// PIN/qulf interfeysi: haqiqiy ilova (index.html) haqiqiy Chromium'da, 360x640 (Android o'lchami).
// Ishga tushirish: HTTP server (python3 -m http.server 8123) va `PW=<playwright/index.mjs yo'li> node tests/e2e-ui.mjs`
// Qisman: `ONLY=S2,S3 node tests/e2e-ui.mjs`
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import(process.env.PW || 'playwright');
const URL = process.env.URL || 'http://localhost:8123/index.html'; const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const PIN = '482915', PIN2 = '739204';
let pass = 0; const fails = [], notes = [], consoleAll = [];
const check = (n, c, x = '') => { if (c) pass++; else fails.push(n); console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${c ? '' : x}`); };
const opts = { viewport: { width: 360, height: 640 }, permissions: ['clipboard-read', 'clipboard-write'] };
const mk = async (ctx) => { const p = await ctx.newPage(); p.on('console', (m) => { consoleAll.push(m.text()); if (m.type() === 'error') fails.push(`konsol xatosi: ${m.text()}`); }); p.on('pageerror', (e) => fails.push(`sahifa xatosi: ${e.message}`)); return p; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (p, s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; }).catch(() => false); // fixed elementda offsetParent null bo'ladi, shuning uchun o'lcham bo'yicha
const lockedDom = async (p) => (await p.$eval('#lock', (e) => !e.hidden)) && (await p.$$eval('#nav a', (a) => a.length)) === 0 && (await p.$eval('#view', (e) => e.innerHTML.trim() === '')) && (await p.$eval('#head', (e) => e.innerHTML.trim() === '')) && await p.$eval('#lockbtn', (e) => e.hidden);
const appOpen = async (p) => { await p.waitForSelector('#nav a', { timeout: 8000 }); return (await p.$eval('#lock', (e) => e.hidden)) && (await p.$$eval('#nav a', (a) => a.length)) === 5 && await visible(p, '#lockbtn'); };
const groupsOf = (p) => p.$$eval('.rk-group', (e) => e.map((x) => x.textContent));
const evalIn = (p, f, ...a) => p.evaluate(f, ...a);
const addTask = (p, title) => evalIn(p, (t) => import('/js/database.js').then((d) => d.add('tasks', { title: t })), title);
const tasks = (p) => evalIn(p, () => import('/js/database.js').then((d) => d.getAll('tasks')).then((r) => r.map((x) => x.title)).catch((e) => e.name));
const dbErr = (p) => evalIn(p, () => import('/js/database.js').then((d) => d.getAll('tasks')).then(() => 'OK', (e) => e.name));
const layoutOk = async (p, label) => { const r = await p.evaluate(() => ({ w: document.documentElement.scrollWidth <= innerWidth, small: [...document.querySelectorAll('button:not([hidden]), input')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 40).length })); check(`[maket 360px] ${label}: gorizontal skroll yo'q, tugma/maydon balandligi yetarli`, r.w && r.small === 0, JSON.stringify(r)); };
async function setupUI(p, pin = PIN) { // PIN yaratish -> kalit -> 3 guruh tasdiqlash; kalitni qaytaradi
  await p.goto(URL); await p.waitForSelector('#pin'); await p.fill('#pin', pin); await p.fill('#pin2', pin); await p.click('#go'); await p.waitForSelector('.rk-group');
  const g = await groupsOf(p); await p.click('#next'); await p.waitForSelector('.rk-in');
  for (const i of await p.$$('.rk-in')) await i.fill(g[Number(await i.getAttribute('data-g'))]);
  await p.click('#go'); await p.waitForSelector('#rk-full'); await p.fill('#rk-full', g.join('-')); await p.click('#go'); check('[sozlash] to\'g\'ri guruhlar va to\'liq kalit bilan tasdiqlangach ilova ochiladi', await appOpen(p)); return g.join('-');
}
const unlockUI = async (p, pin) => { await p.fill('#pin', pin); await p.click('#go'); };
const scan = (p) => p.evaluate(async () => {
  const parts = [JSON.stringify(Object.entries(localStorage)), JSON.stringify(Object.entries(sessionStorage))];
  for (const { name } of await indexedDB.databases()) { const db = await new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); }); for (const s of [...db.objectStoreNames]) parts.push(JSON.stringify(await new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); }))); db.close(); }
  return parts.join('|');
});
const run = async (id, fn) => { if (ONLY.length && !ONLY.includes(id)) return; console.log(`--- ${id}`); try { await fn(); } catch (e) { fails.push(`${id} istisno: ${e.message}`); console.log('FAIL', id, 'istisno:', e.message.split('\n')[0]); } };

const browser = await chromium.launch();
try {
  await run('S1', async () => {
    const ctx = await browser.newContext(opts), p = await mk(ctx); await p.goto(URL); await p.waitForSelector('#pin');
    check('[sozlash] PIN yo\'q: sozlash ekrani, ilova ichi (sarlavha/kontent/navigatsiya) bo\'sh, qulf tugmasi yashirin', await lockedDom(p) && (await p.textContent('.lock-card h1')) === 'PIN yarating');
    const at = await p.$eval('#pin', (e) => [e.type, e.inputMode, e.maxLength]); check('[PIN maydoni] parol turi, raqamli klaviatura, 8 belgi', at.join() === 'password,numeric,8');
    await p.fill('#pin', '12ab34'); check('[PIN maydoni] raqam bo\'lmagan belgilar olib tashlanadi', (await p.inputValue('#pin')) === '1234');
    await p.click('[data-eye="pin"]'); check('[PIN maydoni] ko\'rsatish tugmasi matnni ochadi va yana yashiradi', (await p.$eval('#pin', (e) => e.type)) === 'text' && (await p.getAttribute('[data-eye="pin"]', 'aria-pressed')) === 'true'); await p.click('[data-eye="pin"]'); check('[PIN maydoni] qayta yashiriladi', (await p.$eval('#pin', (e) => e.type)) === 'password');
    for (const w of ['111111', '123456', '000000', '654321']) { await p.fill('#pin', w); await p.fill('#pin2', w); await p.click('#go'); check(`[PIN siyosati] ${w} rad etiladi`, (await p.textContent('#err')).includes('oson') && await p.$('#pin') !== null); }
    await p.fill('#pin', '12345'); await p.fill('#pin2', '12345'); await p.click('#go'); check('[PIN siyosati] 5 raqam rad etiladi', (await p.textContent('#err')).includes('6–8'));
    await p.fill('#pin', PIN); await p.fill('#pin2', '482916'); await p.click('#go'); check('[PIN siyosati] mos kelmaydigan takror rad etiladi', (await p.textContent('#err')).includes('bir xil emas'));
    await layoutOk(p, 'PIN yaratish');
    await p.click('#bench-link'); await p.waitForFunction(() => /median/.test(document.querySelector('#bench-out').textContent), null, { timeout: 15000 }); const bo = await p.textContent('#bench-out');
    check('[diagnostika] sozlash ekranidagi havola PBKDF2 ni o\'lchaydi (ms)', /median\)?: \d+ ms/.test(bo) && bo.includes('600000'), bo); check('[diagnostika] o\'lchov vault yaratmaydi', (await evalIn(p, () => import('/js/lock.js').then((l) => l.getState())).then((s) => s.status)) === 'none');
    await p.fill('#pin', PIN); await p.fill('#pin2', PIN); await p.click('#go'); await p.waitForSelector('.rk-group'); const g = await groupsOf(p); const key = g.join('-');
    check('[tiklash kaliti] 14 guruh, 4 belgidan', g.length === 14 && g.every((x) => /^[0-9A-Z]{4}$/.test(x))); await layoutOk(p, 'tiklash kaliti');
    check('[tiklash kaliti] tasdiqlanmaguncha DB yopiq, ilova ichi bo\'sh', (await dbErr(p)) === 'LockedError' && await lockedDom(p));
    await p.click('#copy'); await p.waitForFunction(() => /Nusxalandi/.test(document.querySelector('#copied').textContent)); check('[tiklash kaliti] nusxalash buferga to\'liq kalitni yozadi', (await p.evaluate(() => navigator.clipboard.readText())) === key);
    await p.click('#next'); await p.waitForSelector('.rk-in'); const gi = await p.$$eval('.rk-in', (e) => e.map((x) => Number(x.dataset.g))); check('[tasdiqlash] 3 ta turli guruh so\'raladi', gi.length === 3 && new Set(gi).size === 3); await layoutOk(p, 'tasdiqlash');
    for (const i of await p.$$('.rk-in')) await i.fill('ZZZZ'); await p.click('#go'); check('[tasdiqlash] noto\'g\'ri guruhlar rad etiladi, DB yopiq', (await p.textContent('#err')).includes('mos kelmadi') && (await dbErr(p)) === 'LockedError');
    await p.click('#back'); check('[tasdiqlash] "qayta ko\'rish" bir xil kalitni ko\'rsatadi', (await groupsOf(p)).join('-') === key); await p.click('#next'); await p.waitForSelector('.rk-in');
    const gi2 = await p.$$eval('.rk-in', (e) => e.map((x) => Number(x.dataset.g))); check('[tasdiqlash] guruhlar qayta ko\'rishdan keyin o\'zgarmaydi', gi2.join() === gi.join());
    for (const i of await p.$$('.rk-in')) await i.fill((await i.getAttribute('data-g')) !== null ? g[Number(await i.getAttribute('data-g'))].toLowerCase() : ''); await p.click('#go');
    await p.waitForSelector('#rk-full'); check('[to\'liq tasdiqlash] to\'g\'ri guruhlardan keyin kalitni to\'liq kiritish so\'raladi, DB hali yopiq', (await dbErr(p)) === 'LockedError' && await lockedDom(p) && (await p.$$('.rk-in')).length === 0); await layoutOk(p, 'to\'liq tasdiqlash');
    check('[to\'liq tasdiqlash] maydon chegarasi 100 belgi', (await p.$eval('#rk-full', (e) => e.maxLength)) === 100);
    await p.click('#go'); check('[to\'liq tasdiqlash] bo\'sh kiritish rad etiladi', (await p.textContent('#err')).includes('to\'liq') && (await dbErr(p)) === 'LockedError');
    await p.fill('#rk-full', g.slice(0, 13).join('-')); await p.click('#go'); check('[to\'liq tasdiqlash] to\'liq bo\'lmagan kalit (13 guruh) rad etiladi, kerakli belgi soni aytiladi', (await p.textContent('#err')).includes('56') && (await dbErr(p)) === 'LockedError');
    const bad = g.slice(); bad[6] = (bad[6][0] === 'A' ? 'B' : 'A') + bad[6].slice(1); await p.fill('#rk-full', bad.join('-')); await p.click('#go'); check('[to\'liq tasdiqlash] bitta belgi xato bo\'lsa rad etiladi, 7-guruh ko\'rsatiladi, DB yopiq', (await p.textContent('#err')).includes('7-guruh') && (await dbErr(p)) === 'LockedError' && await lockedDom(p));
    check('[to\'liq tasdiqlash] guruhlar to\'g\'ri bo\'lsa ham, to\'liq kalit bo\'lmasa ilova ochilmaydi (oldingi kamchilik)', (await p.$eval('#lock', (e) => !e.hidden)) && (await dbErr(p)) === 'LockedError');
    await p.click('#back'); check('[to\'liq tasdiqlash] "qayta ko\'rish" bir xil kalitni ko\'rsatadi', (await groupsOf(p)).join('-') === key); await p.click('#next'); await p.waitForSelector('.rk-in'); for (const i of await p.$$('.rk-in')) await i.fill(g[Number(await i.getAttribute('data-g'))]); await p.click('#go'); await p.waitForSelector('#rk-full');
    await p.fill('#rk-full', g.join(' ').toLowerCase().replace(/0/g, 'o')); await p.click('#go'); check('[to\'liq tasdiqlash] kichik harf, bo\'shliq va O/0 aralash kiritilgan to\'g\'ri kalit qabul qilinadi: ilova ochildi', await appOpen(p));
    check('[holat] vault "ready", sarlavha va qulf tugmasi ko\'rinadi', (await evalIn(p, () => import('/js/lock.js').then((l) => l.getState()))).status === 'ready' && (await p.textContent('h1')) === 'Assalomu alaykum');
    const dump = await scan(p); const all = dump + consoleAll.join('|'); for (const s of [PIN, key, key.replace(/-/g, '')]) check(`[sirlar] ${s.length === 6 ? 'PIN' : 'tiklash kaliti'} localStorage/sessionStorage/IndexedDB va konsolda ochiq yo'q`, !all.includes(s));
    await ctx.close();
  });

  await run('S2', async () => {
    const ctx = await browser.newContext(opts), p = await mk(ctx); await setupUI(p); await addTask(p, 'Saqlanadi'); await p.evaluate(() => { location.hash = '#/reja'; }); await p.waitForFunction(() => document.querySelector('h1').textContent === 'Reja');
    check('[qulf belgisi] yuqori burchakda, 44px dan kichik emas', await p.$eval('#lockbtn', (e) => { const r = e.getBoundingClientRect(); return r.top < 60 && r.right > innerWidth - 40 && r.width >= 44 && r.height >= 44; }));
    await p.click('#lockbtn'); await p.waitForSelector('#lock:not([hidden]) #pin');
    check('[qulflash] belgi bosilganda darhol qulflanadi: qulf ekrani, ilova ichi DOM dan tozalangan', await lockedDom(p) && (await p.textContent('.lock-card h1')) === 'Shaxsiy intizom');
    check('[qulflash] DB amallari rad etiladi', (await dbErr(p)) === 'LockedError' && (await tasks(p)) === 'LockedError');
    await p.evaluate(() => { location.hash = '#/maqsadlar'; }); await sleep(300); check('[qulflash] qulflangan holatda manzil o\'zgarsa ham shaxsiy sahifa chizilmaydi', await lockedDom(p));
    await layoutOk(p, 'qulf ekrani'); await unlockUI(p, '000001'); await p.waitForFunction(() => /noto'g'ri/.test(document.querySelector('#err').textContent)); check('[PIN bilan ochish] noto\'g\'ri PIN: tushunarli xabar, maydon tozalanadi, ochilmaydi', (await p.inputValue('#pin')) === '' && await lockedDom(p));
    await unlockUI(p, PIN); check('[PIN bilan ochish] to\'g\'ri PIN ochadi, oxirgi sahifa (Maqsadlar) tiklanadi', await appOpen(p) && (await p.textContent('h1')) === 'Maqsadlar'); check('[PIN bilan ochish] ma\'lumot saqlangan', (await tasks(p)).join() === 'Saqlanadi');
    await p.reload(); await p.waitForSelector('#pin'); check('[qayta yuklash] sahifa yangilansa qulflangan', await lockedDom(p) && (await dbErr(p)) === 'LockedError'); await ctx.close();
  });

  await run('S3', async () => {
    const ctx = await browser.newContext(opts), p = await mk(ctx); await setupUI(p); await p.click('#lockbtn'); await p.waitForSelector('#pin');
    // kuzatuvchi: kutish matni ko'rinib turganda tugma birorta ham kadrda yoqilmasligi kerak (vaqtga bog'liq bo'lmagan tekshiruv)
    await p.evaluate(() => { window.__bad = 0; const f = () => { const w = document.querySelector('#wait'), g = document.querySelector('#go'); if (w && g && w.textContent && !g.disabled) window.__bad++; requestAnimationFrame(f); }; f(); });
    for (let i = 0; i < 3; i++) { await unlockUI(p, '000001'); await p.waitForFunction((n) => /noto'g'ri/.test(document.querySelector('#err').textContent) || document.querySelector('#wait').textContent, i); await sleep(150); }
    await sleep(700); check('[kutish] kutish ko\'rsatilgan paytda tugma birorta ham kadrda yoqilmaydi', (await p.evaluate(() => window.__bad)) === 0, String(await p.evaluate(() => window.__bad)));
    await p.waitForFunction(() => /\d+ s/.test(document.querySelector('#wait').textContent)); const w = await p.textContent('#wait'); const sec = Number((w.match(/(\d+) s/) || [])[1]);
    check('[kutish] 3 noto\'g\'ri urinishdan keyin kutish vaqti ko\'rsatiladi (<=10 s), tugma o\'chiq', sec > 0 && sec <= 10 && await p.$eval('#go', (e) => e.disabled), w);
    await p.reload(); await p.waitForSelector('#pin'); await sleep(400); check('[kutish] sahifa yangilanganda kutish saqlanadi, tugma o\'chiq', /\d+ s/.test(await p.textContent('#wait')) && await p.$eval('#go', (e) => e.disabled));
    const p2 = await mk(ctx); await p2.goto(URL); await p2.waitForSelector('#pin'); await sleep(400); check('[kutish] yangi tabda ham kutish ko\'rinadi (umumiy holat)', /\d+ s/.test(await p2.textContent('#wait')));
    await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 15000 }); check('[kutish] vaqt tugagach tugma yoqiladi, kutish matni yo\'qoladi', (await p.textContent('#wait')) === '');
    await unlockUI(p, PIN); check('[kutish] to\'g\'ri PIN ochadi va hisoblagich tiklanadi', await appOpen(p) && (await p.evaluate(() => localStorage.getItem('si:throttle'))) === null); await ctx.close();
  });

  await run('S4', async () => {
    const ctx = await browser.newContext(opts), p = await mk(ctx); const key = await setupUI(p); await addTask(p, 'Saqlanadi'); await p.click('#lockbtn'); await p.waitForSelector('#forgot'); await p.click('#forgot'); await p.waitForSelector('#rk');
    check('[tiklash] ekran: kalit, yangi PIN, takror; ma\'lumot saqlanishi va yo\'qolish xavfi tushuntiriladi', (await p.textContent('.lock-card')).includes('tiklab bo\'lmaydi') && (await p.textContent('.lock-card')).includes('saqlanib qoladi')); await layoutOk(p, 'tiklash');
    const fill = async (k, a, b) => { await p.fill('#rk', k); await p.fill('#pin', a); await p.fill('#pin2', b); await p.click('#go'); };
    await fill(key, '111111', '111111'); check('[tiklash] zaif yangi PIN rad etiladi', (await p.textContent('#err')).includes('oson')); await fill(key, PIN2, '739205'); check('[tiklash] mos kelmagan yangi PIN rad etiladi', (await p.textContent('#err')).includes('bir xil emas'));
    const typo = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A'); await fill(typo, PIN2, PIN2); await p.waitForFunction(() => document.querySelector('#err').textContent); check('[tiklash] kalitdagi xato (nazorat belgilari) tushunarli xabar bilan rad etiladi', (await p.textContent('#err')).includes('xato bor') && await lockedDom(p));
    const wrong = await evalIn(p, () => import('/js/crypto.js').then((c) => c.formatRecoveryKey(new Uint8Array(32).fill(5)))); await fill(wrong, PIN2, PIN2); await p.waitForFunction(() => /mos kelmadi/.test(document.querySelector('#err').textContent)); check('[tiklash] boshqa (to\'g\'ri formatdagi) kalit: "mos kelmadi", ochilmaydi', await lockedDom(p));
    await fill(key, PIN2, PIN2); check('[tiklash] to\'g\'ri kalit + yangi PIN: ilova ochiladi, ma\'lumot saqlangan', await appOpen(p) && (await tasks(p)).join() === 'Saqlanadi');
    await p.click('#lockbtn'); await p.waitForSelector('#pin'); await unlockUI(p, PIN); await p.waitForFunction(() => /noto'g'ri/.test(document.querySelector('#err').textContent)); check('[tiklash] eski PIN endi ochmaydi', await lockedDom(p)); await unlockUI(p, PIN2); check('[tiklash] yangi PIN ochadi', await appOpen(p)); await ctx.close();
    const c2 = await browser.newContext(opts), q = await mk(c2); await setupUI(q); await q.click('#lockbtn'); await q.waitForSelector('#forgot'); await q.click('#forgot'); await q.waitForSelector('#rk');
    const bad = await evalIn(q, () => import('/js/crypto.js').then((c) => c.formatRecoveryKey(new Uint8Array(32).fill(9)))); for (let i = 0; i < 3; i++) { await q.fill('#rk', bad); await q.fill('#pin', PIN2); await q.fill('#pin2', PIN2); await q.click('#go'); await sleep(500); }
    await q.waitForFunction(() => /\d+ s/.test(document.querySelector('#wait').textContent)); check('[tiklash] noto\'g\'ri kalit urinishlari ham kutishga bo\'ysunadi: vaqt ko\'rsatiladi, tugma o\'chiq', await q.$eval('#go', (e) => e.disabled)); await c2.close();
  });

  await run('S5', async () => {
    const ctx = await browser.newContext(opts), p = await mk(ctx); await setupUI(p); await addTask(p, 'Saqlanadi'); await p.evaluate(() => { location.hash = '#/sozlamalar'; }); await p.waitForSelector('#s-change');
    check('[sozlamalar] xavfsizlik, PIN almashtirish, tiklash kalitini yangilash va diagnostika bo\'limlari bor', (await p.$$('.card')).length === 4); await layoutOk(p, 'sozlamalar');
    const go = async (o, n, n2) => { await p.fill('#o-pin', o); await p.fill('#n-pin', n); await p.fill('#n-pin2', n2); await p.click('#s-change'); };
    await go(PIN, '111111', '111111'); check('[PIN almashtirish] zaif yangi PIN rad etiladi', (await p.textContent('#s-err')).includes('oson')); await go(PIN, PIN2, '739205'); check('[PIN almashtirish] mos kelmaslik rad etiladi', (await p.textContent('#s-err')).includes('bir xil emas'));
    await go(PIN, PIN, PIN); check('[PIN almashtirish] yangi PIN hozirgisiga teng bo\'lmasin', (await p.textContent('#s-err')).includes('farq')); await go('12', PIN2, PIN2); check('[PIN almashtirish] hozirgi PIN kiritilmasa rad etiladi', (await p.textContent('#s-err')).includes('Hozirgi PIN'));
    await go('000001', PIN2, PIN2); await p.waitForFunction(() => /noto'g'ri/.test(document.querySelector('#s-err').textContent)); check('[PIN almashtirish] noto\'g\'ri hozirgi PIN: xabar, PIN o\'zgarmaydi', true);
    await go(PIN, PIN2, PIN2); await p.waitForFunction(() => /almashtirildi/.test(document.querySelector('#s-ok').textContent)); check('[PIN almashtirish] muvaffaqiyat xabari, maydonlar tozalandi, ochiq sessiya davom etadi', (await p.inputValue('#o-pin')) === '' && await visible(p, '#lockbtn') && (await tasks(p)).join() === 'Saqlanadi');
    await p.click('#s-lock'); await p.waitForSelector('#pin'); check('[sozlamalar] "Hozir qulflash" tugmasi qulflaydi', await lockedDom(p)); await unlockUI(p, PIN); await p.waitForFunction(() => /noto'g'ri/.test(document.querySelector('#err').textContent)); check('[PIN almashtirish] eski PIN endi ochmaydi', await lockedDom(p));
    await unlockUI(p, PIN2); check('[PIN almashtirish] yangi PIN ochadi, ma\'lumot saqlangan', await appOpen(p) && (await tasks(p)).join() === 'Saqlanadi'); await ctx.close();
    const c2 = await browser.newContext(opts), q = await mk(c2); await setupUI(q); await q.evaluate(() => { location.hash = '#/sozlamalar'; }); await q.waitForSelector('#s-change');
    for (let i = 0; i < 3; i++) { await q.fill('#o-pin', '000001'); await q.fill('#n-pin', PIN2); await q.fill('#n-pin2', PIN2); await q.click('#s-change'); await sleep(500); }
    await q.fill('#o-pin', PIN); await q.fill('#n-pin', PIN2); await q.fill('#n-pin2', PIN2); await q.click('#s-change'); await q.waitForFunction(() => /\d+ s/.test(document.querySelector('#s-err').textContent));
    check('[PIN almashtirish] 3 noto\'g\'ri urinishdan keyin to\'g\'ri PIN ham kutish xabari bilan rad etiladi', true);
    await q.click('#s-lock'); await q.waitForSelector('#pin'); await sleep(500); check('[PIN almashtirish] kutish qulf ekrani bilan umumiy (PIN almashtirish orqali chetlab o\'tilmaydi)', /\d+ s/.test(await q.textContent('#wait')) && await q.$eval('#go', (e) => e.disabled)); await c2.close();
  });

  await run('S6', async () => {
    const ctx = await browser.newContext(opts), p = await mk(ctx); await setupUI(p); await p.evaluate(() => { location.hash = '#/sozlamalar'; }); await p.waitForSelector('#d-state dt');
    const st = await p.textContent('#d-state'); check('[diagnostika] PIN va qulf holati: Tayyor, Ochiq, PBKDF2 600000, kalit tasdiqlangan', ['Tayyor', 'Ochiq', 'PBKDF2-SHA256, 600000 iteratsiya', 'Tasdiqlangan'].every((x) => st.includes(x)), st);
    const vault = () => evalIn(p, () => new Promise((res) => { indexedDB.open('shaxsiy-intizom').onsuccess = (e) => { const r = e.target.result.transaction('settings').objectStore('settings').get('security'); r.onsuccess = () => res(JSON.stringify(r.result)); }; }));
    const v0 = await vault(); await p.click('#d-bench'); await p.waitForFunction(() => /median/.test(document.querySelector('#d-out').textContent), null, { timeout: 20000 }); const out = await p.textContent('#d-out');
    check('[diagnostika] o\'lchov natijasi ms da, qurilma ma\'lumoti bilan', /median\)?: \d+ ms/.test(out) && /Qurilma:/.test(out), out); await p.click('#d-bench-copy'); await sleep(300); check('[diagnostika] natijani nusxalash', (await p.evaluate(() => navigator.clipboard.readText())).includes('median'));
    check('[diagnostika] o\'lchov kriptografik sozlamalarni o\'zgartirmaydi (vault baytma-bayt bir xil)', (await vault()) === v0); await p.click('#d-refresh'); check('[diagnostika] yangilangach ham 600000', (await p.textContent('#d-state')).includes('600000'));
    check('[diagnostika] salt/IV/shifrlangan baytlar ko\'rsatilmaydi', !/salt|"iv"|ct/i.test(await p.textContent('#d-state'))); await ctx.close();
  });

  await run('S7', async () => {
    const ctx = await browser.newContext(opts), A = await mk(ctx); await setupUI(A); const B = await mk(ctx); await B.goto(URL); await B.waitForSelector('#pin');
    check('[ko\'p tab] yangi tab qulflangan (A ochiq bo\'lsa ham)', await lockedDom(B) && await appOpen(A)); await unlockUI(B, PIN); check('[ko\'p tab] B ni o\'z PIN i bilan ochish mumkin', await appOpen(B));
    await A.click('#lockbtn'); await B.waitForSelector('#lock:not([hidden]) #pin', { timeout: 3000 }); check('[ko\'p tab] A qulflasa B ham qulflanadi: qulf ekrani, ilova ichi tozalangan', await lockedDom(B) && await lockedDom(A) && (await dbErr(B)) === 'LockedError');
    await unlockUI(A, PIN); await appOpen(A); await unlockUI(B, PIN); await appOpen(B); await B.click('#lockbtn'); await A.waitForSelector('#lock:not([hidden]) #pin', { timeout: 3000 }); check('[ko\'p tab] B qulflasa A ham qulflanadi', await lockedDom(A)); await ctx.close();
  });

  await run('S8', async () => {
    const ctx = await browser.newContext(opts), p = await mk(ctx); await p.goto(URL); await p.waitForSelector('#pin'); await p.fill('#pin', PIN); await p.fill('#pin2', PIN); await p.click('#go'); await p.waitForSelector('.rk-group'); const k1 = (await groupsOf(p)).join('-');
    await p.reload(); await p.waitForSelector('#pin'); check('[tasdiqlanmagan] kalit tasdiqlanmasdan chiqilsa: keyingi ochilishda qulf ekrani', (await p.textContent('.lock-card h1')) === 'Shaxsiy intizom' && await lockedDom(p) && (await dbErr(p)) === 'LockedError');
    await unlockUI(p, PIN); await p.waitForSelector('.lock-card h1'); await p.waitForFunction(() => /Tiklash kalitini tasdiqlang/.test(document.querySelector('.lock-card h1').textContent)); check('[tasdiqlanmagan] PIN to\'g\'ri: majburiy yangi kalit oqimi, DB hali yopiq', (await dbErr(p)) === 'LockedError' && await lockedDom(p));
    await p.click('#go'); await p.waitForSelector('.rk-group'); const g2 = await groupsOf(p); check('[tasdiqlanmagan] yangi kalit eskisidan farq qiladi', g2.join('-') !== k1); await p.click('#next'); await p.waitForSelector('.rk-in');
    for (const i of await p.$$('.rk-in')) await i.fill(g2[Number(await i.getAttribute('data-g'))]); await p.click('#go'); await p.waitForSelector('#rk-full'); await p.fill('#rk-full', g2.join('-')); await p.click('#go'); check('[tasdiqlanmagan] yangi kalit tasdiqlangach ilova ochiladi, DB ishlaydi', await appOpen(p) && (await dbErr(p)) === 'OK');
    await p.click('#lockbtn'); await p.waitForSelector('#forgot'); await p.click('#forgot'); await p.waitForSelector('#rk'); await p.fill('#rk', k1); await p.fill('#pin', PIN2); await p.fill('#pin2', PIN2); await p.click('#go'); await p.waitForFunction(() => /mos kelmadi/.test(document.querySelector('#err').textContent));
    check('[tasdiqlanmagan] eski (tasdiqlanmagan) kalit endi ishlamaydi', await lockedDom(p)); await p.fill('#rk', g2.join('-')); await p.click('#go'); check('[tasdiqlanmagan] yangi kalit bilan tiklash ishlaydi', await appOpen(p)); await ctx.close();
  });

  await run('S9', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-ui-')); let ctx = await chromium.launchPersistentContext(dir, opts); let p = await mk(ctx); await setupUI(p); await addTask(p, 'Saqlanadi'); await ctx.close();
    ctx = await chromium.launchPersistentContext(dir, opts); p = await mk(ctx); await p.goto(URL); await p.waitForSelector('#pin'); check('[qayta ochish] brauzer yopilib ochilgach qulf ekrani, DB yopiq', await lockedDom(p) && (await dbErr(p)) === 'LockedError');
    await unlockUI(p, PIN); check('[qayta ochish] PIN bilan ochiladi, ma\'lumot saqlangan', await appOpen(p) && (await tasks(p)).join() === 'Saqlanadi'); await p.click('#lockbtn'); await p.waitForSelector('#pin');
    for (let i = 0; i < 3; i++) { await unlockUI(p, '000001'); await sleep(600); } await ctx.close();
    ctx = await chromium.launchPersistentContext(dir, opts); p = await mk(ctx); await p.goto(URL); await p.waitForSelector('#pin'); await sleep(500); check('[qayta ochish] kutish muddati brauzer qayta ochilganda ham saqlanadi', /\d+ s/.test(await p.textContent('#wait')) && await p.$eval('#go', (e) => e.disabled)); await ctx.close();
  });
  await run('S10', async () => { // Sozlamalardan tiklash kalitini yangilash
    const ctx = await browser.newContext(opts), p = await mk(ctx); const key1 = await setupUI(p); await addTask(p, 'Rotatsiya sinovi');
    const toSettings = async () => { await evalIn(p, () => { location.hash = '#/sozlamalar'; }); await p.waitForSelector('#r-start'); };
    const diag = () => evalIn(p, () => import('/js/modules/settings.js').then((m) => m.readDiagnostics()));
    const gone = () => p.waitForSelector('#lock', { state: 'hidden', timeout: 8000 }).then(() => true, () => false);
    const typeFull = async (g) => { await p.waitForSelector('.rk-group'); await p.click('#next'); await p.waitForSelector('.rk-in'); for (const i of await p.$$('.rk-in')) await i.fill(g[Number(await i.getAttribute('data-g'))]); await p.click('#go'); await p.waitForSelector('#rk-full'); await p.fill('#rk-full', g.join('-')); await p.click('#go'); };
    const forgot = async (k, pin) => { await p.click('#lockbtn'); await p.waitForSelector('#forgot'); await p.click('#forgot'); await p.waitForSelector('#rk'); await p.fill('#rk', k); await p.fill('#pin', pin); await p.fill('#pin2', pin); await p.click('#go'); };
    await toSettings(); check('[kalitni yangilash] Sozlamalarda "Tiklash kalitini yangilash" bo\'limi bor', await visible(p, '#r-start') && await visible(p, '#r-pin')); await layoutOk(p, 'sozlamalar (kalitni yangilash)');
    await p.click('#r-start'); check('[kalitni yangilash] PIN kiritilmasa so\'raladi', (await p.textContent('#r-err')).includes('PIN'));
    await p.fill('#r-pin', PIN2); await p.click('#r-start'); await p.waitForSelector('#r-err:not(:empty)'); check('[kalitni yangilash] noto\'g\'ri PIN rad etiladi, yangilash boshlanmaydi', (await p.textContent('#r-err')).includes('noto\'g\'ri') && (await diag()).rotationPending === false && !(await visible(p, '.rk-group')));
    // 1) bekor qilish: eski kalit ishlashda davom etadi
    await p.fill('#r-pin', PIN); await p.click('#r-start'); await p.waitForSelector('.rk-group'); const gA = await groupsOf(p);
    check('[kalitni yangilash] to\'g\'ri PIN: yangi kalit ko\'rsatiladi (eskisidan farq qiladi), ilova ochiq qoladi', gA.length === 14 && gA.join('-') !== key1 && (await dbErr(p)) === 'OK' && await visible(p, '#cancel')); await layoutOk(p, 'kalitni yangilash (ko\'rsatish)');
    await p.click('#cancel'); check('[kalitni yangilash] "Bekor qilish": oyna yopiladi, kalit ekranda qolmaydi, xabar ko\'rsatiladi', await gone() && (await p.$$('.rk-group')).length === 0 && (await p.textContent('#r-ok')).includes('bekor'));
    check('[kalitni yangilash] bekor qilingach vault tayyor va tasdiqlangan holda', (await diag()).recoveryConfirmed === true && (await diag()).status === 'ready');
    await forgot(key1, PIN2); check('[kalitni yangilash] bekor qilingach ESKI kalit hamon ishlaydi (PIN tiklandi, ma\'lumot saqlangan)', await appOpen(p) && (await tasks(p)).includes('Rotatsiya sinovi'));
    // 2) to'liq yangilash
    await toSettings(); await p.fill('#r-pin', PIN2); await p.click('#r-start'); await p.waitForSelector('.rk-group'); const key2 = (await groupsOf(p)).join('-'); check('[kalitni yangilash] ikkinchi urinishda yana yangi kalit beriladi', key2 !== key1 && key2 !== gA.join('-'));
    await typeFull(key2.split('-')); check('[kalitni yangilash] to\'liq tasdiqlangach oyna yopiladi, ilova ochiq, muvaffaqiyat xabari', await gone() && await appOpen(p) && (await dbErr(p)) === 'OK' && (await p.textContent('#r-ok')).includes('yangilandi'));
    const d = await diag(); check('[kalitni yangilash] diagnostika: yangilash kutilmaydi, tasdiqlangan', d.rotationPending === false && d.recoveryConfirmed === true);
    await forgot(key1, PIN); await p.waitForSelector('#err:not(:empty)'); check('[kalitni yangilash] ESKI kalit endi ishlamaydi', (await p.textContent('#err')).includes('mos kelmadi') && await lockedDom(p));
    await p.fill('#rk', key2); await p.fill('#pin', PIN); await p.fill('#pin2', PIN); await p.click('#go'); check('[kalitni yangilash] YANGI kalit ishlaydi, ma\'lumotlar saqlangan', await appOpen(p) && (await tasks(p)).includes('Rotatsiya sinovi'));
    // 3) oqim o'rtasida qulflansa: kalit ekranda va xotirada qolmaydi, eski kalit ishlaydi
    await toSettings(); await p.fill('#r-pin', PIN); await p.click('#r-start'); await p.waitForSelector('.rk-group'); const key3 = (await groupsOf(p)).join('-');
    await evalIn(p, () => import('/js/lock.js').then((l) => l.lock('manual'))); await p.waitForSelector('#pin');
    check('[kalitni yangilash] oqim o\'rtasida qulflansa: kalit ekrandan yo\'qoladi, qulf ekrani chiqadi', (await p.$$('.rk-group')).length === 0 && !(await p.textContent('#lock')).includes(key3.slice(0, 4) + '-') && await lockedDom(p));
    await unlockUI(p, PIN); check('[kalitni yangilash] qayta ochilganda ilova ishlaydi, yangilash tasdiqlanmagani aniq ko\'rinadi', await appOpen(p) && (await diag()).rotationPending === true && (await diag()).recoveryConfirmed === true);
    const all = await scan(p) + consoleAll.join('|'); check('[sirlar] yangi tiklash kalitlari localStorage/sessionStorage/IndexedDB va konsolda ochiq yo\'q', ![key2, key2.replace(/-/g, ''), key3, key3.replace(/-/g, ''), gA.join('-')].some((k) => all.includes(k)));
    await ctx.close();
  });
} finally { await browser.close(); }
const okConsole = !consoleAll.some((t) => /PIN|kalit.*[0-9A-Z]{4}-[0-9A-Z]{4}/.test(t) && /\d{6}/.test(t)); if (!okConsole) fails.push('konsolda PIN');
notes.forEach((n) => console.log('ESLATMA:', n)); console.log(`\n${pass} o'tdi, ${fails.length} muvaffaqiyatsiz`); fails.forEach((f) => console.log(' -', f)); process.exit(fails.length ? 1 : 0);
