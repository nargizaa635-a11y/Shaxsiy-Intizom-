// Bosh sahifa interfeysi: bugungi vazifalar va odatlar (shu yerning o'zida belgilanadi), faol maqsadlar va loyihalar, jurnal eslatmasi.
// Ma'lumot faqat modullarning store'lari orqali; har manba alohida yuklanadi (biri buzilsa qolganlari ko'rinadi).
// Qulflanganda xotira, toast va obunalar tozalanadi; localStorage/sessionStorage'ga hech narsa yozilmaydi.
import * as lock from '../lock.js';
import * as TS from './tasks-store.js';
import * as HS from './habits-store.js';
import * as GS from './goals-store.js';
import * as PS from './projects-store.js';
import * as JS from './journal-store.js';
import * as K from './home-core.js';
import { resolve } from '../router.js';
import { ROUTES } from './registry.js';
import { fmtDateUz } from './dates.js';
import { icon, esc, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const st = { token: 0, main: null, offs: [] };
const nowMs = () => Date.now();
const allowed = () => lock.canAccessPersonalPages();
const STORES = [TS, HS, GS, PS, JS];

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.main = null; toaster.clear(); st.offs.forEach((off) => off()); st.offs = [];
  document.body.classList.remove('t-form');
}
let hooked = false;
export function startHome() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); }
  st.offs.forEach((off) => off()); st.offs = STORES.map((S) => S.subscribe(scheduleRefresh));
}
// Bosh sahifa "bosh" yo'nalishi (noma'lum manzillar ham unga tushadi); boshqa sahifada fonda chizilmaydi.
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: { test: (h) => resolve(h, ROUTES) === 'bosh' }, blockClass: 't-form', render: (main) => mountHome(main, true) }), scheduleRefresh = refresher.schedule;
const toaster = UI.createToaster({ getMain: () => st.main }), toast = toaster.toast, attachToast = toaster.attach;

// ---------- Kirish nuqtasi ----------
export async function mountHome(main, silent = false) {
  st.main = main; const token = ++st.token; if (!silent) main.innerHTML = loadingState();
  try {
    const [t, h, g, p, j] = await Promise.allSettled([TS.loadAll(), HS.loadAll(), GS.loadAll(), PS.loadAll(), JS.loadAll()]);
    if (token !== st.token || !allowed()) return;
    const val = (r) => (r.status === 'fulfilled' ? r.value : null);
    if ([t, h, g, p, j].every((r) => r.status === 'rejected')) throw t.reason;
    const model = K.buildHome({ tasks: val(t), habits: val(h), goals: val(g), projects: val(p), journal: val(j) }, nowMs());
    refresher.dirty = false;
    if (!main.__homeFocus) { main.__homeFocus = true; main.addEventListener('focusout', () => { if (refresher.dirty) setTimeout(scheduleRefresh, 700); }); }
    render(main, model); attachToast(); if (!silent) window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}
const refreshAfter = (main, fn, btn) => async () => { btn.disabled = true; try { await fn(); await mountHome(main, true); } catch (e) { toast(`Xatolik: ${e.message}`); btn.disabled = false; } };

// ---------- Chizish ----------
const failed = '<p class="muted home-fail" role="status">Yuklab bo\'lmadi. Sahifani yangilab ko\'ring.</p>';
const sec = (id, title, link, linkText, body) => `<section class="home-sec" id="${id}"><div class="home-h"><h2>${title}</h2>${link ? `<a href="${link}">${linkText}</a>` : ''}</div>${body}</section>`;
const more = (n, link) => (n ? `<p class="muted home-more"><a href="${link}">Yana ${n} ta</a></p>` : '');
const bar = (pr, label) => (pr.percent === null ? '' : `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.percent}"><i style="width:${pr.percent}%"></i></div>`);

function deadlineText(d, deadline, T) {
  if (!deadline) return '';
  const when = fmtDateUz(deadline, T).toLowerCase();
  return d.state === 'overdue' ? `<span class="bad">muddati o'tgan: ${esc(when)}</span>` : d.state === 'today' ? '<span class="bad">muddat: bugun</span>' : d.state === 'soon' ? `muddat: ${esc(when)} (${d.days} kun qoldi)` : `muddat: ${esc(when)}`;
}
function taskMeta(r, T) {
  const t = r.task, time = t.startTime ? `${t.startTime}${t.endTime ? `–${t.endTime}` : ''}` : t.endTime ? `${t.endTime} gacha` : '';
  const parts = [r.overdue && r.date < T ? `<span class="bad">muddati o'tgan: ${esc(fmtDateUz(r.date, T).toLowerCase())}</span>` : r.overdue ? '<span class="bad">vaqti o\'tgan</span>' : '', time, t.priority === 'high' ? 'yuqori ustuvorlik' : ''].filter(Boolean);
  return parts.join(' · ');
}

function tasksHtml(m, T) {
  if (!m) return sec('h-tasks', 'Vazifalar', '#/reja', 'Hammasi', failed);
  const row = (r) => `<li class="t-row${r.done ? ' done' : ''}" data-key="${esc(r.key)}"><button class="t-check" type="button" aria-pressed="${r.done}" aria-label="${esc(r.task.title)}: ${r.done ? 'bajarilgan belgisini olib tashlash' : 'bajarildi deb belgilash'}" data-task="${r.task.id}" data-date="${r.date}">${r.done ? icon('check', 18) : ''}</button><a class="t-main" href="#/reja/${r.task.id}?d=${r.date}"><span class="t-title">${esc(r.task.title)}</span>${taskMeta(r, T) ? `<span class="t-meta">${taskMeta(r, T)}</span>` : ''}</a></li>`;
  const body = m.rows.length ? `<ul class="t-list">${m.rows.map(row).join('')}</ul>${more(m.hidden, '#/reja')}`
    : `<p class="muted home-empty">${m.empty ? 'Vazifalar hali yo\'q.' : 'Bugun vazifa yo\'q.'} <a href="#/reja/yangi">Vazifa qo'shish</a></p>`;
  return sec('h-tasks', 'Bugungi vazifalar', '#/reja', 'Hammasi', body);
}
function habitsHtml(m) {
  if (!m) return sec('h-habits', 'Odatlar', '#/odatlar', 'Hammasi', failed);
  const row = (x) => `<li class="t-row${x.done ? ' done' : ''}"><button class="t-check" type="button" aria-pressed="${x.done}" aria-label="${esc(x.habit.title)}: ${x.done ? 'bugungi belgini bekor qilish' : 'bugun bajarildi deb belgilash'}" data-habit="${x.habit.id}">${x.done ? icon('check', 18) : ''}</button><a class="t-main" href="#/odatlar/${x.habit.id}"><span class="t-title">${esc(x.habit.title)}</span>${x.streak > 0 ? `<span class="t-meta">${x.streak} kun ketma-ket</span>` : ''}</a></li>`;
  const body = m.items.length ? `<ul class="t-list">${m.items.map(row).join('')}</ul>${more(m.hidden, '#/odatlar')}`
    : `<p class="muted home-empty">${m.empty ? 'Odatlar hali yo\'q.' : 'Bugun jadvalda odat yo\'q.'} <a href="#/odatlar/yangi">Odat qo'shish</a></p>`;
  return sec('h-habits', 'Bugungi odatlar', '#/odatlar', 'Hammasi', body);
}
function goalsHtml(m, T) {
  if (!m) return sec('h-goals', 'Maqsadlar', '#/maqsadlar', 'Hammasi', failed);
  if (!m.items.length) return sec('h-goals', 'Maqsadlar', '#/maqsadlar', 'Hammasi', `<p class="muted home-empty">${m.empty ? "Maqsadlar hali yo'q." : "Faol maqsad yo'q."} <a href="#/maqsadlar/yangi">Maqsad qo'shish</a></p>`);
  const row = (x) => { const pr = x.progress, meta = [pr.total ? `${pr.done}/${pr.total} bosqich` : 'bosqichlar yo\'q', deadlineText(x.deadline, x.goal.deadline, T)].filter(Boolean).join(' · ');
    return `<li class="t-row p-row"><a class="t-main" href="#/maqsadlar/${x.goal.id}"><span class="t-title">${esc(x.goal.title)}</span><span class="t-meta">${meta}</span>${bar(pr, `${x.goal.title}: progress`)}</a></li>`; };
  return sec('h-goals', 'Faol maqsadlar', '#/maqsadlar', 'Hammasi', `<ul class="t-list">${m.items.map(row).join('')}</ul>${more(m.hidden, '#/maqsadlar')}`);
}
function projectsHtml(m, T) {
  if (!m) return sec('h-projects', 'Loyihalar', '#/loyihalar', 'Hammasi', failed);
  if (!m.items.length) return m.empty ? '' : sec('h-projects', 'Loyihalar', '#/loyihalar', 'Hammasi', `<p class="muted home-empty">Faol loyiha yo'q.</p>`);
  const row = (x) => { const pr = x.progress, meta = [pr.total ? `${pr.done}/${pr.total} qadam` : "qadamlar yo'q", deadlineText(x.deadline, x.project.deadline, T)].filter(Boolean).join(' · ');
    return `<li class="t-row p-row"><a class="t-main" href="#/loyihalar/${x.project.id}"><span class="t-title">${esc(x.project.title)}</span><span class="t-meta">${meta}</span>${bar(pr, `${x.project.title}: progress`)}</a></li>`; };
  return sec('h-projects', 'Faol loyihalar', '#/loyihalar', 'Hammasi', `<ul class="t-list">${m.items.map(row).join('')}</ul>${more(m.hidden, '#/loyihalar')}`);
}
function journalHtml(m) {
  if (!m) return '';
  return m.wroteToday
    ? `<section class="card home-cta" id="h-journal"><p><b>Bugun jurnalga yozdingiz.</b>${m.streak > 1 ? ` Ketma-ket ${m.streak} kun.` : ''}</p><a class="btn btn-2" href="#/jurnal">Jurnalni ochish</a></section>`
    : `<section class="card home-cta" id="h-journal"><p><b>Bugun jurnalga yozmadingiz.</b>${m.streak > 0 ? ` Ketma-ket ${m.streak} kunlik seriyani saqlab qoling.` : ' Kunni bir necha jumla bilan yakunlang.'}</p><a class="btn btn-2" href="#/jurnal/yangi">${icon('plus', 18)}Yozish</a></section>`;
}

function render(main, M) {
  const T = M.today, d = M.day, num = (m, f) => (m ? f(m) : '—'), warn = K.overdueText(M.overdue);
  const dayText = d.percent === null ? "Bugun reja bo'sh" : `Bugun: ${d.done}/${d.total} bajarildi (${d.percent}%)`;
  main.innerHTML = `<section class="t-stats" aria-label="Bugungi holat"><div class="stat"><b id="h-stat-tasks">${num(M.tasks, (m) => `${m.done}/${m.total}`)}</b><span>Vazifa</span></div><div class="stat"><b id="h-stat-habits">${num(M.habits, (m) => `${m.done}/${m.total}`)}</b><span>Odat</span></div><div class="stat"><b id="h-stat-goals">${num(M.goals, (m) => m.active)}</b><span>Faol maqsad</span></div><div class="stat"><b id="h-stat-overdue"${M.overdue.total ? ' class="bad"' : ''}>${M.overdue.total}</b><span>Muddati o'tgan</span></div></section>
    <section class="card home-day" id="h-day"><p id="h-day-text">${esc(dayText)}</p>${d.percent === null ? '' : `<div class="bar" role="progressbar" aria-label="Bugungi kun progressi" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${d.percent}"><i style="width:${d.percent}%"></i></div>`}</section>
    ${warn ? `<p class="home-warn" id="h-warn" role="status">${esc(warn)}</p>` : ''}
    ${tasksHtml(M.tasks, T)}${habitsHtml(M.habits)}${goalsHtml(M.goals, T)}${projectsHtml(M.projects, T)}${journalHtml(M.journal)}`;
  main.querySelectorAll('[data-task]').forEach((b) => { b.onclick = refreshAfter(main, () => TS.setDone(b.dataset.task, b.dataset.date, b.getAttribute('aria-pressed') !== 'true'), b); });
  main.querySelectorAll('[data-habit]').forEach((b) => { b.onclick = refreshAfter(main, () => HS.setDone(b.dataset.habit, T, b.getAttribute('aria-pressed') !== 'true'), b); });
}
