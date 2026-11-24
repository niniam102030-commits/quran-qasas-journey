// src/learning/tajweed.ts
// جدول احکام تجوید، پالت رنگی استاندارد مصحف‌های تجویدی و استخراج مثال‌های سوره قصص (B2) — ماژول خالص TypeScript
import type { BaseVerse } from "../types/learning";

export type TajweedRuleId =
  | "ghunnah"
  | "ikhfa"
  | "idgham"
  | "iqlab"
  | "izhar"
  | "madd"
  | "qalqalah"
  | "tafkhim";

export interface TajweedRuleMeta {
  id: TajweedRuleId;
  nameFa: string;
  /** رنگ ثابت طبق پالت استاندارد مصحف‌های تجویدی */
  colorHex: string;
  colorClass: string;
  swatchClass: string;
  /** توضیح یک‌جمله‌ای فارسی */
  shortDescFa: string;
  /** درس کوتاه حداکثر ۳ جمله‌ای + تعریف برای صفحه مینی‌درس */
  lessonFa: string;
}

export interface WordTajweedEntry {
  w: number; // اندیس ۰-مبنا در آرایه words آیه پایه
  rules: TajweedRuleId[];
}

export interface SurahTajweedData {
  schema: string;
  surah: number;
  source?: string;
  verses: Record<string, WordTajweedEntry[]>;
}

export const TAJWEED_RULES: readonly TajweedRuleMeta[] = [
  {
    id: "ghunnah",
    nameFa: "غنه",
    colorHex: "#EA580C", // نارنجی
    colorClass: "text-[#EA580C] dark:text-orange-400",
    swatchClass: "bg-[#EA580C]",
    shortDescFa: "کشش صدای خیشومیِ نرم به اندازه دو حرکت در نون و میم مشدد.",
    lessonFa:
      "غنه صدای زنگ‌دار و خیشومی است که از بینی خارج می‌شود و هنگام ادای «نّ» و «مّ» مشدد به اندازه دو حرکت کشیده می‌شود. در تلاوت باید بدون فشار غیرطبیعی و با ریتم یکنواخت اجرا شود.",
  },
  {
    id: "ikhfa",
    nameFa: "اخفا",
    colorHex: "#16A34A", // سبز
    colorClass: "text-[#16A34A] dark:text-emerald-400",
    swatchClass: "bg-[#16A34A]",
    shortDescFa: "تلفظ نون ساکنه یا تنوین در حالتی میانه بین اظهار و ادغام همراه با غنه.",
    lessonFa:
      "اخفا یعنی پنهان‌کردن تلفظ نون ساکنه یا تنوین پیش از ۱۵ حرفِ اخفا (مثل ت، ث، ج، د، ذ، ز، س، ش، ص، ض، ط، ظ، ف، ق، ک) یا میم ساکنه پیش از ب. زبان به مخرج نون نمی‌چسبد و صدا به اندازه دو حرکت با غنه در بینی می‌ماند.",
  },
  {
    id: "idgham",
    nameFa: "ادغام",
    colorHex: "#2563EB", // آبی
    colorClass: "text-[#2563EB] dark:text-blue-400",
    swatchClass: "bg-[#2563EB]",
    shortDescFa: "آمیختن حرف ساکن در حرف متحرک بعدی به‌گونه‌ای که یک حرف مشدد تلفظ شود.",
    lessonFa:
      "ادغام یعنی درهم‌آمیختن نون ساکنه یا تنوین در حروف «یرملون» (یا دو حرف هم‌مخرج/متقارب) به‌طوری‌که حرف اول در دوم ذوب شود. در حروف «ینمو» با غنهٔ دوحرکتی و در «ل، ر» بدون غنه خوانده می‌شود.",
  },
  {
    id: "iqlab",
    nameFa: "اقلاب",
    colorHex: "#9333EA", // بنفش
    colorClass: "text-[#9333EA] dark:text-purple-400",
    swatchClass: "bg-[#9333EA]",
    shortDescFa: "تبدیل نون ساکنه یا تنوین به میمِ مخفی با غنه هنگام رسیدن به حرف «ب».",
    lessonFa:
      "هرگاه پس از نون ساکنه یا تنوین، حرف «ب» بیاید، نون به «م» خفیف تبدیل می‌شود. لب‌ها به‌آرامی و بدون فشار روی هم قرار می‌گیرند و صدای غنه به اندازه دو حرکت کشیده می‌شود.",
  },
  {
    id: "izhar",
    nameFa: "اظهار",
    colorHex: "#64748B", // خاکستری
    colorClass: "text-[#64748B] dark:text-slate-400",
    swatchClass: "bg-[#64748B]",
    shortDescFa: "تلفظ روشن و کامل نون ساکنه یا تنوین پیش از حروف شش‌گانه حلق بدون غنه زائد.",
    lessonFa:
      "اظهار یعنی آشکار خواندن نون ساکنه یا تنوین هنگامی که پیش از حروف حلق (ء، هـ، ع، ح، غ، خ) یا میم ساکنه پیش از سایر حروف قرار گیرد. نون کاملاً از مخرج خود ادا می‌شود و نباید آن را کشید یا در حرف بعدی ادغام کرد.",
  },
  {
    id: "madd",
    nameFa: "مد",
    colorHex: "#DC2626", // قرمز
    colorClass: "text-[#DC2626] dark:text-rose-400",
    swatchClass: "bg-[#DC2626]",
    shortDescFa: "کشش صدای حروف مدی (ا، و، ی) بیش از دو حرکت بر پایه سبب همزه یا سکون.",
    lessonFa:
      "مد به معنای کشیدن صدای حروف مدی (الف ماقبل مفتوح، واو ساکن ماقبل مضموم، یاء ساکن ماقبل مکسور) است. اندازه کشش از ۲ حرکت (طبیعی) تا ۴ یا ۶ حرکت (متصل، منفصل و لازم) بر اساس علامت مد «ٓ» متفاوت است.",
  },
  {
    id: "qalqalah",
    nameFa: "قلقله",
    colorHex: "#92400E", // قهوه‌ای
    colorClass: "text-[#92400E] dark:text-amber-500",
    swatchClass: "bg-[#92400E]",
    shortDescFa: "جهش و انعکاس کوتاه صدا در حروف «قُطْبُ جَدّ» هنگام سکون ذاتی یا عارضی.",
    lessonFa:
      "قلقله جهشِ خفیف صدا هنگام رهاشدن مخرج یکی از پنج حرف «ق، ط، ب، ج، د» در حالت سکون است. در میانهٔ آیه کوتاه (قلقله صغرا) و در وقفِ پایان آیه یا بر حرف مشدد برجسته‌تر (کبرا) تلفظ می‌شود.",
  },
  {
    id: "tafkhim",
    nameFa: "تفخیم",
    colorHex: "#1E3A8A", // سرمه‌ای
    colorClass: "text-[#1E3A8A] dark:text-indigo-300",
    swatchClass: "bg-[#1E3A8A]",
    shortDescFa: "پُرحجم و درشت اداکردن حروف استعلا (خ، ص، ض، غ، ط، ق، ظ) و راء و لام جلاله در شرایط مشخص.",
    lessonFa:
      "تفخیم به معنای پرکردن فضای دهان از طنین حرف است؛ حروف هفت‌گانه استعلا (خ، ص، ض، غ، ط، ق، ظ) همیشه و حروف الف، لام لفظ جلاله و «ر» در شرایط حرکت خاص مفخّم خوانده می‌شوند.",
  },
] as const;

export const TAJWEED_RULE_MAP: Record<TajweedRuleId, TajweedRuleMeta> = Object.fromEntries(
  TAJWEED_RULES.map((r) => [r.id, r]),
) as Record<TajweedRuleId, TajweedRuleMeta>;

export function getWordTajweedStyle(rules: readonly TajweedRuleId[] | undefined): {
  primaryRule: TajweedRuleMeta | null;
  hasMultiple: boolean;
  className: string;
} {
  if (!rules || rules.length === 0) {
    return { primaryRule: null, hasMultiple: false, className: "" };
  }
  const primaryRule = TAJWEED_RULE_MAP[rules[0]] ?? null;
  if (!primaryRule) {
    return { primaryRule: null, hasMultiple: false, className: "" };
  }
  const hasMultiple = rules.length > 1;
  const className = hasMultiple
    ? `${primaryRule.colorClass} underline decoration-dotted underline-offset-4`
    : primaryRule.colorClass;
  return { primaryRule, hasMultiple, className };
}

export interface TajweedLessonExample {
  ruleId: TajweedRuleId;
  verse: number;
  wordIndex0: number;
  wordIndex1: number;
  wordAr: string;
  allRules: TajweedRuleId[];
}

/**
 * استخراج اولین N مثال واقعی از فایل qasas.tajweed.json و آیات پایه سوره قصص
 */
export function extractTajweedExamples(
  tajweed: SurahTajweedData | null | undefined,
  verses: readonly BaseVerse[],
  ruleId: TajweedRuleId,
  limit = 3,
): TajweedLessonExample[] {
  if (!tajweed?.verses || !verses.length || limit <= 0) return [];
  const verseByNum = new Map(verses.map((v) => [v.n, v]));
  const verseNums = Object.keys(tajweed.verses)
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);

  const examples: TajweedLessonExample[] = [];
  for (const vNum of verseNums) {
    const bv = verseByNum.get(vNum);
    if (!bv) continue;
    const entries = tajweed.verses[String(vNum)] ?? [];
    for (const entry of entries) {
      if (!entry.rules.includes(ruleId)) continue;
      const word = bv.words[entry.w];
      if (!word) continue;
      examples.push({
        ruleId,
        verse: vNum,
        wordIndex0: entry.w,
        wordIndex1: word.i,
        wordAr: word.ar,
        allRules: entry.rules,
      });
      if (examples.length >= limit) return examples;
    }
  }
  return examples;
}
