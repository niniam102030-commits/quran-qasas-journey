// src/learning/tasmi.ts
// منطق خالص تسمیع نیم‌صفحه (تلاوت از حفظ + خودارزیابی) — بدون وابستگی به UI/DB.
// نکته: تسمیع و آزمون میانبر عبور از مراحل را ثبت می‌کنند، نه تسلط حرف‌به‌حرف بر تلاوت را.
import { formatSurahCardKey } from "../config/surahConfig";
import { hasRealFsrsHistory, newCard, seedKnownCard, type StoredCard } from "./cardScheduler";

export const TASMI_CLEAN_RECALL_DAYS = 17; // vr, sq
export const TASMI_CLEAN_SUPPORT_DAYS = 7; // vt, vn

export interface TasmiPlanOptions {
  verses: number[];
  slippedVerses: Set<number>;
  existingCards: Map<string, StoredCard>;
  unitId?: string;
  surahNumber?: number;
  now?: Date;
}

/**
 * تولید کارت‌های FSRS پس از خودارزیابی تسمیع:
 * - آیه‌های لغزیده: فقط سررسید vr:<n> به امروز تغییر می‌کند (بدون ثبت lapse/rep جعلی و بدون خرد کردن stability).
 * - آیه‌های سالم: کارت مرور با فاصلهٔ ۱۷ روز برای vr/sq و ۷ روز برای vt/vn (و stability سازگار با منحنی FSRS).
 * - قاعدهٔ حفاظت: هیچ کارتی با سابقهٔ واقعی FSRS (state !== 0 && reps > 0) هرگز با بذر بازنویسی نمی‌شود.
 */
export function planTasmiCards(opts: TasmiPlanOptions): StoredCard[] {
  const now = opts.now ?? new Date();
  const surah = opts.surahNumber ?? 28;
  const out: StoredCard[] = [];

  for (const v of opts.verses) {
    if (opts.slippedVerses.has(v)) {
      const key = formatSurahCardKey("vr", v, surah);
      const prev = opts.existingCards.get(key);
      if (prev) {
        // فقط سررسید = امروز؛ آمار واقعی FSRS (lapses/reps/stability) دست‌نخورده می‌ماند
        out.push({
          ...prev,
          due: now.toISOString(),
        });
      } else {
        out.push(newCard(key, now));
      }
    } else {
      const recallKeys = [
        formatSurahCardKey("vr", v, surah),
        formatSurahCardKey("sq", v, surah),
      ] as const;
      for (const key of recallKeys) {
        const prev = opts.existingCards.get(key);
        if (hasRealFsrsHistory(prev)) continue;
        out.push(
          seedKnownCard(key, {
            now,
            intervalDays: TASMI_CLEAN_RECALL_DAYS,
          }),
        );
      }

      const supportKeys = [
        formatSurahCardKey("vt", v, surah),
        formatSurahCardKey("vn", v, surah),
      ] as const;
      for (const key of supportKeys) {
        const prev = opts.existingCards.get(key);
        if (hasRealFsrsHistory(prev)) continue;
        out.push(
          seedKnownCard(key, {
            now,
            intervalDays: TASMI_CLEAN_SUPPORT_DAYS,
          }),
        );
      }
    }
  }

  // اگر کل نیم‌صفحه بدون هیچ لغزشی تلاوت شد، کارت pg:<unitId> هم با فاصلهٔ ۱۷ روز بذر می‌گیرد
  if (opts.unitId && opts.slippedVerses.size === 0 && opts.verses.length > 0) {
    const pgKey = formatSurahCardKey("pg", opts.unitId, surah);
    const prev = opts.existingCards.get(pgKey);
    if (!hasRealFsrsHistory(prev)) {
      out.push(
        seedKnownCard(pgKey, {
          now,
          intervalDays: TASMI_CLEAN_RECALL_DAYS,
        }),
      );
    }
  }

  return out;
}
