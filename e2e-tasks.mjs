// Vazifalar moduli: haqiqiy ilova haqiqiy Chromium'da (360x640). `PW=<playwright/index.mjs> node tests/e2e-tasks.mjs`; qisman: `ONLY=T2,T3`
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import(process.env.PW || 'playwright');
const URL = process.env.URL || 'http://localhost:8123/index.html'; const ONLY = (process.env.ONLY || '').split(',').filter(Boolean); const PIN = '482915';
let pass = 0; const fails = [], notes = [], consoleAll = [];
const check = (n, c, x = '') => { if (c) pass++; else fails.push(n); console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${c ? '' : x}`); };
const opts = { viewport: { width: 360, height: 640 }, permissions: ['clipboard-read', 'clipboard-write'] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Soat siljishi: window.__off (ms) qo'shiladi: "keyingi kun", "eslatma vaqti" kabi holatlarni haqiqiy ilovada sinash uchun
const clockShim = () => { const R = Date; class F extends R { constructor(...a) { if (a.length === 0) super(R.now() + (window.__off || 0)); else super(...a); } static now() { return R.now() + (window.__off || 0); } } window.Date = F; };
const newCtx = async (b, o = opts) => { const c = await b.newContext(o); await c.addInitScript(clockShim); return c; };
const mk = async (ctx) => { const p = await ctx.newPage(); p.on('console', (m) => { consoleAll.push(m.text()); if (m.type() === 'error') fails.push(`konsol xatosi: ${m.text()}`); }); p.on('pageerror', (e) => fails.push(`sahifa xatosi: ${e.message}`)); return p; };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const visible = (p, s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; }).catch(() => false);
const today = (p) => ev(p, () => import('/js/modules/tasks-core.js').then((K) => K.localParts(Date.now()).date));
const addDaysP = (p, d, n) => ev(p, ([a, b]) => import('/js/modules/tasks-core.js').then((K) => K.addDays(a, b)), [d, n]);
const mkTask = (p, i) => ev(p, (x) => import('/js/modules/tasks-store.js').then((S) => S.createTask(x)), i);
const doneP = (p, id, date, v) => ev(p, ([a, b, c]) => import('/js/modules/tasks-store.js').then((S) => S.setDone(a, b, c)), [id, date, v]);
const titles = (p, sel = '#t-list .t-title') => p.$$eval(sel, (e) => e.map((x) => x.textContent));
const lockedDom = async (p) => (await p.$eval('#lock', (e) => !e.hidden)) && (await p.$$eval('#nav a', (a) => a.length)) === 0 && (await p.$eval('#view', (e) => e.innerHTML.trim() === '')) && (await p.$eval('#head', (e) => e.innerHTML.trim() === '')) && (await p.$eval('#tbanner', (e) => e.innerHTML.trim() === '')) && await p.$eval('#lockbtn', (e) => e.hidden);
async function boot(b, o) { // PIN yaratadi, kalitni tasdiqlaydi va #/reja ga o'tadi
  const ctx = await newCtx(b, o), p = await mk(ctx); await p.goto(URL); await p.waitForSelector('#pin'); await p.fill('#pin', PIN); await p.fill('#pin2', PIN); await p.click('#go'); await p.waitForSelector('.rk-group');
  const g = await p.$$eval('.rk-group', (e) => e.map((x) => x.textContent)); await p.click('#next'); await p.waitForSelector('.rk-in'); for (const i of await p.$$('.rk-in')) await i.fill(g[Number(await i.getAttribute('data-g'))]); await p.click('#go'); await p.waitForSelector('#rk-full'); await p.fill('#rk-full', g.join('-')); await p.click('#go'); await p.waitForSelector('#nav a');
  await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('.t-stats'); return { ctx, p, key: g.join('-') };
}
const unlock = async (p, pin = PIN) => { await p.waitForSelector('#pin'); await p.fill('#pin', pin); await p.click('#go'); await p.waitForSelector('#nav a'); };
const layoutOk = async (p, label) => { const r = await p.evaluate(() => ({ w: document.documentElement.scrollWidth <= innerWidth, small: [...document.querySelectorAll('button:not([hidden]), input:not([type=radio]), select, textarea, a.btn, .chip')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map((e) => e.className || e.id || e.tagName) })); check(`[maket 360px] ${label}: gorizontal skroll yo'q, tugma/maydon balandligi >=40px`, r.w && r.small.length === 0, JSON.stringify(r)); };
const fillForm = async (p, v) => { for (const [k, val] of Object.entries(v)) { if (k === 'priority') await p.check(`input[name=priority][value=${val}]`); else await p.fill(`#f-${k}`, val); } };
const selectOpt = (p, id, v) => p.selectOption(`#f-${id}`, v);
const run = async (id, fn) => { if (ONLY.length && !ONLY.includes(id)) return; console.log(`--- ${id}`); try { await fn(); } catch (e) { fails.push(`${id} istisno: ${e.message}`); console.log('FAIL', id, 'istisno:', e.message.split('\n')[0]); } };

const browser = await chromium.launch();
try {
  await run('T1', async () => {
    const { ctx, p } = await boot(browser); check('[bosh sahifa] bo\'sh holat, FAB, 7 ta filtr, kategoriyalar havolasi', (await p.textContent('.state h2')).includes('hali yo\'q') && await visible(p, '#t-new') && (await p.$$('.chip')).length === 7 && await visible(p, 'a[href="#/reja/kategoriyalar"]'));
    check('[bosh sahifa] ko\'rsatkichlar 0, progress 0%', (await p.textContent('#t-total')) === '0' && (await p.textContent('#t-overall')) === '0%' && (await p.getAttribute('.bar', 'aria-valuenow')) === '0'); await layoutOk(p, 'vazifalar bo\'sh holat');
    check('[bosh sahifa] filtr nomlari o\'zbekcha', (await p.$$eval('.chip', (e) => e.map((x) => x.textContent))).join() === 'Barchasi,Bugun,Ertaga,Kelgusi,Bajarilgan,Bajarilmagan,Muddati o\'tgan');
    check('[bosh sahifa] navigatsiyada "Reja" faol, qulf belgisi ko\'rinadi', (await p.$eval('.nav-item.on', (e) => e.textContent)) === 'Reja' && await visible(p, '#lockbtn')); await ctx.close();
  });

  await run('T2', async () => {
    const { ctx, p } = await boot(browser); const T = await today(p); await p.click('#t-new'); await p.waitForSelector('#t-form');
    check('[forma] bottom nav yashirin, sarlavha "Yangi vazifa", sana bugun', !(await visible(p, '#nav')) && (await p.textContent('h1')) === 'Yangi vazifa' && (await p.inputValue('#f-date')) === T); await layoutOk(p, 'yangi vazifa formasi');
    const af = await p.$eval('#f-title', (e) => e.getAttribute('autocomplete')); const ad = await p.$eval('#f-description', (e) => e.getAttribute('autocomplete')); check('[forma] nom va tavsif maydonlarida brauzer avtoto\'ldirishi o\'chirilgan', af === 'off' && ad === 'off');
    await p.click('#f-save'); check('[forma] nomsiz saqlab bo\'lmaydi: xabar, maydon belgilanadi, fokus nomda', (await p.textContent('#e-title')).includes('nomini kiriting') && (await p.getAttribute('#f-title', 'aria-invalid')) === 'true' && await p.evaluate(() => document.activeElement.id) === 'f-title');
    await p.fill('#f-title', 'Sinov'); await p.fill('#f-startTime', '10:00'); await p.fill('#f-endTime', '09:00'); await p.click('#f-save'); check('[forma] tugash vaqti boshlanishdan oldin: rad etiladi', (await p.textContent('#e-endTime')).includes('keyin') && (await titles(p, '.t-title')).length === 0);
    await p.fill('#f-endTime', ''); await p.fill('#f-startTime', ''); await selectOpt(p, 'reminder', '15'); await p.click('#f-save'); check('[forma] vaqtsiz eslatma: rad etiladi', (await p.textContent('#e-reminder')).includes('boshlanish vaqtini'));
    await selectOpt(p, 'reminder', ''); await p.fill('#f-date', ''); await p.click('#f-save'); check('[forma] sanasiz: rad etiladi', (await p.textContent('#e-date')).length > 0); await p.fill('#f-date', T);
    await fillForm(p, { title: 'Birinchi vazifa', description: 'Batafsil tavsif', startTime: '08:30', endTime: '09:15', priority: 'high' }); await selectOpt(p, 'categoryId', 'ish'); await selectOpt(p, 'reminder', '15'); await p.click('#f-save');
    await p.waitForSelector('.t-row'); check('[saqlash] ro\'yxatga qaytadi (#/reja) va vazifa ko\'rinadi', (await ev(p, () => location.hash)) === '#/reja' && (await titles(p)).includes('Birinchi vazifa'));
    check('[ko\'rsatkichlar] bugun 1, bajarilmagan 1, umumiy 0%', (await p.textContent('#t-total')) === '1' && (await p.textContent('#t-pending')) === '1' && (await p.textContent('#t-overall')) === '0%');
    check('[qator] vaqt, kategoriya va ustuvorlik ko\'rsatiladi', (await p.textContent('.t-meta')).includes('08:30–09:15') && (await p.textContent('.t-meta')).includes('Ish') && await visible(p, '.prio.p-high'));
    await p.reload(); await unlock(p); await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('.t-row'); check('[sahifa yangilash] qulfdan keyin vazifa saqlangan', (await titles(p)).includes('Birinchi vazifa')); await ctx.close();
  });

  await run('T3', async () => {
    const { ctx, p } = await boot(browser); const T = await today(p); const t = await mkTask(p, { title: 'Boshqarish', description: 'Tavsif matni', date: T, priority: 'low', categoryId: 'oila' }); await p.waitForSelector('.t-row');
    await p.click('#t-list .t-check'); await p.waitForFunction(() => document.querySelector('#t-done').textContent === '1'); check('[bajarildi] belgilash: qator o\'chiriladi (chizilgan), ko\'rsatkich va progress yangilanadi', (await p.$eval('.t-row', (e) => e.classList.contains('done'))) && (await p.getAttribute('.bar', 'aria-valuenow')) === '100' && (await p.textContent('#t-prog')).includes('1/1'));
    await p.click('.chip[data-f="done"]'); check('[filtr] "Bajarilgan" da ko\'rinadi', (await titles(p)).includes('Boshqarish')); await p.click('.chip[data-f="undone"]'); check('[filtr] "Bajarilmagan" da yo\'q', !(await titles(p)).includes('Boshqarish'));
    await p.click('.chip[data-f="all"]'); await p.click('#t-list .t-check'); await p.waitForFunction(() => document.querySelector('#t-done').textContent === '0'); check('[qayta faollashtirish] bajarilgan vazifa yana faol', !(await p.$eval('.t-row', (e) => e.classList.contains('done'))));
    await p.click('#t-list .t-main'); await p.waitForSelector('#d-title'); check('[tafsilot] nom, tavsif, kategoriya, ustuvorlik, holat', (await p.textContent('#d-title')) === 'Boshqarish' && (await p.textContent('#d-desc')) === 'Tavsif matni' && (await p.textContent('.kv')).includes('Oila') && (await p.textContent('.kv')).includes('Past') && (await p.textContent('#d-status')) === 'Bajarilmagan'); await layoutOk(p, 'vazifa tafsiloti');
    await p.click('#d-toggle'); await p.waitForFunction(() => document.querySelector('#d-status').textContent === 'Bajarilgan'); check('[tafsilot] "Bajarildi" tugmasi holatni o\'zgartiradi, matn "Qayta faollashtirish"', (await p.textContent('#d-toggle')) === 'Qayta faollashtirish'); await p.click('#d-toggle'); await p.waitForFunction(() => document.querySelector('#d-status').textContent === 'Bajarilmagan');
    await p.click('#d-edit'); await p.waitForSelector('#t-form'); check('[tahrirlash] forma mavjud qiymatlar bilan to\'ldirilgan', (await p.inputValue('#f-title')) === 'Boshqarish' && (await p.inputValue('#f-description')) === 'Tavsif matni' && (await p.inputValue('#f-categoryId')) === 'oila' && await p.isChecked('input[value=low]'));
    await p.fill('#f-title', 'Yangilangan nom'); await p.check('input[name=priority][value=high]'); await p.fill('#f-title', ''); await p.click('#f-save'); check('[tahrirlash] nomni bo\'sh qoldirib saqlab bo\'lmaydi', (await p.textContent('#e-title')).length > 0); await p.fill('#f-title', 'Yangilangan nom'); await p.click('#f-save');
    await p.waitForSelector('#d-title'); check('[tahrirlash] saqlangach tafsilot yangilangan, boshqa maydonlar saqlangan', (await p.textContent('#d-title')) === 'Yangilangan nom' && (await p.textContent('.kv')).includes('Yuqori') && (await p.textContent('#d-desc')) === 'Tavsif matni' && (await p.textContent('.kv')).includes('Oila'));
    await p.click('#d-del'); await p.waitForSelector('.modal'); check('[o\'chirish] tasdiqlash oynasi, nomi ko\'rsatiladi; vazifa hali o\'chmagan', (await p.textContent('.modal')).includes('Yangilangan nom') && (await titles(p, '#d-title')).length === 1); await layoutOk(p, 'o\'chirish tasdig\'i');
    await p.click('#m-no'); check('[o\'chirish] "Bekor qilish": vazifa saqlanadi', !(await visible(p, '.modal')) && (await ev(p, () => location.hash)).includes(t.id)); await p.click('#d-del'); await p.waitForSelector('.modal'); await p.keyboard.press('Escape'); check('[o\'chirish] Escape oynani yopadi', !(await visible(p, '.modal')));
    await p.click('#d-del'); await p.click('#m-ok'); await p.waitForSelector('.toast'); check('[o\'chirilgandan keyin] ro\'yxatga qaytadi, bo\'sh holat va "Bekor qilish" xabari', (await ev(p, () => location.hash)) === '#/reja' && (await p.textContent('.state h2')).includes('hali yo\'q') && (await p.textContent('.toast')).includes("o'chirildi") && await visible(p, '#t-undo'));
    await p.click('#t-undo'); await p.waitForSelector('.t-row'); check('[bekor qilish] vazifa xuddi shunday tiklandi', (await titles(p)).includes('Yangilangan nom') && !(await visible(p, '.toast')));
    await p.click('#t-list .t-main'); await p.waitForSelector('#d-del'); await p.click('#d-del'); await p.click('#m-ok'); await p.waitForSelector('.toast'); await sleep(6600); check('[bekor qilish] 6 soniyadan keyin xabar yo\'qoladi (qaytarib bo\'lmaydi)', !(await visible(p, '.toast')) && (await titles(p)).length === 0); await ctx.close();
  });

  await run('T4', async () => {
    const { ctx, p } = await boot(browser); const T = await today(p), Y = await addDaysP(p, T, -1), TM = await addDaysP(p, T, 1), F = await addDaysP(p, T, 10);
    const A = await mkTask(p, { title: 'A bugun past', date: T, priority: 'low' }); await mkTask(p, { title: 'B ertaga', date: TM, priority: 'medium' }); await mkTask(p, { title: 'C kelgusi', date: F, priority: 'high' }); await mkTask(p, { title: 'D kecha', date: Y, priority: 'high' });
    const E = await mkTask(p, { title: 'E kecha bajarilgan', date: Y, priority: 'low' }); await doneP(p, E.id, Y, true); await mkTask(p, { title: 'F bugun yuqori', date: T, priority: 'high' }); await mkTask(p, { title: 'G bugun 00:01', date: T, endTime: '00:01', priority: 'medium' });
    await p.waitForSelector('#t-list'); const f = async (k) => { await p.click(`.chip[data-f="${k}"]`); await sleep(120); return (await titles(p)).sort(); };
    eqc('[filtr] Bugun', await f('today'), ['A bugun past', 'F bugun yuqori', 'G bugun 00:01']); eqc('[filtr] Ertaga', await f('tomorrow'), ['B ertaga']); eqc('[filtr] Kelgusi', await f('upcoming'), ['B ertaga', 'C kelgusi']); eqc('[filtr] Bajarilgan', await f('done'), ['E kecha bajarilgan']);
    eqc('[filtr] Bajarilmagan', await f('undone'), ['A bugun past', 'B ertaga', 'C kelgusi', 'D kecha', 'F bugun yuqori', 'G bugun 00:01']); const od = await f('overdue'); check('[filtr] Muddati o\'tgan: kecha bajarilmagani; bajarilgani yo\'q', od.includes('D kecha') && !od.includes('E kecha bajarilgan') && !od.includes('B ertaga'), od.join());
    const all = await f('all'); check('[filtr] Barchasi hammasini ko\'rsatadi', all.length === 7, String(all.length)); await p.click('.chip[data-f="all"]');
    check('[ko\'rsatkichlar] bugun 3 ta (kecha/ertaga/kelgusi kirmaydi), bajarilgan 0, bajarilmagan 3, umumiy 1/7=14%', (await p.textContent('#t-total')) === '3' && (await p.textContent('#t-done')) === '0' && (await p.textContent('#t-pending')) === '3' && (await p.textContent('#t-overall')) === '14%', [await p.textContent('#t-total'), await p.textContent('#t-pending'), await p.textContent('#t-overall')].join('/'));
    check('[saralash] sana bo\'yicha: o\'tgan sanalar oldin, kelajak oxirida', (await titles(p)).slice(0, 2).every((x) => x.includes('kecha')) && (await titles(p)).at(-1) === 'C kelgusi'); await p.selectOption('#t-sort', 'priority'); await sleep(100); const byP = await titles(p);
    check('[saralash] ustuvorlik bo\'yicha: yuqori birinchi, past oxirida', ['C kelgusi', 'D kecha', 'F bugun yuqori'].every((x) => byP.indexOf(x) < 3) && byP.slice(-2).every((x) => x.includes('past') || x.includes('bajarilgan')), byP.join('|'));
    await p.click('.chip[data-f="today"]'); check('[saralash] tanlangan saralash filtr almashganda saqlanadi', (await p.inputValue('#t-sort')) === 'priority' && (await titles(p))[0] === 'F bugun yuqori');
    check('[muddati o\'tgan] bugungi vazifa tugash vaqti o\'tgan bo\'lsa belgilanadi', (await f('overdue')).includes('G bugun 00:01') || (await ev(p, () => new Date().getHours() === 0 && new Date().getMinutes() <= 1)));
    check('[yaqinlashayotgan] kartada bajarilmagan va muddati o\'tmagan vazifalar (o\'tgan va bajarilgan emas)', await (async () => { await p.click('.chip[data-f="all"]'); const up = await p.$$eval('#t-up .t-title', (e) => e.map((x) => x.textContent)); return up.includes('B ertaga') && !up.includes('D kecha') && !up.includes('E kecha bajarilgan') && !up.includes('C kelgusi'); })());
    await ctx.close();
  });
  function eqc(n, got, exp) { check(n, JSON.stringify(got) === JSON.stringify(exp), `${got.join('|')} != ${exp.join('|')}`); }

  await run('T5', async () => {
    const { ctx, p } = await boot(browser); const T = await today(p), start = await addDaysP(p, T, -4);
    await p.click('#t-new'); await p.waitForSelector('#t-form'); await fillForm(p, { title: 'Kunlik odat vazifa', date: start }); await selectOpt(p, 'repeat', 'daily'); await p.click('#f-save'); await p.waitForSelector('.t-row');
    await p.click('.chip[data-f="today"]'); await sleep(100); check('[takroriy] "Bugun" filtrida bugungi hodisa, takrorlanish belgisi', (await titles(p)).includes('Kunlik odat vazifa') && (await p.textContent('#t-list .t-meta')).includes('Har kuni'));
    await p.click('#t-list .t-check'); await p.waitForFunction(() => document.querySelector('#t-done').textContent === '1'); await p.click('#t-list .t-main'); await p.waitForSelector('#d-hist');
    check('[tarix] bugungi bajarilish "Bajarilish tarixi"da paydo bo\'ladi', (await p.$$('#d-hist li')).length === 1 && (await p.textContent('#d-hist')).includes('Bugun') && (await p.textContent('#d-status')) === 'Bajarilgan');
    await ev(p, () => { window.__off = 86400000; location.hash = '#/reja'; }); await p.waitForSelector('.t-stats'); await sleep(150); await p.click('.chip[data-f="today"]'); await sleep(100);
    check('[keyingi kun] yangi kunda vazifa yana bajarilmagan, bugungi hisob 1 ta bajarilmagan', (await p.textContent('#t-total')) === '1' && (await p.textContent('#t-done')) === '0' && (await p.$$('#t-list .t-row.done')).length === 0);
    await p.click('.chip[data-f="done"]'); await sleep(100); const dn = await p.$$eval('#t-list .t-meta', (e) => e.map((x) => x.textContent)); check('[keyingi kun] oldingi kunning bajarilganligi yo\'qolmadi ("Bajarilgan"da Kecha)', dn.length === 1 && dn[0].includes('Kecha'), dn.join('|'));
    await p.click('.chip[data-f="today"]'); await p.click('#t-list .t-check'); await p.waitForFunction(() => document.querySelector('#t-done').textContent === '1'); await ev(p, () => { window.__off = 3 * 86400000; location.hash = '#/reja'; }); await p.waitForSelector('.t-stats'); await sleep(150); await p.click('.chip[data-f="done"]'); await sleep(100);
    check('[tarix] 3 kundan keyin ikkala bajarilgan kun saqlanadi', (await titles(p)).length === 2); await p.click('#t-list .t-main'); await p.waitForSelector('#d-hist'); check('[tarix] tafsilotda ikkala kun, yangisi birinchi', (await p.$$('#d-hist li')).length === 2);
    const T1d = await addDaysP(p, T, 1); check('[tarix] tarix sanalari: yangi kun (T+1) birinchi, bugungi (T) oxirgi', (await p.$$eval('#d-hist small', (e) => e.map((x) => x.textContent))).join() === `${T1d},${T}`);
    await p.click('#d-hist li:last-child button'); await sleep(300); check('[tarix] tanlangan kunning bajarilishini bekor qilish faqat shu kunni o\'chiradi (T+1 qoladi)', (await p.$$eval('#d-hist small', (e) => e.map((x) => x.textContent))).join() === T1d);
    await p.click('#d-edit'); await p.waitForSelector('#t-form'); check('[tahrirlash] takrorlanish "Har kuni" saqlangan', (await p.inputValue('#f-repeat')) === 'daily'); await ctx.close();
  });

  await run('T6', async () => {
    const { ctx, p } = await boot(browser); await p.click('a[href="#/reja/kategoriyalar"]'); await p.waitForSelector('#c-list'); await layoutOk(p, 'kategoriyalar');
    check('[kategoriyalar] 6 ta boshlang\'ich', (await p.$$eval('.cat-in', (e) => e.map((x) => x.value))).join() === "Shaxsiy,Ish,O'qish,Sog'liq,Oila,Boshqa"); check('[kategoriyalar] "Boshqa" o\'chirib bo\'lmaydi (tugma yo\'q)', (await p.$$('.cat .c-del')).length === 5);
    await p.fill('#c-new', 'Sayohat'); await p.click('#c-add button'); await p.waitForFunction(() => document.querySelectorAll('.cat').length === 7); check('[kategoriyalar] yangi kategoriya qo\'shildi', (await p.$$eval('.cat-in', (e) => e.map((x) => x.value))).includes('Sayohat'));
    await p.fill('#c-new', 'sayohat'); await p.click('#c-add button'); await sleep(200); check('[kategoriyalar] takror nom rad etiladi', (await p.textContent('#c-err')).includes('bor')); await p.fill('#c-new', '  '); await p.click('#c-add button'); await sleep(150); check('[kategoriyalar] bo\'sh nom rad etiladi', (await p.textContent('#c-err')).includes('kiriting'));
    const li = p.locator('.cat').nth(6); await li.locator('.cat-in').fill('Safar'); await li.locator('.c-save').click(); await sleep(300); check('[kategoriyalar] nomini tahrirlash', (await p.$$eval('.cat-in', (e) => e.map((x) => x.value))).includes('Safar'));
    const id = (await p.$$eval('.cat', (e) => e.map((x) => x.dataset.id)))[6]; await mkTask(p, { title: 'Safar vazifasi', date: await today(p), categoryId: id });
    await p.locator('.cat').nth(6).locator('.c-del').click(); await p.waitForSelector('.modal'); check('[kategoriyalar] o\'chirish tasdiqlanadi', (await p.textContent('.modal')).includes('Boshqa')); await p.click('#m-no'); check('[kategoriyalar] bekor qilinsa saqlanadi', (await p.$$('.cat')).length === 7);
    await p.locator('.cat').nth(6).locator('.c-del').click(); await p.click('#m-ok'); await p.waitForFunction(() => document.querySelectorAll('.cat').length === 6); await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('.t-row'); check('[kategoriyalar] o\'chirilgach vazifa "Boshqa"ga ko\'chadi', (await p.textContent('.t-meta')).includes('Boshqa')); await ctx.close();
  });
  const scan = (p) => p.evaluate(async () => {
    const parts = [JSON.stringify(Object.entries(localStorage)), JSON.stringify(Object.entries(sessionStorage))];
    for (const { name } of await indexedDB.databases()) { const db = await new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); }); for (const s of [...db.objectStoreNames]) parts.push(JSON.stringify(await new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); }))); db.close(); }
    return parts.join('|');
  });

  await run('T7', async () => { // eslatmalar: faqat ilova ochiq paytida
    const { ctx, p } = await boot(browser); const T = await today(p);
    await ev(p, () => { const real = Date.now() - (window.__off || 0), n = new Date(real); window.__off = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 11, 50, 0).getTime() - real; }); // hozir 11:50
    const A = await mkTask(p, { title: 'Eslatma A', date: T, startTime: '12:00', reminder: 15 }); const B2 = await mkTask(p, { title: 'Eslatma B bajarilgan', date: T, startTime: '12:05', reminder: 15 }); await doneP(p, B2.id, T, true);
    await mkTask(p, { title: 'Eslatma C kech', date: T, startTime: '13:00', reminder: 15 }); await mkTask(p, { title: 'Eslatma D eski', date: T, startTime: '09:00', reminder: 0 }); await mkTask(p, { title: 'Eslatma E yo\'q', date: T, startTime: '12:01' });
    const ping = () => ev(p, () => document.dispatchEvent(new Event('visibilitychange'))); await ping(); await p.waitForSelector('.tb'); const bn = async () => p.$$eval('.tb', (e) => e.map((x) => x.textContent));
    let b = await bn(); check('[eslatma] vaqti kelgan vazifa uchun ilova ichida xabar (nom va vaqt bilan)', b.length === 1 && b[0].includes('Eslatma A') && b[0].includes('12:00'), b.join('|'));
    check('[eslatma] bajarilgan, vaqti kelmagan, oynasi o\'tgan va eslatmasiz vazifalar uchun xabar yo\'q', !b.join().includes('bajarilgan') && !b.join().includes('kech') && !b.join().includes('eski') && !b.join().includes("yo'q")); await layoutOk(p, 'eslatma banneri');
    check('[eslatma] "Ko\'rish" havolasi vazifa tafsilotiga olib boradi', (await p.getAttribute('.tb-a', 'href')).includes(A.id)); await p.click('.tb-x'); await ping(); await sleep(400); check('[eslatma] yopilgach bir xil eslatma qayta chiqmaydi', (await bn()).length === 0);
    await ev(p, () => { window.__off += 56 * 60000; }); await ping(); await p.waitForSelector('.tb'); b = await bn(); check('[eslatma] vaqt kelganda ("12:46") "kech" vazifa uchun xabar chiqadi', b.length === 1 && b[0].includes('Eslatma C kech'), b.join('|'));
    await p.click('#lockbtn'); await p.waitForSelector('#lock:not([hidden]) #pin'); check('[eslatma] qulflanganda banner tozalanadi (nom ekranda qolmaydi)', await lockedDom(p)); await ctx.close();
  });

  await run('T8', async () => { // xavfsizlik
    const { ctx, p, key } = await boot(browser); const T = await today(p), M = 'SIR-NOM-5521', D = 'SIR-TAVSIF-7733', C = 'SIR-KATEGORIYA-8841';
    const B = await mk(ctx); await B.goto(URL); await B.waitForSelector('#pin'); await ev(B, () => { window.__got = []; const ch = new BroadcastChannel('si-tasks'); ch.onmessage = (e) => window.__got.push(e.data); window.__ch = ch; });
    const t = await mkTask(p, { title: M, description: D, date: T, startTime: '09:00', reminder: 15, repeat: 'daily' }); await doneP(p, t.id, T, true); await ev(p, (n) => import('/js/modules/tasks-store.js').then((S) => S.addCategory(n)), C); await ev(p, ([id, d]) => import('/js/modules/tasks-store.js').then((S) => S.updateTask(id, { title: d })), [t.id, M + '-2']); await sleep(300);
    const dump = await scan(p), all = dump + consoleAll.join('|'); for (const [n, x] of [['nom', M], ['tavsif', D], ['kategoriya nomi', C], ['sana', T], ['vaqt', '09:00']]) check(`[sirlar] vazifa ${n} IndexedDB/localStorage/sessionStorage/konsolda ochiq emas`, !all.includes(x));
    check('[sirlar] PIN va tiklash kaliti ochiq saqlanmagan', !dump.includes(PIN) && !dump.includes(key) && !dump.includes(key.replace(/-/g, '')));
    const got = await ev(B, () => window.__got); check('[sirlar] tablararo xabarlar faqat {t:"changed"} (mazmun yo\'q), o\'zgarishlar sonida', got.length >= 4 && got.every((m) => JSON.stringify(m) === '{"t":"changed"}') && !JSON.stringify(got).includes(M), String(got.length));
    const inputs = await p.evaluate(() => 0); void inputs; await p.click('#lockbtn'); await p.waitForSelector('#lock:not([hidden]) #pin'); check('[qulf] qulflangan: ilova ichi, banner va sarlavha bo\'sh', await lockedDom(p));
    check('[qulf] qulflanganda vazifa ma\'lumotlar qatlami rad etadi', (await ev(p, () => import('/js/modules/tasks-store.js').then((S) => S.loadAll().then(() => 'OK', (e) => e.name)))) === 'LockedError' && (await ev(p, () => import('/js/modules/tasks-store.js').then((S) => S.createTask({ title: 'x', date: '2026-11-10' }).then(() => 'OK', (e) => e.name)))) === 'LockedError');
    await ev(p, (id) => { location.hash = `#/reja/${id}?d=${new Date().getFullYear()}-01-01`; }, t.id); await sleep(400); check('[qulf] qulflangan holatda vazifa manzili (#/reja/<id>) ochilmaydi, hech narsa chizilmaydi', await lockedDom(p));
    await unlock(p); await p.waitForSelector('#d-title'); check('[qulf] ochilgach xuddi shu vazifa tafsiloti tiklanadi', (await p.textContent('#d-title')) === M + '-2');
    await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('.t-stats'); await p.click('#t-list .t-main'); await p.waitForSelector('#d-del'); await p.click('#d-del'); await p.click('#m-ok'); await p.waitForSelector('.toast'); await p.click('#lockbtn'); await p.waitForSelector('#lock:not([hidden]) #pin'); await unlock(p);
    await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('.t-stats'); await sleep(300); check('[qulf] qulflangach "Bekor qilish" xabari va o\'chirilgan vazifa xotiradan tozalangan (qaytarib bo\'lmaydi)', !(await visible(p, '#t-undo')) && (await titles(p)).length === 0 && (await p.$$('.toast')).length === 0);
    await ctx.close();
  });

  await run('T9', async () => { // bir nechta tab: sinxron
    const { ctx, p: A } = await boot(browser); const T = await today(A); const B = await mk(ctx); await B.goto(URL); await unlock(B); await ev(B, () => { location.hash = '#/reja'; }); await B.waitForSelector('.t-stats');
    const t = await mkTask(A, { title: 'Tab sinxron', date: T }); await B.waitForSelector('#t-list .t-row', { timeout: 3000 }); check('[ko\'p tab] A da yaratilgan vazifa B da o\'zi paydo bo\'ladi (yangilamasdan)', (await titles(B)).includes('Tab sinxron'));
    await B.click('#t-list .t-check'); await A.waitForFunction(() => document.querySelector('#t-done').textContent === '1', null, { timeout: 3000 }); check('[ko\'p tab] B da bajarilgan holat A da ko\'rinadi', (await A.textContent('#t-done')) === '1');
    await ev(A, ([id, d]) => import('/js/modules/tasks-store.js').then((S) => S.updateTask(id, { title: 'Tab sinxron 2' })), [t.id]); await B.waitForFunction(() => document.querySelector('#t-list .t-title').textContent === 'Tab sinxron 2', null, { timeout: 3000 }); check('[ko\'p tab] tahrir boshqa tabda ko\'rinadi', true);
    await B.click('#t-list .t-main'); await B.waitForSelector('#d-del'); await B.click('#d-del'); await B.waitForSelector('.modal'); await mkTask(A, { title: 'Modal paytida', date: T }); await sleep(700); check('[ko\'p tab] boshqa tabdagi o\'zgarish ochiq tasdiqlash oynasini yo\'qotmaydi', await visible(B, '.modal')); await B.click('#m-no'); await sleep(900);
    await ev(B, () => { location.hash = '#/reja/kategoriyalar'; }); await B.waitForSelector('#c-new'); await B.click('#c-new'); await B.keyboard.type('Yozilyapti'); await mkTask(A, { title: 'Yozish paytida', date: T }); await sleep(700);
    check('[ko\'p tab] yozilayotgan matn boshqa tab o\'zgarishida o\'chmaydi', (await B.inputValue('#c-new')) === 'Yozilyapti'); await B.evaluate(() => { window.__old = document.querySelector('#c-new'); document.activeElement.blur(); }); await sleep(1600); const replaced = await B.evaluate(() => document.querySelector('#c-new') !== window.__old);
    check('[ko\'p tab] maydondan chiqilgach kechiktirilgan yangilanish bajariladi (element almashadi) va yozilgan matn saqlanadi', replaced && (await B.inputValue('#c-new')) === 'Yozilyapti', `almashdi=${replaced} qiymat=${await B.inputValue('#c-new')}`);
    await B.click('#c-add button'); await B.waitForFunction(() => document.querySelectorAll('.cat').length === 7, null, { timeout: 3000 }); check('[ko\'p tab] maydondan chiqqach "Qo\'shish" bosilishi buzilmaydi', true);
    const C = await mk(ctx); await C.goto(URL); await C.waitForSelector('#pin'); check('[ko\'p tab] yangi tab qulflangan, vazifalar ko\'rinmaydi', await lockedDom(C)); await unlock(C); await ev(C, () => { location.hash = '#/reja'; }); await C.waitForSelector('#t-list .t-row'); check('[ko\'p tab] ochilgach C eng so\'nggi ma\'lumotni ko\'radi', (await titles(C)).includes('Tab sinxron 2'));
    await ev(A, () => import('/js/modules/tasks-store.js').then(async (S) => { for (const x of (await S.loadAll()).tasks) await S.deleteTask(x.id); })); await C.waitForSelector('.state', { timeout: 3000 }); check('[ko\'p tab] A da o\'chirilgan vazifalar C da yo\'qoladi', (await titles(C)).length === 0); await ctx.close();
  });

  await run('T10', async () => { // offline va yangilash
    const { ctx, p } = await boot(browser); const T = await today(p); await mkTask(p, { title: 'Offline oldin', date: T }); await ev(p, () => navigator.serviceWorker.ready); await p.reload(); await unlock(p); await sleep(400);
    await ctx.setOffline(true); await p.reload(); await unlock(p); await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('#t-list .t-row'); check('[offline] internetsiz ilova ochiladi, avval yaratilgan vazifa ko\'rinadi', (await titles(p)).includes('Offline oldin') && await visible(p, '#offline'));
    await p.click('#t-new'); await p.waitForSelector('#t-form'); await fillForm(p, { title: 'Offline yaratilgan' }); await p.click('#f-save'); await p.waitForSelector('#t-list'); check('[offline] internetsiz yangi vazifa yaratiladi', (await titles(p)).includes('Offline yaratilgan'));
    await p.click('#t-list .t-check'); await sleep(300); check('[offline] internetsiz bajarildi deb belgilash ishlaydi', (await p.textContent('#t-done')) === '1'); await p.reload(); await unlock(p); await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('#t-list .t-row');
    check('[offline] sahifa yangilangach (hali offline) ikkala vazifa saqlangan', (await titles(p)).length === 2); await ctx.setOffline(false); await ctx.close();
  });

  await run('T11', async () => { // maket, klaviatura, orqaga tugmasi
    const { ctx, p } = await boot(browser); const T = await today(p); await mkTask(p, { title: 'W'.repeat(120), description: 'x'.repeat(300), date: T, priority: 'high', startTime: '08:00', endTime: '09:00', repeat: 'weekly' }); await mkTask(p, { title: 'Oddiy', date: T }); await p.waitForSelector('#t-list .t-row');
    await layoutOk(p, 'ro\'yxat (uzun nom)'); await p.click('#t-list .t-main'); await p.waitForSelector('#d-title'); await layoutOk(p, 'tafsilot (uzun nom, tavsif)'); await p.goBack(); await p.waitForSelector('#t-list'); check('[orqaga tugmasi] tafsilotdan ro\'yxatga qaytadi', (await ev(p, () => location.hash)) === '#/reja');
    await p.click('#t-new'); await p.waitForSelector('#t-form'); await p.goBack(); await p.waitForSelector('#t-list'); check('[orqaga tugmasi] formadan ro\'yxatga qaytadi, nav qayta ko\'rinadi', await visible(p, '#nav'));
    await p.click('#t-new'); await p.waitForSelector('#t-form'); check('[forma] FAB va navigatsiya yashirin (klaviatura uchun joy)', !(await visible(p, '.fab')) && !(await visible(p, '#nav')));
    await p.setViewportSize({ width: 360, height: 320 }); await p.focus('#f-description'); await sleep(500); const r = await p.$eval('#f-description', (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; });
    check('[klaviatura] 320px balandlikda (klaviatura ochiq) tavsif maydoni ko\'rinadi', r.top >= 0 && r.bottom <= r.vh, JSON.stringify(r)); await p.fill('#f-title', 'Klaviatura'); await p.$eval('#f-save', (e) => e.scrollIntoView({ block: 'end' })); const s = await p.$eval('#f-save', (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; });
    check('[klaviatura] "Saqlash" tugmasiga skroll qilib yetish mumkin va u yopilmagan (kasr piksel tolerantligi 1px)', s.top >= 0 && s.bottom <= s.vh + 1, JSON.stringify(s)); await p.click('#f-save'); await p.waitForSelector('#t-list'); check('[klaviatura] kichik ekranda ham saqlash ishlaydi', (await titles(p)).includes('Klaviatura'));
    await p.setViewportSize({ width: 360, height: 640 }); await p.click('a[href="#/reja/kategoriyalar"]'); await p.waitForSelector('#c-list'); await layoutOk(p, 'kategoriyalar'); await p.goBack(); await p.waitForSelector('#t-list'); check('[orqaga tugmasi] kategoriyalardan ro\'yxatga qaytadi', true);
    for (const w of [320, 412]) { await p.setViewportSize({ width: w, height: 700 }); await sleep(150); await layoutOk(p, `ro'yxat ${w}px`); } await ctx.close();
  });
  await run('T12', async () => { // buzilgan manzil (hash): URIError yo'q, ilova "Yuklanmoqda"da qotib qolmaydi
    const { ctx, p } = await boot(browser); const T = await today(p); await mkTask(p, { title: 'Hash sinovi', date: T });
    const idle = async () => { await sleep(250); return p.waitForSelector('#view [aria-busy="true"]', { state: 'detached', timeout: 4000 }).then(() => true, () => false); }; // hashchange render boshlanishini kutib, "Yuklanmoqda" yo'qolishini tekshiradi
    const lists = ['#/reja?d=%', '#/reja?d=%E0%A4%A', '#/reja?%=%&&d', '#/reja??d=2026-11-09', '#/reja?d=2026-11-09&d=%zz', '#/reja?d=' + '%E0'.repeat(3000)];
    const details = ['#/reja/%E0%A4%A', '#/reja/%', '#/reja/%00?d=%', '#/reja/' + '%'.repeat(5000)];
    for (const h of lists) { await ev(p, (x) => { location.hash = x; }, h); const ok = await idle(); const st = await p.evaluate(() => ({ list: !!document.querySelector('#t-list'), err: !!document.querySelector('.state-error'), busy: !!document.querySelector('#view [aria-busy="true"]') })); check(`[buzilgan hash] ${h.slice(0, 28)}: ro'yxat ochiladi, xato va qotib qolish yo'q`, ok && st.list && !st.err && !st.busy, JSON.stringify(st)); }
    for (const h of details) { await ev(p, (x) => { location.hash = x; }, h); const ok = await idle(); const txt = await p.$eval('#view', (e) => e.textContent); check(`[buzilgan hash] ${h.slice(0, 28)}: "Vazifa topilmadi" ko'rsatiladi, xato va qotib qolish yo'q`, ok && txt.includes('Vazifa topilmadi') && !(await p.$('.state-error')), txt.slice(0, 80)); }
    await ev(p, () => { location.hash = '#/reja?d=%E0%A4%A'; }); await p.reload(); await unlock(p); await ev(p, () => { location.hash = '#/reja?d=%'; }); await idle();
    check('[buzilgan hash] sahifa yangilanib qayta ochilganda ham ilova ishlaydi', await p.$('#t-list') !== null && (await titles(p)).includes('Hash sinovi'));
    await ev(p, () => { location.hash = '#/reja'; }); await idle(); check('[buzilgan hash] keyin oddiy manzilga qaytilganda ro\'yxat to\'g\'ri chiziladi', (await titles(p)).includes('Hash sinovi')); await ctx.close();
  });
  await run('T13', async () => { // maydon chegaralari (K.LIMITS bilan bir xil) va kategoriya xatosi
    const { ctx, p } = await boot(browser); const L = await ev(p, () => import('/js/modules/tasks-core.js').then((K) => K.LIMITS));
    await ev(p, () => { location.hash = '#/reja/yangi'; }); await p.waitForSelector('#t-form');
    const ml = (sel) => p.$eval(sel, (e) => e.maxLength);
    check('[maxlength] nom, tavsif chegarasi K.LIMITS bilan bir xil', (await ml('#f-title')) === L.title && (await ml('#f-description')) === L.description, JSON.stringify([await ml('#f-title'), await ml('#f-description'), L]));
    await p.click('#f-title'); await p.keyboard.type('x'.repeat(L.title + 15)); await p.click('#f-description'); await p.keyboard.insertText('y'.repeat(L.description + 50));
    check('[maxlength] nomga chegaradan uzun matn yozib bo\'lmaydi (qo\'lda yozish)', (await p.$eval('#f-title', (e) => e.value.length)) === L.title); check('[maxlength] tavsifga chegaradan uzun matn qo\'yib bo\'lmaydi', (await p.$eval('#f-description', (e) => e.value.length)) <= L.description);
    await p.$eval('#f-description', (e) => { e.value = 'z'.repeat(5000); }); await p.fill('#f-title', 'Chegara'); await p.click('#f-save'); await p.waitForSelector('#e-description:not(:empty)');
    check('[maxlength] dasturiy usulda juda uzun tavsif berilsa tekshiruv baribir xato ko\'rsatadi', (await p.textContent('#e-description')).includes(String(L.description)) && await p.$('#t-form') !== null);
    await ev(p, () => { location.hash = '#/reja/kategoriyalar'; }); await p.waitForSelector('#c-new');
    check('[maxlength] kategoriya nomi chegarasi K.LIMITS bilan bir xil (yangi va mavjud)', (await ml('#c-new')) === L.categoryName && (await p.$$eval('.cat-in', (e) => e.every((x) => x.maxLength))) && (await p.$$eval('.cat-in', (e, n) => e.every((x) => x.maxLength === n), L.categoryName)));
    // --- kategoriya ---
    const kat = await ev(p, () => import('/js/modules/tasks-store.js').then((S) => S.addCategory('Vaqtincha'))); const T = await today(p);
    const t = await mkTask(p, { title: 'Kategoriyali', date: T, categoryId: kat.id });
    await ev(p, (id) => { location.hash = `#/reja/${id}/tahrir`; }, t.id); await p.waitForSelector('#t-form'); check('[kategoriya] tahrirlash formasida vazifaning kategoriyasi tanlangan, izoh yo\'q', (await p.$eval('#f-categoryId', (e) => e.value)) === kat.id && !(await p.$('#f-cat-note')));
    await ev(p, (id) => import('/js/modules/tasks-store.js').then((S) => S.deleteCategory(id)), kat.id); // boshqa tabda o'chirildi deb faraz: forma eski ro'yxat bilan qoldi
    await p.fill('#f-title', 'Yangilangan'); await p.selectOption('#f-categoryId', kat.id); await p.click('#f-save'); await p.waitForSelector('#e-categoryId:not(:empty)');
    check('[kategoriya] o\'chirilgan kategoriya bilan saqlashda xato aynan kategoriya maydoni ostida ko\'rinadi (jimgina o\'zgarmaydi)', (await p.textContent('#e-categoryId')).length > 10 && (await p.$eval('#f-categoryId', (e) => e.getAttribute('aria-invalid'))) === 'true' && await p.$('#t-form') !== null);
    check('[kategoriya] xatodan keyin kategoriya ro\'yxati yangilanadi (o\'chirilgani yo\'q), "Boshqa" tanlangan', (await p.$$eval('#f-categoryId option', (o) => o.map((x) => x.value))).includes(kat.id) === false && (await p.$eval('#f-categoryId', (e) => e.value)) === 'boshqa');
    check('[kategoriya] xatoda vazifa saqlanmagan', (await ev(p, (id) => import('/js/modules/tasks-store.js').then((S) => S.getTask(id)), t.id)).title === 'Kategoriyali');
    await p.click('#f-save'); await p.waitForSelector('#t-list, #d-title', { timeout: 5000 }); check('[kategoriya] ro\'yxat yangilangach qayta saqlash ishlaydi', (await ev(p, (id) => import('/js/modules/tasks-store.js').then((S) => S.getTask(id)), t.id)).title === 'Yangilangan');
    // eskirgan kategoriyali yozuv: forma jimgina birinchi variantga emas, "Boshqa"ga o'tadi va aytadi
    const raw = await ev(p, ([d]) => import('/js/database.js').then((db) => db.add('tasks', { kind: 'task', title: 'Eskirgan', description: '', date: d, startTime: null, endTime: null, priority: 'medium', categoryId: 'ochirilgan', repeat: 'none', reminder: null, status: 'active', doneAt: null, schemaV: 1 })), [T]);
    await ev(p, (id) => { location.hash = `#/reja/${id}/tahrir`; }, raw.id); await p.waitForSelector('#t-form');
    check('[kategoriya] eskirgan kategoriyali vazifada "Boshqa" tanlanadi va izoh ko\'rsatiladi', (await p.$eval('#f-categoryId', (e) => e.value)) === 'boshqa' && (await p.$('#f-cat-note')) !== null);
    await p.fill('#f-title', 'Tuzatilgan'); await p.click('#f-save'); await p.waitForSelector('#t-list, #d-title', { timeout: 5000 }); const after = await ev(p, (id) => import('/js/modules/tasks-store.js').then((S) => S.getTask(id)), raw.id); check('[kategoriya] saqlangach vazifa "Boshqa" kategoriyada, nom yangilangan', after.title === 'Tuzatilgan' && after.categoryId === 'boshqa');
    await layoutOk(p, 'kategoriya sinovidan keyin'); await ctx.close();
  });
  await run('T14', async () => { // boshqa oyna bazani yangilaydi (yangi versiya): eski oynalar qulflanadi va xabar beradi, ma'lumot saqlanadi, yangi oyna bloklanmaydi
    const { ctx, p } = await boot(browser); const T = await today(p); await mkTask(p, { title: 'Eski oyna', date: T });
    const B = await mk(ctx); await B.goto(URL); await unlock(B); // ikkinchi ochiq tab ham eski versiyada
    await ev(p, async () => { const { DB_NAME, DB_VERSION } = await import('/js/schema.js'); window.__other = await new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, DB_VERSION + 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('yangi oyna bloklandi')); }); });
    await p.waitForSelector('[data-action="reload"]'); await B.waitForSelector('[data-action="reload"]');
    for (const [n, pg] of [['A', p], ['B', B]]) {
      check(`[yangilanish] tab ${n}: "Ilova yangilandi" xabari va "Sahifani yangilash" tugmasi ko'rinadi`, (await pg.textContent('#lock')).includes('Ilova yangilandi') && await visible(pg, '#lock [data-action="reload"]'));
      check(`[yangilanish] tab ${n}: ilova qulflangan, ekran tozalangan, DB amallari LockedError`, await lockedDom(pg) && (await ev(pg, () => import('/js/lock.js').then((l) => l.isLocked()))) === true && (await ev(pg, () => import('/js/database.js').then((d) => d.getAll('tasks').then(() => 'OK', (e) => e.name)))) === 'LockedError');
    }
    await layoutOk(p, 'ilova yangilandi ekrani');
    const info = await ev(p, () => new Promise((res) => { const r = window.__other.transaction('tasks').objectStore('tasks').getAll(); r.onsuccess = () => res({ n: r.result.length, plain: JSON.stringify(r.result).includes('Eski oyna') }); }));
    check('[yangilanish] yangi oyna ma\'lumotni ko\'radi (yozuv saqlangan), u shifrlangan holda', info.n === 1 && info.plain === false, JSON.stringify(info)); await ev(p, () => window.__other.close()); await ctx.close();
  });
  await run('T15', async () => { // ochilishda boshqa oyna bazani band qilsa: "Kutilmoqda", so'rov rad etilmaydi, oyna yopilgach ilova o'zi davom etadi
    const ctx = await newCtx(browser), H = await mk(ctx), p = await mk(ctx); const origin = URL.slice(0, URL.lastIndexOf('/'));
    await H.goto(`${origin}/manifest.json`);
    await ev(H, async () => { const { DB_NAME, MIGRATIONS } = await import(`${location.origin}/js/schema.js`); window.__h = await new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => MIGRATIONS[0].up(r.result, r.transaction); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }); // versionchange'ga javob bermaydigan eski oyna
    await p.goto(URL); await p.waitForSelector('#lock:not([hidden]) h1'); await sleep(500);
    check('[bloklangan] "Kutilmoqda" xabari ko\'rinadi, xato ekrani va PIN maydoni yo\'q', (await p.textContent('#lock h1')).includes('Kutilmoqda') && !(await p.$('#pin')) && !(await p.$('.state-error'))); await layoutOk(p, 'kutilmoqda ekrani');
    await ev(H, () => window.__h.close()); await p.waitForSelector('#pin', { timeout: 10000 });
    check('[bloklangan] eski oyna yopilgach ilova o\'zi davom etadi: "Kutilmoqda" yo\'qoladi, PIN sozlash ekrani chiqadi', !(await p.textContent('#lock')).includes('Kutilmoqda') && await visible(p, '#pin'));
    const v = await ev(p, async () => { const { DB_NAME, DB_VERSION } = await import('/js/schema.js'); return new Promise((res) => { const r = indexedDB.open(DB_NAME); r.onsuccess = () => { const d = r.result, o = { v: d.version, st: d.objectStoreNames.length, want: DB_VERSION }; d.close(); res(o); }; }); });
    check('[bloklangan] baza kutilgan versiya va store\'lar bilan yangilangan', v.v === v.want && v.st === 14, JSON.stringify(v)); await ctx.close();
  });
  await run('T16', async () => { // brauzer bazani kutilmaganda yopsa/tozalasa (CDP orqali): ilova qulflanadi va ma'lumotsiz davom etmaydi
    const { ctx, p } = await boot(browser); const T = await today(p); await mkTask(p, { title: 'CDP sinovi', date: T }); const origin = URL.slice(0, URL.lastIndexOf('/'));
    const cdp = await ctx.newCDPSession(p); await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'indexeddb' }); await sleep(1500);
    const txt = await p.textContent('#lock'); console.log('   T16 xabar:', txt.slice(0, 90)); const lockedNow = await ev(p, () => import('/js/lock.js').then((l) => l.isLocked()));
    check('[majburiy yopilish] baza tozalansa ilova qulflanadi va xabar ko\'rsatadi', lockedNow === true && /yangilandi|aloqa uzildi/.test(txt) && await visible(p, '#lock [data-action="reload"]'), txt.slice(0, 80)); await ctx.close();
  });
  await run('T17', async () => { // tasdiq oynasi ochiq paytida kelgan yangilanish kechiktiriladi va oyna yopilgach bajariladi (ui-kit ulanishi)
    const { ctx, p } = await boot(browser); const T = await today(p); const t = await mkTask(p, { title: 'Dialog sinovi', date: T });
    const H = await mk(ctx); await H.goto(`${URL.slice(0, URL.lastIndexOf('/'))}/manifest.json`); const ping = () => ev(H, () => { const c = new BroadcastChannel('si-tasks'); c.postMessage({ t: 'changed' }); c.close(); });
    await ev(p, (id) => { location.hash = `#/reja/${id}`; }, t.id); await p.waitForSelector('#d-del'); await ev(p, () => { document.querySelector('#d-title').dataset.marker = 'eski'; });
    await ping(); await sleep(500); check('[dialog] oyna yo\'q paytida tashqi o\'zgarish ekranni yangilaydi (belgi yo\'qoladi)', await p.$eval('#d-title', (e) => e.dataset.marker === undefined));
    await ev(p, () => { document.querySelector('#d-title').dataset.marker = 'eski'; }); await p.click('#d-del'); await p.waitForSelector('.modal');
    await ping(); await sleep(600); check('[dialog] oyna ochiq paytida yangilanish kechiktiriladi: oyna va belgi joyida', await visible(p, '.modal') && await p.$eval('#d-title', (e) => e.dataset.marker === 'eski'));
    await p.click('#m-no'); await sleep(700); check('[dialog] oyna yopilgach kechiktirilgan yangilanish bajariladi (belgi yo\'qoladi), oyna yo\'q', !(await p.$('.modal')) && await p.$eval('#d-title', (e) => e.dataset.marker === undefined));
    check('[dialog] bekor qilingach vazifa o\'chmagan', (await ev(p, (id) => import('/js/modules/tasks-store.js').then((S) => S.getTask(id)), t.id)).title === 'Dialog sinovi'); await ctx.close();
  });
  await run('T18', async () => { // jim yangilash rejalovchisi: forma ochiq paytida tashqi o'zgarish ekranni qayta chizmaydi (ui-kit ulanishi)
    const { ctx, p } = await boot(browser); const T = await today(p); await mkTask(p, { title: 'Reja sinovi', date: T });
    const H = await mk(ctx); await H.goto(`${URL.slice(0, URL.lastIndexOf('/'))}/manifest.json`); const ping = () => ev(H, () => { const c = new BroadcastChannel('si-tasks'); c.postMessage({ t: 'changed' }); c.close(); });
    await ev(p, () => { location.hash = '#/reja/yangi'; }); await p.waitForSelector('#t-form'); await p.fill('#f-title', 'Qoralama'); await p.check('input[name="priority"][value="high"]'); await ev(p, () => { document.activeElement && document.activeElement.blur(); document.querySelector('#f-title').dataset.marker = 'bor'; });
    await ping(); await sleep(700); check('[forma] forma ochiq paytida tashqi o\'zgarish ekranni qayta chizmaydi: yozilgan qoralama va tanlov saqlanadi', await p.$eval('#f-title', (e) => e.value === 'Qoralama' && e.dataset.marker === 'bor') && (await p.$eval('input[name="priority"][value="high"]', (e) => e.checked)));
    await ctx.close();
  });
  await run('T19', async () => { // boshqa sahifada turganda tashqi o'zgarish Vazifalar ro'yxatini o'sha ekran ustiga chizmaydi (ui-kit ulanishi: manzil sharti)
    const { ctx, p } = await boot(browser); const T = await today(p); await mkTask(p, { title: 'Manzil sinovi', date: T });
    const H = await mk(ctx); await H.goto(`${URL.slice(0, URL.lastIndexOf('/'))}/manifest.json`); const ping = () => ev(H, () => { const c = new BroadcastChannel('si-tasks'); c.postMessage({ t: 'changed' }); c.close(); });
    await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('#t-list');
    for (const h of ['#/odatlar', '#/sozlamalar', '#/bosh']) {
      await ev(p, (x) => { location.hash = x; }, h); await sleep(500); const before = await p.$eval('#view', (e) => e.innerHTML); await ping(); await sleep(600);
      check(`[manzil] ${h}: tashqi o'zgarishdan keyin ekran o'zgarmaydi, Vazifalar ro'yxati chizilmaydi`, (await p.$eval('#view', (e) => e.innerHTML)) === before && !(await p.$('#t-list')));
    }
    await ev(p, () => { location.hash = '#/reja'; }); await p.waitForSelector('#t-list'); await ev(p, () => { document.querySelector('#t-list').dataset.marker = 'bor'; }); await ping(); await sleep(600);
    check('[manzil] #/reja da turganda tashqi o\'zgarish ro\'yxatni yangilaydi (belgi yo\'qoladi)', await p.$eval('#t-list', (e) => e.dataset.marker === undefined)); await ctx.close();
  });
} finally { await browser.close(); }
notes.forEach((n) => console.log('ESLATMA:', n)); console.log(`\n${pass} o'tdi, ${fails.length} muvaffaqiyatsiz`); fails.forEach((f) => console.log(' -', f)); process.exit(fails.length ? 1 : 0);
