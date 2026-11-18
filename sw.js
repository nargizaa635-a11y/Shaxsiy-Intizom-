// Service Worker: ilova qobig'ini keshlaydi.
// QOIDA: ASSETS dagi biror fayl o'zgarsa: 1) CACHE versiyasini qo'lda oshiring, 2) pastdagi ASSETS-SHA256 qatorini yangilang.
// Yangi fayl qo'shsangiz, uni ASSETS ga ham qo'shing. `node tests/run-node.mjs` bu qoidalarni tekshiradi va kerakli SHA256 qiymatini xabarda ko'rsatadi.
// ASSETS-SHA256: fe093f6b9713a3aa4e9ee8d6961752b25c92ae3da78e7b7313b9fba309a4e1ea
const CACHE = 'intizom-v13';
const ASSETS = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/app.js', './js/router.js', './js/database.js', './js/schema.js', './js/ui.js', './js/crypto.js', './js/security.js', './js/lock.js', './js/modules/registry.js', './js/modules/security-ui.js', './js/modules/settings.js', './js/modules/dates.js', './js/modules/sync.js', './js/modules/ui-kit.js', './js/modules/tasks-core.js', './js/modules/tasks-store.js', './js/modules/tasks.js', './js/modules/habits-core.js', './js/modules/habits-store.js', './js/modules/habits.js', './js/modules/journal-core.js', './js/modules/journal-store.js', './js/modules/journal.js', './js/modules/projects-core.js', './js/modules/projects-store.js', './js/modules/projects.js', './js/modules/goals-core.js', './js/modules/goals-store.js', './js/modules/goals.js', './js/modules/home-core.js', './js/modules/home.js',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png',
];

// Har bir fayl tarmoqdan (brauzerning HTTP keshini chetlab) olinadi: yangi va eski fayllar aralashib qolmasligi uchun.
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(ASSETS.map(async (u) => {
    const res = await fetch(new Request(u, { cache: 'reload' }));
    if (!res.ok) throw new Error(`Keshlab bo'lmadi: ${u} (${res.status})`);
    await cache.put(u, res);
  }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Faqat joriy versiya keshidan o'qiladi (eski versiya keshidan tasodifan javob berilmaydi).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.status === 200) e.waitUntil(cache.put(req, res.clone()).catch(() => { /* keshga yozib bo'lmadi: javob baribir qaytadi */ }));
      return res;
    } catch (_) {
      return req.mode === 'navigate' ? ((await cache.match('./index.html')) || Response.error()) : Response.error();
    }
  })());
});
