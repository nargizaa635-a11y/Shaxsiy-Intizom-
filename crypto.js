// Sof kriptografiya (Web Crypto). IndexedDB'ga bog'liq emas, Node va brauzerda bir xil ishlaydi.
const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const MIN_ITERATIONS = 600000;
export const DEFAULT_ITERATIONS = 600000;
export const ENVELOPE_V = 2;

export class LockedError extends Error { constructor(m = 'Ilova qulflangan') { super(m); this.name = 'LockedError'; } }
export class DecryptError extends Error { constructor(m = "Shifrni ochib bo'lmadi (kalit noto'g'ri yoki ma'lumot buzilgan)") { super(m); this.name = 'DecryptError'; } }
export class IntegrityError extends Error { constructor(m) { super(m); this.name = 'IntegrityError'; } }
export class WrongCredentialError extends Error { constructor(m) { super(m); this.name = 'WrongCredentialError'; } }
export class RecoveryFormatError extends Error { constructor(m = "Tiklash kaliti formati noto'g'ri") { super(m); this.name = 'RecoveryFormatError'; } }

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export const wipe = (b) => { if (b && typeof b.fill === 'function') b.fill(0); };

// ---- KEK (kalitni o'rovchi kalit) ----
export async function kekFromPin(pin, salt, iterations) {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Iteratsiya soni noto\'g\'ri');
  const bytes = enc.encode(pin);
  try {
    const base = await subtle().importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { wipe(bytes); }
}

export async function kekFromRecovery(keyBytes, salt) {
  const base = await subtle().importKey('raw', keyBytes, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('shaxsiy-intizom/recovery/v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---- DEK o'rash (kind: 'pin' | 'rec' AAD orqali bog'lanadi) ----
const wrapAad = (kind) => enc.encode(`si:wrap:v1:${kind}`);

export async function wrapDek(dekBytes, kek, kind) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: wrapAad(kind) }, kek, dekBytes));
  return { iv, ct };
}

export async function unwrapDek(w, kek, kind) {
  try { return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: w.iv, additionalData: wrapAad(kind) }, kek, w.ct)); }
  catch (_) { throw new WrongCredentialError(kind === 'pin' ? "PIN noto'g'ri" : "Tiklash kaliti noto'g'ri"); }
}

export const importDek = (bytes) => subtle().importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

// ---- Ma'lumot shifrlash: AAD = versiya + store + id ----
const dataAad = (store, id) => enc.encode(`si:data:v${ENVELOPE_V}:${store}:${id}`);

export async function seal(dek, store, id, obj) {
  const iv = randomBytes(12); // har safar yangi 96-bit IV
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: dataAad(store, id) }, dek, enc.encode(JSON.stringify(obj))));
  return { iv, ct };
}

export async function open(dek, store, id, env) {
  let plain;
  try { plain = await subtle().decrypt({ name: 'AES-GCM', iv: env.iv, additionalData: dataAad(store, id) }, dek, env.ct); }
  catch (_) { throw new DecryptError(); }
  return JSON.parse(dec.decode(plain));
}

// ---- Tiklash kaliti formati: Crockford base32, 52 belgi kalit + 4 belgi nazorat, 4 tadan guruh ----
const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function b32enc(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; } val &= (1 << bits) - 1; }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}

function b32dec(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of str) {
    const i = A.indexOf(ch); if (i < 0) throw new RecoveryFormatError();
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; val &= (1 << bits) - 1; }
  }
  if (val !== 0) throw new RecoveryFormatError();
  return Uint8Array.from(out);
}

async function checkChars(bytes) {
  const h = new Uint8Array(await subtle().digest('SHA-256', new Uint8Array([...enc.encode('si:rec-check'), ...bytes])));
  return b32enc(h.slice(0, 3)).slice(0, 4);
}

export const newRecoveryBytes = () => randomBytes(32);

export async function formatRecoveryKey(bytes) {
  const s = b32enc(bytes) + await checkChars(bytes);
  return s.match(/.{4}/g).join('-');
}

export async function parseRecoveryKey(text) {
  const s = String(text).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[\s-]/g, '');
  if (s.length !== 56) throw new RecoveryFormatError();
  const bytes = b32dec(s.slice(0, 52));
  if (bytes.length !== 32 || (await checkChars(bytes)) !== s.slice(52)) throw new RecoveryFormatError("Tiklash kalitida xato bor (ko'chirishda adashgan bo'lishingiz mumkin)");
  return bytes;
}
