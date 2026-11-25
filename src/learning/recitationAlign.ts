// src/learning/recitationAlign.ts
// لایهٔ خالص هم‌ترازی خروجی ASR با متن مرجع آیه، برش‌بندی وقف و کالیبراسیون شخصی (بخش ۱ و ۲)
// بدون هیچ وابستگی به React یا Dexie.
import { normalizeArabicForRecitation } from "../services/recitationVerifier";

export const MATCH_SIM = 0.8;
export const SUBSTITUTED_MAX_SIM = 0.5;
export const MIN_CONFIDENCE_FOR_SUBSTITUTION = 0.5;
export const CALIBRATION_IMMUNITY_THRESHOLD = 2;
export const MAX_CALIBRATION_ENTRIES = 500;

export type WordAlignState = "matched" | "substituted" | "uncertain" | "missed";

export interface WordAlignment {
  ref: string;
  state: WordAlignState;
  heard?: string;
  userConfirmed?: boolean;
  /** نمرهٔ شباهت کلمهٔ جفت‌شده (۰ تا ۱) برای نمایش تشخیصی در پنل آزمایش داور */
  sim?: number;
  /** دلیل صدور حکم برای این کلمه (کد کوتاه لاتین، برای خروجی تست) */
  reason?: string;
}

/** پارامترهای قابل تنظیم داور تلاوت (پنل آزمایش) */
export interface JudgeParams {
  /** حداقل شباهت برای «شنیده‌شده» (matched) */
  matchSim: number;
  /** دروازهٔ پوشش سراسری: حداقل سهم کلمات matched از کل تکه تا تلاش «تلاوت همین تکه» حساب شود */
  coverageGate: number;
  /** سقف جزیرهٔ نامشخص: حداکثر طول مجاز رشتهٔ متوالی کلمات نامشخصِ محصور بین دو لنگر */
  islandCap: number;
  /** فعال‌بودن دروازهٔ پوشش */
  gateEnabled: boolean;
}

export type JudgeProfileName = "lenient" | "balanced" | "strict" | "very_strict";

export const JUDGE_PROFILES: Record<JudgeProfileName, JudgeParams> = {
  lenient: { matchSim: 0.75, coverageGate: 0.3, islandCap: 3, gateEnabled: true },
  balanced: { matchSim: 0.75, coverageGate: 0.4, islandCap: 2, gateEnabled: true },
  strict: { matchSim: 0.85, coverageGate: 0.5, islandCap: 2, gateEnabled: true },
  very_strict: { matchSim: 0.9, coverageGate: 0.6, islandCap: 1, gateEnabled: true },
};

export const DEFAULT_JUDGE_PROFILE: JudgeProfileName = "balanced";

export interface VerseAlignmentResult {
  words: WordAlignment[];
  /** سهم کلمات matched از کل کلمات مرجع (۰ تا ۱) */
  coverage: number;
  /** فقط تعداد کلمات دارای وضعیت substituted */
  confirmedErrors: number;
  /** تعداد کلمات اضافهٔ شنیده‌شده (تکرار/لکنت) که جای کلمهٔ مرجع را نگرفته‌اند */
  extraWords: number;
  /** تعداد کلمات دارای وضعیت missed (ناحیهٔ خطا) — فقط در خروجی داور (judgeRecitationAttempt) پر می‌شود */
  missedCount?: number;
}

export interface AlignOptions {
  tokenConfidences?: number[];
  calibration?: Map<string, number>;
  /** پارامترهای داور (پنل آزمایش)؛ هر فیلدِ داده‌شده جای پیش‌فرض را می‌گیرد */
  judge?: Partial<JudgeParams>;
  /** در تست داور: نادیده‌گرفتن کامل کالیبراسیون شخصی تا مصونیت‌های قبلی نتیجه را آلوده نکنند */
  bypassCalibration?: boolean;
}

export interface RecitationCalibrationData {
  confirmed: Record<string, number>;
}

const WAQF_MARK_RE = /[ۚۖۗۘۙۛۜ]/;

/**
 * ۱-۱) نرمال‌سازی واژه با استفادهٔ مستقیم از نگاشت عثمانی موجود در recitationVerifier.ts
 * (بدون ساختن کپی تازه از جدول رسم‌الخط عثمانی)
 */
export function normalizeForAlign(word: string): string {
  return normalizeArabicForRecitation(word);
}

/** فاصلهٔ ویرایشی (Levenshtein) در سطح نویسه بین دو رشتهٔ نرمال‌شده */
export function charEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j - 1] + cost,
        prev[j] + 1,
        curr[j - 1] + 1,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** شباهت نرمال‌شده بین دو واژهٔ نرمال‌شده در بازهٔ [0, 1] */
export function wordSimilarity(normA: string, normB: string): number {
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  const dist = charEditDistance(normA, normB);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * ۱-۱) هم‌ترازی توالی‌به‌توالی (برنامه‌نویسی پویا) بین کلمات مرجع آیه و کلمات شنیده‌شده از ASR.
 *
 * تعریف دقیق الگوریتمی وضعیت `substituted` (خطای قطعی جایگزینی):
 * یک کلمهٔ مرجع `i` که در مسیر بهینهٔ DP با توکن شنیده‌شدهٔ `j` جفت شده، تنها زمانی `substituted` می‌شود که
 * هم‌زمان تمام ۵ شرط زیر برقرار باشد:
 * ۱. شباهت آن با کلمهٔ مرجع کمتر از ۰٫۵ باشد (`sim < 0.5`)؛ بازهٔ خاکستری `[0.5, 0.8)` همیشه `uncertain` است.
 * ۲. توکن شنیده‌شده با کلمهٔ مرجع قبلی یا بعدی (`i-1` یا `i+1`) شباهت `>= 0.5` نداشته باشد (تا جابه‌جایی/تکرار همسایه خطای جایگزینی نشود).
 * ۳. اگر `tokenConfidences` برای توکن `j` داده شده باشد، مقدارش حداقل `0.5` باشد (`conf >= 0.5`).
 * ۴. در کالیبراسیون شخصی کاربر، شمار تأیید آن کلمهٔ مرجع کمتر از ۲ باشد (`(calibration.get(refNorm) ?? 0) < 2`).
 * ۵. پایداری ناحیهٔ هم‌تراز اطراف `i`:
 *    - در آیات چندکلمه‌ای (`M >= 2`)، حداقل یکی از همسایه‌های بلافصل موجود (`i-1` یا `i+1`) باید با شباهت `>= 0.8` (`matched`) قفل شده باشد،
 *    - و هیچ همسایهٔ بلافصل دیگری نباید هم‌زمان دارای شباهت `< 0.5` یا حذف‌شده باشد (یعنی اگر ۲ یا چند کلمهٔ متوالی هم‌زمان تحریف/خراب شده باشند، ناحیه پرنویز تشخیص داده شده و همهٔ کلمات غیرمنطبق آن ناحیه `uncertain` می‌شوند).
 */
export function alignTranscriptToVerse(
  referenceWords: readonly string[],
  transcriptWords: readonly string[],
  optsOrConfidences?: AlignOptions | readonly number[],
  calibrationArg?: Map<string, number>,
): VerseAlignmentResult {
  const opts: AlignOptions = Array.isArray(optsOrConfidences)
    ? { tokenConfidences: optsOrConfidences, calibration: calibrationArg }
    : ((optsOrConfidences as AlignOptions | undefined) ?? { calibration: calibrationArg });

  const tokenConfidences = opts.tokenConfidences;
  const calibration = opts.calibration ?? calibrationArg;
  const matchSim = Math.min(0.99, Math.max(0.5, opts.judge?.matchSim ?? MATCH_SIM));
  const effCalibration = opts.bypassCalibration ? undefined : calibration;

  const m = referenceWords.length;
  if (m === 0) {
    return { words: [], coverage: 1, confirmedErrors: 0, extraWords: transcriptWords.filter(Boolean).length };
  }

  const refNorm = referenceWords.map((w) => normalizeForAlign(w));

  const spokenList: { raw: string; norm: string; conf?: number }[] = [];
  for (let idx = 0; idx < transcriptWords.length; idx++) {
    const raw = String(transcriptWords[idx] ?? "").trim();
    if (!raw) continue;
    // اگر یک عنصر شامل چند کلمهٔ فاصله‌دار بود، توکن‌ها را باز می‌کنیم
    const subRaw = raw.split(/\s+/).filter(Boolean);
    const conf = tokenConfidences?.[idx];
    for (const sr of subRaw) {
      const norm = normalizeForAlign(sr);
      if (norm) {
        spokenList.push({ raw: sr, norm, conf });
      }
    }
  }

  const n = spokenList.length;
  if (n === 0) {
    return {
      words: referenceWords.map((ref) => ({ ref, state: "uncertain" as const })),
      coverage: 0,
      confirmedErrors: 0,
      extraWords: 0,
    };
  }

  // جدول شباهت همهٔ جفت‌ها
  const simMatrix: number[][] = Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (__, j) => wordSimilarity(refNorm[i], spokenList[j].norm)),
  );

  // جدول DP: کمینه هزینهٔ هم‌ترازی پیشوند i از مرجع با پیشوند j از شنیده‌شده
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const DEL_COST = 1.0;

  for (let i = 1; i <= m; i++) {
    dp[i][0] = i * DEL_COST;
  }

  const insertionCostAt = (i: number, j: number): number => {
    const tokNorm = spokenList[j - 1].norm;
    const prevSpokenSame =
      j >= 2 && wordSimilarity(tokNorm, spokenList[j - 2].norm) >= matchSim;
    const prevRefSame =
      i >= 1 && wordSimilarity(tokNorm, refNorm[i - 1]) >= matchSim;
    return prevSpokenSame || prevRefSame ? 0.35 : 0.85;
  };

  for (let j = 1; j <= n; j++) {
    dp[0][j] = dp[0][j - 1] + insertionCostAt(0, j);
  }

  const pairCostForSim = (sim: number): number => {
    const dist = 1 - sim;
    if (sim >= matchSim) {
      return dist * 0.5; // 0 .. 0.1
    }
    return 0.75 + dist * 0.6; // 0.87 .. 1.35 (کمتر از DEL + INS = 1.85 برای جایگزینی تک‌کلمه)
  };

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const pCost = pairCostForSim(simMatrix[i - 1][j - 1]);
      const insCost = insertionCostAt(i, j);
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + pCost,
        dp[i - 1][j] + DEL_COST,
        dp[i][j - 1] + insCost,
      );
    }
  }

  // بازگشت از (m, n) برای استخراج نگاشت کلمات مرجع و شمار کلمات اضافه
  const pairedTransIdx = new Array<number>(m).fill(-1);
  let extraWords = 0;
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = simMatrix[i - 1][j - 1];
      const pCost = pairCostForSim(sim);
      const insCost = insertionCostAt(i, j);
      // اگر توکن فعلی تکرار/لکنت است و بدون مصرف کلمهٔ مرجع هم هزینه کمینه است، اولویت با insertion (تکرار) است
      const canInsert = Math.abs(dp[i][j] - (dp[i][j - 1] + insCost)) < 1e-6;
      const canPair = Math.abs(dp[i][j] - (dp[i - 1][j - 1] + pCost)) < 1e-6;

      if (canPair && !(canInsert && sim < matchSim)) {
        pairedTransIdx[i - 1] = j - 1;
        i--;
        j--;
        continue;
      }
      if (canInsert) {
        extraWords++;
        j--;
        continue;
      }
    }
    if (i > 0 && Math.abs(dp[i][j] - (dp[i - 1][j] + DEL_COST)) < 1e-6) {
      pairedTransIdx[i - 1] = -1;
      i--;
    } else if (j > 0) {
      extraWords++;
      j--;
    } else {
      i--;
    }
  }

  // بررسی اولیه شباهت هر جایگاه مرجع
  const pairSims = pairedTransIdx.map((tIdx, rIdx) =>
    tIdx >= 0 ? simMatrix[rIdx][tIdx] : -1,
  );
  const isAnchorMatch = (rIdx: number): boolean =>
    rIdx >= 0 && rIdx < m && pairSims[rIdx] >= matchSim;
  const isSevereFailure = (rIdx: number): boolean =>
    rIdx >= 0 && rIdx < m && (pairedTransIdx[rIdx] === -1 || pairSims[rIdx] < SUBSTITUTED_MAX_SIM);

  const words: WordAlignment[] = [];
  let matchedCount = 0;
  let confirmedErrors = 0;

  for (let rIdx = 0; rIdx < m; rIdx++) {
    const ref = referenceWords[rIdx];
    const tIdx = pairedTransIdx[rIdx];
    if (tIdx < 0) {
      words.push({ ref, state: "uncertain", reason: "not_heard" });
      continue;
    }

    const spoken = spokenList[tIdx];
    const sim = pairSims[rIdx];

    if (sim >= matchSim) {
      words.push({ ref, state: "matched", heard: spoken.raw, sim, reason: "matched" });
      matchedCount++;
      continue;
    }

    // بازهٔ خاکستری [0.5, 0.8) همیشه uncertain است
    if (sim >= SUBSTITUTED_MAX_SIM) {
      words.push({ ref, state: "uncertain", heard: spoken.raw, sim, reason: "gray_zone" });
      continue;
    }

    // بررسی ۵ شرط substituted
    const lowConfidence =
      spoken.conf !== undefined && Number.isFinite(spoken.conf) && spoken.conf < MIN_CONFIDENCE_FOR_SUBSTITUTION;
    const calibratedImmune =
      (effCalibration?.get(refNorm[rIdx]) ?? 0) >= CALIBRATION_IMMUNITY_THRESHOLD;
    const matchesNeighborRef =
      (rIdx > 0 && wordSimilarity(refNorm[rIdx - 1], spoken.norm) >= SUBSTITUTED_MAX_SIM) ||
      (rIdx + 1 < m && wordSimilarity(refNorm[rIdx + 1], spoken.norm) >= SUBSTITUTED_MAX_SIM);

    // پایداری ناحیه اطراف rIdx
    const hasPrev = rIdx > 0;
    const hasNext = rIdx + 1 < m;
    const prevAnchored = hasPrev && isAnchorMatch(rIdx - 1);
    const nextAnchored = hasNext && isAnchorMatch(rIdx + 1);
    const neighborSevere =
      (hasPrev && isSevereFailure(rIdx - 1)) || (hasNext && isSevereFailure(rIdx + 1));

    const regionStable =
      m === 1
        ? true
        : (prevAnchored || nextAnchored) && !neighborSevere;

    if (!lowConfidence && !calibratedImmune && !matchesNeighborRef && regionStable) {
      words.push({ ref, state: "substituted", heard: spoken.raw, sim, reason: "substituted_clear" });
      confirmedErrors++;
    } else {
      const blockReason = lowConfidence
        ? "low_confidence"
        : calibratedImmune
        ? "calibration_immune"
        : matchesNeighborRef
        ? "neighbor_match"
        : "noisy_region";
      words.push({ ref, state: "uncertain", heard: spoken.raw, sim, reason: blockReason });
    }
  }

  return {
    words,
    coverage: matchedCount / m,
    confirmedErrors,
    extraWords,
  };
}


export type RecitationAttemptOutcome = "no_speech" | "not_this_text" | "judged";

export interface RecitationJudgeResult extends VerseAlignmentResult {
  outcome: RecitationAttemptOutcome;
  missedCount: number;
  /** سهم کلمات شنیده‌شده (matched یا تأییدشده با لمس) از کل کلمات مرجع */
  heardRatio: number;
  /** پارامترهای مؤثر داور در این تلاش */
  params: JudgeParams;
}

export function resolveJudgeParams(profile?: JudgeProfileName, overrides?: Partial<JudgeParams>): JudgeParams {
  const base = JUDGE_PROFILES[profile ?? DEFAULT_JUDGE_PROFILE] ?? JUDGE_PROFILES[DEFAULT_JUDGE_PROFILE];
  return { ...base, ...(overrides ?? {}) };
}

/**
 * داور تلاوت (نسخهٔ ۱٫۵): سه خروجی سطحِ تلاش پیش از داوری کلمه‌ای + سقف جزیرهٔ نامشخص.
 *
 * ۱) اگر هیچ توکنی شنیده نشده باشد، خروجی «no_speech» است (سکوت یا صدای نامفهوم) و هیچ کلمه‌ای
 *    ارزیابی نمی‌شود؛ پیش‌تر در این حالت همهٔ کلمات «uncertain» می‌شدند و سکوت هم خطا نمی‌خورد.
 * ۲) اگر پوشش سراسری (سهم matched) از دروازهٔ پوشش کمتر باشد، کل تلاش «not_this_text» است:
 *    تلاوت نامربوط، زبان دیگر یا آیهٔ دیگر نباید کلمه‌به‌کلمه «نامشخص» شود؛ همهٔ کلمات missed می‌شوند.
 * ۳) در داوری عادی، «نامشخص» فقط جزیره‌های کوتاهِ محصور بین دو لنگر (کلمهٔ matched) مجاز است؛
 *    رشتهٔ نامشخصِ بلندتر از سقف جزیره، ناحیهٔ خطاست و کلماتش missed می‌شوند (حذف یا خواندن چیز دیگر).
 *    حکم substituted همچنان فقط با شاهد مثبت (۵ شرط سخت‌گیرانهٔ alignTranscriptToVerse) صادر می‌شود.
 */
export function judgeRecitationAttempt(
  referenceWords: readonly string[],
  transcriptWords: readonly string[],
  opts?: AlignOptions & { profile?: JudgeProfileName },
): RecitationJudgeResult {
  const params = resolveJudgeParams(opts?.profile, opts?.judge);
  const tokens = transcriptWords.filter((t) => String(t ?? "").trim().length > 0);

  if (referenceWords.length === 0) {
    return {
      outcome: "judged",
      words: [],
      coverage: 1,
      confirmedErrors: 0,
      extraWords: tokens.length,
      missedCount: 0,
      heardRatio: 1,
      params,
    };
  }

  if (tokens.length === 0) {
    return {
      outcome: "no_speech",
      words: referenceWords.map((ref) => ({ ref, state: "uncertain" as const, reason: "no_speech" })),
      coverage: 0,
      confirmedErrors: 0,
      extraWords: 0,
      missedCount: 0,
      heardRatio: 0,
      params,
    };
  }

  const aligned = alignTranscriptToVerse(referenceWords, tokens, {
    tokenConfidences: opts?.tokenConfidences,
    calibration: opts?.calibration,
    bypassCalibration: opts?.bypassCalibration,
    judge: { matchSim: params.matchSim },
  });

  // دروازهٔ پوشش سراسری
  if (params.gateEnabled && aligned.coverage < params.coverageGate) {
    const words = aligned.words.map((w) => ({
      ...w,
      state: "missed" as const,
      reason: "below_coverage_gate",
    }));
    return {
      outcome: "not_this_text",
      words,
      coverage: aligned.coverage,
      confirmedErrors: aligned.confirmedErrors,
      extraWords: aligned.extraWords,
      missedCount: words.length,
      heardRatio: aligned.coverage,
      params,
    };
  }

  // سقف جزیرهٔ نامشخص: رشته‌های uncertain بلندتر از سقف → missed
  const words = aligned.words.map((w) => ({ ...w }));
  let runStart = -1;
  const flushRun = (runEndExclusive: number) => {
    if (runStart < 0) return;
    const runLen = runEndExclusive - runStart;
    if (runLen > params.islandCap) {
      for (let k = runStart; k < runEndExclusive; k++) {
        words[k] = { ...words[k], state: "missed", reason: "uncertain_run_too_long" };
      }
    }
    runStart = -1;
  };
  for (let idx = 0; idx <= words.length; idx++) {
    const isUncertain = idx < words.length && words[idx].state === "uncertain" && !words[idx].userConfirmed;
    if (isUncertain && runStart < 0) runStart = idx;
    if (!isUncertain) flushRun(idx);
  }

  const missedCount = words.filter((w) => w.state === "missed").length;
  const heard = words.filter((w) => w.state === "matched" || w.userConfirmed).length;
  return {
    outcome: "judged",
    words,
    coverage: aligned.coverage,
    confirmedErrors: aligned.confirmedErrors,
    extraWords: aligned.extraWords,
    missedCount,
    heardRatio: words.length > 0 ? heard / words.length : 1,
    params,
  };
}

/** سهم کلمات شنیده‌شده (matched یا تأییدشده با لمس) از کل — مبنای قبولی در تلاوت کور و آزمون */
export function computeHeardRatio(
  words: readonly { state: WordAlignState; userConfirmed?: boolean }[],
): number {
  if (words.length === 0) return 1;
  const heard = words.filter((w) => w.state === "matched" || w.userConfirmed).length;
  return heard / words.length;
}

/**
 * قبولی تلاوت کور/آزمون: فقط وقتی همهٔ کلمات شنیده شده باشند (یا با لمس تأیید شده باشند).
 * «نامشخص» در این حالت‌ها قبول نیست (جریمه هم نیست؛ یعنی تلاش باید دوباره انجام شود).
 */
export function isBlindRecitationPassed(
  words: readonly { state: WordAlignState; userConfirmed?: boolean }[],
): boolean {
  return words.length > 0 && computeHeardRatio(words) === 1;
}

/**
 * ۱-۲) برش‌بندی آیه بر اساس نشانه‌های وقف عثمانی (ۚ ۖ ۗ ۘ ۙ ۛ ۜ) و پایان آیه؛
 * در نبود نشانه، هر ۵ کلمه؛ هر برش بین ۳ تا ۶ کلمه (برش‌های کوتاه‌تر از ۳ با همسایه ادغام می‌شوند).
 */
export function segmentVerse(words: readonly { text: string }[]): { start: number; end: number }[] {
  const n = words.length;
  if (n === 0) return [];
  if (n < 3) return [{ start: 0, end: n - 1 }];

  // گام ۱: برش اولیه روی کلمات دارای نشانهٔ وقف و انتهای آیه
  const rawCuts: { start: number; end: number }[] = [];
  let segStart = 0;
  for (let i = 0; i < n; i++) {
    const hasWaqf = WAQF_MARK_RE.test(String(words[i]?.text ?? ""));
    if (hasWaqf || i === n - 1) {
      rawCuts.push({ start: segStart, end: i });
      segStart = i + 1;
    }
  }

  // گام ۲: ادغام برش‌های کوتاه‌تر از ۳ کلمه با همسایه
  const merged = rawCuts.map((c) => ({ ...c }));
  let idx = 0;
  while (idx < merged.length && merged.length > 1) {
    const len = merged[idx].end - merged[idx].start + 1;
    if (len < 3) {
      if (idx === 0) {
        merged[1].start = merged[0].start;
        merged.splice(0, 1);
      } else if (idx === merged.length - 1) {
        merged[idx - 1].end = merged[idx].end;
        merged.splice(idx, 1);
        idx--;
      } else {
        const prevLen = merged[idx - 1].end - merged[idx - 1].start + 1;
        const nextLen = merged[idx + 1].end - merged[idx + 1].start + 1;
        if (prevLen <= nextLen) {
          merged[idx - 1].end = merged[idx].end;
          merged.splice(idx, 1);
          idx--;
        } else {
          merged[idx + 1].start = merged[idx].start;
          merged.splice(idx, 1);
        }
      }
    } else {
      idx++;
    }
  }

  // گام ۳: شکستن برش‌های بلندتر از ۶ کلمه به تکه‌های ۵کلمه‌ای (با تراز انتهایی در بازهٔ ۳ تا ۶)
  const finalSegments: { start: number; end: number }[] = [];
  for (const seg of merged) {
    let cur = seg.start;
    const end = seg.end;
    while (end - cur + 1 > 6) {
      const rem = end - cur + 1;
      // اگر برداشتن ۵ کلمه باعث شود تکهٔ پایانی کمتر از ۳ کلمه بماند (مثلاً rem === 7)، ۴ + ۳ برش می‌زنیم
      const step = rem === 7 ? 4 : 5;
      finalSegments.push({ start: cur, end: cur + step - 1 });
      cur += step;
    }
    if (cur <= end) {
      finalSegments.push({ start: cur, end });
    }
  }

  return finalSegments;
}

/** تبدیل دادهٔ کالیبراسیون ذخیره در meta به Map برای alignTranscriptToVerse */
export function calibrationToMap(data: RecitationCalibrationData | null | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!data?.confirmed) return map;
  for (const [k, v] of Object.entries(data.confirmed)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      map.set(k, v);
    }
  }
  return map;
}

/**
 * افزایش شمار تأیید کاربر («درست خواندم») برای یک کلمهٔ مرجع با رعایت سقف ۵۰۰ مدخل
 * (در صورت عبور از ۵۰۰ مدخل، کم‌شمارترین مدخل‌ها حذف می‌شوند).
 */
export function incrementCalibrationWord(
  data: RecitationCalibrationData | null | undefined,
  word: string,
  maxEntries: number = MAX_CALIBRATION_ENTRIES,
): RecitationCalibrationData {
  const norm = normalizeForAlign(word);
  const current: Record<string, number> = { ...(data?.confirmed ?? {}) };
  if (!norm) return { confirmed: current };

  current[norm] = (current[norm] ?? 0) + 1;
  const entries = Object.entries(current);
  if (entries.length > maxEntries) {
    // مرتب‌سازی صعودی بر اساس شمار؛ کلمهٔ تازه تأییدشده در اولویت حفظ است
    entries.sort((a, b) => {
      if (a[0] === norm) return 1;
      if (b[0] === norm) return -1;
      return a[1] - b[1];
    });
    const toRemove = entries.length - maxEntries;
    for (let i = 0; i < toRemove; i++) {
      delete current[entries[i][0]];
    }
  }

  return { confirmed: current };
}

/**
 * محاسبهٔ درصد دقت برای شاخص دقت لفظی (بخش ۳):
 * فرمول: (matched + userConfirmed) / totalEvaluated
 * کلمات uncertain در مخرج کسر دقت حساب نمی‌شوند (نه درست، نه غلط) و هیچ جریمه‌ای ایجاد نمی‌کنند.
 */
export function computePrecisionAccuracy(
  words: readonly { state: WordAlignState; userConfirmed?: boolean }[],
): number {
  let correct = 0;
  let substitutedUnconfirmed = 0;
  for (const w of words) {
    if (w.state === "matched" || w.userConfirmed) {
      correct++;
    } else if (w.state === "substituted" || w.state === "missed") {
      substitutedUnconfirmed++;
    }
  }
  const denom = correct + substitutedUnconfirmed;
  if (denom === 0) return 100;
  return Math.round((correct / denom) * 100);
}

/**
 * ساخت متن هم‌تراز و اطمینان‌دار برای تغذیهٔ وریفایر فعلی (`verifyVerseRecitation`):
 * کلمات matched، userConfirmed و uncertain عین کلمهٔ مرجع فرستاده می‌شوند تا فقط
 * substitutedهای تأییدنشده به‌عنوان خطا در وریفایر ثبت شوند.
 */
export function buildVerifierTranscriptFromAlignment(
  words: readonly WordAlignment[],
): string {
  return words
    .map((w) => {
      if (w.state === "matched" || w.userConfirmed || w.state === "uncertain") {
        return w.ref;
      }
      if (w.state === "missed") return "خطا";
      return w.heard && normalizeForAlign(w.heard) !== normalizeForAlign(w.ref)
        ? w.heard
        : "خطا";
    })
    .join(" ");
}
