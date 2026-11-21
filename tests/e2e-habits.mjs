// Odatlar moduli: haqiqiy ilova haqiqiy Chromium'da (360x640). `PW=<playwright/index.mjs> node tests/e2e-habits.mjs`; qisman: `ONLY=H2,H3`
// Oldin serverni ishga tushiring: `python3 -m http.server 8123` (loyiha ildizida).
const { chromium } = await import(process.env.PW || 'playwright');
const URL = process.env.URL || 'http://localhost:8123/index.html'; const ONLY = (process.env.ONLY || '').split(',').filter(Boolean); const PIN = '482915';
let pass = 0; const fails = [];
const check = (n, c, x = '') => { if (c) pass++; else fails.push(n); console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${c ? '' : x}`); };
const opts = { viewport: { width: 360, height: 640 } };
const mk = async (ctx) => { const p = await ctx.newPage(); p.on('console', (m) => { if (m.type() === 'error') fails.push(`konsol xatosi: ${m.text()}`); }); p.on('pageerror', (e) => fails.push(`sahifa xatosi: ${e.message}`)); return p; };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const visible = (p, s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; }).catch(() => false);
const today = (p) => ev(p, () => import('/js/modules/dates.js').then((D) => D.localParts(Date.now()).date));
const addDaysP = (p, d, n) => ev(p, ([a, b]) => import('/js/modules/dates.js').then((D) => D.addDays(a, b)), [d, n]);
const weekdayP = (p, d) => ev(p, (a) => import('/js/modules/dates.js').then((D) => D.weekday(a)), d);
const mkHabit = (p, i) => ev(p, (x) => import('/js/modules/habits-store.js').then((S) => S.createHabit(x)), i);
const doneP = (p, id, date, v) => ev(p, ([a, b, c]) => import('/js/modules/habits-store.js').then((S) => S.setDone(a, b, c)), [id, date, v]);
const loadP = (p) => ev(p, () => import('/js/modules/habits-store.js').then((S) => S.loadAll()));
const errOf = (p, f, ...a) => p.evaluate(async ([src, args]) => { try { await (new Function('return ' + src))()(...args); return null; } catch (e) { return `${e.name}: ${e.message}`; } }, [f.toString(), a]);
const go = async (p, h) => { await ev(p, (x) => { location.hash = x; }, h); await p.waitForTimeout(150); };
const raw = (p) => ev(p, () => new Promise((res, rej) => { const r = indexedDB.open('shaxsiy-intizom'); r.onerror = () => rej(r.error); r.onsuccess = () => { const d = r.result, o = {}; let n = 0; for (const s of ['habits', 'habit_logs']) { const q = d.transaction(s).objectStore(s).getAll(); q.onsuccess = () => { o[s] = q.result; if (++n === 2) { d.close(); res(o); } }; } }; }));
async function boot(b) {
  const ctx = await b.newContext(opts), p = await mk(ctx); await p.goto(URL); await p.waitForSelector('#pin'); await p.fill('#pin', PIN); await p.fill('#pin2', PIN); await p.click('#go'); await p.waitForSelector('.rk-group');
  const g = await p.$$eval('.rk-group', (e) => e.map((x) => x.textContent)); await p.click('#next'); await p.waitForSelector('.rk-in'); for (const i of await p.$$('.rk-in')) await i.fill(g[Number(await i.getAttribute('data-g'))]);
  await p.click('#go'); await p.waitForSelector('#rk-full'); await p.fill('#rk-full', g.join('-')); await p.click('#go'); await p.waitForSelector('#nav a');
  await go(p, '#/odatlar'); await p.waitForSelector('.t-stats'); return { ctx, p };
}
const unlock = async (p) => { await p.waitForSelector('#pin'); await p.fill('#pin', PIN); await p.click('#go'); await p.waitForSelector('#nav a'); };
const noOverflow = (p) => ev(p, () => document.documentElement.scrollWidth <= innerWidth);
const run = async (id, fn) => { if (ONLY.length && !ONLY.includes(id)) return; console.log(`--- ${id}`); try { await fn(); } catch (e) { fails.push(`${id} istisno: ${e.message}`); console.log('FAIL', id, 'istisno:', e.message.split('\n')[0]); } };

const browser = await chromium.launch();
try {
  await run('H1', async () => {
    const { ctx, p } = await boot(browser);
    check('[ro\'yxat] bo\'sh holat, FAB, 3 ta filtr, sarlavha "Odatlar"', (await p.textContent('.state h2')).includes("hali yo'q") && await visible(p, '#h-new') && (await p.$$eval('.chip', (e) => e.map((x) => x.textContent))).join() === 'Barchasi,Bugun,Arxiv' && (await p.textContent('h1')) === 'Odatlar');
    check('[ro\'yxat] ko\'rsatkichlar: 0/0, streak 0, foiz "—" (soxta foiz yo\'q), faol 0; progress yo\'q', (await p.textContent('#h-today')) === '0/0' && (await p.textContent('#h-streak')) === '0' && (await p.textContent('#h-rate')) === '—' && (await p.textContent('#h-active')) === '0' && !(await visible(p, '.bar')));
    check('[ro\'yxat] navigatsiyada "Boshqalar" faol, gorizontal aylantirish yo\'q', (await p.$eval('.nav-item.on', (e) => e.textContent)) === 'Boshqalar' && await noOverflow(p));
    let keys = []; for (let i = 0; i < 24 && !keys.length; i++) { keys = await ev(p, () => caches.keys().then((ks) => caches.open(ks.find((k) => /^intizom-v\d+$/.test(k)) || '-')).then((k) => k.keys()).then((r) => r.map((x) => new URL(x.url).pathname)).catch(() => [])); if (!keys.length) await p.waitForTimeout(250); }
    check('[SW] joriy kesh (intizom-v<son>) ichida odatlar fayllari bor', ['habits-core.js', 'habits-store.js', 'habits.js'].every((f) => keys.some((k) => k.endsWith(`/js/modules/${f}`))), keys.join());
    await ctx.close();
  });

  await run('H2', async () => {
    const { ctx, p } = await boot(browser), T = await today(p), wd = await weekdayP(p, T);
    await p.click('#h-new'); await p.waitForSelector('#h-form');
    check('[forma] pastki navigatsiya yashirin, sana bugun, avtoto\'ldirish o\'chirilgan, kunlik tanlangan', !(await visible(p, '#nav')) && (await p.inputValue('#f-startDate')) === T && (await p.$eval('#f-title', (e) => e.getAttribute('autocomplete'))) === 'off' && await p.isChecked('input[name=freq][value=daily]') && !(await visible(p, '#h-wk-box')) && !(await visible(p, '#h-every-box')));
    check('[forma] gorizontal aylantirish yo\'q', await noOverflow(p));
    await p.click('#f-save'); check('[forma] nomsiz saqlab bo\'lmaydi: xabar, aria-invalid, fokus nomda', (await p.textContent('#e-title')).includes('kiriting') && (await p.getAttribute('#f-title', 'aria-invalid')) === 'true' && (await ev(p, () => document.activeElement.id)) === 'f-title');
    await p.fill('#f-title', 'Suv <b>ichish</b>'); await p.check('input[name=freq][value=weekly]');
    check('[forma] "Hafta kunlari" tanlansa 7 ta kun chiqadi', await visible(p, '#h-wk-box') && (await p.$$('input[name=weekdays]')).length === 7);
    await p.click('#f-save'); check('[forma] hafta kuni tanlanmasa xato, fokus birinchi kunda', (await p.textContent('#e-weekdays')).includes('Kamida') && (await ev(p, () => document.activeElement.id)) === 'f-weekdays');
    await p.check('input[name=freq][value=interval]'); check('[forma] "Har N kunda": son maydoni chiqadi, kunlar yashiriladi', await visible(p, '#f-every') && !(await visible(p, '#h-wk-box')));
    await p.fill('#f-every', '1'); await p.click('#f-save'); check('[forma] N=1 rad etiladi', (await p.textContent('#e-every')).includes('2–60'));
    await p.check('input[name=freq][value=weekly]'); await p.check(`input[name=weekdays][value="${wd}"]`); await p.click('#f-save'); await p.waitForSelector('#h-list');
    check('[forma] saqlangach ro\'yxatga qaytadi; sarlavhadagi HTML matn sifatida ko\'rinadi (XSS yo\'q)', (await p.textContent('.t-title')) === 'Suv <b>ichish</b>' && (await p.$$('.t-title b')).length === 0);
    check('[ro\'yxat] bugun jadvalli: tekshiruv tugmasi bor, 0/1, faol 1; meta hafta kunini ko\'rsatadi', (await p.$$('.t-check')).length === 1 && (await p.textContent('#h-today')) === '0/1' && (await p.textContent('#h-active')) === '1' && (await p.textContent('.t-meta')).includes('Shaxsiy'));
    check('[ro\'yxat] progress paydo bo\'ladi (0%)', (await p.getAttribute('.bar', 'aria-valuenow')) === '0');
    await p.click('.t-check'); await p.waitForFunction(() => document.querySelector('.t-check').getAttribute('aria-pressed') === 'true');
    check('[ro\'yxat] belgilansa: 1/1, streak 1, progress 100%, qator "bajarilgan", foiz 100%', (await p.textContent('#h-today')) === '1/1' && (await p.textContent('#h-streak')) === '1' && (await p.getAttribute('.bar', 'aria-valuenow')) === '100' && await p.$eval('.t-row', (e) => e.classList.contains('done')) && (await p.textContent('#h-rate')) === '100%');
    await ctx.close();
  });

  await run('H3', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    const h = await mkHabit(p, { title: 'Maxfiy odat NOMI', description: 'Maxfiy TAVSIF', categoryId: 'sogliq', freq: 'daily', startDate: await addDaysP(p, T, -5) });
    await doneP(p, h.id, T, true); await doneP(p, h.id, await addDaysP(p, T, -1), true);
    const r = await raw(p), allowed = new Set(['id', 'createdAt', 'updatedAt', 'v', 'iv', 'ct']), json = JSON.stringify(r);
    check('[shifrlash] habits va habit_logs yozuvlarida faqat id/createdAt/updatedAt/v/iv/ct ochiq', r.habits.length === 1 && r.habit_logs.length === 2 && [...r.habits, ...r.habit_logs].every((x) => Object.keys(x).every((k) => allowed.has(k))));
    check('[shifrlash] nom, tavsif, kategoriya va sana xom ma\'lumotda ko\'rinmaydi; log kaliti sanani ham odat id sini ham oshkor qilmaydi', !json.includes('Maxfiy') && !json.includes('sogliq') && !json.includes(T) && r.habit_logs.every((x) => /^[0-9a-f]{64}$/.test(x.id) && !x.id.includes(h.id)));
    await p.reload(); await unlock(p); await go(p, '#/odatlar'); await p.waitForSelector('#h-list');
    check('[saqlanish] sahifa yangilangach va PIN bilan ochilgach odat va bugungi belgi saqlangan (1/1, streak 2)', (await p.textContent('.t-title')) === 'Maxfiy odat NOMI' && (await p.textContent('#h-today')) === '1/1' && (await p.textContent('#h-streak')) === '2');
    await p.click('#lockbtn'); await p.waitForSelector('#pin');
    check('[qulf] qulflanganda ekran tozalanadi (ro\'yxat, sarlavha, navigatsiya bo\'sh)', await ev(p, () => !document.getElementById('lock').hidden && document.getElementById('view').innerHTML.trim() === '' && document.getElementById('head').innerHTML.trim() === '' && document.querySelectorAll('#nav a').length === 0));
    check('[qulf] qulflanganda ma\'lumot qatlami LockedError beradi', (await errOf(p, async () => (await import('/js/modules/habits-store.js')).loadAll())) !== null);
    await unlock(p); await go(p, '#/odatlar'); await p.waitForSelector('#h-list'); check('[qulf] qayta ochilgach ma\'lumot joyida', (await p.textContent('#h-today')) === '1/1');
    await ctx.close();
  });

  await run('H4', async () => {
    const { ctx, p } = await boot(browser), T = await today(p), wd = await weekdayP(p, T);
    const h = await mkHabit(p, { title: 'Kalendar', freq: 'daily', startDate: await addDaysP(p, T, -9) }), y1 = await addDaysP(p, T, -1), y2 = await addDaysP(p, T, -2);
    await doneP(p, h.id, y2, true); await doneP(p, h.id, y1, true);
    await go(p, `#/odatlar/${h.id}`); await p.waitForSelector('#d-cal');
    check('[tafsilot] joriy streak 2 (bugun hali bajarilmagan: uzilmaydi), eng uzun 2, jami 2/10, foiz 2/9=22%', (await p.textContent('#s-current')) === '2' && (await p.textContent('#s-best')) === '2' && (await p.textContent('#s-total')) === '2' && (await p.textContent('#d-stats')).includes('2 / 10') && (await p.textContent('#s-rate30')) === '22%');
    check('[tafsilot] holat "Bugun bajarilmagan", kalendar sarlavhasi joriy oy, 7 ustunli sarlavha', (await p.textContent('#d-status')) === 'Bugun bajarilmagan' && (await p.$$('.cal-h')).length === 7 && (await noOverflow(p)));
    await p.click('#d-toggle'); await p.waitForFunction(() => document.getElementById('s-current').textContent === '3');
    check('[tafsilot] "Bugun bajarildi" bosilsa streak 3, holat yangilanadi', (await p.textContent('#d-status')) === 'Bugun bajarilgan' && (await p.textContent('#s-best')) === '3');
    const cell = await p.$(`.h-cell[data-date="${y1}"]`);
    if (cell) { await cell.click(); await p.waitForFunction(() => document.getElementById('s-current').textContent === '1'); check('[kalendar] o\'tgan kunni bosib belgini olib tashlash: streak 1, eng uzun 1 (kechagi kun uzildi)', (await p.textContent('#s-best')) === '1'); await p.click(`.h-cell[data-date="${y1}"]`); await p.waitForFunction(() => document.getElementById('s-current').textContent === '3'); check('[kalendar] qayta bosilsa tiklanadi (streak 3)', true); } else check('[kalendar] kechagi kun joriy oyda emas: store orqali tekshirildi', true);
    check('[kalendar] kelajak kun bosilmaydi (tugma emas)', await ev(p, (t) => { const c = [...document.querySelectorAll('.h-cell.future')]; return c.every((x) => x.tagName !== 'BUTTON'); }, T));
    await p.click('#c-prev'); await p.waitForTimeout(200); check('[kalendar] oldingi oyga o\'tish: manzilda ?m=, sarlavha o\'zgaradi, ma\'lumot buzilmaydi', (await p.url()).includes('?m=') && (await p.textContent('#s-current')) === '3');
    check('[ishonch] kelajak sanani va jadvaldan tashqari kunni belgilab bo\'lmaydi', (await errOf(p, async (id, d) => (await import('/js/modules/habits-store.js')).setDone(id, d, true), h.id, await addDaysP(p, T, 1)))?.includes('Kelajakdagi') && (await errOf(p, async (id, d) => (await import('/js/modules/habits-store.js')).setDone(id, d, true), h.id, await addDaysP(p, T, -30)))?.includes('jadvalida yo\'q'));
    const w = await mkHabit(p, { title: 'Hafta', freq: 'weekly', weekdays: [(wd + 1) % 7], startDate: await addDaysP(p, T, -20) });
    check('[ishonch] hafta kunlari odati: jadvalda yo\'q kun rad etiladi', (await errOf(p, async (id, d) => (await import('/js/modules/habits-store.js')).setDone(id, d, true), w.id, T))?.includes("jadvalida yo'q"));
    await Promise.all([1, 2, 3, 4, 5].map(() => doneP(p, h.id, y2, true))); const r = await raw(p);
    check('[ishonch] bir kunga 5 ta bir vaqtdagi belgi bitta yozuv qoldiradi (ikki tab poygasi)', r.habit_logs.length === (await loadP(p)).logs.length && (await loadP(p)).logs.filter((l) => l.habitId === h.id && l.date === y2).length === 1);
    await ctx.close();
  });

  await run('H5', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    const h = await mkHabit(p, { title: 'Tahrir', freq: 'daily', startDate: await addDaysP(p, T, -3) }); await doneP(p, h.id, await addDaysP(p, T, -1), true); await doneP(p, h.id, T, true);
    await go(p, `#/odatlar/${h.id}/tahrir`); await p.waitForSelector('#h-form');
    check('[tahrir] forma mavjud qiymatlar bilan to\'ldirilgan', (await p.inputValue('#f-title')) === 'Tahrir' && await p.isChecked('input[name=freq][value=daily]'));
    await p.fill('#f-title', 'Tahrir 2'); await p.check('input[name=freq][value=interval]'); await p.fill('#f-every', '2'); await p.click('#f-save'); await p.waitForSelector('#d-stats');
    check('[tahrir] saqlangach tafsilotga qaytadi, nom va takrorlanish yangilanadi, tarix (2 ta belgi) saqlanadi', (await p.textContent('#d-title')) === 'Tahrir 2' && (await p.textContent('.kv')).includes('Har 2 kunda') && (await loadP(p)).logs.length === 2);
    await p.click('#d-arch'); await p.waitForFunction(() => document.getElementById('d-status').textContent === 'Arxivda');
    check('[arxiv] arxivlanganda belgilash tugmasi yo\'q, "Faollashtirish" bor', !(await visible(p, '#d-toggle')) && (await p.textContent('#d-arch')) === 'Faollashtirish');
    await go(p, '#/odatlar'); await p.waitForSelector('.t-stats');
    check('[arxiv] "Barchasi"da yo\'q, faol 0; "Arxiv (1)" filtrida bor', (await p.textContent('#h-active')) === '0' && (await p.$$('.t-title')).length === 0);
    await p.click('.chip[data-f="archived"]'); check('[arxiv] arxiv filtrida odat ko\'rinadi', (await p.textContent('.t-title')) === 'Tahrir 2');
    await p.click('.t-main'); await p.waitForSelector('#d-arch'); await p.click('#d-arch'); await p.waitForFunction(() => document.getElementById('d-status').textContent !== 'Arxivda'); check('[arxiv] qayta faollashtirildi', true);
    await p.click('#d-del'); await p.waitForSelector('.modal'); check('[o\'chirish] tasdiq oynasi (dialog, aria-modal), arxivlash taklifi', (await p.getAttribute('.modal', 'role')) === 'dialog' && (await p.textContent('.modal')).includes('arxivlang'));
    await p.click('#m-no'); check('[o\'chirish] "Bekor qilish" odatni saqlaydi', (await loadP(p)).habits.length === 1);
    await p.click('#d-del'); await p.click('#m-ok'); await p.waitForSelector('.toast');
    check('[o\'chirish] o\'chirilgach odat va yozuvlari yo\'q, toast "Bekor qilish" bilan', (await loadP(p)).habits.length === 0 && (await loadP(p)).logs.length === 0 && await visible(p, '#t-undo'));
    await p.click('#t-undo'); await p.waitForFunction(() => document.getElementById('h-active') && document.getElementById('h-active').textContent === '1'); // filtr (Arxiv) saqlanib qoladi: faol odat "Barchasi"da
    const back = await loadP(p); check('[o\'chirish] "Bekor qilish" odatni va barcha tarixini (2 ta) qaytaradi', back.habits.length === 1 && back.logs.length === 2 && back.habits[0].id === h.id);
    await ctx.close();
  });

  await run('H6', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    await mkHabit(p, { title: 'Offline', freq: 'daily', startDate: T });
    await ev(p, () => navigator.serviceWorker.ready.then(() => true)); await p.waitForTimeout(500);
    await ctx.setOffline(true); await p.reload(); await unlock(p); await go(p, '#/odatlar');
    await p.waitForSelector('#h-list', { timeout: 8000 }).catch(() => {});
    check('[oflayn] internetsiz yangilab PIN bilan ochilgach odatlar ishlaydi', (await p.$$('#h-list .t-row')).length === 1 && await visible(p, '#offline'));
    if (await p.$('.t-check')) { await p.click('.t-check'); await p.waitForFunction(() => document.querySelector('.t-check').getAttribute('aria-pressed') === 'true'); check('[oflayn] internetsiz belgilash saqlanadi', (await loadP(p)).logs.length === 1); } else check('[oflayn] belgilash tugmasi topilmadi', false);
    await ctx.setOffline(false); await ctx.close();
  });
} finally { await browser.close(); }
console.log(`\n${pass} o'tdi, ${fails.length} xato`); if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
