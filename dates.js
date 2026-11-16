// Sana va vaqt yordamchilari (sof mantiq, DOM va IndexedDB'siz). Sanalar "YYYY-MM-DD" (mahalliy kalendar), vaqtlar "HH:MM".
// Avval tasks-core.js ichida edi; xulq-atvori o'zgarmagan holda ko'chirilgan (tasks-core.js ularni qayta eksport qiladi).

const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const pad = (n) => String(n).padStart(2, '0');

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const fmtDate = (y, m, d) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1970 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}
export const toDays = (s) => { const p = parseDate(s); return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000); };
export const fromDays = (n) => { const dt = new Date(n * 86400000); return fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };
export const addDays = (s, n) => fromDays(toDays(s) + n);
export const weekday = (s) => (((toDays(s) + 3) % 7) + 7) % 7; // dushanba = 0
export const parseTime = (s) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s)); return m ? +m[1] * 60 + +m[2] : null; };
export function localParts(ms) { const d = new Date(ms); return { date: fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate()), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; }
export const localMs = (date, time) => { const p = parseDate(date), [h, m] = time.split(':'); return new Date(p.y, p.m - 1, p.d, +h, +m).getTime(); };
export function fmtDateUz(date, today) {
  if (date === today) return 'Bugun'; if (date === addDays(today, 1)) return 'Ertaga'; if (date === addDays(today, -1)) return 'Kecha';
  const p = parseDate(date); return `${p.d} ${MONTHS_UZ[p.m - 1]}${p.y !== parseDate(today).y ? ` ${p.y}` : ''}`;
}
