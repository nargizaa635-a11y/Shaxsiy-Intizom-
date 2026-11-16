// Tablararo sinxron: xabarda faqat "o'zgardi" belgisi bor, mazmun yo'q (hech qanday ma'lumot localStorage yoki kanalga yozilmaydi).
// Avval tasks-store.js ichida edi; xulq-atvori o'zgarmagan holda ko'chirilgan va kanal/kalit nomi parametr qilingan (har modul o'z nomi bilan).
// Bir kanalda ikki tab, BroadcastChannel yo'q bo'lsa `storage` hodisasi zaxira bo'ladi.
export function createSync({ channel: CHANNEL, revKey: REV_KEY }) {
  const listeners = new Set(); let chan = null, storageOn = null;
  const fire = () => listeners.forEach((f) => { try { f(); } catch (_) { /* tinglovchi xatosi saqlashga xalaqit bermasin */ } });
  function ensureSync() {
    if (!chan && typeof BroadcastChannel !== 'undefined') { try { chan = new BroadcastChannel(CHANNEL); chan.onmessage = (e) => { if (e.data && e.data.t === 'changed') fire(); }; } catch (_) { chan = null; } }
    if (!storageOn && typeof window !== 'undefined') { storageOn = (e) => { if (e.key === REV_KEY) fire(); }; window.addEventListener('storage', storageOn); }
  }
  function subscribe(fn) { ensureSync(); listeners.add(fn); return () => listeners.delete(fn); }
  function stop() { if (chan) { try { chan.close(); } catch (_) { /* e'tiborsiz */ } chan = null; } if (storageOn) { window.removeEventListener('storage', storageOn); storageOn = null; } listeners.clear(); }
  function notify() {
    ensureSync(); try { if (chan) chan.postMessage({ t: 'changed' }); } catch (_) { /* zaxira bor */ }
    try { localStorage.setItem(REV_KEY, `${Date.now()}:${Math.random().toString(36).slice(2)}`); } catch (_) { /* e'tiborsiz */ }
    fire();
  }
  return { subscribe, stop, notify };
}
