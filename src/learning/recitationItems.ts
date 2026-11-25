// src/learning/recitationItems.ts
// قالب‌های تمرین تلاوت به‌صورت «آیتم تلاوت» زمان اجرا — توابع خالص طراحی/ارزیابی.
// این آیتم‌ها سؤال بانکی نیستند؛ از آیات همان واحد ساخته می‌شوند و محتوای برنامه دست‌نخورده می‌ماند.
import type { RatingKind } from "./cardScheduler";

export type ReciteMode = "follow" | "fade" | "blind" | "link" | "hunt" | "voice" | "witness";
export type RecitePurpose = "stage" | "gate" | "review" | "hunt" | "exam" | "witness";

export interface ReciteItemSpec {
  id: string;
  verse: number;
  mode: ReciteMode;
  unitId?: string;
  /** قالب اتصال: تلاوت از این آیه شروع می‌شود و آیهٔ هدف (verse) باید از حفظ ادامه یابد */
  linkFromVerse?: number;
  /** قالب مرور صوتی: کلید کارت FSRS که با نمرهٔ صوتی به‌روز می‌شود */
  cardKey?: string;
  /** قالب شکار خطا: متن مرجع کلماتی که کاربر قبلاً در این آیه لغزیده است */
  erredWords?: string[];
  /** قالب محو: سطح محو ۰ (کامل) تا ۳ (پنهان کامل) */
  fadeLevel?: number;
  /** آیتم اختیاری (مثلاً آشنایی مرحلهٔ ۱) — قابل ردکردن بدون جریمه */
  optional?: boolean;
}

export interface ReciteAttemptSummary {
  totalWords: number;
  matched: number;
  uncertain: number;
  /** خطای قطعی: missed + substituted نهایی (پس از قواعد داور و تأیید کاربر) */
  confirmedErrors: number;
  judgedSegments: number;
  totalSegments: number;
  /** همهٔ تکه‌ها با حکم judged تمام شده‌اند (نه not_this_text و نه ناتمام) */
  coverageComplete: boolean;
}

export interface ReciteItemResult {
  itemId: string;
  verse: number;
  mode: ReciteMode;
  status: "passed" | "failed" | "skipped";
  /** سهم کلمات matched از کل (در حالت نابینا، uncertain قبول نیست) */
  accuracyRatio: number;
  confirmedErrors: number;
  peeks: number;
  attemptsUsed: number;
  /** فقط قالب مرور صوتی: نمرهٔ FSRS متناظر */
  grade?: RatingKind;
  cardKey?: string;
}

export const GATE_MIN_ACCURACY = 0.9;
export const LINK_MIN_ACCURACY = 0.8;
export const MAX_RECITE_ATTEMPTS = 2;
export const FADE_MAX_PEEKS = 2;
export const VOICE_REVIEW_DAILY_CAP = 5;

export function accuracyRatioOf(s: ReciteAttemptSummary): number {
  return s.totalWords > 0 ? s.matched / s.totalWords : 0;
}

/** نمرهٔ FSRS برای کارت مرور صوتی از روی خلاصهٔ داوری */
export function voiceGradeOf(s: ReciteAttemptSummary): RatingKind {
  if (!s.coverageComplete || s.confirmedErrors >= 1) return "again";
  if (s.uncertain > 0) return "hard";
  return "good";
}

/** ارزیابی قبولی یک آیتم تلاوت بر اساس قالبش — قلب قواعد طراحی */
export function evaluateReciteItem(
  mode: ReciteMode,
  s: ReciteAttemptSummary,
  peeks: number,
): { passed: boolean; grade?: RatingKind } {
  const acc = accuracyRatioOf(s);
  switch (mode) {
    case "witness":
      // همراهی بدون قضاوت: صرفِ انجام تلاوت کافی است، خطا شکست نیست
      return { passed: s.judgedSegments > 0 };
    case "follow":
      return { passed: s.coverageComplete };
    case "fade":
      return { passed: s.coverageComplete && peeks <= FADE_MAX_PEEKS && s.confirmedErrors <= 1 };
    case "blind":
      // گیت پاس‌شدن: بدون خطای قطعی و دقت ≥ ۹۰٪ (uncertain قبول نیست)
      return { passed: s.coverageComplete && s.confirmedErrors === 0 && acc >= GATE_MIN_ACCURACY };
    case "link":
      return { passed: s.coverageComplete && s.confirmedErrors <= 1 && acc >= LINK_MIN_ACCURACY };
    case "hunt":
      // شکار خطا فقط با تلاوت کاملاً تمیز تمام می‌شود
      return { passed: s.coverageComplete && s.confirmedErrors === 0 };
    case "voice": {
      const grade = voiceGradeOf(s);
      return { passed: grade !== "again", grade };
    }
  }
}

export type FadeDisplay = "full" | "first" | "hidden";

/** نمایش هر کلمه در قالب محو: سطح ۰ کامل؛ ۱ کلمات ضعیف پنهان؛ ۲ فقط حرف اول؛ ۳ همه پنهان */
export function fadeDisplayFor(
  wordCount: number,
  level: number,
  weakIdxs: ReadonlySet<number>,
): FadeDisplay[] {
  const lv = Math.max(0, Math.min(3, level));
  return Array.from({ length: wordCount }, (_, i) => {
    if (lv === 0) return "full" as FadeDisplay;
    if (lv === 1) return weakIdxs.has(i) ? ("hidden" as FadeDisplay) : ("full" as FadeDisplay);
    if (lv === 2) return weakIdxs.has(i) ? ("hidden" as FadeDisplay) : ("first" as FadeDisplay);
    return "hidden" as FadeDisplay;
  });
}

/** سطح محو بعدی بر اساس تعداد تلاوت‌های تمیزِ پیاپیِ همان آیه (۰ تا ۳) */
export function fadeLevelForCleanStreak(cleanStreak: number): number {
  return Math.max(0, Math.min(3, cleanStreak));
}

function pickIdx(len: number, seed: number): number {
  if (len <= 0) return 0;
  const x = Math.sin(seed * 9973 + 17) * 10000;
  return Math.abs(Math.floor(x)) % len;
}

/**
 * نقشهٔ آیتم تلاوت هر مرحله (بدون واژه‌ها؛ سرویس داده آن‌ها را پر می‌کند):
 * ۱ همراهی اختیاری، ۳ همراهی، ۴ محو، ۵ اتصال، ۶ محو، ۷ و ۸ گیت نابینا.
 */
export function stageRecitePlan(
  stage: number,
  verses: number[],
  seed: number,
  fadeLevels: ReadonlyMap<number, number>,
): ReciteItemSpec[] {
  if (verses.length === 0) return [];
  const pick = verses[pickIdx(verses.length, seed + stage)];
  const id = (mode: ReciteMode, verse: number) => `recite_s${stage}_${mode}_${verse}`;
  switch (stage) {
    case 1:
      return [{ id: id("follow", verses[0]), verse: verses[0], mode: "follow", optional: true }];
    case 3:
      return [{ id: id("follow", pick), verse: pick, mode: "follow" }];
    case 4:
      return [{ id: id("fade", pick), verse: pick, mode: "fade", fadeLevel: fadeLevels.get(pick) ?? 0 }];
    case 5: {
      if (verses.length >= 2) {
        const ti = Math.min(verses.length - 1, Math.max(1, pickIdx(verses.length, seed + 55)));
        return [
          {
            id: id("link", verses[ti]),
            verse: verses[ti],
            mode: "link",
            linkFromVerse: verses[ti - 1],
          },
        ];
      }
      return [{ id: id("follow", pick), verse: pick, mode: "follow" }];
    }
    case 6:
      return [{ id: id("fade", pick), verse: pick, mode: "fade", fadeLevel: fadeLevels.get(pick) ?? 0 }];
    case 7:
    case 8:
      return [{ id: id("blind", pick), verse: pick, mode: "blind" }];
    default:
      return [];
  }
}
