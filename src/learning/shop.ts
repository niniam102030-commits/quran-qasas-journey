// src/learning/shop.ts
// کاتالوگ خالص فروشگاه عقیق (G2)

export type ShopItemKind = "shield" | "theme" | "sound" | "debtFreeze";

export interface ShopItem {
  id: string;
  titleFa: string;
  descFa: string;
  price: number;
  kind: ShopItemKind;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "shield",
    titleFa: "سپر محافظ چله",
    descFa: "محافظت از پیوستگی روزشمار چله در برابر یک روز غیبت",
    price: 30,
    kind: "shield",
  },
  {
    id: "theme_gold",
    titleFa: "تم طلایی مصحف",
    descFa: "پس‌زمینهٔ کهربایی و طلایی ملایم در نمای نیم‌صفحهٔ مصحف (دائمی)",
    price: 50,
    kind: "theme",
  },
  {
    id: "theme_night",
    titleFa: "تم شبانهٔ مصحف",
    descFa: "پس‌زمینهٔ تیرهٔ گرم با متن کرم برای مطالعهٔ آرام شبانه (دائمی)",
    price: 50,
    kind: "theme",
  },
  {
    id: "sound_soft",
    titleFa: "بستهٔ افکت صوتی ملایم",
    descFa: "آوای نرم‌تر و کم‌فرکانس‌تر هنگام ثبت پاسخ درست و غلط (دائمی)",
    price: 40,
    kind: "sound",
  },
  {
    id: "debt_freeze",
    titleFa: "یخبندان بدهی مرور",
    descFa: "تعویق ۱ روزهٔ همهٔ کارت‌های سررسیدگذشته و امروز (حداکثر یک بار در هر ۷ روز)",
    price: 40,
    kind: "debtFreeze",
  },
];
