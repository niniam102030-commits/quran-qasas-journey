// src/learning/fsrsTuning.ts
// بهینه‌سازی شخصی FSRS-6 (لایه ۱: تنظیم خودکار retention؛ لایه ۲: برازش وزن‌های ۲۱تایی با فرود مختصاتی و اعتبارسنجی holdout)
// ماژول کاملاً خالص بدون وابستگی به Dexie یا DOM.
import { kindOfKey, hasRealFsrsHistory, ratingFor, type CardKind, type RatingKind, type StoredCard } from "./cardScheduler";

export const DEFAULT_RETENTION: Record<CardKind, number> = {
  w: 0.9,
  vt: 0.9,
  vr: 0.93,
  vn: 0.93,
  sq: 0.93,
  pg: 0.93,
};

/** وزن‌های پیش‌فرض FSRS-6 مطابق با ts-fsrs v6 */
export const DEFAULT_FSRS6_WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956,
  6.4133, 0.8334, 3.0194, 0.001,
  1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014,
  1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
];

export const MIN_RETENTION_SAMPLES = 50;
export const MAX_RETENTION_STEP = 0.03;
export const RETENTION_MIN = 0.85;
export const RETENTION_MAX = 0.97;
export const RETENTION_WINDOW_DAYS = 30;

export const MIN_FIT_REVIEWS = 400;
export const MAX_FIT_ITERATIONS = 200;
export const HOLDOUT_RATIO = 0.2;

/** کران‌های معتبر پارامترهای FSRS-6 در ts-fsrs */
export const FSRS6_BOUNDS: readonly [number, number][] = [
  [0.001, 100], // w0: S0(Again)
  [0.001, 100], // w1: S0(Hard)
  [0.001, 100], // w2: S0(Good)
  [0.001, 100], // w3: S0(Easy)
  [1, 10],      // w4: D0(Easy) base
  [0.001, 4],   // w5: D0 spread
  [0.001, 4],   // w6: D update rate
  [0.001, 0.75],// w7: mean reversion
  [0, 4.5],     // w8: recall stability exp base
  [0, 0.8],     // w9: stability saturation exponent
  [0.001, 3.5], // w10: retrievability gain
  [0.001, 5],   // w11: forget stability scale
  [0.001, 0.25],// w12: forget difficulty power
  [0.001, 0.9], // w13: forget stability power
  [0, 4],       // w14: forget retrievability gain
  [0, 1],       // w15: hard penalty
  [1, 6],       // w16: easy bonus
  [0, 2],       // w17: short-term slope
  [0, 2],       // w18: short-term shift
  [0.01, 0.8],  // w19: short-term decay
  [0.1, 0.8],   // w20: forgetting curve decay
];

export interface RetentionAttemptInput {
  at: number;
  sessionType: string;
  perTarget: Record<string, boolean>;
}

export interface RetentionTuningResult {
  retention: Record<CardKind, number>;
  counts: Record<CardKind, { total: number; correct: number; observed: number | null; changed: boolean }>;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function round4(v: number): number {
  return Number(v.toFixed(4));
}

function tryKindOfKey(key: string): CardKind | null {
  try {
    return kindOfKey(key);
  } catch {
    return null;
  }
}

/**
 * لایه ۱: تنظیم خودکار retention برای هر CardKind بر اساس نرخ یادآوری واقعی ۳۰ روز اخیر
 * در مرورهای REVIEW/REMEDIAL روی کارت‌های دارای سابقه واقعی FSRS.
 */
export function computeTunedRetention(input: {
  attempts: RetentionAttemptInput[];
  cards: StoredCard[];
  currentRetention?: Partial<Record<CardKind, number>>;
  now?: Date;
}): RetentionTuningResult {
  const nowMs = (input.now ?? new Date()).getTime();
  const cutoffMs = nowMs - RETENTION_WINDOW_DAYS * 86400_000;

  const cardByKey = new Map<string, StoredCard>();
  for (const c of input.cards) {
    cardByKey.set(c.key, c);
  }

  const kinds: CardKind[] = ["w", "vt", "vr", "vn", "sq", "pg"];
  const stats = new Map<CardKind, { total: number; correct: number }>();
  for (const k of kinds) stats.set(k, { total: 0, correct: 0 });

  for (const attempt of input.attempts) {
    if (attempt.sessionType !== "REVIEW" && attempt.sessionType !== "REMEDIAL") continue;
    if (!Number.isFinite(attempt.at) || attempt.at < cutoffMs || attempt.at > nowMs + 60_000) continue;

    for (const [targetKey, ok] of Object.entries(attempt.perTarget ?? {})) {
      const card = cardByKey.get(targetKey);
      if (!hasRealFsrsHistory(card)) continue;
      const kind = tryKindOfKey(targetKey);
      if (!kind) continue;
      const bucket = stats.get(kind)!;
      bucket.total += 1;
      if (ok) bucket.correct += 1;
    }
  }

  const retention = { ...DEFAULT_RETENTION };
  const counts = {} as RetentionTuningResult["counts"];

  for (const k of kinds) {
    const base = clamp(input.currentRetention?.[k] ?? DEFAULT_RETENTION[k], RETENTION_MIN, RETENTION_MAX);
    const { total, correct } = stats.get(k)!;
    if (total < MIN_RETENTION_SAMPLES) {
      retention[k] = round4(base);
      counts[k] = {
        total,
        correct,
        observed: total > 0 ? round4(correct / total) : null,
        changed: false,
      };
      continue;
    }
    const observed = correct / total;
    const step = clamp(observed - base, -MAX_RETENTION_STEP, MAX_RETENTION_STEP);
    const next = round4(clamp(base + step, RETENTION_MIN, RETENTION_MAX));
    retention[k] = next;
    counts[k] = {
      total,
      correct,
      observed: round4(observed),
      changed: Math.abs(next - base) > 1e-6,
    };
  }

  return { retention, counts };
}

export type NumericRating = 1 | 2 | 3 | 4;

export interface FsrsReviewLogItem {
  cardKey: string;
  at: number;
  rating: NumericRating | RatingKind;
  elapsedDays?: number;
}

export interface NormalizedReviewItem {
  cardKey: string;
  at: number;
  rating: NumericRating;
  elapsedDays?: number;
}

const RATING_TO_NUM: Record<RatingKind, NumericRating> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

export function normalizeRating(r: NumericRating | RatingKind): NumericRating {
  if (typeof r === "number") {
    if (r <= 1) return 1;
    if (r === 2) return 2;
    if (r === 3) return 3;
    return 4;
  }
  return RATING_TO_NUM[r] ?? 3;
}

/**
 * تبدیل تلاش‌های ذخیره شده در IndexedDB به لاگ زمانی مرور برای لایه ۲
 */
export function buildReviewLogFromAttempts(
  attempts: {
    at: number;
    sessionType: string;
    usedHint?: boolean;
    responseMs?: number;
    perTarget: Record<string, boolean>;
  }[],
): FsrsReviewLogItem[] {
  const out: FsrsReviewLogItem[] = [];
  const sorted = attempts
    .filter((a) => a.sessionType === "STAGE" || a.sessionType === "REVIEW" || a.sessionType === "REMEDIAL" || a.sessionType.startsWith("CYCLE:"))
    .slice()
    .sort((a, b) => a.at - b.at);

  for (const a of sorted) {
    for (const [cardKey, ok] of Object.entries(a.perTarget ?? {})) {
      if (!tryKindOfKey(cardKey)) continue;
      const rating = ratingFor({
        correct: Boolean(ok),
        usedHint: Boolean(a.usedHint),
        responseMs: Number.isFinite(a.responseMs) ? Number(a.responseMs) : 5000,
      });
      out.push({ cardKey, at: a.at, rating });
    }
  }
  return out;
}

// ============================================================
// معادلات مدل بازیابی‌پذیری FSRS-6 (مطابق فرمول‌های منتشرشده و ts-fsrs v6)
// ============================================================

export function fsrs6ForgettingCurve(elapsedDays: number, stability: number, decayWeight: number): number {
  const s = Math.max(0.001, stability);
  const t = Math.max(0, elapsedDays);
  if (t === 0) return 1;
  const decay = -decayWeight;
  const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
  return Math.pow(1 + (factor * t) / s, decay);
}

function initStability(w: readonly number[], grade: NumericRating): number {
  return clamp(w[grade - 1], 0.001, 36500);
}

function initDifficulty(w: readonly number[], grade: NumericRating): number {
  return clamp(w[4] - Math.exp((grade - 1) * w[5]) + 1, 1, 10);
}

function nextDifficulty(w: readonly number[], d: number, grade: NumericRating): number {
  const deltaD = -w[6] * (grade - 3);
  const damped = deltaD * ((10 - d) / 9);
  const nextD = d + damped;
  const dEasy = w[4] - Math.exp(3 * w[5]) + 1;
  const reverted = w[7] * dEasy + (1 - w[7]) * nextD;
  return clamp(reverted, 1, 10);
}

function nextShortTermStability(w: readonly number[], s: number, grade: NumericRating): number {
  const sinc = Math.pow(Math.max(0.001, s), -w[19]) * Math.exp(w[17] * (grade - 3 + w[18]));
  const masked = grade >= 2 ? Math.max(sinc, 1) : sinc;
  return clamp(s * masked, 0.001, 36500);
}

function nextRecallStability(w: readonly number[], d: number, s: number, r: number, grade: NumericRating): number {
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  const nextS =
    s *
    (1 +
      Math.exp(w[8]) *
        (11 - d) *
        Math.pow(Math.max(0.001, s), -w[9]) *
        (Math.exp((1 - r) * w[10]) - 1) *
        hardPenalty *
        easyBonus);
  return clamp(nextS, 0.001, 36500);
}

function nextForgetStability(w: readonly number[], d: number, s: number, r: number): number {
  const afterFail =
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(Math.max(0.001, s) + 1, w[13]) - 1) *
    Math.exp((1 - r) * w[14]);
  const sMin = s / Math.exp(w[17] * w[18]);
  return clamp(sMin, 0.001, clamp(afterFail, 0.001, 36500));
}

/**
 * شبیه‌سازی پیش‌رونده و محاسبه میانگین زیان لگاریتمی روی بازهٔ [evalFrom .. evalTo)
 */
export function evaluateFsrs6LogLoss(
  sortedLog: NormalizedReviewItem[],
  weights: readonly number[],
  evalFrom = 0,
  evalTo = sortedLog.length,
): { loss: number; count: number } {
  const states = new Map<string, { d: number; s: number; lastAt: number }>();
  let totalLoss = 0;
  let count = 0;

  const limit = Math.min(sortedLog.length, evalTo);
  for (let idx = 0; idx < limit; idx++) {
    const item = sortedLog[idx];
    const prev = states.get(item.cardKey);

    if (!prev) {
      states.set(item.cardKey, {
        d: initDifficulty(weights, item.rating),
        s: initStability(weights, item.rating),
        lastAt: item.at,
      });
      continue;
    }

    const deltaT =
      item.elapsedDays !== undefined && Number.isFinite(item.elapsedDays)
        ? Math.max(0, item.elapsedDays)
        : Math.max(0, (item.at - prev.lastAt) / 86400_000);

    const r = fsrs6ForgettingCurve(deltaT, prev.s, weights[20]);

    if (idx >= evalFrom && deltaT > 0) {
      const p = clamp(r, 1e-6, 1 - 1e-6);
      const y = item.rating === 1 ? 0 : 1;
      totalLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      count += 1;
    }

    const nextS =
      deltaT === 0
        ? nextShortTermStability(weights, prev.s, item.rating)
        : item.rating === 1
        ? nextForgetStability(weights, prev.d, prev.s, r)
        : nextRecallStability(weights, prev.d, prev.s, r, item.rating);

    states.set(item.cardKey, {
      d: nextDifficulty(weights, prev.d, item.rating),
      s: nextS,
      lastAt: item.at,
    });
  }

  return {
    loss: count > 0 ? totalLoss / count : Number.POSITIVE_INFINITY,
    count,
  };
}

export function clipWeightsToFsrs6Bounds(weights: readonly number[]): number[] {
  return FSRS6_BOUNDS.map(([min, max], idx) => {
    const v = weights[idx] ?? DEFAULT_FSRS6_WEIGHTS[idx];
    return Number(clamp(v, min, max).toFixed(6));
  });
}

export function isValidFsrs6Weights(weights: unknown): weights is number[] {
  if (!Array.isArray(weights) || weights.length !== 21) return false;
  return weights.every((v, idx) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
    const [min, max] = FSRS6_BOUNDS[idx];
    return v >= min && v <= max;
  });
}

export interface FitWeightsResult {
  improved: boolean;
  weights: number[] | null;
  defaultLoss: number;
  fittedLoss: number;
  sampleCount: number;
  holdoutCount: number;
  iterations: number;
}

/**
 * لایه ۲: برازش ۲۱ وزن FSRS-6 با فرود مختصاتی محدود (حداکثر ۲۰۰ تکرار، گام کاهشی)
 * فقط وقتی وزن تازه را برمی‌گرداند که لاگ‌لاس روی ۲۰٪ انتهایی (holdout) از وزن‌های پیش‌فرض کمتر باشد.
 */
export function fitWeights(
  reviewLog: FsrsReviewLogItem[],
  opts?: { maxIterations?: number },
): FitWeightsResult {
  const sampleCount = reviewLog.length;
  if (sampleCount < MIN_FIT_REVIEWS) {
    return {
      improved: false,
      weights: null,
      defaultLoss: Number.NaN,
      fittedLoss: Number.NaN,
      sampleCount,
      holdoutCount: 0,
      iterations: 0,
    };
  }

  const sorted: NormalizedReviewItem[] = reviewLog
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((item) => ({
      cardKey: item.cardKey,
      at: item.at,
      rating: normalizeRating(item.rating),
      elapsedDays: item.elapsedDays,
    }));

  const splitIdx = Math.floor(sorted.length * (1 - HOLDOUT_RATIO));
  const defaultEval = evaluateFsrs6LogLoss(sorted, DEFAULT_FSRS6_WEIGHTS, splitIdx, sorted.length);
  const trainBase = evaluateFsrs6LogLoss(sorted, DEFAULT_FSRS6_WEIGHTS, 0, splitIdx);

  if (!Number.isFinite(defaultEval.loss) || defaultEval.count === 0 || trainBase.count === 0) {
    return {
      improved: false,
      weights: null,
      defaultLoss: defaultEval.loss,
      fittedLoss: defaultEval.loss,
      sampleCount,
      holdoutCount: defaultEval.count,
      iterations: 0,
    };
  }

  const maxIterations = Math.min(MAX_FIT_ITERATIONS, Math.max(1, opts?.maxIterations ?? MAX_FIT_ITERATIONS));
  const w = [...DEFAULT_FSRS6_WEIGHTS];
  let bestTrainLoss = trainBase.loss;

  // اولویت پارامترهای اثرگذار بر شیب فراموشی و رشد/افت پایداری در فرود مختصاتی
  const coordOrder = [8, 10, 20, 9, 4, 5, 6, 11, 14, 15, 16, 0, 1, 2, 3, 7, 12, 13, 17, 18, 19];
  const initialSteps = FSRS6_BOUNDS.map(([min, max], idx) => {
    const span = max - min;
    const base = Math.max(Math.abs(DEFAULT_FSRS6_WEIGHTS[idx]), 0.1);
    return Math.min(span * 0.25, base * 0.35);
  });

  let iterationsUsed = 0;
  let stepScale = 1.0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterationsUsed = iter + 1;
    const paramIdx = coordOrder[iter % coordOrder.length];
    const [minB, maxB] = FSRS6_BOUNDS[paramIdx];
    const delta = initialSteps[paramIdx] * stepScale;
    const orig = w[paramIdx];

    let improvedIter = false;
    for (const dir of [1, -1]) {
      const cand = clamp(orig + dir * delta, minB, maxB);
      if (Math.abs(cand - orig) < 1e-7) continue;
      w[paramIdx] = cand;
      const ev = evaluateFsrs6LogLoss(sorted, w, 0, splitIdx);
      if (ev.loss < bestTrainLoss - 1e-7) {
        bestTrainLoss = ev.loss;
        improvedIter = true;
        break;
      }
      w[paramIdx] = orig;
    }

    if ((iter + 1) % coordOrder.length === 0) {
      stepScale *= improvedIter ? 0.92 : 0.72;
      if (stepScale < 0.005) break;
    }
  }

  const clipped = clipWeightsToFsrs6Bounds(w);
  const fittedEval = evaluateFsrs6LogLoss(sorted, clipped, splitIdx, sorted.length);

  if (Number.isFinite(fittedEval.loss) && fittedEval.loss < defaultEval.loss - 1e-6 && isValidFsrs6Weights(clipped)) {
    return {
      improved: true,
      weights: clipped,
      defaultLoss: defaultEval.loss,
      fittedLoss: fittedEval.loss,
      sampleCount,
      holdoutCount: defaultEval.count,
      iterations: iterationsUsed,
    };
  }

  return {
    improved: false,
    weights: null,
    defaultLoss: defaultEval.loss,
    fittedLoss: fittedEval.loss,
    sampleCount,
    holdoutCount: defaultEval.count,
    iterations: iterationsUsed,
  };
}

export function shouldRunDailyTuning(lastTunedIso: string | null, todayIso: string): boolean {
  return lastTunedIso !== todayIso;
}

export function isPersonalizedFsrs(
  retention: Partial<Record<CardKind, number>> | null | undefined,
  weights: unknown,
): boolean {
  const hasWeights = isValidFsrs6Weights(weights);
  if (hasWeights) return true;
  if (!retention) return false;
  return (Object.keys(DEFAULT_RETENTION) as CardKind[]).some((k) => {
    const v = retention[k];
    return typeof v === "number" && Number.isFinite(v) && Math.abs(v - DEFAULT_RETENTION[k]) > 1e-5;
  });
}
