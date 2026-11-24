// src/config/surahConfig.ts
// پیکربندی مرکزی و رجیستری پک‌های چندسوره‌ای (Multi-Surah Pack Architecture)
import type { CardKind } from "../types/learning";

export interface SurahConfig {
  /** شماره سوره در مصحف (۱ تا ۱۱۴) */
  number: number;
  /** شناسه فایل‌های محتوا (مثلاً qasas یا s036) */
  slug: string;
  /** تعداد کل آیات سوره */
  verseCount: number;
  /** تعداد واحدهای نیم‌صفحه‌ای */
  unitCount: number;
  /** نام عربی سوره */
  nameAr: string;
  /** نام فارسی سوره */
  nameFa: string;
  /** مسیر مانیفست محتوای سوره */
  manifestPath: string;
  /** آیا پک این سوره هم‌اکنون در برنامه نصب است؟ */
  installed: boolean;
}

export const SURAH_PACK_REGISTRY: readonly SurahConfig[] = [
  {
    number: 28,
    slug: "qasas",
    verseCount: 88,
    unitCount: 22,
    nameAr: "القصص",
    nameFa: "قصص",
    manifestPath: "content/manifest.json",
    installed: true,
  },
];

export const ACTIVE_SURAH: SurahConfig = SURAH_PACK_REGISTRY[0];

export function getSurahByNumber(surahNumber: number): SurahConfig | undefined {
  return SURAH_PACK_REGISTRY.find((s) => s.number === surahNumber);
}

export function getAllVerseNumbers(surah: SurahConfig = ACTIVE_SURAH): number[] {
  return Array.from({ length: surah.verseCount }, (_, i) => i + 1);
}

/**
 * ساخت کلید کارت سازگار با چندسوره:
 * - برای سوره ۲۸ (قصص) قالب قبلی (`vr:5`) حفظ می‌شود تا با داده‌های کاربران فعلی ۱۰۰٪ سازگار باشد.
 * - برای سوره‌های جدید قالب نام‌فضادار (`vr:36:5`) تولید می‌شود.
 */
export function formatSurahCardKey(
  kind: CardKind,
  targetId: string | number,
  surahNumber: number = ACTIVE_SURAH.number,
): string {
  if (surahNumber === 28) {
    return `${kind}:${targetId}`;
  }
  return `${kind}:${surahNumber}:${targetId}`;
}

export interface ParsedCardKey {
  kind: CardKind;
  surahNumber: number;
  targetId: string;
}

/**
 * تجزیه کلید کارت (پشتیبانی هم‌زمان از قالب قدیمی `vr:5` و قالب چندسوره‌ای `vr:36:5`)
 */
export function parseSurahCardKey(key: string): ParsedCardKey | null {
  const parts = key.split(":");
  if (parts.length < 2) return null;
  const kind = parts[0] as CardKind;
  if (!["w", "vr", "vt", "vn", "sq", "pg"].includes(kind)) return null;

  if (parts.length === 2) {
    return { kind, surahNumber: 28, targetId: parts[1] };
  }
  const surahNum = Number(parts[1]);
  if (!Number.isInteger(surahNum) || surahNum < 1 || surahNum > 114) return null;
  return { kind, surahNumber: surahNum, targetId: parts.slice(2).join(":") };
}
