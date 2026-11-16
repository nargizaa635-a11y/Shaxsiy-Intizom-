// IndexedDB qatlami: ochish, CRUD, atomik tranzaksiyalar.
import { DB_NAME, DB_VERSION, STORES, SECURITY_KEY, migrate, stamp } from './schema.js';
import * as C from './crypto.js';

let dbPromise = null;
let currentName = DB_NAME;

// Ulanish hodisalari (faqat joriy baza uchun): 'blocked' (boshqa oyna ulanishni yopmayapti, kutilmoqda), 'unblocked' (kutish tugadi),
// 'stale' (boshqa oyna bazani yangiladi/o'chirdi: ulanish yopildi), 'closed' (brauzer ulanishni kutilmaganda yopdi).
// Ulanish yopilganda keshlangan va'da tozalanadi: keyingi open() yangi ulanish ochadi. Qulflash va xabar berish ilova (app.js) vazifasi.
const listeners = new Set();
export const onConnectionEvent = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (type, name) => { for (const fn of [...listeners]) { try { fn({ type, name }); } catch (_) { /* tinglovchi xatosi bazaga ta'sir qilmasin */ } } };

// Testlar uchun alohida baza nomiga o'tish (haqiqiy ma'lumotlarga tegmaslik uchun).
export function useDatabase(name = DB_NAME) {
  if (dbPromise) dbPromise.then((d) => d.close()).catch(() => {});
  dbPromise = null; currentName = name;
}
export const deleteDatabase = (name) => new Promise((res, rej) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res(); });
export const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
export const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Tranzaksiya bekor qilindi')); });

export function open(name = currentName, version = DB_VERSION, migrations) {
  if (name === currentName && dbPromise) return dbPromise;
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => migrate(req.result, req.transaction, e.oldVersion, e.newVersion, migrations);
    let waited = false;
    req.onblocked = () => { waited = true; if (name === currentName) emit('blocked', name); }; // rad etilmaydi: boshqa oyna yopilgach so'rov o'zi davom etadi
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const d = req.result; let lost = false;
      const drop = (type) => { if (lost) return; lost = true; try { d.close(); } catch (_) { /* allaqachon yopiq */ } if (dbPromise === p) { dbPromise = null; emit(type, name); } };
      d.onversionchange = () => drop('stale');
      d.onclose = () => drop('closed');
      if (waited && name === currentName) emit('unblocked', name);
      resolve(d);
    };
  });
  if (name === currentName) { dbPromise = p; p.catch(() => { if (dbPromise === p) dbPromise = null; }); } // xato keshda qolmaydi: qayta urinish mumkin
  return p;
}

export function checkStore(name) {
  if (!STORES[name]) throw new Error(`Noma'lum store: ${name}`);
}

// Atomik tranzaksiya. QOIDA: fn ichida faqat IndexedDB so'rovlari await qilinadi (kripto va boshqa async'lar emas),
// aks holda tranzaksiya avtomatik yopilib ketadi. Kripto har doim tranzaksiyadan oldin/keyin bajariladi.
export async function transact(names, mode, fn, db) {
  names.forEach(checkStore);
  db = db || await open();
  const tx = db.transaction(names, mode);
  const finished = done(tx);
  finished.catch(() => {});
  const stores = Object.fromEntries(names.map((n) => [n, tx.objectStore(n)]));
  try {
    const result = await fn(stores, tx);
    await finished;
    return result;
  } catch (err) {
    try { tx.abort(); } catch (_) { /* allaqachon yakunlangan */ }
    await finished.catch(() => {});
    throw err;
  }
}

// ---- Shifrlash qatlami ----
let keyProvider = () => { throw new C.LockedError(); };
export const setKeyProvider = (fn) => { keyProvider = fn; };
const kpOf = (store) => STORES[store].keyPath;
const isVault = (store, id) => store === 'settings' && id === SECURITY_KEY;
const guard = (store, id) => { if (isVault(store, id)) throw new Error("'security' kaliti zaxiralangan"); };
const isEnvelope = (r) => r && r.v === C.ENVELOPE_V && r.ct && r.iv;

// Ochiq qoladigan maydonlar: id/key, createdAt, updatedAt, v, iv, ct. Qolgan hammasi shifrlanadi.
export async function sealRecord(store, rec, key) {
  const kp = kpOf(store), id = rec[kp];
  if (isVault(store, id)) return rec;
  if (isEnvelope(rec)) throw new C.IntegrityError(`Yozuv allaqachon shifrlangan: ${store}/${id}`);
  const { [kp]: _id, createdAt, updatedAt, ...payload } = rec;
  const { iv, ct } = await C.seal(key || keyProvider(), store, id, payload);
  return { [kp]: id, createdAt, updatedAt, v: C.ENVELOPE_V, iv, ct };
}

export async function openRecord(store, raw) {
  if (!raw) return raw;
  const kp = kpOf(store), id = raw[kp];
  if (isVault(store, id)) return raw;
  if (!isEnvelope(raw)) throw new C.IntegrityError(`Shifrlanmagan yozuv topildi: ${store}/${id}`);
  const payload = await C.open(keyProvider(), store, id, raw);
  return { ...payload, [kp]: id, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
}

const rawGet = (name, id) => transact([name], 'readonly', (s) => wrap(s[name].get(id)));
const rawAll = (name) => transact([name], 'readonly', (s) => wrap(s[name].getAll()));
const MAX_RETRY = 8;

export async function add(name, data) {
  checkStore(name); guard(name, data.key);
  const now = Date.now();
  const rec = name === 'settings' ? { ...data, createdAt: now, updatedAt: now } : stamp(data, now);
  const env = await sealRecord(name, rec); // avval shifrlash, keyin qisqa yozish tranzaksiyasi
  await transact([name], 'readwrite', (s) => wrap(s[name].add(env)));
  return rec;
}

export async function get(name, id) {
  checkStore(name); guard(name, id); keyProvider();
  return openRecord(name, await rawGet(name, id)); // tranzaksiya yopilgach deshifrlanadi
}

export async function getAll(name) {
  checkStore(name); keyProvider();
  const raws = (await rawAll(name)).filter((r) => !isVault(name, r[kpOf(name)]));
  return Promise.all(raws.map((r) => openRecord(name, r)));
}

// Indekslar yo'q: filtrlash xotirada.
export async function query(name, predicate) { return (await getAll(name)).filter(predicate); }

export async function count(name) {
  checkStore(name); keyProvider();
  const keys = await transact([name], 'readonly', (s) => wrap(s[name].getAllKeys()));
  return keys.filter((k) => !isVault(name, k)).length;
}

export async function remove(name, id) {
  checkStore(name); guard(name, id); keyProvider();
  return transact([name], 'readwrite', (s) => wrap(s[name].delete(id)));
}

// O'qish -> deshifrlash -> o'zgartirish -> shifrlash (hammasi tranzaksiyadan tashqarida) -> versiyani tekshirib yozish.
// Yozish oldidan yozuv o'zgargan bo'lsa, qayta urinadi (yo'qotilgan yangilanish bo'lmaydi).
// Bir yozuvga bir vaqtdagi yangilashlar shu jarayonda ketma-ket bajariladi (tablararo to'qnashuv versiya tekshiruvi bilan hal bo'ladi).
const chains = new Map();
function serial(key, fn) {
  const next = (chains.get(key) || Promise.resolve()).catch(() => {}).then(fn);
  chains.set(key, next);
  next.catch(() => {}).then(() => { if (chains.get(key) === next) chains.delete(key); });
  return next;
}

export async function update(name, id, changes) {
  checkStore(name); guard(name, id); keyProvider();
  return serial(`${name}/${id}`, () => updateOnce(name, id, changes));
}

async function updateOnce(name, id, changes) {
  const kp = kpOf(name);
  for (let i = 0; i < MAX_RETRY; i++) {
    const raw = await rawGet(name, id);
    if (!raw) throw new Error('Yozuv topilmadi');
    const cur = await openRecord(name, raw);
    const next = { ...cur, ...changes, [kp]: id, createdAt: cur.createdAt, updatedAt: Math.max(Date.now(), cur.updatedAt + 1) };
    const env = await sealRecord(name, next);
    const ok = await transact([name], 'readwrite', async (s) => {
      const now = await wrap(s[name].get(id));
      if (!now || now.updatedAt !== raw.updatedAt) return false;
      await wrap(s[name].put(env));
      return true;
    });
    if (ok) return next;
  }
  throw new Error("Yozuv bir vaqtda o'zgartirilmoqda, qayta urinib ko'ring");
}

export async function getSetting(key, fallback = null) {
  const r = await get('settings', key);
  return r ? r.value : fallback;
}

export async function setSetting(key, value) {
  guard('settings', key);
  for (let i = 0; i < MAX_RETRY; i++) {
    if (await rawGet('settings', key)) { await update('settings', key, { value }); return; }
    try { await add('settings', { key, value }); return; } catch (e) { if (e && e.name !== 'ConstraintError') throw e; }
  }
  throw new Error('Sozlamani saqlab bo\'lmadi');
}
