// 2.0 poydevor modullari (dates.js, sync.js, ui-kit.js) uchun testlar. runPure: brauzersiz (Node va brauzerda); runBrowser: IndexedDB/DOM kerak bo'lganlar.
import { test, assert, eq } from './harness.js';
import * as D from '../js/modules/dates.js';
import * as K from '../js/modules/tasks-core.js';
import { createSync } from '../js/modules/sync.js';
import * as S from '../js/modules/tasks-store.js';
import * as UI from '../js/modules/ui-kit.js';
import { icon } from '../js/ui.js';

// Kutilgan qiymatlar tasks-core.js ning 2.0 dan OLDINGI versiyasidan olingan (xarakter testi: ko'chirish xulq-atvorni o'zgartirmaganini tasdiqlaydi).
const GOLDEN = [
    ["daysInMonth", [2024,2], "29"],
    ["daysInMonth", [2026,2], "28"],
    ["daysInMonth", [2100,2], "28"],
    ["daysInMonth", [2000,2], "29"],
    ["daysInMonth", [2026,12], "31"],
    ["fmtDate", [2026,3,4], "\"2026-03-04\""],
    ["fmtDate", [26,11,13], "\"0026-11-13\""],
    ["parseDate", ["2026-11-13"], "{\"y\":2026,\"m\":11,\"d\":13}"],
    ["parseDate", ["2026-02-29"], "null"],
    ["parseDate", ["2024-02-29"], "{\"y\":2024,\"m\":2,\"d\":29}"],
    ["parseDate", ["1969-12-31"], "null"],
    ["parseDate", ["2201-01-01"], "null"],
    ["parseDate", ["2026-1-1"], "null"],
    ["parseDate", [null], "null"],
    ["toDays", ["1970-01-01"], "0"],
    ["toDays", ["2026-11-13"], "20770"],
    ["fromDays", [0], "\"1970-01-01\""],
    ["fromDays", [20770], "\"2026-11-13\""],
    ["fromDays", [-1], "\"1969-12-31\""],
    ["addDays", ["2026-11-13",1], "\"2026-11-14\""],
    ["addDays", ["2026-12-31",1], "\"2027-01-01\""],
    ["addDays", ["2024-02-28",1], "\"2024-02-29\""],
    ["addDays", ["2024-03-01",-1], "\"2024-02-29\""],
    ["addDays", ["2026-01-01",-1], "\"2025-12-31\""],
    ["addDays", ["2026-11-13",365], "\"2027-11-13\""],
    ["addDays", ["2026-11-13",-400], "\"2025-10-09\""],
    ["weekday", ["2026-11-09"], "0"],
    ["weekday", ["2026-11-13"], "4"],
    ["weekday", ["2026-11-15"], "6"],
    ["weekday", ["1970-01-01"], "3"],
    ["weekday", ["2024-02-29"], "3"],
    ["parseTime", ["00:00"], "0"],
    ["parseTime", ["09:05"], "545"],
    ["parseTime", ["23:59"], "1439"],
    ["parseTime", ["24:00"], "null"],
    ["parseTime", ["9:5"], "null"],
    ["parseTime", ["12:60"], "null"],
    ["parseTime", [null], "null"],
    ["fmtDateUz", ["2026-11-13","2026-11-13"], "\"Bugun\""],
    ["fmtDateUz", ["2026-11-14","2026-11-13"], "\"Ertaga\""],
    ["fmtDateUz", ["2026-11-12","2026-11-13"], "\"Kecha\""],
    ["fmtDateUz", ["2026-11-20","2026-11-13"], "\"20 noyabr\""],
    ["fmtDateUz", ["2027-01-05","2026-11-13"], "\"5 yanvar 2027\""],
    ["fmtDateUz", ["2025-05-01","2026-11-13"], "\"1 may 2025\""]
];
const DATE_API = ['daysInMonth', 'fmtDate', 'parseDate', 'toDays', 'fromDays', 'addDays', 'weekday', 'parseTime', 'localParts', 'localMs', 'fmtDateUz'];

async function runDates() {
  await test('dates.js: eksport qilinadigan API to\'liq va faqat shu nomlar', () => { eq(Object.keys(D).sort(), [...DATE_API].sort()); });
  await test('dates.js <-> tasks-core.js: sana yordamchilari qayta eksport qilinadi (bir xil funksiya obyekti), tashqi kod uchun API saqlangan', () => { for (const n of DATE_API) { assert(typeof D[n] === 'function', `${n} funksiya emas`); assert(K[n] === D[n], `${n}: tasks-core qayta eksporti dates.js dagi bilan bir xil emas`); } });
  await test('dates.js: xarakter testi, eski tasks-core.js natijalari bilan bir xil (44 holat: kabisa yili, oy/yil chegarasi, noto\'g\'ri kiritish)', () => {
    for (const [fn, args, want] of GOLDEN) eq(JSON.stringify(D[fn](...args)), want, `${fn}(${JSON.stringify(args)}):`);
  });
  await test('dates.js: aylanma xossalar (toDays/fromDays, addDays, localMs/localParts) va dushanba = 0', () => {
    for (const d of ['1970-01-01', '2024-02-29', '2026-11-13', '2199-12-31']) { eq(D.fromDays(D.toDays(d)), d); eq(D.addDays(D.addDays(d, 37), -37), d); const ms = D.localMs(d, '07:45'); eq(D.localParts(ms), { date: d, time: '07:45' }); }
    eq(D.weekday('2026-11-09'), 0); eq(D.weekday('2026-11-15'), 6); for (let i = 0; i < 14; i++) eq(D.weekday(D.addDays('2026-11-09', i)), i % 7);
    eq(D.parseTime('09:05'), 545); eq(D.parseTime('24:00'), null);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (p, ms = 600) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Vaqt tugadi: va'da hal bo'lmadi")), ms))]);
let seq = 0; const names = () => ({ channel: `si-t-${Date.now()}-${++seq}`, revKey: `si:t-rev-${Date.now()}-${seq}` });

export async function runPure() {
  await runDates();
  await test('sync.js: createSync() subscribe/stop/notify beradi; notify mahalliy tinglovchilarni darhol chaqiradi, o\'chirilgani chaqirilmaydi, xato qilgan tinglovchi boshqalarga xalaqit bermaydi', async () => {
    const S = createSync(names()); try {
      eq(Object.keys(S).sort(), ['notify', 'stop', 'subscribe']); let a = 0, b = 0; const offBad = S.subscribe(() => { throw new Error('tinglovchi xatosi'); }), offA = S.subscribe(() => { a++; }), offB = S.subscribe(() => { b++; });
      S.notify(); eq([a, b], [1, 1]); eq(offB(), true); S.notify(); eq([a, b], [2, 1]); eq(offB(), false); offBad(); offA(); S.notify(); eq(a, 2);
    } finally { S.stop(); }
  });
  await test('sync.js: bir xil kanaldagi boshqa nusxa xabar oladi (tab taqlidi), boshqa kanal esa olmaydi; xabar faqat {t:"changed"}', async () => {
    if (typeof BroadcastChannel === 'undefined') return; const n = names(), A = createSync(n), B = createSync(n), C = createSync(names()); const spy = new BroadcastChannel(n.channel), got = []; spy.onmessage = (e) => got.push(e.data);
    try {
      let b = 0, c = 0, a = 0; A.subscribe(() => { a++; }); B.subscribe(() => { b++; }); C.subscribe(() => { c++; }); A.notify(); await wait(120);
      eq([a, b, c], [1, 1, 0]); eq(got, [{ t: 'changed' }]); // mazmun yo'q: faqat belgi
    } finally { A.stop(); B.stop(); C.stop(); spy.close(); }
  });
  await test('sync.js: begona yoki buzuq kanal xabarlari e\'tiborsiz qoldiriladi, xato bermaydi', async () => {
    if (typeof BroadcastChannel === 'undefined') return; const n = names(), S = createSync(n), tx = new BroadcastChannel(n.channel); let calls = 0; S.subscribe(() => { calls++; });
    try { for (const m of [null, undefined, 1, 'changed', {}, { t: 'x' }, { t: 'changed ' }, []]) tx.postMessage(m); await wait(120); eq(calls, 0); tx.postMessage({ t: 'changed' }); await wait(120); eq(calls, 1); }
    finally { S.stop(); tx.close(); }
  });
  await test('sync.js: stop() tinglovchilarni tozalaydi va kanalni yopadi (keyingi xabarlar chaqirmaydi)', async () => {
    if (typeof BroadcastChannel === 'undefined') return; const n = names(), A = createSync(n), tx = new BroadcastChannel(n.channel); let calls = 0; A.subscribe(() => { calls++; }); A.stop(); tx.postMessage({ t: 'changed' }); await wait(120); eq(calls, 0); A.notify(); eq(calls, 0); /* stop() tinglovchilarni tozalagan */ tx.close(); A.stop();
  });
}


// ---- ui-kit.js (DOM: faqat brauzerda) ----
const fixture = () => { const root = document.createElement('div'); root.innerHTML = '<div id="head"></div><main id="fx-main"></main>'; document.body.appendChild(root); return { root, head: root.querySelector('#head'), main: root.querySelector('#fx-main') }; };
async function runKitC1() {
  await test('ui-kit: setHeader() sarlavha (HTML ekranlanadi) va ixtiyoriy "Orqaga" havolasi, avvalgi tasks.js bilan bir xil HTML', () => {
    const f = fixture(); try {
      UI.setHeader('Vazifalar'); eq(f.head.innerHTML, '<div><h1>Vazifalar</h1></div>');
      UI.setHeader('<b>x</b> & "y"', '#/reja'); const norm = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.innerHTML; }; // brauzer serializatsiyasi bilan solishtirish (<path/> -> <path></path>)
      eq(f.head.innerHTML, norm(`<a class="back" href="#/reja" aria-label="Orqaga">${icon('back')}</a><div><h1>&lt;b&gt;x&lt;/b&gt; &amp; "y"</h1></div>`)); assert(!f.head.querySelector('b'), 'sarlavhada HTML ishladi');
    } finally { f.root.remove(); }
  });
  await test('ui-kit: isTyping/isBusy: matn maydoni va textarea band, radio/checkbox/tugma band emas, tashqaridagi fokus band emas, ochiq .modal band, main yo\'q bo\'lsa band emas', () => {
    const f = fixture(); try {
      f.main.innerHTML = '<input id="a" type="text"><textarea id="b"></textarea><input id="c" type="checkbox"><input id="d" type="radio"><button id="e">x</button><input id="n" type="number">'; const out = document.createElement('input'); f.root.appendChild(out);
      const at = (el) => { el.focus(); return [UI.isTyping(f.main), UI.isBusy(f.main)]; };
      eq(at(f.main.querySelector('#a')), [true, true]); eq(at(f.main.querySelector('#b')), [true, true]); eq(at(f.main.querySelector('#n')), [true, true]);
      for (const id of ['#c', '#d', '#e']) eq(at(f.main.querySelector(id)), [false, false]); eq(at(out), [false, false]); eq([UI.isTyping(null), UI.isBusy(null), UI.isBusy(undefined)], [false, false, false]);
      f.main.querySelector('#e').focus(); const m = document.createElement('div'); m.className = 'modal'; f.main.appendChild(m); eq([UI.isTyping(f.main), UI.isBusy(f.main)], [false, true]);
    } finally { f.root.remove(); }
  });
  await test('ui-kit: confirmDialog(): tuzilma va a11y, matn ekranlanadi, fokus "Bekor qilish"da; tasdiqlash/bekor/Escape/fon bosish natijalari, oyna ichini bosish yopmaydi, har safar onClosed bir marta, Escape tinglovchisi olib tashlanadi', async () => {
    const f = fixture(); try {
      let closed = 0; const open = (o = {}) => UI.confirmDialog(f.main, { title: 'Sarlavha <i>1</i>', text: 'Matn <b>2</b>', ok: "O'chirish", ...o }, () => { closed++; }); const dlg = () => f.main.querySelector('.modal');
      let p = open(); const d = dlg(); eq([d.getAttribute('role'), d.getAttribute('aria-modal'), d.getAttribute('aria-labelledby')], ['dialog', 'true', 'm-title']);
      eq(d.querySelector('#m-title').textContent, 'Sarlavha <i>1</i>'); eq(d.querySelector('p').textContent, 'Matn <b>2</b>'); assert(!d.querySelector('i') && !d.querySelector('p b'), 'HTML ishladi'); eq([d.querySelector('#m-ok').textContent, d.querySelector('#m-no').textContent], ["O'chirish", 'Bekor qilish']); assert(document.activeElement === d.querySelector('#m-no'), 'fokus "Bekor qilish" tugmasida emas'); // (eq() DOM elementlarni JSON orqali solishtiradi: hammasi "{}")
      d.querySelector('.modal-box').click(); eq(!!dlg(), true); eq(closed, 0); d.querySelector('#m-ok').click(); eq(await within(p), true); eq([!!dlg(), closed], [false, 1]);
      p = open(); dlg().querySelector('#m-no').click(); eq(await within(p), false); eq(closed, 2);
      p = open(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); eq(!!dlg(), true); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); eq(await within(p), false); eq(closed, 3);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); eq(closed, 3); // tinglovchi olib tashlangan
      p = open(); dlg().click(); eq(await within(p), false); eq(closed, 4);
      const q = UI.confirmDialog(f.main, { title: 't', text: 'x', ok: 'ok' }); dlg().querySelector('#m-ok').click(); eq(await within(q), true); // onClosed ixtiyoriy
    } finally { f.root.remove(); }
  });
}

const fakeTimers = () => { const real = { st: window.setTimeout, ct: window.clearTimeout }; let id = 100; const live = new Map(), cleared = []; window.setTimeout = (fn, ms) => { id++; live.set(id, { fn, ms }); return id; }; window.clearTimeout = (h) => { cleared.push(h); live.delete(h); }; return { live, cleared, fire(h) { const t = live.get(h); live.delete(h); t.fn(); }, restore() { window.setTimeout = real.st; window.clearTimeout = real.ct; } }; };
async function runKitC2() {
  await test('ui-kit: createToaster(): toast role=status, matn ekranlanadi, "Bekor qilish" faqat undo bo\'lsa; yangi toast eskisini almashtiradi (eski taymer to\'xtatiladi, bitta .toast)', () => {
    const f = fixture(), T = fakeTimers(); try {
      let expired = 0; const k = UI.createToaster({ getMain: () => f.main, onExpire: () => { expired++; } });
      k.toast('Salom <b>x</b>'); let el = f.main.querySelector('.toast'); eq(el.getAttribute('role'), 'status'); eq(el.querySelector('span').textContent, 'Salom <b>x</b>'); assert(!el.querySelector('b'), 'HTML ishladi'); assert(!el.querySelector('#t-undo'), 'undo yo\'q, tugma bo\'lmasligi kerak');
      const first = [...T.live.keys()][0]; eq(T.live.get(first).ms, 6000); k.toast('Ikkinchi', async () => {}); eq(f.main.querySelectorAll('.toast').length, 1); eq(f.main.querySelector('.toast span').textContent, 'Ikkinchi'); assert(T.cleared.includes(first), 'eski taymer to\'xtatilmadi'); assert(f.main.querySelector('#t-undo').textContent === 'Bekor qilish'); eq(expired, 0);
    } finally { T.restore(); f.root.remove(); }
  });
  await test('ui-kit: createToaster(): 6 soniyadan keyin toast o\'chadi va onExpire bir marta chaqiriladi; attach() qayta chizilgan ekranga toastni qaytaradi, toast yo\'q yoki main yo\'q bo\'lsa hech narsa qilmaydi', () => {
    const f = fixture(), T = fakeTimers(); try {
      let expired = 0, main = f.main; const k = UI.createToaster({ getMain: () => main, onExpire: () => { expired++; } }); k.attach(); eq(f.main.querySelectorAll('.toast').length, 0);
      k.toast('Xabar', async () => {}); f.main.innerHTML = '<p>qayta chizildi</p>'; eq(f.main.querySelectorAll('.toast').length, 0); k.attach(); eq(f.main.querySelectorAll('.toast').length, 1); k.attach(); eq(f.main.querySelectorAll('.toast').length, 1); // takroriy attach nusxa qo'shmaydi
      const h = [...T.live.keys()].pop(); T.fire(h); eq(expired, 1); eq(document.querySelectorAll('.toast').length, 0); k.attach(); eq(f.main.querySelectorAll('.toast').length, 0); // tugagach attach qaytarmaydi
      main = null; k.toast('main yo\'q'); eq(document.querySelectorAll('.toast').length, 0);
    } finally { T.restore(); f.root.remove(); }
  });
  await test('ui-kit: createToaster(): "Bekor qilish" funksiyani bir marta chaqiradi, toastni olib tashlaydi va taymerni to\'xtatadi; funksiya xato bersa "Qaytarib bo\'lmadi: ..." toasti chiqadi; clear() taymer va holatni tozalaydi', async () => {
    const f = fixture(), T = fakeTimers(); try {
      let calls = 0, expired = 0; const k = UI.createToaster({ getMain: () => f.main, onExpire: () => { expired++; } });
      k.toast('O\'chirildi', async () => { calls++; }); const h1 = [...T.live.keys()].pop(); f.main.querySelector('#t-undo').click(); await Promise.resolve(); await Promise.resolve(); eq(calls, 1); eq(f.main.querySelectorAll('.toast').length, 0); assert(T.cleared.includes(h1), 'taymer to\'xtatilmadi'); k.attach(); eq(f.main.querySelectorAll('.toast').length, 0);
      k.toast('Xato bo\'ladi', async () => { throw new Error('sabab'); }); f.main.querySelector('#t-undo').click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); eq(f.main.querySelector('.toast span').textContent, "Qaytarib bo'lmadi: sabab"); assert(!f.main.querySelector('#t-undo'));
      const h2 = [...T.live.keys()].pop(); k.clear(); assert(T.cleared.includes(h2), 'clear() taymerni to\'xtatmadi'); const before = f.main.querySelectorAll('.toast').length; k.attach(); eq(f.main.querySelectorAll('.toast').length, before); /* clear() dan keyin attach() yangi toast chizmaydi */ eq(expired, 0); k.clear(); // ikkinchi clear() xato bermaydi
    } finally { T.restore(); f.root.remove(); }
  });
}

async function runKitC3() {
  await test('ui-kit: createRefresher(): 60 ms kechiktirish, ketma-ket chaqiruvlar bitta chizishga birlashadi, dirty bayrog\'i va dirty o\'rnatuvchisi', () => {
    const f = fixture(), T = fakeTimers(), href0 = location.href; try {
      history.replaceState(null, '', '#/kun-test'); const renders = []; const R = UI.createRefresher({ getMain: () => f.main, allowed: () => true, routeRe: /^#\/kun-test(\/|\?|$)/, blockClass: 'kun-block', render: (m) => renders.push(m) });
      eq(R.dirty, false); R.schedule(); eq(R.dirty, true); const first = [...T.live.keys()][0]; eq(T.live.get(first).ms, 60); R.schedule(); assert(T.cleared.includes(first), 'eski taymer to\'xtatilmadi'); eq(T.live.size, 1);
      T.fire([...T.live.keys()][0]); eq(renders.length, 1); assert(renders[0] === f.main, 'render main bilan chaqirilmadi'); eq(R.dirty, false);
      R.dirty = 1; eq(R.dirty, true); R.dirty = 0; eq(R.dirty, false);
    } finally { T.restore(); history.replaceState(null, '', href0); f.root.remove(); }
  });
  await test('ui-kit: createRefresher(): har bir kechiktirish sharti alohida (main yo\'q/uzilgan, ruxsat yo\'q, manzil mos emas, body klassi, tasdiq oynasi, matn kiritish): chizilmaydi, dirty saqlanadi; shart bartaraf bo\'lgach chiziladi', () => {
    const f = fixture(), T = fakeTimers(), href0 = location.href; try {
      history.replaceState(null, '', '#/kun-test/ichki?d=1'); let allowed = true, main = f.main; const renders = [];
      const R = UI.createRefresher({ getMain: () => main, allowed: () => allowed, routeRe: /^#\/kun-test(\/|\?|$)/, blockClass: 'kun-block', render: (m) => renders.push(m) }); const fire = () => T.fire([...T.live.keys()].pop());
      const cases = [
        ['main yo\'q', () => { main = null; }, () => { main = f.main; }], ['main uzilgan', () => { main = document.createElement('div'); }, () => { main = f.main; }], ['ruxsat yo\'q (qulflangan)', () => { allowed = false; }, () => { allowed = true; }],
        ['manzil mos emas', () => history.replaceState(null, '', '#/boshqa'), () => history.replaceState(null, '', '#/kun-test')], ['manzil o\'xshash lekin boshqa (#/kun-testX)', () => history.replaceState(null, '', '#/kun-testX'), () => history.replaceState(null, '', '#/kun-test?q=1')],
        ['body klassi', () => document.body.classList.add('kun-block'), () => document.body.classList.remove('kun-block')],
        ['tasdiq oynasi ochiq', () => { const m = document.createElement('div'); m.className = 'modal'; f.main.appendChild(m); }, () => f.main.querySelector('.modal').remove()],
        ['matn kiritilmoqda', () => { f.main.innerHTML = '<textarea id="tx"></textarea>'; f.main.querySelector('#tx').focus(); }, () => { f.main.querySelector('#tx').blur(); f.main.innerHTML = ''; }],
      ];
      for (const [label, setup, undo] of cases) {
        const n = renders.length; setup(); R.schedule(); fire(); eq(renders.length, n, `${label}: chizilmasligi kerak edi, lekin chizildi`); eq(R.dirty, true, `${label}: dirty saqlanmadi`);
        undo(); R.schedule(); fire(); eq(renders.length, n + 1, `${label}: shart bartaraf bo'lgach chizilmadi`); eq(R.dirty, false, `${label}: dirty tozalanmadi`);
      }
    } finally { T.restore(); document.body.classList.remove('kun-block'); history.replaceState(null, '', href0); f.root.remove(); }
  });
}

export async function runBrowser() {
  await runKitC1(); await runKitC2(); await runKitC3();
  await test('sync.js (brauzer): BroadcastChannel yo\'q holatdagi zaxira yo\'li, `storage` hodisasi faqat o\'z kaliti uchun ishlaydi; notify() mazmunsiz belgi yozadi; stop() hodisa tinglovchisini olib tashlaydi', async () => {
    const n = names(), A = createSync(n); let calls = 0; A.subscribe(() => { calls++; });
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: n.revKey })); eq(calls, 1); window.dispatchEvent(new StorageEvent('storage', { key: 'boshqa-kalit' })); window.dispatchEvent(new StorageEvent('storage', { key: null })); eq(calls, 1);
      A.notify(); const v = localStorage.getItem(n.revKey); assert(/^\d+:[a-z0-9]+$/.test(v), `localStorage belgisi mazmunsiz bo'lishi kerak: ${v}`); eq(calls, 2);
      A.stop(); window.dispatchEvent(new StorageEvent('storage', { key: n.revKey })); eq(calls, 2);
    } finally { A.stop(); localStorage.removeItem(n.revKey); }
  });
  await test('tasks-store: sinxron API (subscribe, stopSync) va kanal/kalit nomlari o\'zgarmagan (eski versiyadagi tablar bilan moslik: "si-tasks", "si:tasks-rev")', async () => {
    eq([typeof S.subscribe, typeof S.stopSync], ['function', 'function']); let calls = 0; const off = S.subscribe(() => { calls++; });
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: 'si:tasks-rev' })); eq(calls, 1); window.dispatchEvent(new StorageEvent('storage', { key: 'si:habits-rev' })); eq(calls, 1);
      const remote = new BroadcastChannel('si-tasks'); remote.postMessage({ t: 'changed' }); await wait(150); remote.close(); eq(calls, 2); eq(off(), true);
    } finally { S.stopSync(); }
  });
}
