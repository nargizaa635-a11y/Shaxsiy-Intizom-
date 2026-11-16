// Sozlamalar: PINni almashtirish, qulflash va diagnostika (PIN/qulf holati, PBKDF2 tezligi).
import * as lock from '../lock.js';
import { transact, wrap } from '../database.js';
import { SECURITY_KEY } from '../schema.js';
import { icon, esc } from '../ui.js';
import { pinField, wire, pinProblem, explain, fmtWait, benchPbkdf2, benchText, recoveryFlow } from './security-ui.js';

export function renderSettings() {
  return `<section class="card"><h2>Xavfsizlik</h2>
    <button class="btn btn-2" id="s-lock" type="button">${icon('lock', 18)} Hozir qulflash</button></section>
  <section class="card"><h2>PINni almashtirish</h2><p class="muted">Ma'lumotlaringiz qayta shifrlanmaydi, tiklash kaliti ham o'zgarmaydi.</p>
    ${pinField('o-pin', 'Hozirgi PIN')}${pinField('n-pin', 'Yangi PIN', '6–8 ta raqam')}${pinField('n-pin2', 'Yangi PINni qayta kiriting')}
    <p class="err" id="s-err" role="alert"></p><p class="ok" id="s-ok" role="status"></p><button class="btn" id="s-change" type="button">PINni almashtirish</button></section>
  <section class="card"><h2>Tiklash kalitini yangilash</h2><p class="muted">Kalitni yo'qotgan yoki boshqa birov ko'rgan bo'lsa, yangisini yarating. Yangi kalit tasdiqlangach eskisi ishlamay qoladi. PIN va ma'lumotlaringiz o'zgarmaydi.</p>
    ${pinField('r-pin', 'Hozirgi PIN')}
    <p class="err" id="r-err" role="alert"></p><p class="ok" id="r-ok" role="status"></p><button class="btn" id="r-start" type="button">Yangi tiklash kalitini yaratish</button></section>
  <section class="card"><h2>Diagnostika</h2><p class="muted">PIN va qulf holati hamda qurilmada PIN tekshiruvi qancha vaqt olishi. Bu yerda hech qanday sozlama o'zgarmaydi.</p>
    <dl class="kv" id="d-state" aria-live="polite"></dl>
    <button class="btn btn-2" id="d-refresh" type="button">Holatni yangilash</button>
    <button class="btn btn-2" id="d-bench" type="button">Tezlikni o'lchash</button><pre class="diag" id="d-out" aria-live="polite"></pre>
    <button class="btn btn-link" id="d-bench-copy" type="button" hidden>Natijani nusxalash</button></section>`;
}

// Faqat sezgir bo'lmagan metama'lumot: salt, IV va shifrlangan baytlar ko'rsatilmaydi.
export async function readDiagnostics() {
  const st = await lock.getState();
  const rec = await transact(['settings'], 'readonly', (s) => wrap(s.settings.get(SECURITY_KEY)));
  const v = rec && rec.value;
  return {
    status: st.status, locked: st.locked, throttleMs: st.throttleRemainingMs,
    kdf: v ? v.pin.kdf : null, iterations: v ? v.pin.iterations : null, recKdf: v ? v.rec.kdf : null,
    recoveryConfirmed: v ? !!v.recoveryConfirmed : null, rotationPending: v ? !!v.recNext : null,
  };
}
const STATUS = { none: 'PIN yaratilmagan', 'pending-recovery': 'Tiklash kaliti tasdiqlanmagan', ready: 'Tayyor' };
export function diagRows(d) {
  return [
    ['Vault holati', STATUS[d.status] || d.status], ['Qulf', d.locked ? 'Qulflangan' : 'Ochiq'],
    ['Noto\'g\'ri urinishlar kutishi', d.throttleMs > 0 ? fmtWait(d.throttleMs) : "Yo'q"],
    ['PIN kaliti (KDF)', d.kdf ? `${d.kdf}, ${d.iterations} iteratsiya` : '—'], ['Tiklash kaliti (KDF)', d.recKdf || '—'],
    ['Tiklash kaliti tasdig\'i', d.recoveryConfirmed == null ? '—' : d.recoveryConfirmed ? 'Tasdiqlangan' : 'Tasdiqlanmagan'],
    ['Kalit almashtirish', d.rotationPending ? 'Tasdiq kutilmoqda' : "Yo'q"],
  ];
}

export function bindSettings(root) {
  const $ = (s) => root.querySelector(s); wire(root);
  $('#s-lock').onclick = () => lock.lock('manual');
  $('#s-change').onclick = async () => {
    const err = $('#s-err'), ok = $('#s-ok'), btn = $('#s-change'); err.textContent = ''; ok.textContent = '';
    const oldPin = $('#o-pin').value, np = $('#n-pin').value;
    const p = !/^\d{4,8}$/.test(oldPin) ? 'Hozirgi PINni kiriting.' : pinProblem(np, $('#n-pin2').value) || (np === oldPin ? 'Yangi PIN hozirgisidan farq qilsin.' : '');
    if (p) { err.textContent = p; return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Tekshirilmoqda…';
    try { await lock.changePin(oldPin, np); ok.textContent = 'PIN almashtirildi.'; ['#o-pin', '#n-pin', '#n-pin2'].forEach((i) => { $(i).value = ''; }); }
    catch (e) { err.textContent = e.name === 'WrongCredentialError' ? 'Hozirgi PIN noto\'g\'ri.' : explain(e); }
    finally { btn.disabled = false; btn.textContent = label; refresh(); }
  };
  $('#r-start').onclick = async () => {
    const err = $('#r-err'), ok = $('#r-ok'), btn = $('#r-start'), pin = $('#r-pin').value; err.textContent = ''; ok.textContent = '';
    if (!/^\d{4,8}$/.test(pin)) { err.textContent = 'Hozirgi PINni kiriting.'; return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Tekshirilmoqda…';
    let key;
    try { ({ recoveryKey: key } = await lock.startRecoveryRotation(pin)); $('#r-pin').value = ''; }
    catch (e) { err.textContent = e.name === 'WrongCredentialError' ? 'Hozirgi PIN noto\'g\'ri.' : explain(e); btn.disabled = false; btn.textContent = label; return; }
    // Kalit to'liq ekranli oynada ko'rsatiladi (qulf ekrani joyida). Ilova qulflansa, oqim to'xtaydi va kalit xotiradan tozalanadi.
    const overlay = document.getElementById('lock'), ac = new AbortController(), off = lock.onLockChange((st) => { if (st.locked) ac.abort(); });
    try {
      const done = await recoveryFlow(overlay, key, (k) => lock.confirmRecoveryRotation(k), { cancelable: true, signal: ac.signal });
      if (!ac.signal.aborted) { overlay.hidden = true; overlay.innerHTML = ''; }
      ok.textContent = done ? 'Tiklash kaliti yangilandi. Eskisi endi ishlamaydi.' : ac.signal.aborted ? '' : 'Yangilash bekor qilindi. Eski tiklash kaliti hozircha ishlaydi.';
    } finally { off(); key = ''; btn.disabled = false; btn.textContent = label; refresh(); }
  };
  async function refresh() {
    const box = () => $('#d-state'); if (!box()) return; // ko'rinish almashgan yoki qulflash tufayli tozalangan
    try { const html = diagRows(await readDiagnostics()).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join(''); if (box()) box().innerHTML = html; }
    catch (e) { if (box()) box().innerHTML = `<dt>Xatolik</dt><dd>${esc(e.message)}</dd>`; }
  }
  $('#d-refresh').onclick = refresh; refresh();
  $('#d-bench').onclick = async () => {
    const b = $('#d-bench'), out = $('#d-out'); b.disabled = true; out.textContent = "O'lchanmoqda…";
    try {
      out.textContent = benchText(await benchPbkdf2()); const c = $('#d-bench-copy'); c.hidden = false;
      c.onclick = async () => { try { await navigator.clipboard.writeText(out.textContent); c.textContent = 'Nusxalandi'; } catch (_) { c.textContent = "Nusxalab bo'lmadi, matnni belgilab oling"; } };
    } catch (e) { out.textContent = `O'lchab bo'lmadi: ${e.message}`; } finally { b.disabled = false; }
  };
}
