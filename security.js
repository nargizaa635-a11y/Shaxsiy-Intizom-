// Vault: DEK, PIN va Recovery Key bilan o'rash, qulf holati. Kripto: crypto.js, saqlash: database.js.
import { transact, wrap, setKeyProvider, sealRecord } from './database.js';
import * as C from './crypto.js';
import { STORE_NAMES, SECURITY_KEY } from './schema.js';

export class VaultExistsError extends Error { constructor() { super("PIN allaqachon yaratilgan: mavjud vault almashtirilmaydi"); this.name = 'VaultExistsError'; } }

// DEK faqat non-extractable CryptoKey, faqat shu modul ichida. U FAQAT Recovery Key tasdiqlangan vault uchun ochiladi:
// tasdiqlanmagan (pending-recovery) holatda DEK xotirada saqlanmaydi, shuning uchun hech qanday CRUD ishlamaydi.
let dek = null;
let setupIncomplete = false; // faqat xato xabari uchun; kirishni boshqarmaydi
const provider = () => { if (!dek) throw new C.LockedError(setupIncomplete ? 'Tiklash kaliti hali tasdiqlanmagan' : undefined); return dek; };
// Modulning bir nechta nusxasi yuklangan bo'lsa (testlar), kalit provayderini shu nusxaga qaytarish uchun.
export const registerKeyProvider = () => setKeyProvider(provider);
registerKeyProvider();

export const isUnlocked = () => dek !== null;
export const lock = () => { dek = null; };

const validatePin = (pin) => { if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN 4–8 ta raqamdan iborat bo\'lishi kerak'); };
const checkIter = (n) => { if (!Number.isInteger(n) || n < C.MIN_ITERATIONS) throw new Error(`Iteratsiyalar soni ${C.MIN_ITERATIONS} dan kam bo'lishi mumkin emas`); };

const readVault = async () => (await transact(['settings'], 'readonly', (s) => wrap(s.settings.get(SECURITY_KEY)))) || null;

// 'none' | 'pending-recovery' (PIN bor, tiklash kaliti tasdiqlanmagan) | 'ready'
export async function getStatus() {
  const v = await readVault();
  return !v ? 'none' : v.value.recoveryConfirmed ? 'ready' : 'pending-recovery';
}

async function makePinWrap(pin, dekBytes, iterations) {
  const salt = C.randomBytes(16);
  const { iv, ct } = await C.wrapDek(dekBytes, await C.kekFromPin(pin, salt, iterations), 'pin');
  return { kdf: 'PBKDF2-SHA256', iterations, salt, iv, ct };
}

async function makeRecWrap(recBytes, dekBytes) {
  const salt = C.randomBytes(16);
  const { iv, ct } = await C.wrapDek(dekBytes, await C.kekFromRecovery(recBytes, salt), 'rec');
  return { kdf: 'HKDF-SHA256', salt, iv, ct };
}

const dekBytesFromPin = async (w, pin) => C.unwrapDek(w, await C.kekFromPin(String(pin), w.salt, w.iterations), 'pin');
async function dekBytesFromRecovery(w, text) {
  const rb = await C.parseRecoveryKey(text);
  try { return await C.unwrapDek(w, await C.kekFromRecovery(rb, w.salt), 'rec'); } finally { C.wipe(rb); }
}

async function needVault() {
  const v = await readVault();
  if (!v) throw new Error('PIN hali yaratilmagan');
  return v;
}

// Sozlama yozuvini faqat u o'zgarmagan bo'lsa almashtiradi (atomik, bitta tranzaksiya).
async function saveVault(prev, value) {
  await transact(['settings'], 'readwrite', async (s) => {
    const cur = await wrap(s.settings.get(SECURITY_KEY));
    if (!cur || cur.updatedAt !== prev.updatedAt) throw new Error("Xavfsizlik sozlamalari boshqa joyda o'zgargan");
    await wrap(s.settings.put({ ...cur, value, updatedAt: Math.max(Date.now(), cur.updatedAt + 1) }));
  });
}

// Mavjud (ochiq) yozuvlarni bitta tranzaksiyada shifrlaydi va vault yozuvini qo'shadi: yo hammasi, yo hech narsa.
// Vault mavjudligi yakuniy readwrite tranzaksiyasi ichida ham tekshiriladi (boshqa tab bilan poyga) va yozuv add() bilan qo'shiladi.
async function encryptAllExisting(vaultRecord, key, beforeCommit) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snap = await transact(STORE_NAMES, 'readonly', async (s) => {
      const o = {}; for (const n of STORE_NAMES) o[n] = await wrap(s[n].getAll()); return o;
    });
    if (snap.settings.some((r) => r.key === SECURITY_KEY)) throw new VaultExistsError();
    const sealed = {};
    for (const n of STORE_NAMES) sealed[n] = await Promise.all(snap[n].map((r) => sealRecord(n, r, key))); // xato bo'lsa hech narsa yozilmagan
    if (beforeCommit) await beforeCommit(attempt);
    const ok = await transact(STORE_NAMES, 'readwrite', async (s) => {
      if (await wrap(s.settings.get(SECURITY_KEY))) throw new VaultExistsError(); // tranzaksiya bekor qilinadi, mavjud vault tegilmaydi
      for (const n of STORE_NAMES) {
        const kp = n === 'settings' ? 'key' : 'id';
        const cur = await wrap(s[n].getAll());
        const same = cur.length === snap[n].length && cur.every((c) => snap[n].some((o) => o[kp] === c[kp] && o.updatedAt === c.updatedAt));
        if (!same) return false;
      }
      for (const n of STORE_NAMES) for (const r of sealed[n]) s[n].put(r);
      await wrap(s.settings.add(vaultRecord)); // mavjud bo'lsa ConstraintError: hech qachon almashtirmaydi
      return true;
    });
    if (ok) return;
  }
  throw new Error("Ma'lumotlar bir vaqtda o'zgarmoqda, qayta urinib ko'ring");
}

// DEK ochilmaydi: PIN yaratilgach ham, Recovery Key tasdiqlanmaguncha, barcha ma'lumot amallari rad etiladi.
export async function createVault(pin, { iterations = C.DEFAULT_ITERATIONS, beforeCommit } = {}) {
  validatePin(pin); checkIter(iterations);
  if (await readVault()) throw new VaultExistsError();
  const dekBytes = C.randomBytes(32), recBytes = C.newRecoveryBytes();
  try {
    const now = Date.now();
    const vaultRecord = { key: SECURITY_KEY, createdAt: now, updatedAt: now,
      value: { v: 1, recoveryConfirmed: false, pin: await makePinWrap(String(pin), dekBytes, iterations), rec: await makeRecWrap(recBytes, dekBytes), recNext: null } };
    await encryptAllExisting(vaultRecord, await C.importDek(dekBytes), beforeCommit);
    setupIncomplete = true;
    return { recoveryKey: await C.formatRecoveryKey(recBytes) };
  } finally { C.wipe(dekBytes); C.wipe(recBytes); }
}

async function openWith(dekBytes) { try { dek = await C.importDek(dekBytes); setupIncomplete = false; } finally { C.wipe(dekBytes); } }

// Tiklash kalitini to'liq kiritish uni tasdiqlaydi: shundan keyingina (va faqat saqlash muvaffaqiyatli bo'lsa) DB ochiladi.
export async function unlockWithRecovery(text) {
  const v = await needVault();
  const bytes = await dekBytesFromRecovery(v.value.rec, text);
  try { if (!v.value.recoveryConfirmed) await saveVault(v, { ...v.value, recoveryConfirmed: true }); } catch (e) { C.wipe(bytes); throw e; }
  await openWith(bytes);
}
export const confirmRecovery = unlockWithRecovery;

// 'unlocked' | 'recovery-pending': PIN to'g'ri, lekin tiklash kaliti tasdiqlanmagan, DB ochilmaydi.
export async function unlock(pin) {
  const v = await needVault();
  const bytes = await dekBytesFromPin(v.value.pin, pin);
  if (!v.value.recoveryConfirmed) { C.wipe(bytes); setupIncomplete = true; return 'recovery-pending'; }
  await openWith(bytes);
  return 'unlocked';
}

// PIN almashtirish: faqat DEK qayta o'raladi, ma'lumot qayta shifrlanmaydi.
export async function changePin(oldPin, newPin, { iterations = C.DEFAULT_ITERATIONS } = {}) {
  validatePin(newPin); checkIter(iterations);
  const v = await needVault();
  const dekBytes = await dekBytesFromPin(v.value.pin, oldPin);
  try { await saveVault(v, { ...v.value, pin: await makePinWrap(String(newPin), dekBytes, iterations) }); } finally { C.wipe(dekBytes); }
}

// Tiklash kaliti bilan yangi PIN o'rnatish; muvaffaqiyatli saqlangandan keyin ilova ochiladi.
export async function resetPinWithRecovery(text, newPin, { iterations = C.DEFAULT_ITERATIONS } = {}) {
  validatePin(newPin); checkIter(iterations);
  const v = await needVault();
  const dekBytes = await dekBytesFromRecovery(v.value.rec, text);
  try {
    await saveVault(v, { ...v.value, recoveryConfirmed: true, pin: await makePinWrap(String(newPin), dekBytes, iterations) });
    dek = await C.importDek(dekBytes); setupIncomplete = false;
  } finally { C.wipe(dekBytes); }
}

// Tiklash kalitini yangilash ikki bosqichli: 1) yangi kalit tayyorlanadi (eskisi ishlashda davom etadi),
// 2) foydalanuvchi yangisini kiritib tasdiqlaganda bitta yozuvda almashadi.
export async function startRecoveryRotation(pin) {
  const v = await needVault();
  const dekBytes = await dekBytesFromPin(v.value.pin, pin), nb = C.newRecoveryBytes();
  try {
    await saveVault(v, { ...v.value, recNext: await makeRecWrap(nb, dekBytes) });
    return { recoveryKey: await C.formatRecoveryKey(nb) };
  } finally { C.wipe(dekBytes); C.wipe(nb); }
}

export async function confirmRecoveryRotation(text) {
  const v = await needVault();
  if (!v.value.recNext) throw new Error('Yangilash boshlanmagan');
  const bytes = await dekBytesFromRecovery(v.value.recNext, text); // to'g'ri kalit kiritilganini isbotlaydi
  const wasPending = !v.value.recoveryConfirmed;
  try { await saveVault(v, { ...v.value, rec: v.value.recNext, recNext: null, recoveryConfirmed: true }); } catch (e) { C.wipe(bytes); throw e; }
  if (wasPending || dek) await openWith(bytes); else C.wipe(bytes);
}
