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

// ─── هدف‌های یادگیری تیک‌زدنی ────────────────────────────────────────────────
// به‌جای چهار مسیر آماده، کاربر خودش انتخاب می‌کند چه چیزهایی یاد بگیرد.
// هر سؤال بر اساس نوعش دقیقاً به یک دسته تعلق دارد و هر کارت بر اساس نوعش
// (w/vt/vn/pg/vr/sq) به یک دسته؛ دسته‌ی خاموش یعنی آن سؤال‌ها در هیچ جلسه‌ای
// (مرحله، آزمون میانبر، مرور روزانه) نمی‌آیند و کارت‌هایش هم تمرین داده
// نمی‌شوند. «شماره صفحه» نوع سؤال مستقلی ندارد و فقط از راه کارت‌های pg
// تمرین می‌شود؛ خاموش‌کردنش جلوی ساخته‌شدن و مرور همان کارت‌ها را می‌گیرد.
export type GoalId = "hifz" | "vocab" | "translation" | "verseNumber" | "pageNumber";
export type GoalFlags = Record<GoalId, boolean>;

export interface GoalDef {
  id: GoalId;
  labelFa: string;
  descriptionFa: string;
}

export const GOAL_DEFS: GoalDef[] = [
  { id: "hifz", labelFa: "حفظ آیات", descriptionFa: "سؤال‌های حفظ، اتصال و ترتیب آیات" },
  { id: "vocab", labelFa: "واژگان", descriptionFa: "معنی کلمات و عبارت‌ها" },
  { id: "translation", labelFa: "ترجمه", descriptionFa: "ترجمه‌ی آیه و کامل‌کردن ترجمه" },
  { id: "verseNumber", labelFa: "شماره‌ی آیات", descriptionFa: "سؤال‌های شماره‌ی آیه" },
  { id: "pageNumber", labelFa: "شماره‌ی صفحه", descriptionFa: "تمرین شماره‌ی صفحه‌ی مصحف از راه کارت‌های صفحه" },
];

export const ALL_GOALS: GoalFlags = {
  hifz: true,
  vocab: true,
  translation: true,
  verseNumber: true,
  pageNumber: true,
};

const PURE_VOCAB_TYPES = new Set(["WORD_AR_TO_FA", "WORD_FA_TO_AR", "MATCH_WORDS", "MATCH_PHRASES"]);
const TRANSLATION_TYPES = new Set([
  "VERSE_TO_TRANSLATION",
  "TRANSLATION_TO_VERSE",
  "BUILD_FROM_TRANSLATION",
  "ORDER_TRANSLATION_CHUNKS",
  "CLOZE_FA",
]);

export function questionGoalCategory(type: string): GoalId {
  if (PURE_VOCAB_TYPES.has(type)) return "vocab";
  if (TRANSLATION_TYPES.has(type)) return "translation";
  if (NUMBER_TYPES.has(type)) return "verseNumber";
  return "hifz";
}

export function questionAllowedByGoals(type: string, goals: GoalFlags): boolean {
  return goals[questionGoalCategory(type)];
}

export function targetAllowedByGoals(target: string, goals: GoalFlags): boolean {
  const kind = target.split(":")[0];
  switch (kind) {
    case "w":
      return goals.vocab;
    case "vt":
      return goals.translation;
    case "vn":
      return goals.verseNumber;
    case "pg":
      return goals.pageNumber;
    default:
      return goals.hifz;
  }
}

/** تبدیل مسیر قدیمی به هدف‌ها (برای مهاجرت کاربران فعلی) */
export function goalsFromTrack(track: LearningTrack): GoalFlags {
  switch (track) {
    case "full":
      return { ...ALL_GOALS };
    case "light":
      return { ...ALL_GOALS, verseNumber: false, pageNumber: false };
    case "vocab":
      return { hifz: false, vocab: true, translation: true, verseNumber: false, pageNumber: false };
    case "hifz":
      return { hifz: true, vocab: false, translation: false, verseNumber: false, pageNumber: false };
  }
}

/** نزدیک‌ترین مسیر قدیمی برای برآورد حجم کار؛ فیلتر واقعی با خودِ goals است */
export function deriveTrackForGoals(goals: GoalFlags): LearningTrack {
  if (goals.hifz && goals.vocab && goals.translation && goals.verseNumber && goals.pageNumber) return "full";
  if (goals.hifz && !goals.vocab && !goals.translation && !goals.verseNumber && !goals.pageNumber) return "hifz";
  if (!goals.hifz && goals.vocab && goals.translation && !goals.verseNumber && !goals.pageNumber) return "vocab";
  if (goals.hifz && goals.vocab && goals.translation && !goals.verseNumber && !goals.pageNumber) return "light";
  return "full";
}
