// Kichik test harness: brauzer va Node'da ishlaydi.
export const results = [];
export async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: e && e.message ? e.message : String(e) }); }
}
export function assert(cond, msg = 'Shart bajarilmadi') { if (!cond) throw new Error(msg); }
export function eq(a, b, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} kutilgan=${JSON.stringify(b)} haqiqiy=${JSON.stringify(a)}`); }
export async function rejects(p, msg = 'Xato kutilgan edi') { try { await p; } catch (_) { return; } throw new Error(msg); }
export const summary = () => ({ total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
