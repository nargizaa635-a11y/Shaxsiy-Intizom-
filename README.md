# Shaxsiy intizom

Android-first PWA: kun tartibi, odatlar, maqsadlar va rivojlanishni yagona joyda boshqarish.
Texnologiya: HTML, CSS, vanilla JavaScript (ES modules), IndexedDB, Service Worker. Framework va build tizimi yo'q.

## Holat: PIN/xavfsizlik va Vazifalar moduli
Tayyor: papka tuzilmasi, dizayn tizimi, pastki navigatsiya (5 tab), router, 13 ta bo'limning bo'sh sahifalari, IndexedDB (14 store, UUID, createdAt/updatedAt, versiyalash, migratsiya), PWA va oflayn qobig'i.
Tayyor: shifrlash yadrosi (`crypto.js`, `security.js`, shifrlangan `database.js`), qulf yadrosi (`lock.js`), PIN interfeysi va **Vazifalar moduli** (`modules/tasks-core.js`, `tasks-store.js`, `tasks.js`) hamda ularning testlari.
**Hali mavjud EMAS:** backup/restore, ma'lumotlarni to'liq tozalash, Android bildirishnomalari va boshqa modullar (odatlar, maqsadlar, kalendar, jurnal, statistika va hokazo).

## Ishga tushirish
ES modullar va Service Worker `file://` da ishlamaydi, HTTP kerak:
`python3 -m http.server 8000` -> `http://localhost:8000`

GitHub Pages: fayllarni repository ildiziga yuklang, Settings -> Pages -> branch `main` / root.

## Tuzilma
- `index.html`, `manifest.json`, `sw.js`
- `css/style.css` — dizayn tizimi (CSS o'zgaruvchilari)
- `js/app.js` — ishga tushirish, render; `js/router.js` — hash router
- `js/schema.js` — store'lar, migratsiyalar, uuid (sof, testlanadi); `js/database.js` — IndexedDB CRUD, atomik tranzaksiya va shifrlash qatlami
- `js/lock.js` — qulf menejeri (qo'lda/avto qulflash, tablararo qulf, urinishlar kutishi)
- `js/crypto.js` — sof kripto (AES-GCM, PBKDF2, HKDF, Recovery Key formati); `js/security.js` — vault, PIN/Recovery bilan ochish
- `js/ui.js` — ikonkalar va holat komponentlari; `js/modules/registry.js` — bo'limlar ro'yxati
- `tests/` — testlar

## Ma'lumotlar bazasi
Nomi `shaxsiy-intizom`, **versiya 2** (v2 barcha indekslarni olib tashlaydi). Barcha store'lar kaliti `id` (UUID), faqat `settings` kaliti `key`. Vaqtlar `createdAt`/`updatedAt` — millisekund (epoch). Yangi migratsiya: `MIGRATIONS` ga keyingi versiyani qo'shing va `DB_VERSION` ni oshiring; mavjud store'larni o'chirmang.

## Testlar
- Node: `node tests/run-node.mjs` (sxema, migratsiya, uuid, router, ro'yxat, sof kripto).
- Brauzer: serverni ishga tushirib `/tests/index.html` ni oching (haqiqiy IndexedDB va vault, alohida test bazalarida; ilova ma'lumotiga tegmaydi).
- Vazifalar: Node'da sof mantiq (`tests/tasks.test.js`), Chromium'da ma'lumotlar qatlami `/tests/index.html` da; haqiqiy ilova: `PW=<playwright/index.mjs yo'li> node tests/e2e-tasks.mjs` (~3 daq; qisman `ONLY=T4,T5`).
- PIN interfeysi (haqiqiy ilova, 360x640): `PW=<playwright/index.mjs yo'li> node tests/e2e-ui.mjs` (~2 daq, real 10 s kutish bor); qisman: `ONLY=S2,S3`. Android'da qo'lda sinash: `tests/ANDROID.md`.
- Lock yadrosi: sof testlar Node'da, IndexedDB bilan testlar `/tests/index.html` da; haqiqiy ko'p tab, BroadcastChannel'siz holat, kutish va brauzerni qayta ochish: `PW=<playwright/index.mjs yo'li> node tests/e2e-lock.mjs` (~1 daq, real 10 s kutishlar bor).
- Ko'p tab va brauzerni qayta ochish: serverni ishga tushirib `PW=<playwright/index.mjs yo'li> node tests/e2e-tabs.mjs` (parallel vault yaratish, sahifa yangilanishi, yangi tab, doimiy profilda brauzerni yopib qayta ochish).

## Yangilash
Keshlanadigan fayl o'zgarsa `sw.js` dagi `CACHE` versiyasini oshiring. Yangi fayl qo'shsangiz, uni `ASSETS` ro'yxatiga ham qo'shing.

## Xavfsizlik arxitekturasi
- **DEK**: 256-bit tasodifiy kalit, AES-256-GCM. Ilovada faqat non-extractable `CryptoKey`; bazada faqat ikki o'ralgan nusxa (`settings/security`).
- **PIN** (4–8 raqam, 6–8 tavsiya): PBKDF2-HMAC-SHA-256, 600 000 iteratsiya (har wrap yozuvida saqlanadi, avtomatik pasaytirilmaydi), 16 bayt random salt -> KEK -> AES-GCM bilan DEK o'raladi. Alohida PIN hash saqlanmaydi: noto'g'ri PIN o'rashni ochmaydi.
- **Recovery Key**: 256-bit random, HKDF-SHA-256 + alohida salt bilan DEK alohida o'raladi. Ko'rsatish formati: 14 guruh x 4 belgi (Crockford base32, oxirgi guruh nazorat belgilari). Bazada saqlanmaydi. Foydalanuvchi qayta kiritib tasdiqlamaguncha holat `pending-recovery`.
- **Vault yaratish** (`createVault`): vault mavjudligi yakuniy readwrite tranzaksiya ichida ham tekshiriladi va yozuv `add()` bilan qo'shiladi, shuning uchun ikki tab/chaqiruv bir vaqtda urinsa faqat bittasi yaratadi, mavjud vault hech qachon almashtirilmaydi (`VaultExistsError`).
- **Tiklash kaliti tasdiqlanmaguncha DB yopiq**: `createVault` DEK ni ochmaydi; `recoveryConfirmed=false` paytida barcha CRUD `LockedError` beradi. `unlock(PIN)` bu holatda `'recovery-pending'` qaytaradi va DB yopiq qoladi. DB faqat tiklash kaliti to'liq kiritilib tasdiqlanganda (`confirmRecovery`/`unlockWithRecovery`, `resetPinWithRecovery` yoki `confirmRecoveryRotation`) ochiladi; tasdiq va ochish orasida saqlash xato bersa DB ochilmaydi. Holat bazada saqlanadi, shuning uchun sahifa yangilanganda yoki brauzer yopilganda ham tiklanadi.
- **Yozuv**: `{id|key, createdAt, updatedAt, v:2, iv, ct}`. AAD = `si:data:v2:<store>:<id>`; yozuvni boshqa id/store ostiga ko'chirib bo'lmaydi. Har shifrlashda yangi 96-bit IV. Barcha qolgan maydonlar (sana, holat, tur ham) shifrlanadi; indekslar yo'q, filtrlash xotirada (`query`).
- **PIN almashtirish** faqat DEK ni qayta o'raydi. **Recovery yangilash** ikki bosqichli: yangisi tayyorlanadi (eskisi ishlaydi), tasdiqlanganda bitta yozuvda almashadi.

### IndexedDB va async kripto
Tranzaksiya ichida faqat IndexedDB so'rovlari `await` qilinadi. O'qish -> (tranzaksiya yopiladi) -> deshifrlash; shifrlash -> keyin qisqa yozish tranzaksiyasi. `update` yozishdan oldin yozuv versiyasini (`updatedAt`) tekshiradi va o'zgargan bo'lsa qayta urinadi. Vault yaratishda mavjud ochiq yozuvlar bitta tranzaksiyada shifrlanadi (yo hammasi, yo hech narsa). Migratsiyalarda (versionchange) kripto yo'q.

## Vazifalar moduli (`#/reja`)
**Ekranlar:** bosh sahifa (bugungi/bajarilgan/bajarilmagan soni, umumiy foiz, bugungi progress, yaqinlashayotgan muddatlar, 7 ta filtr, saralash), yangi vazifa va tahrirlash formasi, tafsilot, kategoriyalar, o'chirishni tasdiqlash oynasi va "Bekor qilish" xabari. Manzillar: `#/reja`, `#/reja/yangi`, `#/reja/<id>?d=<sana>`, `#/reja/<id>/tahrir`, `#/reja/kategoriyalar` (Android "orqaga" tugmasi ishlaydi).
**Tuzilma:** `tasks-core.js` (sof mantiq, DOM/DB'siz), `tasks-store.js` (faqat `database.js` orqali: shifrlash avtomatik), `tasks.js` (ekranlar). `schema.js` va DB versiyasi (2) o'zgarmagan.
**Ma'lumot:** vazifa `tasks` store'ida (yuk shifrlangan: `title, description, date, startTime, endTime, priority, categoryId, repeat, reminder, status, doneAt, schemaV`; ochiq faqat `id/createdAt/updatedAt`). `schemaV` yozuvni kelajakda migratsiya qilish uchun. Kategoriyalar: har biri alohida `settings` yozuvi (`taskCategory:<id>`), 6 ta boshlang'ich birinchi ochilishda yaratiladi (ochirilgani qayta paydo bo'lmaydi), "Boshqa" o'chirilmaydi, o'chirilganda vazifalar "Boshqa"ga o'tadi.
**Bajarilish tarixi (completion history):** takroriy vazifa bitta qoida bo'lib qoladi; har bir bajarilgan kun alohida shifrlangan `completion` yozuvi (`{kind:'completion', taskId, date, doneAt}`, tasodifiy `id`, sana ochiq emas) bo'lib shu `tasks` store'ida saqlanadi. Keyingi kunga o'tganda oldingi kunlar yo'qolmaydi, "Bajarilgan" filtri va vazifa tafsilotida ko'rinadi, istalgan kunning bajarilishini alohida bekor qilish mumkin. Bir martalik vazifada `status/doneAt`. Takrorlar (ikki tab bir vaqtda) o'qishda (vazifa, sana) bo'yicha bitta deb hisoblanadi; yetim tarix yozuvlari fonda tozalanadi. Vazifa o'chirilganda avval vazifa, keyin tarixi o'chiriladi (uzilsa tarix yetim bo'lib tozalanadi, aksincha emas).
**Takrorlanish:** kunlik, haftalik, oylik (oy oxiri to'g'ri: 31-yanvar → 28/29-fevral → 31-mart). Muddati o'tgan: faqat eng so'nggi o'tkazib yuborilgan hodisa ko'rsatiladi (eskilari to'planmaydi).
**Ko'rsatkichlar ta'rifi:** "Bugun" = bugungi hodisalar (bir martalik + takroriy); "Umumiy" = barcha bir martalik vazifalar + bugungi takroriy hodisalar bo'yicha bajarilgan ulushi. Muddati o'tgan: sana bugundan oldin, yoki bugun va tugash vaqti o'tgan. Yaqinlashayotgan: keyingi 7 kun, bajarilmagan va muddati o'tmagan.
**Eslatmalar:** hozircha FAQAT ilova ochiq va qulfdan chiqarilgan paytda (har 30 s va sahifa ko'ringanda tekshiriladi, boshlanishdan 1 soatgacha o'tkazib yuborilgan eslatma ham ko'rsatiladi; xabar xotirada, sahifa yangilansa qayta chiqishi mumkin). Boshlanish vaqti shart. Kelajakda Android bildirishnomasi uchun `reminderInstants(tasks, completions, fromMs, toMs)` tayyor (takroriy hodisalarni kengaytiradi). Bildirishnoma qulf ekranida vazifa nomini ko'rsatishi maxfiylikka ta'sir qiladi: buni alohida hal qilish kerak.
**Tablararo sinxron:** `BroadcastChannel('si-tasks')` (xabar faqat `{t:'changed'}`) + `localStorage` hisoblagichi (mazmunsiz). Tasdiqlash oynasi ochiq yoki matn yozilayotgan paytda yangilanish kechiktiriladi, yozilgan kategoriya matni saqlanadi.
**Xavfsizlik:** qulflanganda modul keshi, "Bekor qilish" buferi/xabari, eslatma banneri va timerlar tozalanadi; `#/reja/...` manzili qulfda chizilmaydi; hech qanday vazifa matni `localStorage`/`sessionStorage`/konsolga yozilmaydi (testlanadi). Cheklovlar: Android klaviaturasi yozilgan so'zlarni o'rganishi mumkin, "oxirgi ilovalar" ko'rinishida ekran rasmi qolishi mumkin (PWA bloklay olmaydi); nom/tavsif maydonlarida `autocomplete="off"` qo'yilgan, lekin brauzer buni hurmat qilishi kafolatlanmaydi.

## PIN interfeysi
Ilova ochilganda `app.js` darvozasi ishlaydi: PIN yo'q → **PIN yaratish** (6–8 raqam, ikki marta, `111111`/`123456`/`000000`/`654321` kabi oson PIN'lar va ketma-ket/takroriy raqamlar rad etiladi) → **tiklash kaliti** (14 guruh, nusxalash) → **3 ta tasodifiy guruhni qayta kiritib tasdiqlash** → ilova. Qulflangan bo'lsa **qulf ekrani** (PIN, noto'g'ri urinishdan keyin qolgan vaqt hisoblagichi, "PINni unutdim" → tiklash kaliti + yangi PIN). Kalit tasdiqlanmasdan chiqilsa, keyingi safar PIN'dan so'ng majburiy yangi kalit beriladi (eskisi bekor bo'ladi, ma'lumot yo'qolmaydi).
Yuqori o'ng burchakdagi **qulf belgisi** ilovani darhol qulflaydi (Telegram uslubi): qulflanganda sarlavha, kontent va navigatsiya DOM'dan tozalanadi va shaxsiy sahifalar chizilmaydi. **Sozlamalar** sahifasida: "Hozir qulflash", **PINni almashtirish**, **Diagnostika** (vault/qulf/kutish holati, KDF va iteratsiya soni, PBKDF2 tezligini o'lchash; faqat o'lchaydi, sozlamani o'zgartirmaydi). PBKDF2 o'lchovi PIN yaratish ekranida ham havola sifatida bor.
Hamma PIN/kalit amallari faqat `lock.js` orqali (kutish shu yerda); interfeys xavfsizlik mantig'ini qayta yozmaydi. PIN siyosati (6–8 raqam, oson PIN'lar) faqat interfeysda qo'llanadi: `security.js` hanuzgacha 4–8 raqamni qabul qiladi, shuning uchun qulf ekrani 4–8 raqamni qabul qiladi (eski PIN'lar uchun). PIN va kalit faqat yopilmada turadi, localStorage/sessionStorage/IndexedDB/konsolga yozilmaydi (testda tekshiriladi). Ekran rasmini PWA bloklay olmaydi: kalit ko'rsatilgan ekranni suratga olmang.

## Lock yadrosi (`js/lock.js`)
**Qulflash modeli (Telegram uslubida):** ilova faqat foydalanuvchi qulf belgisini bosganda (`lock()`), boshqa tab qulflaganda yoki yangi sessiyada (to'liq yopib qayta ochish, sahifani yangilash) qulflanadi. **Faoliyatsizlik yoki fonga o'tish sababli avtomatik qulflash yo'q**, avtoqulf sozlamalari ham yo'q.

`createLockManager(opts)` menejer yaratadi; modul darajasidagi eksportlar standart menejerga ulangan (`start()` chaqirilguncha hech qanday tinglovchi/kanal ochilmaydi).

| API | Vazifasi |
|---|---|
| `lock(reason)` | Shu tabni qulflaydi (DEK havolasi bekor qilinadi) va boshqa tablarga xabar beradi |
| `unlock(pin)` | Kutish tekshiriladi, `security.unlock` chaqiriladi. `'unlocked'` yoki `'recovery-pending'` (PIN to'g'ri, tiklash kaliti tasdiqlanmagan: DB yopiq qoladi) |
| `unlockWithRecovery(key)`, `resetPin(key, newPin)` | Kalit bilan ochish / yangi PIN. Xuddi shu kutishga bo'ysunadi |
| `confirmRecovery(key)` | PIN yaratilgach tiklash kalitini tasdiqlaydi: to'liq kalit kutishdan o'tadi, sessiya faollashadi (`'unlocked'`) |
| `changePin(oldPin, newPin, opts)` | PIN almashtirish. Eski PIN tekshiriladi, shuning uchun kutishdan o'tadi (umumiy hisoblagich). Yangi PIN/iteratsiya xatosi eski PIN tekshirilishidan oldin rad etiladi va hisoblanmaydi (eski PIN haqida ma'lumot bermaydi). DEK, tiklash kaliti va sessiya o'zgarmaydi; qulflangan sessiya ochilmaydi |
| `createVault(pin, opts)` | Vault yaratadi (`{recoveryKey}`), DB ochilmaydi (tiklash kaliti tasdiqlanishi shart). Hech qanday sirni tekshirmagani uchun kutishdan o'tmaydi, lekin hisoblagich faqat MUVAFFAQIYATLI yaratilgandan keyin tiklanadi: mavjud vaultda `VaultExistsError` beradi va kutishga tegmaydi. Ikki tab bir vaqtda urinsa faqat bittasi yaratadi |
| `startRecoveryRotation(pin)` | Yangi tiklash kaliti tayyorlaydi. PIN'ni tekshirgani uchun u ham kutishdan o'tadi (PIN oracle bo'lmasligi uchun) |
| `confirmRecoveryRotation(key)` | Yangi kalitni tasdiqlaydi. `'unlocked'`: tasdiqlanmagan vault ochildi; `'locked'`: vault avval tasdiqlangan edi, kalit almashdi, sessiya ochilmadi |
| `isLocked()`, `canAccessPersonalPages()` | Holat (DEK xotirada bormi). UI/router faqat shuni tekshirishi kerak |
| `getState()` | `{locked, status: none/pending-recovery/ready, throttleRemainingMs}` |
| `onLockChange(fn)` | UI signali: `{locked, reason: manual/remote/unlock, at}` |
| `handleVisibilityChange()`, `tick()` | Faqat tablararo qulf holatini qayta tekshiradi (fon holati o'zi qulflamaydi) |

**Qoida:** PIN yoki tiklash kalitini tekshiruvchi har bir chaqiruv faqat shu menejer orqali bo'lishi kerak (kutish shu yerda). Statik test `lock.js` dagi har bir `sec.*` chaqiruvini sanaydi: 8 tadan faqat `createVault` kutishsiz (u hech narsani tekshirmaydi), qolgan 7 tasi kutish ichida bo'lishi shart. PIN siyosati (6–8 raqam, zaif PIN'larni rad etish) hali qo'llanmagan: hozir `security.js` 4–8 raqamni qabul qiladi.
**Tablararo qulf:** `BroadcastChannel` (xabar faqat `{t:'lock'}`, PIN/DEK/kalit uzatilmaydi) + zaxira: `localStorage` dagi monoton "qulf davri" (`storage` hodisasi, tab ko'rinadigan bo'lganda va intervalda tekshiruv). Kanal bo'lmasa yoki xabar o'tkazib yuborilsa (muzlatilgan tab) tab keyin baribir qulflanadi. Har bir tab o'z PIN'ini so'raydi: yangi tab doim qulflangan.
**Noto'g'ri urinishlar:** 1–2 urinish: kutish yo'q; 3: 10 s; 4: 30 s; 5: 1 daq; 6: 5 daq; 7+: 15 daq. Holat `localStorage` da (sahifa yangilanganda va tablar o'rtasida saqlanadi), to'g'ri PIN/kalit hisoblagichni tiklaydi. Format xatosi hisoblanmaydi.

### Kutish: chetlab o'tish mumkin (kripto himoya EMAS)
Kutish holati qurilmadagi `localStorage` da turadi. Uni o'chirish yoki tahrirlash (DevTools), qurilma soatini oldinga surish yoki `security.js` ni to'g'ridan-to'g'ri chaqirish, ilovani o'tkazib yuborib bazaning nusxasini boshqa joyda ochish orqali chetlab o'tish mumkin. Soatni orqaga surish kutishni qisqartirmaydi, lekin oldinga surish tugatadi. Haqiqiy himoya faqat PIN'dan olingan kalit (PBKDF2 + AES-GCM); 4–8 xonali PIN oflayn brute-force'ga chidamliligi cheklangan. Qulflash DEK havolasini bekor qiladi va DB'ni yopadi, lekin JavaScript xotirasidan kalit baytlarini to'liq o'chirish kafolatlanmaydi (GC, JIT nusxalari). Fonda yoki BFCache'da turgan sahifa ochiq qoladi (model shunday): qurilma qulfsiz qolsa, ilova ochiq bo'lishi mumkin. Ochiq `BroadcastChannel` Chromium'da sahifani BFCache'ga kiritmaydi (qayta yuklanib qulflanadi).

### Cheklovlar (ochiq aytiladi)
- Ochiq qoladigan metama'lumot: yozuv `id`, `createdAt`/`updatedAt`, store nomi, yozuvlar soni va taxminiy hajmi, `settings` kalit nomlari. Mazmun ochiq emas.
- 4–8 xonali PIN oflayn brute-force'ga qarshi cheklangan himoya beradi (PBKDF2 faqat sekinlatadi). Urinishlar kutishi (`lock.js`) kripto himoya EMAS: qurilmadagi bazani nusxalagan odam uni chetlab o'tadi.
- JS'da xotirani to'liq tozalash kafolatlanmaydi; baytlarni nollash va havolani yo'qotish "harakat".
- **PIN ham, Recovery Key ham yo'qolsa, ma'lumotni tiklab bo'lmaydi.**
- Yozuv uzunligi yashirilmaydi (padding yo'q). Unikallik (masalan odat/kun) indeks emas, ilova qatlamida ta'minlanadi.
- PBKDF2 tezligi haqiqiy Android telefonda o'lchanishi kerak (hozircha o'lchov yo'q).
