// src/learning/tasmi.ts
// منطق خالص تسمیع نیم‌صفحه (تلاوت از حفظ + خودارزیابی) — بدون وابستگی به UI/DB.
// نکته: تسمیع و آزمون میانبر عبور از مراحل را ثبت می‌کنند، نه تسلط حرف‌به‌حرف بر تلاوت را.
import { seedKnownCard, type StoredCard } from "./cardScheduler";

export const TASMI_CLEAN_RECALL_DAYS = 17; // vr, sq
export const TASMI_CLEAN_RECALL_STABILITY = 14;
export const TASMI_CLEAN_SUPPORT_DAYS = 7; // vt, vn
export const TASMI_CLEAN_SUPPORT_STABILITY = 7;

export interface TasmiPlanOptions {
  verses: number[];
  slippedVerses: Set<number>;
  existingCards: Map<string, StoredCard>;
  unitId?: string;
  now?: Date;
}

/**
 * تولید کارت‌های FSRS پس از خودارزیابی تسمیع:
 * - آیه‌های لغزیده: فقط vr:<n> با سررسید امروز (state=1, due=now, streak=0) تا وارد صف مرور/تمرین شوند.
 * - آیه‌های سالم: کارت مرور با فاصلهٔ ۱۷ روز برای vr/sq و فاصلهٔ ۷ روز برای vt/vn.
 */
export function planTasmiCards(opts: TasmiPlanOptions): StoredCard[] {
  const now = opts.now ?? new Date();
  const out: StoredCard[] = [];

  for (const v of opts.verses) {
    if (opts.slippedVerses.has(v)) {
      const key = `vr:${v}`;
      const prev = opts.existingCards.get(key);
      out.push({
        key,
        kind: "vr",
        due: now.toISOString(),
        stability: prev ? Math.min(prev.stability, 1) : 0.5,
        difficulty: prev ? prev.difficulty : 6,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: (prev?.reps ?? 0) + 1,
        lapses: (prev?.lapses ?? 0) + 1,
        state: 1,
        lastReview: now.toISOString(),
        streak: 0,
      });
    } else {
      const recallKeys = [`vr:${v}`, `sq:${v}`] as const;
      for (const key of recallKeys) {
        const prev = opts.existingCards.get(key);
        if (prev && prev.state === 2 && prev.stability >= TASMI_CLEAN_RECALL_STABILITY) continue;
        out.push(
          seedKnownCard(key, {
            now,
            intervalDays: TASMI_CLEAN_RECALL_DAYS,
            stability: TASMI_CLEAN_RECALL_STABILITY,
          }),
        );
      }

      const supportKeys = [`vt:${v}`, `vn:${v}`] as const;
      for (const key of supportKeys) {
        const prev = opts.existingCards.get(key);
        if (prev && prev.state === 2 && prev.stability >= TASMI_CLEAN_SUPPORT_STABILITY) continue;
        out.push(
          seedKnownCard(key, {
            now,
            intervalDays: TASMI_CLEAN_SUPPORT_DAYS,
            stability: TASMI_CLEAN_SUPPORT_STABILITY,
          }),
        );
      }
    }
  }

  // اگر کل نیم‌صفحه بدون هیچ لغزشی تلاوت شد، کارت pg:<unitId> هم با فاصلهٔ ۱۷ روز بذر می‌گیرد
  if (opts.unitId && opts.slippedVerses.size === 0 && opts.verses.length > 0) {
    const pgKey = `pg:${opts.unitId}`;
    const prev = opts.existingCards.get(pgKey);
    if (!(prev && prev.state === 2 && prev.stability >= TASMI_CLEAN_RECALL_STABILITY)) {
      out.push(
        seedKnownCard(pgKey, {
          now,
          intervalDays: TASMI_CLEAN_RECALL_DAYS,
          stability: TASMI_CLEAN_RECALL_STABILITY,
        }),
      );
    }
  }

  return out;
}
