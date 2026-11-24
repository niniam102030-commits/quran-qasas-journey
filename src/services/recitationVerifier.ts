// src/services/recitationVerifier.ts
// موتور هم‌ترازی و خطایابی دقیق کلمه‌به‌کلمه تلاوت قرآنی (بدون تلورانس آزاد تک‌حرفی)
// نکته علمی: این ماژول صحت لفظی کلمات (حذف، اضافه، جابه‌جایی) را می‌سنجد و جایگزین ارزیابی احکام تجوید نیست.

export interface ExpectedReciteWord {
  id: string;
  ar: string;
}

export type ReciteWordStatus = "correct" | "missing" | "substituted";

export interface ReciteWordResult {
  wordId: string;
  expectedAr: string;
  status: ReciteWordStatus;
  spoken?: string;
}

export interface RecitationCheckResult {
  wordResults: ReciteWordResult[];
  extraWords: string[];
  correctCount: number;
  totalCount: number;
  accuracyPercent: number;
  matchedWordIds: string[];
}

/**
 * نگاشت محدود و صریح تفاوت‌های املاییِ صرفاً رسم‌الخط عثمانی با املای معیار عربی (بدون تلورانس عمومی)
 */
const UTHMANI_ORTHOGRAPHY_MAP: Record<string, string> = {
  الصلوه: "الصلاه",
  الصلواه: "الصلاه",
  صلوه: "صلاه",
  صلواه: "صلاه",
  الحيوه: "الحياه",
  الحيواه: "الحياه",
  حيوه: "حياه",
  حيواه: "حياه",
  الزكوه: "الزكاه",
  الزكواه: "الزكاه",
  زكوه: "زكاه",
  زكواه: "زكاه",
  مشكوه: "مشكاه",
  مشكواه: "مشكاه",
  النجوه: "النجاه",
  النجواه: "النجاه",
  نجوه: "نجاه",
  الغدوه: "الغداه",
  الغدواه: "الغداه",
  الربوا: "الربا",
  الرحمن: "الرحمان",
  سموات: "سماوات",
  السموات: "السماوات",
  اولو: "اولوا",
  اولي: "اولي",
  هولاء: "هاولاء",
  هاولاء: "هولاء",
  ذلك: "ذالك",
  لكن: "لاكن",
};

function canonicalizeOrthography(token: string): string {
  return UTHMANI_ORTHOGRAPHY_MAP[token] ?? token;
}

/**
 * نرمال‌سازی رسم‌الخط عثمانی و متن گفتاری عربی برای تطبیق دقیق کلمه‌به‌کلمه
 */
export function normalizeArabicForRecitation(text: string): string {
  const cleaned = text
    .normalize("NFKC")
    // الف خنجری (ـٰ) در قرائت به‌صورت «ا» تلفظ می‌شود (مثل الكتـٰب → الكتاب، ءايـٰت → ايات)
    .replace(/\u0640?\u0670/g, "ا")
    // حذف حرکات، تنوین، علامات وقف و کشیده
    .replace(/[\u064B-\u065F\u06D6-\u06ED\u0640\u0610-\u061A\u06E5\u06E6]/g, "")
    // حذف علائم نگارشی و شماره آیه
    .replace(/[۝۞﴿﴾.,،؛!؟?\-\d۰-۹٠-٩]/g, " ")
    // یکسان‌سازی الف‌ها، همزه‌ها و املای عثمانی (ءا ← ا)
    .replace(/ءا/g, "ا")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ک/g, "ك")
    .replace(/ی/g, "ي")
    // ادغام الف‌های تکراری حاصل از الف خنجری کنار الف
    .replace(/اا+/g, "ا")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map(canonicalizeOrthography)
    .join(" ");
}

/**
 * تطابق دقیق کلمات پس از نرمال‌سازی عثمانی (بدون فاصله ویرایشی آزاد تا حذف «وَ» یا تغییر ضمیر «هم/کم» هرگز رد نشود)
 */
function isWordMatch(expectedNorm: string, spokenNorm: string): boolean {
  if (!expectedNorm || !spokenNorm) return false;
  return expectedNorm === spokenNorm;
}

/**
 * هم‌ترازی بهینه (DP / Levenshtein در سطح کلمه) بین کلمات مصحف و متن تلاوت کاربر
 */
export function verifyVerseRecitation(
  expectedWords: readonly ExpectedReciteWord[],
  spokenTranscript: string,
): RecitationCheckResult {
  const expNorm = expectedWords.map((w) => normalizeArabicForRecitation(w.ar));
  const spokenTokens = normalizeArabicForRecitation(spokenTranscript)
    .split(" ")
    .filter(Boolean);

  const m = expNorm.length;
  const n = spokenTokens.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const matched = isWordMatch(expNorm[i - 1], spokenTokens[j - 1]);
      const subCost = matched ? 0 : 1.1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + subCost,
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      );
    }
  }

  const wordResults: ReciteWordResult[] = [];
  const extraWords: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const matched = isWordMatch(expNorm[i - 1], spokenTokens[j - 1]);
      const subCost = matched ? 0 : 1.1;
      if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + subCost)) < 1e-6) {
        wordResults.push({
          wordId: expectedWords[i - 1].id,
          expectedAr: expectedWords[i - 1].ar,
          status: matched ? "correct" : "substituted",
          spoken: spokenTokens[j - 1],
        });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && Math.abs(dp[i][j] - (dp[i - 1][j] + 1)) < 1e-6) {
      wordResults.push({
        wordId: expectedWords[i - 1].id,
        expectedAr: expectedWords[i - 1].ar,
        status: "missing",
      });
      i--;
    } else if (j > 0) {
      extraWords.push(spokenTokens[j - 1]);
      j--;
    }
  }

  wordResults.reverse();
  extraWords.reverse();

  const matchedWordIds = wordResults.filter((r) => r.status === "correct").map((r) => r.wordId);
  const correctCount = matchedWordIds.length;
  const totalCount = expectedWords.length;
  // جریمه کلمات اضافه در دقت نهایی: تنها زمانی ۱۰۰٪ است که همه کلمات درست و بدون کلمه اضافه باشند
  const denominator = totalCount + extraWords.length;
  const accuracyPercent = denominator > 0 ? Math.round((correctCount / denominator) * 100) : 0;

  return {
    wordResults,
    extraWords,
    correctCount,
    totalCount,
    accuracyPercent,
    matchedWordIds,
  };
}
