# Android'da qo'lda sinash ro'yxati

Avtomatik testlar Chromium'da (360×640) o'tgan. Quyidagilarni haqiqiy Android telefonda tekshiring va natijani yuboring. Har bandga ✔ / ✘ va izoh yozing.

**Tayyorgarlik:** ilovani GitHub Pages (HTTPS) orqali oching, Chrome menyusidan "Ilovani o'rnatish" qiling.

1. **O'rnatish va ikonka:** bosh ekranda ikonka chiqdimi, ilova to'liq ekranda (brauzer satrisiz) ochildimi.
2. **PBKDF2 tezligi (eng muhim):** PIN yaratish ekranidagi "Qurilma tezligini tekshirish" ni bosing, keyin Sozlamalar → Diagnostika → "Tezlikni o'lchash". 3 ta natijani va qurilma modelini yuboring. Hozircha xavfsizlik darajasi avtomatik o'zgarmaydi.
3. **PIN klaviaturasi:** PIN maydonida raqamli klaviatura chiqadimi, ko'z tugmasi ishlayaptimi, klaviatura tugmalarni yopib qo'ymayaptimi, avtoto'ldirish/parol saqlash taklifi chiqmayaptimi.
4. **PIN siyosati:** `123456`, `111111`, `000000`, `654321` rad etilishi; `482915` kabi PIN qabul qilinishi.
5. **Tiklash kaliti:** 14 guruh ekranga sig'adimi (skroll), "Nusxalash" ishlaydimi (Android bufer bildirishi chiqishi mumkin), 3 guruhli tasdiqlash qulayligi. Kalitni qog'ozga yozing.
6. **Qulf belgisi:** yuqori o'ng burchakda, bosish oson, bosilganda darhol qulflanadi, tarmoq va navigatsiya ko'rinmaydi.
7. **Fon:** ekranni o'chirib yoqing; boshqa ilovaga o'tib qayting; 5 daqiqadan ko'p kuting: ilova **qulflanmasligi** kerak (Telegram uslubi).
8. **To'liq yopish:** ilovani oxirgi ilovalar ro'yxatidan suring (yoping) va qayta oching: PIN so'ralishi kerak. Chrome tabida ham xuddi shunday.
9. **Ikki oyna:** o'rnatilgan ilova va Chrome tabini bir vaqtda ochib, birida qulflang: ikkinchisi ham qulflanishi kerak.
10. **Kutish:** 3 marta noto'g'ri PIN → 10 s kutish. Ilovani yopib qayta oching: kutish davom etishi kerak. (Soatni o'zgartirmang: bu kutishni chetlab o'tish usuli ekani hujjatlashtirilgan.)
11. **Tiklash:** "PINni unutdim" → kalit + yangi PIN. Ma'lumotlar saqlanib qolganini tekshiring (yangi PIN bilan qayta kiring).
12. **PIN almashtirish:** Sozlamalar → PINni almashtirish; keyin qulflab, eski PIN ochmasligini va yangisi ochishini tekshiring.
13. **Oflayn:** samolyot rejimida ilova ochiladimi va PIN ishlaydimi.
14. **Ekran va shrift:** Android sozlamalarida shriftni kattalashtiring; kichik ekranda (320 px) va gorizontal holatda ekranlar buzilmayaptimi.
15. **Orqaga tugmasi:** qulf ekranida va Sozlamalarda Android "orqaga" tugmasi ilovani kutilmagan holda ochib yubormayaptimi (qulfni chetlab o'tmasligi kerak).
16. **Ma'lum cheklov:** PWA ekran rasmini bloklay olmaydi (Android `FLAG_SECURE` yo'q): kalit ko'rsatilganda skrinshot olinishi mumkin.

## Vazifalar moduli (qo'shimcha)
17. **Forma va klaviatura:** yangi vazifa formasida nom, tavsif yozayotganda klaviatura maydonlarni yopib qo'ymayaptimi; "Saqlash" tugmasiga skroll qilib yetish mumkinmi; sana va vaqt tanlagichlari Android'ning o'z oynasida ochilyaptimi.
18. **Eslatma:** 2 daqiqadan keyingi vaqtga eslatma (boshlanishdan 1 daqiqa oldin) qo'ying va ilovani ochiq qoldiring: xabar chiqishi kerak. Ilovani yopsangiz xabar CHIQMASLIGI kutiladi (bildirishnoma hali yo'q).
19. **Takroriy vazifa:** "Har kuni" vazifani bugun bajaring, ertasiga (yoki telefon sanasini 1 kunga surib) oching: bugungi kun "Bajarilgan" filtrida va vazifa tarixida saqlanganini tekshiring.
20. **O'chirish va bekor qilish:** o'chirishdan oldin tasdiq so'raladimi; "Bekor qilish" 6 soniya ichida tiklaydimi; qulflasangiz xabar yo'qoladimi.
21. **Ikki oyna:** o'rnatilgan ilova va Chrome tabida bir vaqtda ochiq: birida vazifa qo'shsangiz ikkinchisida o'zi paydo bo'ladimi.
22. **Maxfiylik:** Gboard "oxirgi so'zlar" (so'z o'rganish) va "oxirgi ilovalar" ko'rinishida vazifa matni qolayotganini tekshiring; kerak bo'lsa klaviaturaning "inkognito" rejimini yoqing.
23. **Offline:** samolyot rejimida vazifa yarating, bajaring, ilovani yoping va qayta oching: ma'lumot saqlanganini tekshiring.
24. **Katta ro'yxat:** 100+ vazifa qo'shilganda ro'yxat qotib qolmayaptimi (hammasi xotirada deshifrlanadi).

---

## 2.0 poydevor refaktoridan keyingi tekshiruv (18 band)

2.0 bosqichida Vazifalar modulining umumiy qatlami (sana yordamchilari, tablararo sinxron, tasdiq oynasi, toast va jim yangilash) alohida modullarga ajratildi, Service Worker keshi esa `intizom-v8` ga o'tdi. Foydalanuvchiga ko'rinadigan yangi funksiya yo'q: maqsad avvalgi xatti-harakat o'zgarmaganini haqiqiy qurilmada tasdiqlash.
Avtomatik testlar o'tgan (Node 85, Chromium birlik 144, e2e 345: ui 120, tasks 155, lock 39, tabs 31), lekin ular Linux Chromium'da (360×640) bajarilgan. Quyidagilarni **haqiqiy Android telefonda** tekshiring.

**Qanday boshlash:**
1. Yangi versiya joylashtirilgach, eski versiya o'rnatilgan qurilmadan boshlang (A bo'limi yangilanishni tekshiradi). Toza o'rnatishni keyin alohida sinang.
2. Ilovani oching, sahifani ikki marta yangilang (birinchisi yangi Service Worker'ni o'rnatadi, ikkinchisi uni ishga tushiradi).
3. Har bir bandni bajarib, katakchani belgilang: `[x]` bajarildi, `[ ]` bajarilmadi yoki muammo bor. Muammoni "Izoh" qatoriga yozing (nima qildingiz, nima chiqdi).
4. Oxirida natijani yozing va muammolarni yuboring.

**Qurilma:** ______________  **Android:** ______  **Chrome:** ______  **Sana:** ________  **Tekshirgan:** ________

### A. O'rnatish va yangilash
- [ ] **1. Eski versiyadan yangilanish.** Eski versiya o'rnatilgan qurilmada ilovani oching, vazifa yarating. Yangi versiya joylashtirilgach sahifani ikki marta yangilang: yangi versiya ishlashi va eski vazifa saqlanib qolishi kerak. Izoh: ______
- [ ] **2. Ikki marta yangilash.** Yangilangandan keyin ilova to'g'ri ochiladimi, bo'sh yoki buzilgan ekran, "Yuklanmoqda"da qotib qolish yo'qmi. Izoh: ______
- [ ] **3. Asosiy ekranga qo'shish.** PWA'ni asosiy ekranga qo'shing (yoki mavjudini yangilang) va ilova rejimida (brauzer satrisiz) oching. Izoh: ______

### B. Xavfsizlik
- [ ] **4. PIN va tiklash kaliti.** PIN o'rnatish, Recovery Key ko'rsatish, 3 guruhni tasdiqlash va oxirida kalitni to'liq qo'lda kiritish qadami. Izoh: ______
- [ ] **5. Tiklash kalitini yangilash.** Sozlamalar → "Tiklash kalitini yangilash": bir marta bekor qiling (eski kalit ishlashda davom etishi kerak), keyin to'liq tugating. Izoh: ______
- [ ] **6. Qulflash.** Qulf tugmasi; ilovani fonga olib qaytish; qulflanganda ekran, vazifalar va xabarlar ko'rinmasligi, PIN so'ralishi. Izoh: ______
- [ ] **7. Noto'g'ri PIN.** Ketma-ket noto'g'ri PIN: kutish ko'rsatiladimi, ilovani yopib qayta ochganda kutish davom etadimi. Izoh: ______

### C. Vazifalar (umumiy qatlam)
- [ ] **8. Asosiy amallar.** Vazifa yarating, tahrirlang, bajarildi deb belgilang, qayta faollashtiring. Izoh: ______
- [ ] **9. O'chirish va bekor qilish.** O'chirishdan oldin tasdiq oynasi chiqadi; o'chirgach 6 soniya ichida "Bekor qilish" vazifani xuddi shunday tiklaydi; 6 soniyadan keyin tugma yo'qoladi. Izoh: ______
- [ ] **10. Tasdiq oynasi.** Oyna ochiq paytida "Bekor qilish" ishlaydi; tashqi klaviatura bo'lsa Escape yopadi; oyna tashqarisini bosish yopadi, oyna ichini bosish yopmaydi. Izoh: ______
- [ ] **11. Forma va tashqi o'zgarish.** Forma ochiq turganda boshqa oynadan o'zgarish kelsa (13-band bilan birga), yozilgan matn va tanlovlar yo'qolmasligi kerak. Izoh: ______
- [ ] **12. Kategoriyalar.** Yangi kategoriya qo'shing, nomini o'zgartiring, o'chiring. O'chirilgan kategoriyali vazifa tahrir qilinganda "Boshqa" tanlanib, izoh chiqadi. Maydonlarga chegaradan uzun matn yozib bo'lmaydi. Izoh: ______

### D. Ko'p oyna
- [ ] **13. Ikki oyna.** O'rnatilgan ilova va Chrome tabi bir vaqtda: birida vazifa yarating yoki o'chiring, ikkinchisi o'zi yangilansin. Birini qulflasangiz ikkinchisi ham qulflansin. Izoh: ______

### E. Oflayn
- [ ] **14. Oflayn ochish.** Samolyot rejimi: ilovani to'liq yoping, qayta oching, PIN kiriting, ma'lumotlar o'qilsin. Izoh: ______
- [ ] **15. Oflayn yozish.** Oflayn rejimda vazifa yarating va bajaring, ilovani yoping, qayta oching: o'zgarishlar saqlangan bo'lsin; tarmoq qaytgach ham joyida. Izoh: ______

### F. Ekran va qulaylik
- [ ] **16. Ekran va klaviatura.** Gorizontal skroll yo'q, tugmalar bosishga qulay, klaviatura ochilganda forma maydonlari va "Saqlash" tugmasi yopilmaydi (kichik ekran, 320 px ham). Izoh: ______
- [ ] **17. Aylantirish va shrift.** Ekranni aylantirganda holat saqlanadi; Android'da shriftni kattalashtirganda ekranlar buzilmaydi. Izoh: ______

### G. Navigatsiya
- [ ] **18. "Orqaga" tugmasi.** Android "Orqaga" tugmasi ekranlar (ro'yxat, tafsilot, forma, kategoriyalar, Sozlamalar) orasida to'g'ri ishlaydi va qulfni chetlab o'tmaydi. Izoh: ______

**Natija:** ____ / 18 bajarildi. **Muammolar:** ______________________________________________

---

## Texnik tavsiya: yetim Service Worker keshi

Holat: **hujjat, kodga o'zgartirish kiritilmagan** (`sw.js` tegilmagan). Qaror kutilmoqda. Sana: 2026-11-14.

### Topilma
Yangi Service Worker o'rnatilayotganda (`install`) `precache()` avval yangi kesh nomini ochadi (`caches.open(CACHE)`), keyin fayllarni birma-bir yuklaydi. Bironta fayl yuklanmasa (masalan 404, tarmoq uzilishi), o'rnatish yiqiladi va eski Service Worker faol qoladi. Lekin yarim to'lgan yangi kesh o'chirilmaydi: u keyingi **muvaffaqiyatli** `activate` gacha (u `CACHE` dan boshqa hamma keshlarni o'chiradi) qurilmada qoladi.

### Isbot
Haqiqiy Chromium'da (loyihadan tashqaridagi skratch skriptda) faol kesh `intizom-v8`; yangi `sw.js` (`intizom-v99`) bitta fayl yo'q holda yangilanganda kesh ro'yxati `["intizom-v8","intizom-v99"]` bo'ldi. Ilova va ma'lumot esa to'liq ishladi. Fayl tiklanib qayta urinilganda yangilanish o'tdi va yetim kesh tozalandi (`["intizom-v99"]`).

### Ta'siri
- **Foydalanuvchi ma'lumotiga ta'sir yo'q:** kesh faqat ilova fayllarini saqlaydi, ma'lumot IndexedDB'da.
- **Noto'g'ri javob yo'q:** `fetch` faqat joriy `CACHE` ichidan o'qiydi, shuning uchun yetim keshdan hech qachon javob berilmaydi.
- **Xarajat:** bir necha yuz KB gacha ortiqcha joy, keyingi muvaffaqiyatli yangilanishgacha. Past xavf.
- **Qachon uchraydi:** yangilash paytida tarmoq uzilsa yoki joylashtirishda `ASSETS` dagi fayl yetishmasa.

### Tavsiya etilgan tuzatish (hozircha qo'llanmagan)
`sw.js` dagi `precache()` ni quyidagicha o'zgartirish: o'rnatish yiqilsa, **shu o'rnatish yaratgan** keshni o'chirish.

```js
async function precache() {
  const existed = await caches.has(CACHE);   // CACHE nomi allaqachon bormi (versiya oshirilmagan bo'lsa shunday bo'ladi)
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(ASSETS.map(async (u) => {
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if (!res.ok) throw new Error(`Keshlab bo'lmadi: ${u} (${res.status})`);
      await cache.put(u, res);
    }));
  } catch (e) {
    if (!existed) await caches.delete(CACHE); // faqat o'zimiz yaratgan keshni o'chiramiz
    throw e;
  }
}
```

**Muhim ehtiyot:** `existed` tekshiruvi shart. Agar dasturchi `CACHE` versiyasini oshirishni unutsa (bu holat testda ham ushlanadi), yangi o'rnatish **faol kesh bilan bir xil nom**ni ochadi. Shartsiz o'chirish faol keshni yo'q qilib, oflayn ishlashni buzardi.

### Tuzatishni joriy qilishda kerak bo'ladigan ishlar
1. `sw.js` o'zgarishi: `ASSETS` ro'yxati o'zgarmasa ham fayl o'zgargani uchun `CACHE` ni oshirish va `ASSETS-SHA256` qatorini yangilash (`node tests/run-node.mjs` talab qiladi va kerakli qiymatni ko'rsatadi).
2. Mavjud SW tekshiruvlari (`cache: 'reload'`, `caches.match(` yo'qligi, `addAll(` yo'qligi) saqlanishi kerak.
3. Yangi sinov (haqiqiy brauzerda): yangi o'rnatish yiqilganda faol kesh o'zgarmaydi **va** yetim kesh qolmaydi; shuningdek `CACHE` versiyasi oshirilmagan holda yiqilgan o'rnatish faol keshni o'chirib yubormaydi.
4. Hamma to'plamni qayta ishga tushirish va yuqoridagi 14-bandni (oflayn) qurilmada qayta tekshirish.

### Qaytarish rejasi
O'zgarish bitta funksiyada. Muammo chiqsa avvalgi `precache()` ga qaytarib, `CACHE` ni yana oshirish kifoya.

### Qaror
- [ ] Hozircha qo'llanmaydi (xavf past, keyingi bosqichda qaraladi)
- [ ] Alohida kichik bosqich sifatida qo'llanadi (yuqoridagi 1–4 ish bilan)
