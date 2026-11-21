// Ibodat moduli: haqiqiy ilova haqiqiy Chromium'da (360x640). `PW=<playwright/index.mjs> node tests/e2e-ibodat.mjs`; qisman: `ONLY=I2,I3`
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
const store = (p, fn, ...a) => p.evaluate(async ([f, args]) => { const S = await import('/js/modules/ibodat-store.js'); return S[f](...args); }, [fn, a]);
const storeErr = (p, fn, ...a) => p.evaluate(async ([f, args]) => { try { const S = await import('/js/modules/ibodat-store.js'); await S[f](...args); return null; } catch (e) { return `${e.name}: ${e.message}`; } }, [fn, a]);
const loadP = (p) => store(p, 'loadAll');
const go = async (p, h) => { await ev(p, (x) => { location.hash = x; }, h); await p.waitForTimeout(150); };
const raw = (p) => ev(p, () => new Promise((res, rej) => { const r = indexedDB.open('shaxsiy-intizom'); r.onerror = () => rej(r.error); r.onsuccess = () => { const d = r.result, q = d.transaction('worship_logs').objectStore('worship_logs').getAll(); q.onsuccess = () => { d.close(); res(q.result); }; }; }));
async function boot(b) {
  const ctx = await b.newContext(opts), p = await mk(ctx); await p.goto(URL); await p.waitForSelector('#pin'); await p.fill('#pin', PIN); await p.fill('#pin2', PIN); await p.click('#go'); await p.waitForSelector('.rk-group');
  const g = await p.$$eval('.rk-group', (e) => e.map((x) => x.textContent)); await p.click('#next'); await p.waitForSelector('.rk-in'); for (const i of await p.$$('.rk-in')) await i.fill(g[Number(await i.getAttribute('data-g'))]);
  await p.click('#go'); await p.waitForSelector('#rk-full'); await p.fill('#rk-full', g.join('-')); await p.click('#go'); await p.waitForSelector('#nav a');
  await go(p, '#/ibodat'); await p.waitForSelector('#i-quran'); return { ctx, p };
}
const unlock = async (p) => { await p.waitForSelector('#pin'); await p.fill('#pin', PIN); await p.click('#go'); await p.waitForSelector('#nav a'); };
const noOverflow = (p) => ev(p, () => document.documentElement.scrollWidth <= innerWidth);
const pressed = (p) => p.$$eval('.i-p', (e) => e.filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.p));
const run = async (id, fn) => { if (ONLY.length && !ONLY.includes(id)) return; console.log(`--- ${id}`); try { await fn(); } catch (e) { fails.push(`${id} istisno: ${e.message}`); console.log('FAIL', id, 'istisno:', e.message.split('\n')[0]); } };

const browser = await chromium.launch();
try {
  await run('I1', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    check('[kun] sarlavha "Ibodat", maxfiylik izohi, bugungi sana, "keyingi kun" yo\'q, "Bugunga qaytish" yo\'q', (await p.textContent('h1')) === 'Ibodat' && (await p.textContent('.i-priv')).includes('maxfiy') && (await p.textContent('#i-date')).includes('Bugun') && !(await p.$('#i-next')) && !(await p.$('#i-today')));
    check('[kun] 5 ta namoz tugmasi (Bomdod…Xufton), hammasi belgilanmagan, "Belgilangan: 0"', (await p.$$eval('.i-p', (e) => e.map((x) => x.textContent))).join() === 'Bomdod,Peshin,Asr,Shom,Xufton' && (await pressed(p)).length === 0 && (await p.textContent('#i-pr-n')) === 'Belgilangan: 0');
    check('[kun] Qur\'on, Zikr, Qaydlar bo\'limlari va Tarix havolasi bor; gorizontal aylantirish yo\'q', await visible(p, '#i-quran') && await visible(p, '#i-dhikr') && await visible(p, '#i-notes') && await visible(p, '#i-hist') && await noOverflow(p));
    check('[kun] navigatsiyada "Boshqalar" faol', (await p.$eval('.nav-item.on', (e) => e.textContent)) === 'Boshqalar');
    let keys = []; for (let i = 0; i < 24 && !keys.length; i++) { keys = await ev(p, () => caches.keys().then((ks) => caches.open(ks.find((k) => /^intizom-v\d+$/.test(k)) || '-')).then((k) => k.keys()).then((r) => r.map((x) => new URL(x.url).pathname)).catch(() => [])); if (!keys.length) await p.waitForTimeout(250); }
    check('[SW] joriy kesh (intizom-v<son>) ichida ibodat fayllari bor', ['ibodat-core.js', 'ibodat-store.js', 'ibodat.js'].every((f) => keys.some((k) => k.endsWith(`/js/modules/${f}`))), keys.join());
    await go(p, '#/ibodat/kun/2099-01-01'); await p.waitForSelector('#i-date');
    check('[kun] kelajak sana manzilda bo\'lsa bugunga qaytariladi (kelajakka yozib bo\'lmaydi)', (await p.textContent('#i-date')).includes(T) && !(await p.$('#i-next')));
    await go(p, '#/ibodat/kun/buzuq'); await p.waitForSelector('#i-date'); check('[kun] buzuq manzil xato bermaydi', (await p.textContent('#i-date')).includes(T));
    await ctx.close();
  });

  await run('I2', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    await p.click('.i-p[data-p="fajr"]'); await p.waitForFunction(() => document.getElementById('i-pr-n').textContent === 'Belgilangan: 1'); await p.click('.i-p[data-p="isha"]'); await p.waitForFunction(() => document.getElementById('i-pr-n').textContent === 'Belgilangan: 2');
    check('[namoz] Bomdod va Xufton belgilanadi (aria-pressed), son yangilanadi', (await pressed(p)).join() === 'fajr,isha');
    await p.click('.i-p[data-p="fajr"]'); await p.waitForFunction(() => document.getElementById('i-pr-n').textContent === 'Belgilangan: 1'); check('[namoz] qayta bosilsa belgi olib tashlanadi', (await pressed(p)).join() === 'isha');
    const r = await raw(p), json = JSON.stringify(r), allowed = new Set(['id', 'createdAt', 'updatedAt', 'v', 'iv', 'ct']);
    check('[shifrlash] namoz yozuvi: faqat id/createdAt/updatedAt/v/iv/ct ochiq; sana va namoz turi xom ma\'lumotda yo\'q; kalit 64 belgili hex', r.length === 1 && Object.keys(r[0]).every((k) => allowed.has(k)) && /^[0-9a-f]{64}$/.test(r[0].id) && !json.includes(T) && !json.includes('isha') && !json.includes('prayer'));
    await p.reload(); await unlock(p); await go(p, '#/ibodat'); await p.waitForSelector('.i-p');
    check('[saqlanish] yangilab PIN bilan ochilgach belgi saqlangan', (await pressed(p)).join() === 'isha');
    await Promise.all([1, 2, 3, 4, 5].map(() => store(p, 'setPrayer', T, 'asr', true)));
    check('[ishonch] bir vaqtdagi 5 ta bir xil belgi bitta yozuv qoldiradi (ikki tab poygasi)', (await loadP(p)).prayers.filter((x) => x.prayer === 'asr').length === 1);
    check('[ishonch] kelajak sana va noma\'lum namoz rad etiladi', (await storeErr(p, 'setPrayer', await addDaysP(p, T, 1), 'fajr', true))?.includes('Kelajak') && (await storeErr(p, 'setPrayer', T, 'vitr', true))?.includes('Namoz turi'));
    const y = await addDaysP(p, T, -1); await p.reload(); await unlock(p); await go(p, '#/ibodat'); await p.waitForSelector('#i-prev'); await p.click('#i-prev'); await p.waitForSelector('#i-next');
    check('[tarix] oldingi kunga o\'tiladi: manzil, sana, "Bugunga qaytish" va "keyingi kun" paydo bo\'ladi, belgilar bo\'sh', (await p.url()).endsWith(`#/ibodat/kun/${y}`) && (await p.textContent('#i-date')).includes('Kecha') && await visible(p, '#i-today') && (await pressed(p)).length === 0);
    await p.click('.i-p[data-p="dhuhr"]'); await p.waitForFunction(() => document.getElementById('i-pr-n').textContent === 'Belgilangan: 1'); check('[tarix] o\'tgan kunni belgilash mumkin', (await loadP(p)).prayers.some((x) => x.date === y && x.prayer === 'dhuhr'));
    await p.click('#i-today'); await p.waitForFunction(() => document.querySelectorAll('.i-p[aria-pressed="true"]').length === 2); check('[tarix] "Bugunga qaytish" bugungi belgilarni ko\'rsatadi', (await pressed(p)).join() === 'asr,isha');
    await ctx.close();
  });

  await run('I3', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    await p.click('#q-add'); check('[Qur\'on] bo\'sh yuborilsa xato, fokus sahifa maydonida, aria-invalid', (await p.textContent('#e-pages')).includes('kiriting') && (await ev(p, () => document.activeElement.id)) === 'f-pages' && (await p.getAttribute('#f-pages', 'aria-invalid')) === 'true');
    await p.fill('#f-pages', '700'); await p.click('#q-add'); check('[Qur\'on] 700 sahifa rad etiladi (0–604)', (await p.textContent('#e-pages')).includes('604'));
    await p.fill('#f-pages', '3'); await p.fill('#f-minutes', '10'); await p.fill('#f-note', 'Baqara <b>x</b>'); await p.click('#q-add'); await p.waitForSelector('#i-q-list');
    check('[Qur\'on] qo\'shilgach jami 3 sahifa · 10 daqiqa, izoh matn sifatida (XSS yo\'q), forma tozalanadi', (await p.textContent('#i-q-sum')) === 'Jami: 3 sahifa · 10 daqiqa' && (await p.textContent('#i-q-list')).includes('Baqara <b>x</b>') && (await p.$$('#i-q-list b')).length === 0 && (await p.inputValue('#f-pages')) === '');
    await p.fill('#f-pages', '2'); await p.click('#q-add'); await p.waitForFunction(() => document.getElementById('i-q-sum').textContent.includes('5 sahifa')); check('[Qur\'on] ikkinchi yozuv: jami 5 sahifa · 10 daqiqa', (await p.textContent('#i-q-sum')) === 'Jami: 5 sahifa · 10 daqiqa' && (await p.$$('#i-q-list li')).length === 2);
    await p.click('.q-del >> nth=1'); await p.waitForSelector('.toast'); await p.waitForFunction(() => document.querySelectorAll('#i-q-list li').length === 1);
    check('[Qur\'on] o\'chirilsa toast "Bekor qilish" bilan, jami yangilanadi', await visible(p, '#t-undo') && (await loadP(p)).quran.length === 1);
    await p.click('#t-undo'); await p.waitForFunction(() => document.querySelectorAll('#i-q-list li').length === 2); check('[Qur\'on] "Bekor qilish" yozuvni qaytaradi (o\'sha id bilan)', (await loadP(p)).quran.length === 2);
    const r = await raw(p), json = JSON.stringify(r); check('[shifrlash] Qur\'on izohi va sonlari xom ma\'lumotda ko\'rinmaydi', !json.includes('Baqara') && !json.includes('quran') && r.length === 2);
    check('[ishonch] sahifasiz va daqiqasiz yozuv hamda kelajak sana rad etiladi', (await storeErr(p, 'addQuran', {}))?.includes('kiriting') && (await storeErr(p, 'addQuran', { pages: 1, date: await addDaysP(p, T, 1) }))?.includes('Kelajak'));
    check('[Qur\'on] gorizontal aylantirish yo\'q', await noOverflow(p));
    await ctx.close();
  });

  await run('I4', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    await p.click('#z-add'); check('[zikr] nomsiz yuborilsa xato', (await p.textContent('#e-name')).includes('kiriting'));
    await p.fill('#f-name', 'Subhanalloh'); await p.fill('#f-target', '5'); await p.click('#z-add'); await p.waitForSelector('#z-tap');
    check('[zikr] hisoblagich yaratiladi va ochiladi: nom, son 0, maqsad 5, progress ko\'rinadi', (await p.textContent('#z-title')) === 'Subhanalloh' && (await p.textContent('#z-count')) === '0' && (await p.textContent('#z-target')) === 'Maqsad: 5' && await visible(p, '#z-bar'));
    check('[zikr] gorizontal aylantirish yo\'q, tugma katta (kamida 150px)', await noOverflow(p) && (await p.$eval('#z-tap', (e) => e.getBoundingClientRect().width)) >= 150);
    for (let i = 0; i < 3; i++) await p.click('#z-tap'); check('[zikr] 3 marta bosilsa 3 / progress 60%', (await p.textContent('#z-count')) === '3' && (await p.getAttribute('#z-bar', 'aria-valuenow')) === '60' && (await p.getAttribute('#z-tap', 'aria-label')).includes('3'));
    await p.waitForTimeout(900); check('[zikr] bosishlar pauzadan so\'ng bazaga saqlanadi (3)', (await loadP(p)).dhikr[0].count === 3);
    await p.click('#z-tap'); await p.click('#z-tap'); check('[zikr] maqsadga yetilganda neytral xabar; baho yo\'q', (await p.textContent('#z-reached')) === 'Maqsad miqdoriga yetildi.' && (await p.textContent('#z-live')).includes('Maqsad miqdoriga'));
    await p.click('#z-minus'); check('[zikr] −1 sonni kamaytiradi (4), maqsad xabari yo\'qoladi', (await p.textContent('#z-count')) === '4' && (await p.textContent('#z-reached')) === '');
    await p.click('#z-reset'); await p.waitForSelector('.modal'); check('[zikr] nolga qaytarish tasdiq oynasi bilan (dialog)', (await p.getAttribute('.modal', 'role')) === 'dialog'); await p.click('#m-no'); check('[zikr] tasdiqlanmasa son saqlanadi (4)', (await p.textContent('#z-count')) === '4');
    await p.click('#z-reset'); await p.click('#m-ok'); await p.waitForTimeout(300); check('[zikr] tasdiqlansa 0 va bazaga darhol yoziladi', (await p.textContent('#z-count')) === '0' && (await loadP(p)).dhikr[0].count === 0);
    await p.fill('#f-target', '0'); await p.click('#z-tsave'); check('[zikr] maqsad 0 rad etiladi', (await p.textContent('#e-target')).includes('1–1000000'));
    await p.fill('#f-target', ''); await p.click('#z-tsave'); await p.waitForFunction(() => document.getElementById('z-target').textContent === 'Maqsad belgilanmagan'); check('[zikr] maqsadni bo\'sh qoldirib saqlash maqsadsiz qiladi (progress yo\'q)', !(await visible(p, '#z-bar')));
    const rec = (await loadP(p)).dhikr[0]; await go(p, `#/ibodat/zikr/${rec.id}`); await p.waitForSelector('#z-tap'); check('[saqlanish] hisoblagich ochiladi va ko\'rsatilgan son bazadagiga mos', Number(await p.textContent('#z-count')) === rec.count);
    await p.click('#z-tap'); const before = Number(await p.textContent('#z-count')); await go(p, '#/ibodat'); await p.waitForSelector('#i-z-list');
    check('[saqlanish] sahifadan chiqishda saqlanmagan bosish saqlanadi, kunlik ro\'yxatda ko\'rinadi', (await loadP(p)).dhikr[0].count === before && (await p.textContent('#i-z-list .t-meta')) === String(before));
    const again = await store(p, 'createDhikr', { name: '  SUBHANALLOH ', date: T }); const all = await loadP(p);
    check('[ishonch] shu kunga shu nom (katta-kichik harf farqsiz) ikkinchi hisoblagich yaratmaydi, mavjudi qaytadi', again.existed === true && all.dhikr.length === 1 && again.record.id === rec.id);
    const r = await raw(p), json = JSON.stringify(r); check('[shifrlash] zikr nomi va soni xom ma\'lumotda yo\'q; kalit sana va nomni oshkor qilmaydi', !json.includes('Subhanalloh') && !json.includes('dhikr') && /^[0-9a-f]{64}$/.test(r[0].id) && !json.includes(T));
    await p.click('#i-z-list .t-main'); await p.waitForSelector('#z-del'); await p.click('#z-del'); await p.click('#m-ok'); await p.waitForSelector('.toast');
    check('[o\'chirish] hisoblagich o\'chiriladi, kunlik ko\'rinishga qaytadi, toast "Bekor qilish" bilan', (await loadP(p)).dhikr.length === 0 && await visible(p, '#t-undo'));
    await p.click('#t-undo'); await p.waitForFunction(() => document.querySelector('#i-z-list') !== null); check('[o\'chirish] "Bekor qilish" hisoblagichni sanog\'i bilan qaytaradi', (await loadP(p)).dhikr.length === 1 && (await loadP(p)).dhikr[0].count === before);
    check('[zikr] avvalgi nomlar tez tanlash tugmasi bo\'lib chiqmaydi (bugun allaqachon bor); kecha uchun chiqadi', !(await p.$('.z-quick')));
    await go(p, `#/ibodat/kun/${await addDaysP(p, T, -1)}`); await p.waitForSelector('#i-dhikr'); check('[zikr] kechagi kunda "Subhanalloh" tez tanlash tugmasi bor', (await p.$$eval('.z-quick', (e) => e.map((x) => x.textContent))).join() === 'Subhanalloh');
    await p.click('.z-quick'); await p.waitForSelector('#z-tap'); check('[zikr] tez tanlash kechagi kunga 0 dan hisoblagich ochadi', (await p.textContent('#z-count')) === '0' && (await loadP(p)).dhikr.length === 2);
    await ctx.close();
  });

  await run('I5', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    await p.click('#i-n-all'); await p.waitForSelector('#n-new'); check('[qayd] bo\'sh holat va "Yangi qayd" tugmasi', (await p.textContent('.state h2')).includes("yo'q") && await visible(p, '#n-new'));
    await p.click('#n-new'); await p.waitForSelector('#n-form'); check('[qayd] forma: pastki navigatsiya yashirin, sana bugun, avtoto\'ldirish o\'chirilgan', !(await visible(p, '#nav')) && (await p.inputValue('#f-date')) === T && (await p.getAttribute('#f-body', 'autocomplete')) === 'off');
    await p.click('#f-save'); check('[qayd] matnsiz saqlab bo\'lmaydi: xabar va fokus', (await p.textContent('#e-body')).includes('kiriting') && (await ev(p, () => document.activeElement.id)) === 'f-body');
    await p.fill('#f-title', 'Sarlavha'); await p.fill('#f-body', 'Matn <img src=x onerror=window.__xss=1> oxiri'); await p.click('#f-save'); await p.waitForSelector('#n-list .t-row');
    check('[qayd] saqlangach ro\'yxatga qaytadi; sarlavha ko\'rinadi', (await p.textContent('#n-list .t-title')) === 'Sarlavha');
    await p.click('#n-list .t-main'); await p.waitForSelector('#d-body');
    check('[qayd] tafsilotda matn aynan ko\'rinadi, HTML bajarilmaydi (XSS yo\'q)', (await p.textContent('#d-body')) === 'Matn <img src=x onerror=window.__xss=1> oxiri' && (await p.$$('#d-body img')).length === 0 && (await ev(p, () => window.__xss)) === undefined);
    await p.click('#d-edit'); await p.waitForSelector('#n-form'); check('[qayd] tahrirlash formasi to\'ldirilgan', (await p.inputValue('#f-title')) === 'Sarlavha'); await p.fill('#f-title', 'Yangi sarlavha'); await p.click('#f-save'); await p.waitForSelector('#d-title');
    check('[qayd] tahrirdan so\'ng tafsilot yangilanadi', (await p.textContent('#d-title')) === 'Yangi sarlavha');
    await go(p, '#/ibodat/qayd'); await p.waitForSelector('#n-q'); await p.fill('#n-q', 'yo\'q-bunday'); check('[qayd] qidiruv: topilmasa "Hech narsa topilmadi"', (await p.textContent('#n-list')).includes('Hech narsa topilmadi')); await p.fill('#n-q', 'YANGI'); check('[qayd] qidiruv katta-kichik harfga bog\'liq emas', (await p.$$('#n-list .t-row')).length === 1);
    const r = await raw(p), json = JSON.stringify(r); check('[shifrlash] qayd sarlavhasi va matni xom ma\'lumotda ko\'rinmaydi', !json.includes('sarlavha') && !json.includes('Matn') && r.length === 1);
    await p.click('#n-list .t-main'); await p.waitForSelector('#d-del'); await p.click('#d-del'); await p.waitForSelector('.modal'); await p.click('#m-no'); check('[qayd] o\'chirish "Bekor qilish"da qayd saqlanadi', (await loadP(p)).notes.length === 1);
    await p.click('#d-del'); await p.click('#m-ok'); await p.waitForSelector('.toast'); check('[qayd] o\'chirilsa toast "Bekor qilish" bilan', (await loadP(p)).notes.length === 0 && await visible(p, '#t-undo'));
    await p.click('#t-undo'); await p.waitForFunction(() => document.querySelector('#n-list .t-row') !== null); check('[qayd] "Bekor qilish" qaydni qaytaradi', (await loadP(p)).notes.length === 1);
    await go(p, '#/ibodat'); await p.waitForSelector('#i-n-list'); check('[qayd] bugungi qayd kunlik ko\'rinishda ham chiqadi', (await p.textContent('#i-n-list')).includes('Yangi sarlavha'));
    await ctx.close();
  });

  await run('I6', async () => {
    const { ctx, p } = await boot(browser), T = await today(p), y = await addDaysP(p, T, -1);
    await go(p, '#/ibodat/tarix'); await p.waitForSelector('.t-stats'); check('[tarix] bo\'sh holat; shu oy ko\'rsatkichlari 0', (await p.textContent('.state h2')).includes("bo'sh") && (await p.textContent('#h-days')) === '0' && (await p.textContent('#h-pg')) === '0');
    await store(p, 'setPrayer', T, 'fajr', true); await store(p, 'setPrayer', T, 'dhuhr', true); await store(p, 'addQuran', { pages: 4, minutes: 15 }); await store(p, 'addQuran', { pages: 1, date: y });
    const z = (await store(p, 'createDhikr', { name: 'Zikr', date: T })).record; await store(p, 'setDhikrCount', z.id, 33); await store(p, 'createNote', { body: 'Qayd' });
    await go(p, '#/ibodat'); await go(p, '#/ibodat/tarix'); await p.waitForSelector('#h-list');
    const rows = await p.$$eval('#h-list .t-row', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ')));
    check('[tarix] bugun va kecha qatorlari (yangisi birinchi) neytral sanoq bilan', rows.length === 2 && rows[0].includes('Bugun') && rows[0].includes('Namoz: 2') && rows[0].includes("Qur'on: 4 sahifa, 15 daqiqa") && rows[0].includes('Zikr: 33') && rows[0].includes('Qayd: 1') && rows[1].includes('Kecha') && rows[1].includes("Qur'on: 1 sahifa"), rows.join('|'));
    const m = T.slice(0, 7) === y.slice(0, 7); check('[tarix] shu oy sanog\'i: namoz 2, Qur\'on sahifa, zikr 33, kunlar', (await p.textContent('#h-pr')) === '2' && (await p.textContent('#h-pg')) === (m ? '5' : '4') && (await p.textContent('#h-dh')) === '33' && (await p.textContent('#h-days')) === (m ? '2' : '1'));
    check('[betaraflik] tarix va kunlik ko\'rinishda foiz, streak yoki "o\'tkazib yuborilgan" so\'zlari yo\'q', !/%|streak|ketma-ket|o'tkazib|qazo/i.test(await p.textContent('#view')));
    await p.click('#h-list .t-main'); await p.waitForSelector('#i-quran'); check('[tarix] qatorni bosish shu kunning ko\'rinishini ochadi', (await p.textContent('#i-q-sum')) === 'Jami: 4 sahifa · 15 daqiqa' && !/%|streak|ketma-ket|o'tkazib|qazo/i.test(await p.textContent('#i-quran') + await p.textContent('.i-pr')));
    await go(p, '#/tahlil'); await p.waitForTimeout(600); const a = await p.textContent('#view'); await go(p, '#/bosh'); await p.waitForTimeout(600); const h = await p.textContent('#view');
    check('[maxfiylik] Ibodat ma\'lumotlari Tahlil va Bosh sahifada ko\'rinmaydi', !/namoz|qur'on|zikr|ibodat/i.test(a + h), (a + h).slice(0, 200));
    await ctx.close();
  });

  await run('I7', async () => {
    const { ctx, p } = await boot(browser), T = await today(p);
    await store(p, 'setPrayer', T, 'fajr', true); await p.reload(); await unlock(p); await go(p, '#/ibodat'); await p.waitForSelector('.i-p');
    await p.click('#lockbtn'); await p.waitForSelector('#pin');
    check('[qulf] qulflanganda ekran tozalanadi (kunlik ko\'rinish, sarlavha, navigatsiya bo\'sh)', await ev(p, () => !document.getElementById('lock').hidden && document.getElementById('view').innerHTML.trim() === '' && document.getElementById('head').innerHTML.trim() === '' && document.querySelectorAll('#nav a').length === 0));
    check('[qulf] qulflanganda ma\'lumot qatlami xato beradi', (await storeErr(p, 'loadAll')) !== null && (await storeErr(p, 'setPrayer', T, 'asr', true)) !== null);
    await unlock(p); await go(p, '#/ibodat'); await p.waitForSelector('.i-p'); check('[qulf] qayta ochilgach ma\'lumot joyida', (await pressed(p)).join() === 'fajr');
    await ctx.close();
  });

  await run('I8', async () => {
    const { ctx, p } = await boot(browser);
    await p.waitForTimeout(600); await ev(p, () => navigator.serviceWorker.ready.then(() => true)); await p.waitForTimeout(500);
    await ctx.setOffline(true); await p.reload(); await unlock(p); await go(p, '#/ibodat'); await p.waitForSelector('.i-p', { timeout: 8000 }).catch(() => {});
    check('[oflayn] internetsiz yangilab PIN bilan ochilgach Ibodat ishlaydi va oflayn belgisi ko\'rinadi', (await p.$$('.i-p')).length === 5 && await visible(p, '#offline'));
    if (await p.$('.i-p')) { await p.click('.i-p[data-p="maghrib"]'); await p.waitForFunction(() => document.getElementById('i-pr-n').textContent === 'Belgilangan: 1'); check('[oflayn] internetsiz belgilash saqlanadi', (await loadP(p)).prayers.length === 1); } else check('[oflayn] namoz tugmalari topilmadi', false);
    await ctx.setOffline(false); await ctx.close();
  });
} finally { await browser.close(); }
console.log(`\n${pass} o'tdi, ${fails.length} xato`); if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
