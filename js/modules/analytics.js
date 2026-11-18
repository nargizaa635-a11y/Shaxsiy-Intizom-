// Tahlil interfeysi: davr tanlash (7/30/90 kun), intizom indeksi, xulosalar, kunlik bajarilish va kayfiyat grafiklari (SVG), odatlar, vazifalar, jurnal, maqsad/loyihalar.
// Ma'lumot faqat modullarning store'lari orqali; har manba alohida yuklanadi (biri buzilsa qolganlari ko'rinadi). Faqat o'qiydi, hech narsa yozmaydi.
// Qulflanganda xotira va obunalar tozalanadi; localStorage/sessionStorage'ga hech narsa yozilmaydi (tanlangan davr ham faqat xotirada).
import * as lock from '../lock.js';
import * as TS from './tasks-store.js';
import * as HS from './habits-store.js';
import * as GS from './goals-store.js';
import * as PS from './projects-store.js';
import * as JS from './journal-store.js';
import * as K from './analytics-core.js';
import { resolve } from '../router.js';
import { ROUTES } from './registry.js';
import { esc, errorState, loadingState } from '../ui.js';
import * as UI from './ui-kit.js';

const st = { days: K.DEFAULT_PERIOD, src: null, token: 0, main: null, offs: [] };
const nowMs = () => Date.now();
const allowed = () => lock.canAccessPersonalPages();
const STORES = [TS, HS, GS, PS, JS];

// ---------- Hayot sikli ----------
function dispose() {
  st.token++; st.src = null; st.main = null; st.days = K.DEFAULT_PERIOD; st.offs.forEach((off) => off()); st.offs = [];
}
let hooked = false;
export function startAnalytics() {
  if (!hooked) { hooked = true; lock.onLockChange((s) => { if (s.locked) dispose(); }); }
  st.offs.forEach((off) => off()); st.offs = STORES.map((S) => S.subscribe(scheduleRefresh));
}
const refresher = UI.createRefresher({ getMain: () => st.main, allowed, routeRe: { test: (h) => resolve(h, ROUTES) === 'tahlil' }, blockClass: 't-form', render: (main) => mountAnalytics(main, true) }), scheduleRefresh = refresher.schedule;

// ---------- Kirish nuqtasi ----------
export async function mountAnalytics(main, silent = false) {
  st.main = main; const token = ++st.token; if (!silent) main.innerHTML = loadingState();
  try {
    const [t, h, g, p, j] = await Promise.allSettled([TS.loadAll(), HS.loadAll(), GS.loadAll(), PS.loadAll(), JS.loadAll()]);
    if (token !== st.token || !allowed()) return;
    const val = (r) => (r.status === 'fulfilled' ? r.value : null);
    if ([t, h, g, p, j].every((r) => r.status === 'rejected')) throw t.reason;
    st.src = { tasks: val(t), habits: val(h), goals: val(g), projects: val(p), journal: val(j) };
    refresher.dirty = false; render(main); if (!silent) window.scrollTo(0, 0);
  } catch (e) { if (token === st.token && allowed()) main.innerHTML = errorState(e.message); }
}

// ---------- Grafiklar (SVG) ----------
const W = 320, H = 150, PT = 12, PB = 22, shortDate = (d) => `${d.slice(8)}.${d.slice(5, 7)}`;
const lbl = (b, size) => (size > 1 ? `${shortDate(b.from)}–${shortDate(b.to)}` : shortDate(b.from));
function barChart(A) {
  const bs = A.chart.buckets, n = bs.length, PL = 6, plotW = W - PL - 6, plotH = H - PT - PB, slot = plotW / n, bw = Math.max(2, slot * 0.7), base = PT + plotH, mx = A.chart.maxPlanned;
  const bars = bs.map((b, i) => { const x = (PL + i * slot + (slot - bw) / 2).toFixed(1), hp = (b.planned / mx) * plotH, hd = (b.done / mx) * plotH;
    return `${b.planned ? `<rect class="ch-plan" x="${x}" y="${(base - hp).toFixed(1)}" width="${bw.toFixed(1)}" height="${hp.toFixed(1)}" rx="1.5"></rect>` : ''}${b.done ? `<rect class="ch-done" x="${x}" y="${(base - hd).toFixed(1)}" width="${bw.toFixed(1)}" height="${hd.toFixed(1)}" rx="1.5"></rect>` : ''}`; }).join('');
  const tp = bs.reduce((a, b) => a + b.planned, 0), td = bs.reduce((a, b) => a + b.done, 0);
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${A.size > 1 ? 'Haftalik' : 'Kunlik'} bajarilish grafigi: jami ${tp} ta rejadan ${td} tasi bajarildi"><line class="ch-axis" x1="${PL}" y1="${base}" x2="${W - 6}" y2="${base}"></line>${bars}<text class="ch-lbl" x="${PL}" y="${H - 6}">${lbl(bs[0], A.size)}</text><text class="ch-lbl" x="${W - 6}" y="${H - 6}" text-anchor="end">${lbl(bs[n - 1], A.size)}</text><text class="ch-lbl" x="${PL}" y="9">maks ${mx}</text></svg>`;
}
function moodChart(A) {
  const bs = A.mood.buckets, n = bs.length, PL = 20, plotW = W - PL - 8, plotH = H - PT - PB, slot = plotW / n, X = (i) => PL + i * slot + slot / 2, Y = (m) => PT + plotH * ((5 - m) / 4);
  const grid = [1, 3, 5].map((v) => `<line class="ch-axis" x1="${PL}" y1="${Y(v).toFixed(1)}" x2="${W - 8}" y2="${Y(v).toFixed(1)}"></line><text class="ch-lbl" x="${PL - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join('');
  const pts = bs.map((b, i) => (b.mood === null ? null : `${X(i).toFixed(1)},${Y(b.mood).toFixed(1)}`)).filter(Boolean); // kayfiyatli kunlar bo'sh kunlar orqali bog'lanadi
  const path = pts.length > 1 ? `<polyline class="ch-line" points="${pts.join(' ')}"></polyline>` : '';
  const dots = bs.map((b, i) => (b.mood === null ? '' : `<circle class="ch-dot" cx="${X(i).toFixed(1)}" cy="${Y(b.mood).toFixed(1)}" r="3"></circle>`)).join('');
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kayfiyat grafigi: davr o'rtachasi ${A.journal && A.journal.avgMood !== null ? A.journal.avgMood : "yo'q"} (1–5 shkala)">${grid}${path}${dots}<text class="ch-lbl" x="${PL}" y="${H - 6}">${lbl(bs[0], A.size)}</text><text class="ch-lbl" x="${W - 8}" y="${H - 6}" text-anchor="end">${lbl(bs[n - 1], A.size)}</text></svg>`;
}

// ---------- Chizish ----------
const failed = '<p class="muted" role="status">Yuklab bo\'lmadi. Sahifani yangilab ko\'ring.</p>';
const card = (id, title, body) => `<section class="card a-card" id="${id}"><h2>${title}</h2>${body}</section>`;
const bar = (pct, label) => (pct === null ? '' : `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`);

function indexCard(A) {
  const x = A.index, v = x.value;
  if (v === null) return card('a-index-card', 'Intizom indeksi', `<p class="muted" id="a-index-empty">Indeks hisoblash uchun odat yoki vazifa kerak. <a href="#/odatlar/yangi">Odat qo'shing</a> yoki <a href="#/reja/yangi">vazifa qo'shing</a>.</p>`);
  const delta = x.delta === null ? '' : x.delta > 0 ? `Oldingi ${A.days} kunga nisbatan +${x.delta}` : x.delta < 0 ? `Oldingi ${A.days} kunga nisbatan −${Math.abs(x.delta)}` : `Oldingi ${A.days} kun bilan bir xil`;
  const parts = [x.habits !== null ? `Odatlar: ${x.habits}%` : '', x.tasks !== null ? `Vazifalar: ${x.tasks}%` : ''].filter(Boolean).join(' · ');
  return card('a-index-card', 'Intizom indeksi', `<p class="a-idx"><b id="a-index" class="${v < 40 ? 'bad' : ''}">${v}</b><span id="a-label">${esc(x.label)}</span></p>${bar(v, 'Intizom indeksi')}${delta ? `<p class="muted" id="a-delta">${esc(delta)}</p>` : ''}<p class="muted" id="a-parts">${esc(parts)}</p><p class="muted a-note">Indeks = odatlar va vazifalar bajarilishining o'rtachasi. Bugungi hali bajarilmaganlar hisobga olinmaydi.</p>`);
}
function insightsCard(A) {
  if (!A.insights.length) return '';
  return card('a-insights', 'Xulosalar', `<ul class="a-ins">${A.insights.map((i) => `<li class="ins-${i.kind}">${esc(i.text)}</li>`).join('')}</ul>`);
}
function chartCard(A) {
  const title = A.size > 1 ? 'Haftalik bajarilish' : 'Kunlik bajarilish';
  if (!A.chart.hasData) return card('a-chart', title, `<p class="muted" id="a-chart-empty">Bu davrda rejalashtirilgan vazifa yoki odat yo'q.</p>`);
  const tp = A.chart.buckets.reduce((a, b) => a + b.planned, 0), td = A.chart.buckets.reduce((a, b) => a + b.done, 0);
  return card('a-chart', title, `${barChart(A)}<p class="a-legend"><span class="lg lg-plan"></span>Reja <span class="lg lg-done"></span>Bajarildi</p><p class="muted" id="a-chart-sum">Jami ${tp} ta rejadan ${td} tasi bajarildi.</p>`);
}
function habitsCard(A) {
  const m = A.habits; if (!m) return card('a-habits', 'Odatlar', failed);
  if (!m.items.length) return card('a-habits', 'Odatlar', `<p class="muted" id="a-habits-empty">${m.activeCount ? 'Bu davrda jadvaldagi odat yo\'q.' : 'Faol odatlar yo\'q.'} <a href="#/odatlar/yangi">Odat qo'shish</a></p>`);
  const row = (x) => `<li class="t-row"><a class="t-main" href="#/odatlar/${x.habit.id}"><span class="t-title">${esc(x.habit.title)}</span><span class="t-meta">${x.done}/${x.total} kun${x.streak > 0 ? ` · seriya ${x.streak}` : ''}</span>${bar(x.rate, `${x.habit.title}: ${x.rate}%`)}</a><b class="a-pct">${x.rate}%</b></li>`;
  return card('a-habits', 'Odatlar', `<ul class="t-list">${m.items.map(row).join('')}</ul>${m.hidden ? `<p class="muted"><a href="#/odatlar">Yana ${m.hidden} ta</a></p>` : ''}`);
}
function tasksCard(A) {
  const m = A.tasks; if (!m) return card('a-tasks', 'Vazifalar', failed);
  if (!m.total) return card('a-tasks', 'Vazifalar', `<p class="muted" id="a-tasks-empty">${m.empty ? 'Vazifalar hali yo\'q.' : 'Bu davrda vazifa yo\'q.'} <a href="#/reja/yangi">Vazifa qo'shish</a></p>`);
  return card('a-tasks', 'Vazifalar', `<p id="a-tasks-sum"><b>${m.done}/${m.total}</b> bajarildi${m.rate !== null ? ` (${m.rate}%)` : ''}</p>${bar(m.rate, 'Vazifalar bajarilishi')}${m.overdueNow ? `<p class="bad" id="a-overdue">Hozir muddati o'tgan: ${m.overdueNow} ta</p>` : ''}`);
}
function moodCard(A) {
  const j = A.journal; if (!j) return card('a-mood', 'Jurnal va kayfiyat', failed);
  const stats = `<p class="muted" id="a-journal-sum">Yozuvlar: ${j.entries} · yozilgan kunlar: ${j.daysWritten}/${A.days}${j.avgMood !== null ? ` · o'rtacha kayfiyat: ${j.avgMood}/5` : ''}${j.streak > 1 ? ` · ketma-ket ${j.streak} kun` : ''}</p>`;
  return card('a-mood', 'Jurnal va kayfiyat', A.mood.hasData ? `${moodChart(A)}${stats}` : `<p class="muted" id="a-mood-empty">Bu davrda kayfiyat belgilangan yozuv yo'q.</p>${stats}`);
}
function plansCard(A) {
  const g = A.goals, p = A.projects; if (!g && !p) return card('a-plans', 'Maqsad va loyihalar', failed);
  const line = (name, m, link) => !m ? `<p class="muted">${name}: yuklab bo'lmadi.</p>` : m.empty ? '' : `<p><a href="${link}"><b>${name}:</b></a> faol ${m.active}${m.avgProgress !== null ? ` (o'rtacha progress ${m.avgProgress}%)` : ''}, davrda ${name === 'Maqsadlar' ? 'erishilgan' : 'yakunlangan'} ${m.doneInPeriod}${m.overdue ? `, <span class="bad">muddati o'tgan ${m.overdue}</span>` : ''}</p>`;
  const body = `${line('Maqsadlar', g, '#/maqsadlar')}${line('Loyihalar', p, '#/loyihalar')}`;
  return card('a-plans', 'Maqsad va loyihalar', body || `<p class="muted" id="a-plans-empty">Maqsad va loyihalar hali yo'q.</p>`);
}

function render(main) {
  const A = K.buildAnalytics(st.src, st.days, nowMs());
  main.innerHTML = `<div class="chips" role="group" aria-label="Davr">${K.PERIODS.map((d) => `<button type="button" class="chip${d === st.days ? ' on' : ''}" data-days="${d}" aria-pressed="${d === st.days}">${d} kun</button>`).join('')}</div>
    ${indexCard(A)}${insightsCard(A)}${chartCard(A)}${habitsCard(A)}${tasksCard(A)}${moodCard(A)}${plansCard(A)}`;
  main.querySelectorAll('[data-days]').forEach((b) => { b.onclick = () => { st.days = Number(b.dataset.days); render(main); }; });
}
