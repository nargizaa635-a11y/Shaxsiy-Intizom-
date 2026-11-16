// Modullar uchun umumiy interfeys yordamchilari (vazifalar, odatlar, kunlik reja). Ma'lumotga tegmaydi; faqat DOM.
// Avval tasks.js ichida edi; xulq-atvori o'zgarmagan holda ko'chirilgan.
import { icon, esc } from '../ui.js';

export const $ = (s, r = document) => r.querySelector(s);
export function setHeader(title, back) { $('#head').innerHTML = `${back ? `<a class="back" href="${back}" aria-label="Orqaga">${icon('back')}</a>` : ''}<div><h1>${esc(title)}</h1></div>`; }

// Foydalanuvchi matn kiritayotgan yoki tasdiq oynasi ochiq: jim yangilash shu paytda kechiktiriladi (yozilayotgan matn o'chib ketmasligi uchun).
export const isTyping = (main) => { const a = document.activeElement; return !!a && !!main && main.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['radio', 'checkbox'].includes(a.type))); };
export const isBusy = (main) => !!(main && $('.modal', main)) || isTyping(main);

// Tasdiq oynasi. `onClosed` oyna yopilgach (har qanday natija bilan) chaqiriladi: chaqiruvchi kechiktirilgan yangilanishni shu yerda bajaradi.
export function confirmDialog(main, { title, text, ok }, onClosed) {
  return new Promise((resolve) => {
    const el = document.createElement('div'); el.className = 'modal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'm-title');
    el.innerHTML = `<div class="modal-box"><h2 id="m-title">${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-danger" id="m-ok" type="button">${esc(ok)}</button><button class="btn btn-2" id="m-no" type="button">Bekor qilish</button></div>`;
    const done = (v) => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); if (onClosed) onClosed(); }; const onKey = (e) => { if (e.key === 'Escape') done(false); };
    el.onclick = (e) => { if (e.target === el) done(false); }; $('#m-ok', el).onclick = () => done(true); $('#m-no', el).onclick = () => done(false);
    document.addEventListener('keydown', onKey); main.appendChild(el); $('#m-no', el).focus();
  });
}

// Qisqa xabar (toast), ixtiyoriy "Bekor qilish" bilan. `getMain` joriy asosiy konteynerni qaytaradi; `onExpire` 6 soniyadan keyin toast o'chganda chaqiriladi.
// Holat (xabar va bekor qilish funksiyasi) faqat shu yerda; `clear()` qulflanganda hammasini xotiradan tashlaydi.
export function createToaster({ getMain, onExpire }) {
  let cur = null;
  function toast(msg, undo) {
    if (cur) clearTimeout(cur.timer);
    cur = { msg, undo, timer: setTimeout(() => { cur = null; if (onExpire) onExpire(); const e = $('.toast'); if (e) e.remove(); }, 6000) }; attach();
  }
  function attach() {
    const main = getMain(); if (!main || !cur) return; const old = $('.toast', main); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = `<span>${esc(cur.msg)}</span>${cur.undo ? '<button id="t-undo" type="button">Bekor qilish</button>' : ''}`; main.appendChild(el);
    const u = $('#t-undo', el); if (u) u.onclick = async () => { const fn = cur && cur.undo; clearTimeout(cur.timer); cur = null; el.remove(); if (fn) { try { await fn(); } catch (e) { toast(`Qaytarib bo'lmadi: ${e.message}`); } } };
  }
  const clear = () => { if (cur) { clearTimeout(cur.timer); cur = null; } };
  return { toast, attach, clear };
}

// Jim yangilash rejalovchisi: o'z yoki boshqa tab o'zgarishi ekranni qayta chizishi kerak, lekin tasdiq oynasi ochiq yoki matn kiritilayotgan paytda emas
// (aks holda foydalanuvchi yozayotgan matn yoki ochiq oyna o'chib ketardi). Kechiktirilsa `dirty` saqlanadi; chaqiruvchi foydalanuvchi tugatgach qayta `schedule()` qiladi.
// `routeRe`: faqat shu manzilda chiziladi; `blockClass`: <body> da shu klass bo'lsa (masalan forma ochiq) chizilmaydi.
export function createRefresher({ getMain, allowed, routeRe, blockClass, render }) {
  let timer = null, dirty = false;
  function schedule() {
    dirty = true; clearTimeout(timer);
    timer = setTimeout(() => {
      const main = getMain();
      if (!main || !main.isConnected || !allowed() || !routeRe.test(location.hash) || document.body.classList.contains(blockClass) || isBusy(main)) return; // kechiktirildi: dirty saqlanadi; boshqa sahifada chizilmaydi
      dirty = false; render(main);
    }, 60);
  }
  return { schedule, get dirty() { return dirty; }, set dirty(v) { dirty = !!v; } };
}
