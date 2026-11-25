// src/learning/mastery.ts
// قواعد تسلط — تابع‌های خالص.
import type { StoredCard } from "./cardScheduler";

export interface StageAttempt {
  stage: number;
  correct: boolean;
  usedHint: boolean;
}

export const STAGE_INTRO_PASS_RATIO = 0.75; // مراحل ۱ و ۲ (آشنایی اولیه)
export const STAGE_PASS_RATIO = 0.8;        // مراحل ۳ تا ۷
export const STAGE8_PASS_RATIO = 0.85;      // مرحله ۸ (آزمون تسلط بدون راهنما)
export const UNLOCK_DEBT_LIMIT = 40;
export const LESSONS_PER_STAGE = 2;         // هر مرحله شامل ۲ درس کوتاه ۱۰ سوالی
export const LESSON_SIZE = 10;              // تعداد سوال در هر درس کوتاه
export const MAX_REQUEUE_PER_QUESTION = 2;  // حداکثر ۲ بار بازگشت سوال غلط به صف
export const FLAWLESS_MIN_ATTEMPTS = 8;     // حداقل تلاش اول برای حذف مشروط درس دوم

export function passRatioForStage(stage: number): number {
  if (stage === 8) return STAGE8_PASS_RATIO;
  if (stage <= 2) return STAGE_INTRO_PASS_RATIO;
  return STAGE_PASS_RATIO;
}

/** آیا درس کاملاً بی‌نقص انجام شده؟ (حداقل ۸ تلاش اول، همگی درست، بدون راهنما و بدون بازگشت به صف) */
export function isFlawlessLesson(
  attempts: StageAttempt[],
  opts: { anyHint: boolean; anyRequeue: boolean },
): boolean {
  if (attempts.length < FLAWLESS_MIN_ATTEMPTS) return false;
  if (opts.anyHint || opts.anyRequeue) return false;
  return attempts.every((a) => a.correct && !a.usedHint);
}

/** آیا درس/مرحله پاس شد؟ مراحل ۱–۲: ≥۷۵٪، مراحل ۳–۷: ≥۸۰٪، مرحله ۸: ≥۸۵٪ بدون راهنما.
 * حداقل تلاش اول پیش‌فرض ۴ است؛ وقتی صفِ واقعیِ درس (پس از همه‌ی فیلترها)
 * کوتاه‌تر از ۴ سؤال است، سازنده‌ی جلسه همان طول صف را به‌عنوان حداقل
 * می‌دهد تا درسی که ذاتاً سؤال بیشتری ندارد برای همیشه ناپاس نماند. */
export function stagePassed(attempts: StageAttempt[], stage: number, minAttempts = 4): boolean {
  const a = attempts.filter((x) => x.stage === stage);
  if (a.length < Math.max(1, minAttempts)) return false;
  const ok = a.filter((x) => x.correct && (stage !== 8 || !x.usedHint)).length;
  const ratio = ok / a.length;
  return ratio >= passRatioForStage(stage);
}

/** سطح مهارت کارت: 0 ندیده، 1 دیده، 2 پایدار شروع، 3 تسلط (stability ≥ 7 روز و streak ≥ 2) */
export function skillLevel(card: StoredCard | undefined): 0 | 1 | 2 | 3 {
  if (!card || card.state === 0) return 0;
  if (card.stability >= 7 && card.streak >= 2) return 3;
  if (card.stability >= 2) return 2;
  return 1;
}

/** آیه‌ی طلایی: چهار مهارت vr, vt, vn, sq همه سطح ۳ */
export function isGoldenVerse(verse: number, cards: Map<string, StoredCard>): boolean {
  return ["vr", "vt", "vn", "sq"].every((k) => skillLevel(cards.get(`${k}:${verse}`)) >= 3);
}

/** گشایش واحد بعدی: بدهی مرور < ۴۰ و مرحله ۸ واحد فعلی پاس شده */
export function canUnlockNext(stage8Passed: boolean, debt: number): boolean {
  return stage8Passed && debt < UNLOCK_DEBT_LIMIT;
}

/** واحد «مسلط» است اگر همه‌ی آیه‌هایش طلایی باشند و pg سطح ۳ */
export function unitMastered(verses: number[], unitId: string, cards: Map<string, StoredCard>): boolean {
  return verses.every((v) => isGoldenVerse(v, cards)) && skillLevel(cards.get(`pg:${unitId}`)) >= 3;
}
