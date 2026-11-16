// PIN yaratish, tiklash kaliti, qulf ekrani va tiklash interfeysi.
// Xavfsizlik mantig'i (kutish, qulf, vault) faqat lock.js orqali: bu yerda hech qanday sir saqlanmaydi (PIN/kalit faqat yopilmada).
import * as lock from '../lock.js';
import * as C from '../crypto.js';
import { icon } from '../ui.js';

const $ = (r, s) => r.querySelector(s);
export const GROUPS = 14, CONFIRM_GROUPS = 3;

// ---------- Sof yordamchilar (Node'da ham testlanadi) ----------
const COMMON_WEAK = new Set(['112233', '123321', '159753', '147258', '258369', '789456', '112211', '102030', '010203', '696969', '121314', '123654', '111222', '000111', '123123', '13579', '135791']);
export function weakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return true; // 111111, 000000
  const d = [...pin].map(Number), steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true; // 123456, 654321
  for (let p = 1; p <= pin.length / 2; p++) if (pin.length % p === 0 && pin.slice(0, p).repeat(pin.length / p) === pin) return true; // 121212, 12341234
  return COMMON_WEAK.has(pin);
}
// Yangi PIN uchun siyosat: 6–8 raqam, oson PIN'lar rad etiladi. pin2 berilsa, mos kelishi ham tekshiriladi.
export function pinProblem(pin, pin2) {
  if (!/^\d*$/.test(pin)) return "PIN faqat raqamlardan iborat bo'lsin.";
  if (pin.length < 6 || pin.length > 8) return "PIN 6–8 ta raqamdan iborat bo'lishi kerak.";
  if (weakPin(pin)) return "Bu PIN juda oson topiladi (masalan 111111 yoki 123456). Boshqa PIN tanlang.";
  if (pin2 !== undefined && pin !== pin2) return 'Ikkala PIN bir xil emas. Qayta kiriting.';
  return '';
}
// To'liq kalitni qayta kiritishni solishtirish (crypto.parseRecoveryKey bilan bir xil normallashtirish: katta harf, O->0, I/L->1, bo'shliq va chiziqlar e'tiborga olinmaydi).
export const fullNorm = (s) => String(s).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[\s-]/g, '');
export const KEY_CHARS = 56, KEY_INPUT_MAX = 100;
export function checkFullKey(typed, key) {
  const t = fullNorm(typed), k = fullNorm(key);
  if (!t) return { ok: false, error: 'Kalitni to\'liq kiriting.' };
  if (t === k) return { ok: true };
  if (t.length !== k.length) return { ok: false, error: `Kalit ${k.length} ta belgidan iborat (14 guruh × 4). Siz ${t.length} ta belgi kiritdingiz.` };
  const bad = [...Array(Math.ceil(k.length / 4)).keys()].find((g) => t.slice(g * 4, g * 4 + 4) !== k.slice(g * 4, g * 4 + 4));
  return { ok: false, error: `Kiritilgan kalit asl kalitga mos kelmadi (${bad + 1}-guruhda farq bor). Tekshirib, qayta kiriting.` };
}
export const normGroup = (s) => String(s).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
export function pickGroups(total = GROUPS, count = CONFIRM_GROUPS, rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n) {
  const picks = []; while (picks.length < count) { const i = rand(total); if (!picks.includes(i)) picks.push(i); }
  return picks.sort((a, b) => a - b);
}
export function fmtWait(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} daq ${String(s % 60).padStart(2, '0')} s` : `${s} s`; }

// PBKDF2 tezligi diagnostikasi: faqat o'lchaydi (soxta PIN va tasodifiy salt bilan), hech narsani saqlamaydi va o'zgartirmaydi.
export async function benchPbkdf2(iterations = C.MIN_ITERATIONS, runs = 3) {
  const times = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); await C.kekFromPin('000000', C.randomBytes(16), iterations); times.push(Math.round(performance.now() - t)); }
  const sorted = [...times].sort((a, b) => a - b);
  return { iterations, runs: times, medianMs: sorted[Math.floor(sorted.length / 2)] };
}
export const benchText = (r) => `PBKDF2-SHA256, ${r.iterations} iteratsiya\nUrinishlar: ${r.runs.join(', ')} ms\nO'rtacha (median): ${r.medianMs} ms\nQurilma: ${navigator.userAgent}\nYadrolar: ${navigator.hardwareConcurrency || '?'}`;

// Xato -> foydalanuvchi uchun tushunarli matn
export function explain(e, ctx = 'pin') {
  switch (e && e.name) {
    case 'ThrottledError': return `Juda ko'p noto'g'ri urinish. ${fmtWait(e.remainingMs)} dan keyin qayta urinib ko'ring.`;
    case 'WrongCredentialError': return ctx === 'recovery' ? 'Bu tiklash kaliti mos kelmadi.' : "PIN noto'g'ri.";
    case 'RecoveryFormatError': return e.message;
    case 'VaultExistsError': return 'PIN boshqa oynada allaqachon yaratilgan.';
    default: return `Xatolik: ${e && e.message ? e.message : e}`;
  }
}

// ---------- DOM yordamchilari ----------
export const pinField = (id, label, hint = '') => `<label class="fld"><span>${label}</span><div class="pin"><input id="${id}" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-describedby="${id}-h"><button type="button" class="eye" data-eye="${id}" aria-label="PINni ko'rsatish yoki yashirish" aria-pressed="false">${icon('eye', 20)}</button></div>${hint ? `<small id="${id}-h">${hint}</small>` : `<small id="${id}-h" hidden></small>`}</label>`;
export function wire(root) {
  root.querySelectorAll('[data-eye]').forEach((b) => { b.onclick = () => { const i = $(root, `#${b.dataset.eye}`); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', String(show)); }; });
  root.querySelectorAll('input[inputmode="numeric"]').forEach((i) => { i.oninput = () => { i.value = i.value.replace(/\D/g, '').slice(0, 8); }; });
}
const mount = (root, html) => { root.innerHTML = `<div class="lock-card">${html}</div>`; root.hidden = false; wire(root); const f = $(root, 'input, textarea'); if (f) f.focus({ preventScroll: true }); };
const setErr = (root, m) => { const e = $(root, '#err'); if (e) e.textContent = m || ''; };
async function busy(root, fn) {
  const b = $(root, '#go'); const label = b.textContent; b.disabled = true; b.textContent = 'Tekshirilmoqda…';
  try { return await fn(); } finally { if (b.isConnected) { b.disabled = false; b.textContent = label; } }
}
const clearInputs = (root) => root.querySelectorAll('input, textarea').forEach((i) => { i.value = ''; });

// ---------- Tiklash kaliti: ko'rsatish -> 3 ta tasodifiy guruhni qayta kiritish -> to'liq kalit bilan tasdiqlash ----------
// Natija: true (tasdiqlandi) | false (foydalanuvchi bekor qildi yoki signal to'xtatdi). `cancelable` faqat ixtiyoriy yangilashda: majburiy oqimda (PIN yaratish) bekor qilish yo'q.
// `signal` to'xtatilsa (masalan, ilova qulflanganda) kalit xotiradan tozalanadi va ekranga tegilmaydi: u endi qulf ekraniga tegishli.
export function recoveryFlow(root, key, confirmFn, { cancelable = false, signal = null } = {}) {
  return new Promise((resolve) => {
    const groups = key.split('-'), picks = pickGroups(groups.length, CONFIRM_GROUPS);
    const finish = (v) => { key = ''; groups.length = 0; resolve(v); };
    if (signal) { if (signal.aborted) return finish(false); signal.addEventListener('abort', () => finish(false), { once: true }); }
    const cancelBtn = cancelable ? '<button class="btn btn-link" id="cancel" type="button">Bekor qilish</button>' : '';
    const bindCancel = () => { const b = $(root, '#cancel'); if (b) b.onclick = () => { root.innerHTML = ''; finish(false); }; };
    const show = () => {
      mount(root, `<div class="lock-ico">${icon('lock', 28)}</div><h1>Tiklash kaliti</h1>
        <p>PINni unutsangiz, bu kalit ma'lumotlaringizni qaytaradi. U faqat hozir ko'rsatiladi va telefonda saqlanmaydi.</p>
        <div class="rk" aria-label="Tiklash kaliti">${groups.map((g) => `<span class="rk-group">${g}</span>`).join('')}</div>
        <button class="btn btn-2" id="copy" type="button">${icon('copy', 18)} Nusxalash</button><p class="ok" id="copied" role="status"></p>
        <ul class="tips"><li>Uni telefondan tashqarida saqlang: qog'ozga yozing yoki parol menejeriga qo'shing.</li><li>PIN ham, bu kalit ham yo'qolsa, ma'lumotlarni hech kim tiklay olmaydi.</li><li>Nusxalasangiz, buferni keyin tozalang. Ekran rasmini olmang.</li></ul>
        <button class="btn" id="next" type="button">Saqlab oldim, davom etish</button>${cancelBtn}`);
      bindCancel();
      $(root, '#copy').onclick = async () => { const m = $(root, '#copied'); try { await navigator.clipboard.writeText(key); m.textContent = 'Nusxalandi.'; } catch (_) { m.textContent = "Nusxalab bo'lmadi. Kalitni qo'lda yozib oling."; } };
      $(root, '#next').onclick = confirm;
    };
    const confirm = () => {
      mount(root, `<h1>Kalitni tasdiqlang</h1><p>Saqlaganingizga ishonch hosil qilish uchun quyidagi guruhlarni kalitdan ko'chirib kiriting. Keyingi qadamda kalitni to'liq kiritasiz.</p>
        ${picks.map((p) => `<label class="fld"><span>${p + 1}-guruh</span><input class="rk-in" data-g="${p}" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`).join('')}
        <p class="err" id="err" role="alert"></p><button class="btn" id="go" type="button">Davom etish</button><button class="btn btn-link" id="back" type="button">Kalitni qayta ko'rish</button>${cancelBtn}`);
      bindCancel(); $(root, '#back').onclick = show;
      $(root, '#go').onclick = () => busy(root, async () => {
        const ok = [...root.querySelectorAll('.rk-in')].every((i) => normGroup(i.value) === normGroup(groups[Number(i.dataset.g)]));
        if (!ok) return setErr(root, "Kiritilgan guruhlar kalitga mos kelmadi. Tekshirib qayta urinib ko'ring.");
        full();
      });
    };
    // 2-qadam: kalit to'liq qayta kiritiladi. Yadro (confirmFn) aynan foydalanuvchi kiritgan matnni tekshiradi, dasturdagi nusxani emas.
    const full = () => {
      mount(root, `<h1>Kalitni to'liq kiriting</h1><p>Oxirgi tekshiruv: kalitni boshidan oxirigacha o'zingiz saqlagan joydan ko'chirib kiriting. Bo'shliq yoki chiziq bo'lishi muhim emas.</p>
        <label class="fld"><span>To'liq tiklash kaliti</span><textarea id="rk-full" rows="4" maxlength="${KEY_INPUT_MAX}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-…"></textarea></label>
        <p class="err" id="err" role="alert"></p><button class="btn" id="go" type="button">Tasdiqlash</button><button class="btn btn-link" id="back" type="button">Kalitni qayta ko'rish</button>${cancelBtn}`);
      bindCancel(); $(root, '#back').onclick = show;
      $(root, '#go').onclick = () => busy(root, async () => {
        const typed = $(root, '#rk-full').value, c = checkFullKey(typed, key);
        if (!c.ok) return setErr(root, c.error);
        try { await confirmFn(typed); } catch (e) { return setErr(root, `Tasdiqlab bo'lmadi: ${explain(e, 'recovery')}`); }
        clearInputs(root); finish(true);
      });
    };
    show();
  });
}

// ---------- Birinchi sozlash ----------
export function runSetup(root) {
  return new Promise((resolve) => {
    mount(root, `<div class="lock-ico">${icon('lock', 28)}</div><h1>PIN yarating</h1>
      <p>Ma'lumotlaringiz shu PIN bilan shifrlanadi. 6–8 ta raqam kiriting; 123456 yoki 111111 kabi oson PIN'lar qabul qilinmaydi.</p>
      ${pinField('pin', 'PIN', '6–8 ta raqam')}${pinField('pin2', 'PINni qayta kiriting')}
      <p class="err" id="err" role="alert"></p><button class="btn" id="go" type="button">Davom etish</button>
      <button class="btn btn-link" id="bench-link" type="button">Qurilma tezligini tekshirish</button>
      <pre class="diag" id="bench-out" aria-live="polite"></pre>`);
    $(root, '#bench-link').onclick = async () => { const out = $(root, '#bench-out'); out.textContent = "O'lchanmoqda…"; try { out.textContent = benchText(await benchPbkdf2()); } catch (e) { out.textContent = `O'lchab bo'lmadi: ${e.message}`; } };
    $(root, '#go').onclick = () => busy(root, async () => {
      const pin = $(root, '#pin').value, p = pinProblem(pin, $(root, '#pin2').value);
      if (p) return setErr(root, p);
      let key;
      try { ({ recoveryKey: key } = await lock.createVault(pin)); } catch (e) { if (e.name === 'VaultExistsError') return resolve(); return setErr(root, `PIN yaratib bo'lmadi: ${explain(e)}`); }
      clearInputs(root);
      await recoveryFlow(root, key, (k) => lock.confirmRecovery(k)); resolve();
    });
  });
}

// PIN to'g'ri, lekin tiklash kaliti tasdiqlanmagan: yangi kalit beriladi va tasdiqlanadi (DB shundan keyingina ochiladi).
async function forcedRecovery(root, pin) {
  const { recoveryKey } = await lock.startRecoveryRotation(pin);
  mount(root, `<div class="lock-ico">${icon('lock', 28)}</div><h1>Tiklash kalitini tasdiqlang</h1><p>Oldingi sozlash tugallanmagan. Sizga yangi tiklash kaliti beriladi: eskisi endi ishlamaydi.</p><button class="btn" id="go" type="button">Davom etish</button>`);
  await new Promise((r) => { $(root, '#go').onclick = r; });
  await recoveryFlow(root, recoveryKey, (k) => lock.confirmRecoveryRotation(k));
}

// ---------- Qulf ekrani ----------
export function runUnlock(root) {
  return new Promise((resolve) => {
    let until = 0, working = false, tick = null;
    const stopTimers = () => { clearInterval(tick); window.removeEventListener('focus', sync); };
    const finish = () => { stopTimers(); resolve(); };
    const upd = () => {
      const go = $(root, '#go'), w = $(root, '#wait'); if (!go || !w) return; // boshqa ekranda (masalan tiklash kaliti) kutish elementi yo'q
      const rem = Math.max(0, until - Date.now());
      w.textContent = rem > 0 ? `Juda ko'p noto'g'ri urinish. ${fmtWait(rem)} dan keyin qayta urinib ko'ring.` : '';
      if (!working) go.disabled = rem > 0;
    };
    const sync = async () => { try { until = Date.now() + (await lock.getState()).throttleRemainingMs; } catch (_) { /* e'tiborsiz */ } upd(); };
    const screen = () => {
      mount(root, `<div class="lock-ico">${icon('lock', 28)}</div><h1>Shaxsiy intizom</h1><p>Davom etish uchun PINni kiriting.</p>
        ${pinField('pin', 'PIN')}<p class="err" id="err" role="alert"></p><p class="wait" id="wait" role="status"></p>
        <button class="btn" id="go" type="button">Ochish</button><button class="btn btn-link" id="forgot" type="button">PINni unutdim (tiklash kaliti)</button>`);
      clearInterval(tick); tick = setInterval(upd, 250); sync();
      $(root, '#forgot').onclick = reset;
      const submit = async () => { await busy(root, async () => {
        working = true; setErr(root, ''); const pin = $(root, '#pin').value;
        try {
          if (!/^\d{4,8}$/.test(pin)) return setErr(root, 'PIN faqat raqamlardan iborat (4–8 ta).');
          const r = await lock.unlock(pin); clearInputs(root);
          if (r === 'recovery-pending') { stopTimers(); await forcedRecovery(root, pin); }
          return finish();
        } catch (e) { setErr(root, e.name === 'ThrottledError' ? '' : explain(e)); const i = $(root, '#pin'); if (i) i.value = ''; await sync(); }
        finally { working = false; upd(); }
      }); upd(); }; // busy() tugmani qayta yoqadi: kutish holatini qayta qo'llash shart
      $(root, '#go').onclick = submit; $(root, '#pin').onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
    };
    const reset = () => {
      mount(root, `<h1>Tiklash kaliti bilan kirish</h1><p>Tiklash kalitini kiriting va yangi PIN o'rnating. Ma'lumotlaringiz saqlanib qoladi. PIN ham, kalit ham yo'qolgan bo'lsa, ma'lumotlarni tiklab bo'lmaydi.</p>
        <label class="fld"><span>Tiklash kaliti</span><textarea id="rk" rows="3" maxlength="${KEY_INPUT_MAX}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-…"></textarea></label>
        ${pinField('pin', 'Yangi PIN', '6–8 ta raqam')}${pinField('pin2', 'Yangi PINni qayta kiriting')}
        <p class="err" id="err" role="alert"></p><p class="wait" id="wait" role="status"></p><button class="btn" id="go" type="button">PINni almashtirish</button><button class="btn btn-link" id="back" type="button">Orqaga</button>`);
      clearInterval(tick); tick = setInterval(upd, 250); sync();
      $(root, '#back').onclick = screen;
      $(root, '#go').onclick = async () => { await busy(root, async () => {
        working = true; setErr(root, ''); const pin = $(root, '#pin').value, p = pinProblem(pin, $(root, '#pin2').value);
        try {
          if (p) return setErr(root, p);
          await lock.resetPin($(root, '#rk').value, pin); clearInputs(root); return finish();
        } catch (e) { setErr(root, e.name === 'ThrottledError' ? '' : explain(e, 'recovery')); await sync(); }
        finally { working = false; upd(); }
      }); upd(); };
    };
    window.addEventListener('focus', sync); screen();
  });
}
