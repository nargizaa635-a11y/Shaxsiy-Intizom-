// Bo'limlar ro'yxati. Har bir bo'lim keyingi bosqichlarda o'z faylida amalga oshiriladi.
export const TABS = [
  { id: 'bosh', label: 'Bosh sahifa', icon: 'home' },
  { id: 'reja', label: 'Reja', icon: 'calendar' },
  { id: 'maqsadlar', label: 'Maqsadlar', icon: 'target' },
  { id: 'tahlil', label: 'Tahlil', icon: 'chart' },
  { id: 'boshqalar', label: 'Boshqalar', icon: 'grid' },
];

export const ROUTES = {
  bosh: { title: 'Bosh sahifa', tab: 'bosh', empty: ["Bugun uchun hozircha hech narsa yo'q", "Vazifalar, odatlar va Pomodoro shu yerda ko'rinadi."] },
  reja: { title: 'Reja', tab: 'reja', empty: ["Vazifalar hali yo'q", "Kun tartibi va vazifalar bo'limi keyingi bosqichda ishga tushadi."] },
  maqsadlar: { title: 'Maqsadlar', tab: 'maqsadlar', empty: ["Maqsadlar hali yo'q", "Qisqa, o'rta va uzoq muddatli maqsadlar shu yerda boshqariladi."] },
  tahlil: { title: 'Tahlil', tab: 'tahlil', empty: ["Tahlil uchun ma'lumot yo'q", "Ma'lumot to'plangach, grafiklar va intizom indeksi shu yerda chiqadi."] },
  boshqalar: { title: 'Boshqalar', tab: 'boshqalar' },
  odatlar: { title: 'Odatlar', tab: 'boshqalar', parent: true, icon: 'repeat', empty: ["Odatlar hali yo'q", "Kundalik odatlar va ularning tarixi shu yerda bo'ladi."] },
  fokus: { title: 'Fokus', tab: 'boshqalar', parent: true, icon: 'timer', empty: ["Fokus sessiyalari yo'q", "Pomodoro va fokus taymeri shu yerda bo'ladi."] },
  bilim: { title: 'Bilim', tab: 'boshqalar', parent: true, icon: 'book', empty: ["Kitoblar hali qo'shilmagan", "Kitoblar, o'qish sessiyalari va o'rganilgan mavzular shu yerda bo'ladi."] },
  ibodat: { title: 'Ibodat', tab: 'boshqalar', parent: true, icon: 'moon', empty: ["Qaydlar yo'q", "Shaxsiy va maxfiy qaydlar shu yerda bo'ladi."] },
  moliya: { title: 'Moliya', tab: 'boshqalar', parent: true, icon: 'wallet', empty: ["Yozuvlar yo'q", "Daromad, xarajat va budjet (UZS) shu yerda bo'ladi."] },
  loyihalar: { title: 'Loyihalar', tab: 'boshqalar', parent: true, icon: 'folder', empty: ["Loyihalar hali yo'q", "Faol, kutilayotgan va yakunlangan loyihalar shu yerda bo'ladi."] },
  jurnal: { title: 'Jurnal', tab: 'boshqalar', parent: true, icon: 'pen', empty: ["Yozuvlar yo'q", "Kundalik yozuvlar va qaydlar shu yerda saqlanadi."] },
  sozlamalar: { title: 'Sozlamalar', tab: 'boshqalar', parent: true, icon: 'gear', empty: ["Sozlamalar keyingi bosqichda", "PIN, backup va indeks vaznlari shu yerda bo'ladi."] },
};

export const OTHERS = Object.entries(ROUTES).filter(([, r]) => r.parent).map(([id, r]) => ({ id, ...r }));
