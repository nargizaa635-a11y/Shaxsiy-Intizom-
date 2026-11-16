// Brauzersiz testlar: `node tests/run-node.mjs`
import { results, summary, test, assert, eq } from './harness.js';
import { run as pure } from './pure.test.js';
import { run as crypt } from './crypto.test.js';
import { runPure as lockPure } from './lock.test.js';
import { runPure as tasksPure } from './tasks.test.js';
import { runPure as sharedPure } from './shared.test.js';
import { runPure as habitsPure } from './habits.test.js';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';

// ---------- Service Worker tekshiruvi: versiya va keshlanadigan fayllar ro'yxati ----------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fileOf = (u) => (u === './' ? 'index.html' : u.replace(/^\.\//, ''));
export function swInfo(src = read('sw.js')) {
  const cache = /^const CACHE = '([^']*)';/m.exec(src), assets = /^const ASSETS = (\[[\s\S]*?\]);/m.exec(src), sha = /^\/\/ ASSETS-SHA256: ([0-9a-f]{64})$/m.exec(src);
  return { cache: cache && cache[1], assets: assets ? new Function(`return ${assets[1]}`)() : null, sha: sha && sha[1] };
}
export function assetsSha(assets, read2 = (f) => fs.readFileSync(path.join(ROOT, f))) {
  const h = crypto.createHash('sha256');
  for (const f of [...new Set(assets.map(fileOf))].sort()) { h.update(f); h.update('\0'); h.update(read2(f)); h.update('\0'); }
  return h.digest('hex');
}
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const importsOf = (f) => [...read(f).matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));

export async function swChecks() {
  const { cache, assets, sha } = swInfo(), files = assets ? [...new Set(assets.map(fileOf))] : [];
  await test("SW: CACHE nomi 'intizom-v<son>' ko'rinishida, ASSETS ro'yxati o'qiladi va takrorlanmaydi", () => {
    assert(cache && /^intizom-v\d+$/.test(cache), `CACHE noto'g'ri: ${cache}`); assert(Array.isArray(assets) && assets.length > 0, "ASSETS topilmadi");
    eq(assets.length, new Set(assets).size, 'ASSETS da takror bor:');
  });
  await test("SW: ASSETS dagi har bir fayl mavjud", () => { for (const f of files) assert(fs.existsSync(path.join(ROOT, f)), `Fayl yo'q: ${f}`); });
  await test("SW: js/, css/, assets/ dagi har bir fayl ASSETS da (keshdan tashqarida fayl qolmaydi)", () => {
    const missing = ['js', 'css', 'assets'].flatMap(walk).filter((f) => !files.includes(f)); eq(missing, [], "ASSETS ga qo'shilmagan:");
  });
  await test("SW: har bir import, index.html havolasi va manifest ikonkasi ASSETS da", () => {
    const miss = new Set();
    for (const f of files.filter((x) => x.endsWith('.js'))) for (const i of importsOf(f)) if (!files.includes(i)) miss.add(`${f} -> ${i}`);
    for (const m of read('index.html').matchAll(/(?:href|src)="([^"#:]+)"/g)) if (!files.includes(path.posix.normalize(m[1]))) miss.add(`index.html -> ${m[1]}`);
    for (const ic of JSON.parse(read('manifest.json')).icons) if (!files.includes(path.posix.normalize(ic.src))) miss.add(`manifest -> ${ic.src}`);
    eq([...miss], [], "ASSETS da yo'q:");
  });
  await test("SW: ASSETS-SHA256 fayllarning haqiqiy mazmuniga mos (fayl o'zgargan bo'lsa CACHE ni oshiring va SHA256 qatorini yangilang)", () => {
    const real = assetsSha(assets); assert(sha === real, `Keshlanadigan fayllar o'zgargan. 1) sw.js dagi CACHE versiyasini oshiring; 2) '// ASSETS-SHA256: ${real}' qatorini yozing. Hozir: ${sha}`);
  });
  await test("SW: oldindan keshlash HTTP keshini chetlab o'tadi (cache: 'reload'), qidiruv faqat joriy CACHE ichida", () => {
    const src = read('sw.js'); assert(/cache:\s*'reload'/.test(src), "precache cache:'reload' ishlatmayapti"); assert(!/\bcaches\.match\(/.test(src), "caches.match() barcha keshlardan qidiradi: caches.open(CACHE) ichidan qidiring"); assert(!/addAll\(/.test(src), 'addAll HTTP keshidan olishi mumkin');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await pure(); await crypt(); await lockPure(); await tasksPure(); await sharedPure(); await habitsPure(); await swChecks();
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.error ? ' — ' + r.error : ''}`);
  const s = summary(); console.log(`\n${s.passed}/${s.total} o'tdi`);
  process.exit(s.failed.length ? 1 : 0);
}
