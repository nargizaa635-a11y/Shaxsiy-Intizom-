// Umumiy UI yordamchilari: ikonkalar, bo'sh, yuklanish va xato holatlari.
const P = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  timer: 'M12 8v5l3 2M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9 2h6',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6M20 4v14h-6',
  moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 13h3',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  pen: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
};

export function icon(name, size = 22) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const emptyState = (title, text) => `<div class="state">${icon('inbox', 28)}<h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
export const errorState = (msg) => `<div class="state state-error" role="alert">${icon('alert', 28)}<h2>Xatolik yuz berdi</h2><p>${esc(msg)}</p><button class="btn" data-action="reload">Qayta urinish</button></div>`;
export const loadingState = () => '<div class="state" aria-busy="true"><div class="spinner"></div><p>Yuklanmoqda…</p></div>';
