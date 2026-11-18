import { TABS, ROUTES, OTHERS } from './modules/registry.js';
import { createRouter } from './router.js';
import { icon, emptyState, errorState, loadingState, esc } from './ui.js';
import { open, onConnectionEvent } from './database.js';
import * as lock from './lock.js';
import { runSetup, runUnlock } from './modules/security-ui.js';
import { renderSettings, bindSettings } from './modules/settings.js';
import { mountTasks, startTasks } from './modules/tasks.js';
import { mountHabits, startHabits } from './modules/habits.js';
import { mountJournal, startJournal } from './modules/journal.js';
import { mountProjects, startProjects } from './modules/projects.js';
import { mountGoals, startGoals } from './modules/goals.js';
import { mountHome, startHome } from './modules/home.js';
import { mountAnalytics, startAnalytics } from './modules/analytics.js';

const $ = (s) => document.querySelector(s);
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const DAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

function renderNav(active) {
  $('#nav').innerHTML = TABS.map((t) => `<a href="#/${t.id}" class="nav-item${t.id === active ? ' on' : ''}"${t.id === active ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${t.label}</span></a>`).join('');
}

function renderHeader(id, route) {
  const d = new Date();
  const back = route.parent ? `<a class="back" href="#/boshqalar" aria-label="Orqaga">${icon('back')}</a>` : '';
  const sub = id === 'bosh' ? `<p class="sub">${d.getDate()} ${MONTHS[d.getMonth()]}, ${DAYS[d.getDay()]}</p>` : '';
  $('#head').innerHTML = `${back}<div><h1>${esc(id === 'bosh' ? 'Assalomu alaykum' : route.title)}</h1>${sub}</div>`;
}

function renderView(id, route) {
  if (id === 'sozlamalar') return renderSettings();
  if (id === 'boshqalar') {
    return `<ul class="list">${OTHERS.map((o) => `<li><a class="row" href="#/${o.id}">${icon(o.icon)}<span>${esc(o.title)}</span>${icon('next', 18)}</a></li>`).join('')}</ul>`;
  }
  return emptyState(...route.empty);
}

function show(id, route) {
  if (!lock.canAccessPersonalPages()) return; // qulflangan: hech qanday shaxsiy sahifa chizilmaydi
  document.body.classList.remove('t-form');
  renderNav(route.tab);
  renderHeader(id, route);
  const main = $('#view');
  main.innerHTML = loadingState();
  try {
    main.innerHTML = renderView(id, route);
    if (id === 'sozlamalar') bindSettings(main);
    if (id === 'tahlil') mountAnalytics(main).catch((e) => { main.innerHTML = errorState(e.message); });
    if (id === 'bosh') mountHome(main).catch((e) => { main.innerHTML = errorState(e.message); });
    if (id === 'reja') mountTasks(main).catch((e) => { main.innerHTML = errorState(e.message); });
    if (id === 'odatlar') mountHabits(main).catch((e) => { main.innerHTML = errorState(e.message); });
    if (id === 'jurnal') mountJournal(main).catch((e) => { main.innerHTML = errorState(e.message); });
    if (id === 'loyihalar') mountProjects(main).catch((e) => { main.innerHTML = errorState(e.message); });
    if (id === 'maqsadlar') mountGoals(main).catch((e) => { main.innerHTML = errorState(e.message); });
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) { main.innerHTML = errorState(e.message); }
}

function setupOnline() {
  const bar = $('#offline');
  const upd = () => { bar.hidden = navigator.onLine; };
  addEventListener('online', upd); addEventListener('offline', upd); upd();
}

let router = null, gating = false, relock = false;
const clearApp = () => { for (const id of ['head', 'view', 'nav', 'tbanner']) $(`#${id}`).innerHTML = ''; $('#lockbtn').hidden = true; };

// Baza ulanishi boshqa oyna tufayli (yangilanish) yoki brauzer tomonidan yopilsa: oyna qulflanadi va sahifani yangilash so'raladi.
let dbLost = null;
const LOST = {
  stale: ['Ilova yangilandi', "Ilovaning yangi versiyasi boshqa oynada ma'lumotlar bazasini yangiladi. Xavfsizlik uchun ilova qulflandi. Davom etish uchun sahifani yangilang."],
  closed: ["Ma'lumotlar bazasi bilan aloqa uzildi", "Brauzer bazani kutilmaganda yopdi. Xavfsizlik uchun ilova qulflandi. Davom etish uchun sahifani yangilang."],
};
function renderLost() {
  clearApp(); const r = $('#lock'), [h, p] = LOST[dbLost]; r.hidden = false;
  r.innerHTML = `<div class="lock-card"><h1>${esc(h)}</h1><p>${esc(p)}</p><button class="btn" data-action="reload" type="button">Sahifani yangilash</button></div>`;
}
function watchDb() {
  onConnectionEvent((ev) => {
    const r = $('#lock');
    if (ev.type === 'blocked') { r.hidden = false; r.innerHTML = `<div class="lock-card"><h1>Kutilmoqda…</h1><p>Ma'lumotlar bazasi boshqa oynada band. Ilovaning boshqa oynalarini yoping, shundan keyin bu oyna o'zi davom etadi.</p></div>`; }
    else if (ev.type === 'unblocked') { if (!dbLost) { r.hidden = true; r.innerHTML = ''; } }
    else { dbLost = ev.type; lock.lock('db-lost'); renderLost(); }
  });
}

// Darvoza: PIN yo'q -> sozlash; qulflangan -> qulf ekrani; ochiq -> ilova. Qulflansa ekran tozalanib, qayta shu yerga qaytiladi.
async function gate() {
  if (gating) { relock = true; return; }
  gating = true;
  try {
    do {
      relock = false; clearApp();
      if (dbLost) { renderLost(); return; }
      const root = $('#lock'), st = await lock.getState();
      if (st.status === 'none') await runSetup(root); else if (st.locked) await runUnlock(root);
      if (!lock.canAccessPersonalPages()) { relock = true; continue; }
      root.hidden = true; root.innerHTML = '';
      const btn = $('#lockbtn'); btn.innerHTML = icon('lock', 22); btn.hidden = false;
      startTasks(); startHabits(); startJournal(); startProjects(); startGoals(); startHome(); startAnalytics(); router.start();
    } while (relock);
  } catch (e) { const r = $('#lock'); r.hidden = false; r.innerHTML = `<div class="lock-card">${errorState(e.message)}</div>`; }
  finally { gating = false; }
}

async function boot() {
  setupOnline();
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action="reload"]')) location.reload(); });
  $('#lockbtn').onclick = () => lock.lock('manual');
  watchDb();
  try { await open(); } catch (e) { const r = $('#lock'); r.hidden = false; r.innerHTML = `<div class="lock-card">${errorState(`Ma'lumotlar bazasini ochib bo'lmadi: ${e.message}`)}</div>`; return; }
  lock.start();
  router = createRouter({ routes: ROUTES, onChange: show });
  lock.onLockChange((s) => { if (s.locked) { clearApp(); gate(); } });
  await gate();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
