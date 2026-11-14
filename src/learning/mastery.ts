// src/learning/mastery.ts
// قواعد تسلط — تابع‌های خالص.
import type { StoredCard } from "./cardScheduler";

export interface StageAttempt {
  stage: number;
  correct: boolean;
  usedHint: boolean;
}

export const STAGE_PASS_RATIO = 0.85;
export const STAGE8_PASS_RATIO = 0.9;
export const UNLOCK_DEBT_LIMIT = 40;

/** آیا مرحله پاس شد؟ ≥۸۵٪ (مرحله ۸: ≥۹۰٪ بدون راهنما) و دو پاسخ درست متوالی در انتها. */
export function stagePassed(attempts: StageAttempt[], stage: number): boolean {
  const a = attempts.filter((x) => x.stage === stage);
  if (a.length < 4) return false;
  const ok = a.filter((x) => x.correct && (stage !== 8 || !x.usedHint)).length;
  const ratio = ok / a.length;
  if (ratio < (stage === 8 ? STAGE8_PASS_RATIO : STAGE_PASS_RATIO)) return false;
  const last2 = a.slice(-2);
  return last2.length === 2 && last2.every((x) => x.correct && (stage !== 8 || !x.usedHint));
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
