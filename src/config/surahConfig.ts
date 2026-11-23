// src/config/surahConfig.ts
// پیکربندی مرکزی سوره فعال برای آمادگی چندسوره‌ای (Multi-Surah Pack Ready)

export interface SurahConfig {
  /** شماره سوره در مصحف (۱ تا ۱۱۴) */
  number: number;
  /** تعداد کل آیات سوره */
  verseCount: number;
  /** نام عربی سوره */
  nameAr: string;
  /** نام فارسی سوره */
  nameFa: string;
}

export const ACTIVE_SURAH: SurahConfig = {
  number: 28,
  verseCount: 88,
  nameAr: "القصص",
  nameFa: "قصص",
};

export function getAllVerseNumbers(surah: SurahConfig = ACTIVE_SURAH): number[] {
  return Array.from({ length: surah.verseCount }, (_, i) => i + 1);
}
