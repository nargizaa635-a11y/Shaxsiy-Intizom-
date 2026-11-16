// Sxema, migratsiyalar va sof yordamchi funksiyalar (brauzerga bog'liq emas).
export const DB_NAME = 'shaxsiy-intizom';
export const DB_VERSION = 2;
export const SECURITY_KEY = 'security'; // settings ichidagi yagona ochiq yozuv (kalit-o'rash metama'lumoti)

export const STORE_NAMES = ['tasks', 'habits', 'habit_logs', 'goals', 'milestones', 'focus_sessions', 'books', 'learning_logs',
  'worship_logs', 'transactions', 'projects', 'journal_entries', 'settings', 'analytics_snapshots'];
export const STORES = Object.fromEntries(STORE_NAMES.map((n) => [n, { keyPath: n === 'settings' ? 'key' : 'id' }]));

// v1 indekslari tarixiy: v2 ularni o'chiradi (shaxsiy maydonlar ochiq indekslanmasligi uchun).
const V1_INDEXES = {
  tasks: [['date', 'date'], ['status', 'status'], ['goalId', 'goalId'], ['projectId', 'projectId'], ['category', 'category']],
  habits: [['category', 'category'], ['status', 'status']],
  habit_logs: [['habitId', 'habitId'], ['date', 'date'], ['habitDate', ['habitId', 'date'], { unique: true }]],
  goals: [['term', 'term'], ['status', 'status'], ['deadline', 'deadline']],
  milestones: [['goalId', 'goalId'], ['projectId', 'projectId']],
  focus_sessions: [['date', 'date'], ['taskId', 'taskId']],
  books: [['status', 'status']],
  learning_logs: [['date', 'date'], ['type', 'type']],
  worship_logs: [['date', 'date'], ['type', 'type']],
  transactions: [['date', 'date'], ['type', 'type'], ['category', 'category']],
  projects: [['status', 'status']],
  journal_entries: [['date', 'date'], ['type', 'type']],
  analytics_snapshots: [['date', 'date'], ['period', 'period']],
};

// Migratsiyalar ketma-ket ishlaydi. Mavjud store'larni o'chirmang. Kripto kerak bo'lgan ishlar bu yerda emas
// (versionchange tranzaksiyasida await mumkin emas): ular security.js da bajariladi.
export const MIGRATIONS = [
  {
    version: 1,
    up(db) {
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [idx, path, opts] of V1_INDEXES[name] || []) store.createIndex(idx, path, opts || {});
      }
    },
  },
  {
    version: 2, // Maksimal maxfiylik: ochiq indekslar yo'q, filtrlash xotirada.
    up(db, tx) {
      for (const n of [...db.objectStoreNames]) {
        const st = tx.objectStore(n);
        for (const i of [...st.indexNames]) st.deleteIndex(i);
      }
    },
  },
];

export function migrate(db, tx, oldVersion, newVersion, migrations = MIGRATIONS) {
  const applied = [];
  for (const m of migrations) {
    if (m.version > oldVersion && m.version <= newVersion) { m.up(db, tx); applied.push(m.version); }
  }
  return applied;
}

export function uuid() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function stamp(data, now = Date.now()) {
  return { ...data, id: data.id || uuid(), createdAt: now, updatedAt: now };
}
