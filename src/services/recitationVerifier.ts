// src/services/recitationVerifier.ts
// موتور هم‌ترازی و خطایابی کلمه‌به‌کلمه تلاوت قرآنی (مستقل از موتور ASR)
// نکته علمی: این ماژول صحت کلمات (حذف، اضافه، جابه‌جایی) را می‌سنجد و جایگزین ارزیابی احکام تجوید نیست.

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
 * نرمال‌سازی رسم‌الخط عثمانی و متن گفتاری عربی برای تطبیق منصفانه کلمه‌به‌کلمه
 */
export function normalizeArabicForRecitation(text: string): string {
  return text
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
    // ادغام الف‌های تکراری احتمالی
    .replace(/اا+/g, "ا")
    .replace(/\s+/g, " ")
    .trim();
}

function charEditDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * تطابق تقریبی دو کلمه نرمال‌شده (برای پوشش تفاوت‌های جزئی رسم‌الخط عثمانی با املای معیار ASR مثل الصلاه/الصلوه)
 */
function isWordMatch(expectedNorm: string, spokenNorm: string): boolean {
  if (!expectedNorm || !spokenNorm) return false;
  if (expectedNorm === spokenNorm) return true;
  // برای کلمات بلندتر از ۴ حرف، حداکثر ۱ تفاوت حرفی (مثلاً الف خنجری جاافتاده در رسم‌الخط عثمانی مثل الرحمن/الرحمان) مجاز است
  const maxLen = Math.max(expectedNorm.length, spokenNorm.length);
  if (maxLen >= 4 && charEditDistance(expectedNorm, spokenNorm) <= 1) {
    return true;
  }
  return false;
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

  // ماتریس برنامه‌نویسی پویا برای کمینه‌سازی فاصله هم‌ترازی
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const matched = isWordMatch(expNorm[i - 1], spokenTokens[j - 1]);
      const subCost = matched ? 0 : 1.1; // ترجیح اندک به تطبیق دقیق‌تر
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + subCost,
        dp[i - 1][j] + 1, // کلمه از آیه جا افتاده (missing)
        dp[i][j - 1] + 1, // کلمه اضافه خوانده شده (extra)
      );
    }
  }

  // بازگردانی مسیر هم‌ترازی
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
  const accuracyPercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  return {
    wordResults,
    extraWords,
    correctCount,
    totalCount,
    accuracyPercent,
    matchedWordIds,
  };
}
