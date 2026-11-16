// Qulf boshqaruvi (Telegram uslubida): faqat qo'lda qulflash, tablararo qulf va noto'g'ri urinishlar kutishi.
// Faoliyatsizlik yoki fonga o'tish sababli avtomatik qulflash YO'Q. Yangi sessiyada (yopib qayta ochish/yangilash) DEK xotirada yo'q, shuning uchun PIN so'raladi.
// Kripto yadro (security.js) holatini qayta ishlatadi: "ochiq" = DEK xotirada (faqat Recovery tasdiqlangan vault uchun).
// DIQQAT: bu qatlam QO'SHIMCHA himoya, kripto himoya EMAS (README'dagi cheklovlarga qarang).
import * as sec from './security.js';

// ---------- Saqlash yordamchilari ----------
function resolveStorage(s) {
  if (s !== undefined) return s;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; }
}

// ---------- Noto'g'ri urinishlar kutishi (sof funksiyalar) ----------
export const delayForFails = (f) => (f < 3 ? 0 : f === 3 ? 10000 : f === 4 ? 30000 : f === 5 ? 60000 : f === 6 ? 300000 : 900000);
export const afterFail = (state, now) => { const fails = (state.fails || 0) + 1; return { fails, until: now + delayForFails(fails) }; };
// Soat orqaga surilsa ham kutish joriy bosqich chegarasidan oshmaydi (orqaga surish kutishni qisqartirmaydi).
export const remainingMs = (state, now) => Math.min(Math.max(0, (state.until || 0) - now), delayForFails(state.fails || 0));

export class ThrottledError extends Error { constructor(ms) { super("Juda ko'p noto'g'ri urinish"); this.name = 'ThrottledError'; this.remainingMs = ms; } }

export function createThrottle({ storage, key = 'si:throttle', now = Date.now } = {}) {
  const st = resolveStorage(storage); let mem = {};
  const read = () => { try { const raw = st && st.getItem(key); return raw ? JSON.parse(raw) : mem; } catch (_) { return mem; } };
  const write = (v) => { mem = v; try { if (st) st.setItem(key, JSON.stringify(v)); } catch (_) { /* xotirada qoladi */ } };
  return {
    state: read,
    remaining: () => remainingMs(read(), now()),
    fail: () => { const s = afterFail(read(), now()); write(s); return s; },
    reset: () => { mem = {}; try { if (st) st.removeItem(key); } catch (_) { /* e'tiborsiz */ } },
  };
}

// Faqat noto'g'ri PIN/kalit hisoblanadi (format xatosi, qulflanganlik va boshqa xatolar hisoblanmaydi).
async function guarded(throttle, fn) {
  const rem = throttle.remaining(); if (rem > 0) throw new ThrottledError(rem);
  try { const r = await fn(); throttle.reset(); return r; }
  catch (e) { if (e && e.name === 'WrongCredentialError') throttle.fail(); throw e; }
}

// ---------- Tablararo "qulf davri" (epoch): xabar o'tkazib yuborilsa ham tab keyin qulflanadi ----------
export function createEpoch({ storage, key = 'si:lock-epoch' } = {}) {
  const st = resolveStorage(storage); let mem = 0;
  const read = () => { try { const v = st && st.getItem(key); return Math.max(v ? parseInt(v, 10) || 0 : 0, mem); } catch (_) { return mem; } };
  const bump = () => { const n = read() + 1; mem = n; try { if (st) st.setItem(key, `${n}:${Math.random().toString(36).slice(2)}`); } catch (_) { /* e'tiborsiz */ } return n; };
  return { key, read, bump };
}

// ---------- Qulf menejeri ----------
export function createLockManager({ now = Date.now, throttle, epoch, win = globalThis.window, doc = globalThis.document, channel = 'auto', channelName = 'si-lock', tickMs = 5000 } = {}) {
  throttle = throttle || createThrottle({ now }); epoch = epoch || createEpoch();
  let seenEpoch = epoch.read(), ch = null, stopFn = null;
  const listeners = new Set();
  const emit = (info) => listeners.forEach((f) => { try { f({ ...info, at: now() }); } catch (_) { /* tinglovchi xatosi qulfga xalaqit bermasin */ } });

  // Faqat o'z tabidagi holat: DEK havolasi bekor qilinadi (JS xotirasini to'liq tozalash kafolatlanmaydi), UI ga signal beriladi.
  function lockLocal(reason) {
    const was = sec.isUnlocked(); sec.lock();
    if (was) emit({ locked: true, reason });
    return was;
  }
  // Hamma tablar: epoch oshiriladi (qo'shimcha kafolat) va BroadcastChannel orqali xabar yuboriladi. Xabarda sir yo'q.
  function lock(reason = 'manual') {
    const was = lockLocal(reason);
    epoch.bump(); seenEpoch = epoch.read();
    try { if (ch) ch.postMessage({ t: 'lock' }); } catch (_) { /* epoch zaxirasi bor */ }
    return was;
  }
  // Boshqa tab qulflagan bo'lsa (xabar o'tkazib yuborilgan bo'lsa ham) shu tabni qulflaydi. Bu vaqtga bog'liq avtoqulf EMAS.
  const checkEpoch = () => { if (sec.isUnlocked() && epoch.read() > seenEpoch) { lockLocal('remote'); return true; } return false; };

  // Sessiya faqat xavfsizlik yadrosi DB ni ochgandan keyin faollashadi.
  function activate(wasOpen) {
    seenEpoch = epoch.read();
    if (!wasOpen && sec.isUnlocked()) emit({ locked: false, reason: 'unlock' });
  }
  // Hisob ma'lumoti (PIN/kalit) qabul qiluvchi HAR BIR yo'l kutishdan o'tadi (guarded); xavfsizlik yadrosiga to'g'ridan-to'g'ri murojaat yo'q.
  const via = (fn) => guarded(throttle, fn);

  const api = {
    // Natija: 'unlocked' | 'recovery-pending' (PIN to'g'ri, lekin tiklash kaliti tasdiqlanmagan: DB yopiq qoladi).
    async unlock(pin) { const open = sec.isUnlocked(); const r = await via(() => sec.unlock(pin)); if (r === 'unlocked') activate(open); return r; },
    async unlockWithRecovery(key) { const open = sec.isUnlocked(); await via(() => sec.unlockWithRecovery(key)); activate(open); return 'unlocked'; },
    async resetPin(key, newPin, opts) { const open = sec.isUnlocked(); await via(() => sec.resetPinWithRecovery(key, newPin, opts)); activate(open); return 'unlocked'; },
    // PIN almashtirish: eski PIN tekshiriladi, shuning uchun kutishdan o'tadi (kutishsiz PIN oracle bo'lmasligi uchun).
    // Yangi PIN/iteratsiya xatosi eski PIN tekshirilishidan OLDIN rad etiladi va urinish hisoblanmaydi. Sessiya, DEK va tiklash kaliti o'zgarmaydi.
    changePin(oldPin, newPin, opts) { return via(() => sec.changePin(oldPin, newPin, opts)); },
    // Vault yaratish hech qanday sirni tekshirmaydi (vault bor bo'lsa VaultExistsError), shuning uchun kutishga bo'ysunmaydi. Lekin:
    // hisoblagich FAQAT muvaffaqiyatli yaratilgandan keyin tiklanadi (mavjud vaultda kutishni o'chirib bo'lmasin); DB ochilmaydi (tiklash kaliti tasdiqlanishi shart).
    async createVault(pin, opts) { const r = await sec.createVault(pin, opts); throttle.reset(); return r; },
    // Tiklash kalitini tasdiqlash (PIN yaratilgach): to'liq kalit kutish orqali o'tadi, sessiya faollashadi.
    async confirmRecovery(key) { const open = sec.isUnlocked(); await via(() => sec.confirmRecovery(key)); activate(open); return 'unlocked'; },
    // Yangi tiklash kaliti tayyorlash PIN ni tekshiradi, shuning uchun u ham kutishdan o'tadi (PIN oracle bo'lmasligi uchun).
    startRecoveryRotation(pin) { return via(() => sec.startRecoveryRotation(pin)); },
    // 'unlocked' (tasdiqlanmagan vault ochildi) | 'locked' (vault avval tasdiqlangan edi: tiklash kaliti almashdi, sessiya ochilmadi).
    async confirmRecoveryRotation(key) {
      const open = sec.isUnlocked(); await via(() => sec.confirmRecoveryRotation(key));
      if (!sec.isUnlocked()) return 'locked';
      activate(open); return 'unlocked';
    },
    lock, isLocked: () => !sec.isUnlocked(), canAccessPersonalPages: () => sec.isUnlocked(),
    async getState() { return { locked: !sec.isUnlocked(), status: await sec.getStatus(), throttleRemainingMs: throttle.remaining() }; },
    onLockChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    throttleRemaining: () => throttle.remaining(), throttleState: () => throttle.state(),
    // Sahifa ko'rinishi o'zgarganda faqat tablararo qulf holati qayta tekshiriladi (fon holati o'zi qulflamaydi).
    handleVisibilityChange() { return checkEpoch(); },
    handlePageShow() { return checkEpoch(); },
    tick() { return checkEpoch(); },
    start() {
      if (stopFn) return stopFn;
      const C = channel === 'auto' ? globalThis.BroadcastChannel : channel;
      if (C) { try { ch = new C(channelName); ch.onmessage = (e) => { if (e.data && e.data.t === 'lock') lockLocal('remote'); }; } catch (_) { ch = null; } }
      const offs = [];
      if (win) {
        const on = (t, ev, f) => { t.addEventListener(ev, f); offs.push(() => t.removeEventListener(ev, f)); };
        on(win, 'storage', (e) => { if (e.key === epoch.key) checkEpoch(); }); // BroadcastChannel bo'lmasa ham ishlaydi
        on(win, 'pageshow', () => api.handlePageShow()); on(win, 'resume', () => api.handlePageShow());
        if (doc) on(doc, 'visibilitychange', () => { if (doc.visibilityState === 'visible') api.handleVisibilityChange(); });
        const id = win.setInterval(api.tick, tickMs); offs.push(() => win.clearInterval(id));
      }
      stopFn = () => { offs.forEach((f) => f()); if (ch) { try { ch.close(); } catch (_) { /* e'tiborsiz */ } ch = null; } stopFn = null; };
      return stopFn;
    },
    stop() { if (stopFn) stopFn(); },
  };
  return api;
}

// Standart menejer (ilova uchun). Import qilish hech qanday tinglovchi/kanal ochmaydi: `start()` chaqirilguncha faol emas.
const manager = createLockManager();
export const start = () => manager.start();
export const lock = (reason) => manager.lock(reason);
export const unlock = (pin) => manager.unlock(pin);
export const unlockWithRecovery = (key) => manager.unlockWithRecovery(key);
export const resetPin = (key, pin, opts) => manager.resetPin(key, pin, opts);
export const changePin = (oldPin, newPin, opts) => manager.changePin(oldPin, newPin, opts);
export const createVault = (pin, opts) => manager.createVault(pin, opts);
export const confirmRecovery = (key) => manager.confirmRecovery(key);
export const startRecoveryRotation = (pin) => manager.startRecoveryRotation(pin);
export const confirmRecoveryRotation = (key) => manager.confirmRecoveryRotation(key);
export const isLocked = () => manager.isLocked();
export const handleVisibilityChange = () => manager.handleVisibilityChange();
export const onLockChange = (fn) => manager.onLockChange(fn);
export const getState = () => manager.getState();
export const canAccessPersonalPages = () => manager.canAccessPersonalPages();
