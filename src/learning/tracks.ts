// src/learning/tracks.ts
// مسیرهای یادگیری بر اساس هدف کاربر (مورد ۱۷): فیلتر خالصِ نوع سؤال، بدون دست‌کاری محتوا
export type LearningTrack = "full" | "hifz" | "vocab" | "light";

export interface TrackInfo {
  id: LearningTrack;
  labelFa: string;
  descriptionFa: string;
  /** سهم تقریبی سؤال‌های این مسیر از کل بانک ۶٬۸۲۳ سؤال (برای پیش‌بینی پایان) */
  workRatio: number;
}

export const TRACK_LIST: TrackInfo[] = [
  {
    id: "full",
    labelFa: "کامل",
    descriptionFa: "همهٔ تمرین‌ها: حفظ، واژگان، ترجمه و شمارهٔ آیات — مسیر جامع تسلط.",
    workRatio: 1,
  },
  {
    id: "light",
    labelFa: "سبک",
    descriptionFa: "همه‌چیز به‌جز سؤال‌های شمارهٔ آیه و صفحه؛ برای کسی که شماره‌ها برایش مهم نیست.",
    workRatio: 0.86,
  },
  {
    id: "vocab",
    labelFa: "فقط واژگان",
    descriptionFa: "فقط کلمات، ریشه و ترجمه — بدون هدف حفظ و بدون شماره‌ها.",
    workRatio: 0.57,
  },
  {
    id: "hifz",
    labelFa: "فقط حفظ",
    descriptionFa: "فقط حفظ و اتصال آیات — بدون درس واژگان سخت و بدون شمارهٔ آیه و صفحه.",
    workRatio: 0.29,
  },
];

const VOCAB_TYPES = new Set([
  "WORD_AR_TO_FA",
  "WORD_FA_TO_AR",
  "MATCH_WORDS",
  "MATCH_PHRASES",
  "VERSE_TO_TRANSLATION",
  "TRANSLATION_TO_VERSE",
  "BUILD_FROM_TRANSLATION",
  "ORDER_TRANSLATION_CHUNKS",
  "CLOZE_FA",
]);

const NUMBER_TYPES = new Set([
  "VERSE_TO_NUMBER",
  "NUMBER_TO_VERSE_START",
  "MATCH_NUMBER_OPENING",
  "BUILD_FROM_NUMBER",
]);

export function isLearningTrack(value: unknown): value is LearningTrack {
  return value === "full" || value === "hifz" || value === "vocab" || value === "light";
}

export function questionAllowedInTrack(type: string, track: LearningTrack): boolean {
  switch (track) {
    case "full":
      return true;
    case "light":
      return !NUMBER_TYPES.has(type);
    case "vocab":
      return VOCAB_TYPES.has(type);
    case "hifz":
      return !VOCAB_TYPES.has(type) && !NUMBER_TYPES.has(type);
  }
}

export function trackWorkRatio(track: LearningTrack): number {
  return TRACK_LIST.find((t) => t.id === track)?.workRatio ?? 1;
}
