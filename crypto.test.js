// Sof kripto testlari (Node va brauzerda).
import { test, assert, eq, rejects } from './harness.js';
import * as C from '../js/crypto.js';

export async function run() {
  const dekBytes = C.randomBytes(32), dek = await C.importDek(dekBytes);
  await test('DEK: non-extractable CryptoKey', async () => { assert(dek.extractable === false); eq(dek.algorithm.name, 'AES-GCM'); eq(dek.algorithm.length, 256); });
  await test('seal/open: aylanma yo\'l', async () => {
    const e = await C.seal(dek, 'tasks', 'id1', { title: 'Salom', n: 5 }); eq(await C.open(dek, 'tasks', 'id1', e), { title: 'Salom', n: 5 });
  });
  await test('AAD: boshqa store yoki boshqa id bilan ochilmaydi', async () => {
    const e = await C.seal(dek, 'tasks', 'id1', { a: 1 });
    await rejects(C.open(dek, 'goals', 'id1', e)); await rejects(C.open(dek, 'tasks', 'id2', e));
  });
  await test('Buzilgan ciphertext/IV aniqlanadi (DecryptError)', async () => {
    const e = await C.seal(dek, 'tasks', 'x', { a: 1 });
    const ct = e.ct.slice(); ct[0] ^= 1; try { await C.open(dek, 'tasks', 'x', { iv: e.iv, ct }); assert(false); } catch (err) { eq(err.name, 'DecryptError'); }
    const iv = e.iv.slice(); iv[0] ^= 1; await rejects(C.open(dek, 'tasks', 'x', { iv, ct: e.ct }));
    await rejects(C.open(dek, 'tasks', 'x', { iv: e.iv, ct: e.ct.slice(0, -1) }));
  });
  await test('Boshqa DEK bilan ochilmaydi', async () => {
    const e = await C.seal(dek, 'tasks', 'x', { a: 1 }); const other = await C.importDek(C.randomBytes(32)); await rejects(C.open(other, 'tasks', 'x', e));
  });
  await test('IV takrorlanmaydi (3000 shifrlash) va bir xil matn har safar boshqa ciphertext', async () => {
    const ivs = new Set(), cts = new Set();
    for (let i = 0; i < 3000; i++) { const e = await C.seal(dek, 'tasks', 'x', { a: 1 }); ivs.add(e.iv.join(',')); if (i < 20) cts.add(e.ct.join(',')); }
    eq(ivs.size, 3000); eq(cts.size, 20);
  });
  await test('PBKDF2 o\'rash: to\'g\'ri PIN DEK ni qaytaradi, noto\'g\'ri PIN rad etiladi', async () => {
    const salt = C.randomBytes(16), kek = await C.kekFromPin('123456', salt, C.MIN_ITERATIONS);
    const w = await C.wrapDek(dekBytes, kek, 'pin');
    eq([...await C.unwrapDek(w, await C.kekFromPin('123456', salt, C.MIN_ITERATIONS), 'pin')], [...dekBytes]);
    await rejects(C.unwrapDek(w, await C.kekFromPin('123457', salt, C.MIN_ITERATIONS), 'pin'));
    await rejects(C.unwrapDek(w, await C.kekFromPin('123456', C.randomBytes(16), C.MIN_ITERATIONS), 'pin'));
    await rejects(C.unwrapDek(w, kek, 'rec')); // 'pin' o'rashi 'rec' sifatida ochilmaydi
  });
  await test('Tiklash kaliti: format 14 guruh, aylanma yo\'l, o\'xshash belgilar', async () => {
    const b = C.newRecoveryBytes(), s = await C.formatRecoveryKey(b);
    assert(/^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/.test(s)); eq([...await C.parseRecoveryKey(s)], [...b]);
    eq([...await C.parseRecoveryKey(s.toLowerCase().replace(/-/g, ' '))], [...b]);
    eq([...await C.parseRecoveryKey(s.replace(/0/g, 'O').replace(/1/g, 'l'))], [...b]);
  });
  await test('Tiklash kaliti: bitta belgi xatosi, qisqa va ortiqcha matn rad etiladi', async () => {
    const s = await C.formatRecoveryKey(C.newRecoveryBytes());
    for (const i of [0, 7, 20, 40, 54]) { const c = s.replace(/-/g, ''); const rep = c[i] === 'A' ? 'B' : 'A'; await rejects(C.parseRecoveryKey(c.slice(0, i) + rep + c.slice(i + 1))); }
    await rejects(C.parseRecoveryKey(s.slice(0, -5))); await rejects(C.parseRecoveryKey(s + 'AAAA')); await rejects(C.parseRecoveryKey(''));
  });
  await test('Tiklash kaliti bilan DEK o\'rash (HKDF) va boshqa kalit rad etiladi', async () => {
    const rb = C.newRecoveryBytes(), salt = C.randomBytes(16), w = await C.wrapDek(dekBytes, await C.kekFromRecovery(rb, salt), 'rec');
    eq([...await C.unwrapDek(w, await C.kekFromRecovery(rb, salt), 'rec')], [...dekBytes]);
    await rejects(C.unwrapDek(w, await C.kekFromRecovery(C.newRecoveryBytes(), salt), 'rec'));
  });
  await test('wipe: baytlarni nollaydi', () => { const b = C.randomBytes(8); C.wipe(b); eq([...b], [0, 0, 0, 0, 0, 0, 0, 0]); });
}
