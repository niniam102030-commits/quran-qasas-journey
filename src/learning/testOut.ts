// src/learning/testOut.ts
// منطق خالص آزمون میانبر واحد (Test-Out) و بذرپاشی کارت‌های FSRS — بدون وابستگی به UI/DB.
import { formatSurahCardKey } from "../config/surahConfig";
import { kindOfKey, stabilityForInterval, type CardKind } from "./cardScheduler";
import type { StageAttempt } from "./mastery";
import { rng, shuffle, spreadByType, type PlannerQuestion } from "./sessionPlanner";

export interface TestOutQuota {
  stage: number;
  count: number;
}

export interface TestOutQuestion extends PlannerQuestion {
  shape: "choice" | "match" | "order" | "cloze";
}

export const TESTOUT_SIZE = 28;
export const TESTOUT_MIN_QUESTIONS = 20;
export const TESTOUT_QUOTAS: TestOutQuota[] = [
  { stage: 1, count: 5 }, // واژگان سخت
  { stage: 2, count: 4 }, // ترجمه
  { stage: 3, count: 4 }, // ساخت آیه
  { stage: 4, count: 5 }, // جایخالی — اولویت difficulty >= 4
  { stage: 5, count: 4 }, // قبل و بعد
  { stage: 6, count: 3 }, // شمارهٔ آیه
  { stage: 7, count: 2 }, // یادآوری کل نیم‌صفحه
  { stage: 8, count: 1 }, // از بانک مرحلهٔ ۸ همان واحد
];

export const TESTOUT_PASS_RATIO = 0.9; // کلی
export const TESTOUT_SKILL_FLOOR = 0.7; // حداقل هر گروه مهارتی
export const TESTOUT_RECALL_FLOOR = 0.85; // حداقل گروه‌های حفظی (مراحل ۴ و ۷)
export const TESTOUT_MIN_PRODUCTION_RATIO = 0.4;

const SPECIAL_TYPES = new Set(["MUTASHABIH_SPOT", "ENDING_CHOICE"]);
const PRODUCTIVE_SHAPES = new Set(["order", "cloze"]);

const TESTED_OK_INTERVAL: Record<CardKind, number> = {
  w: 14,
  vt: 14,
  vr: 17,
  vn: 21,
  sq: 21,
  pg: 21,
};

export interface StageScore {
  correct: number;
  total: number;
  ratio: number;
}

export interface TestOutEvaluation {
  passed: boolean;
  ratio: number;
  perStage: Record<number, StageScore>;
  weakestStage: number | null;
  /** مراحلی که هیچ سؤالی از آن‌ها در آزمون نیامده است */
  missingStages: number[];
}

export interface SeedPlanEntry {
  key: string;
  intervalDays: number;
  stability: number;
}

function prioritizeCandidates(
  list: TestOutQuestion[],
  rand: () => number,
  recentIds: Set<string>,
  preferHighDiffMin?: number,
): TestOutQuestion[] {
  // درهم‌ریزی اولیه برای شکستن تساوی‌های داخل هر سطل سختی
  const shuffled = shuffle(list, rand);
  return shuffled.sort((a, b) => {
    const aRec = recentIds.has(a.id) ? 1 : 0;
    const bRec = recentIds.has(b.id) ? 1 : 0;
    if (aRec !== bRec) return aRec - bRec;

    if (preferHighDiffMin !== undefined) {
      const aMeets = a.difficulty >= preferHighDiffMin ? 0 : 1;
      const bMeets = b.difficulty >= preferHighDiffMin ? 0 : 1;
      if (aMeets !== bMeets) return aMeets - bMeets;
    }

    return b.difficulty - a.difficulty;
  });
}

/**
 * انتخاب طبقه‌ای ۲۸ سؤال برای آزمون میانبر یک واحد:
 * - به ازای هر مرحله به اندازهٔ سهمیه، با اولویت difficulty بالاتر و recentIds در اولویت آخر
 * - جبران کسری مرحله از مرحلهٔ ۴ و بعد ۳ (و در نهایت باقی مراحل)
 * - جایگزینی حداکثر ۲ سؤال با MUTASHABIH_SPOT یا ENDING_CHOICE در صورت وجود
 * - تضمین حداقل ۴۰٪ شکل تولیدی (order یا cloze)
 */
export function buildTestOutPlan(
  questions: TestOutQuestion[],
  seed = 1,
  recentIds: Set<string> = new Set(),
): TestOutQuestion[] {
  if (questions.length === 0) return [];
  const rand = rng(seed);
  const targetSize = Math.min(TESTOUT_SIZE, questions.length);

  const byStage = new Map<number, TestOutQuestion[]>();
  for (const q of questions) {
    const arr = byStage.get(q.stage) ?? [];
    arr.push(q);
    byStage.set(q.stage, arr);
  }

  const selected: TestOutQuestion[] = [];
  const pickedIds = new Set<string>();
  let deficit = 0;

  for (const quota of TESTOUT_QUOTAS) {
    const pool = prioritizeCandidates(
      byStage.get(quota.stage) ?? [],
      rand,
      recentIds,
      quota.stage === 4 ? 4 : undefined,
    );
    const take = pool.slice(0, quota.count);
    for (const q of take) {
      selected.push(q);
      pickedIds.add(q.id);
    }
    if (take.length < quota.count) {
      deficit += quota.count - take.length;
    }
  }

  // جبران کسری از مرحله ۴، سپس مرحله ۳، و در نهایت سایر مراحل
  if (deficit > 0 && selected.length < targetSize) {
    const fallbackOrder = [4, 3, 7, 5, 2, 1, 6, 8];
    for (const st of fallbackOrder) {
      if (selected.length >= targetSize) break;
      const unused = prioritizeCandidates(
        (byStage.get(st) ?? []).filter((q) => !pickedIds.has(q.id)),
        rand,
        recentIds,
      );
      for (const q of unused) {
        if (selected.length >= targetSize) break;
        selected.push(q);
        pickedIds.add(q.id);
      }
    }
  }

  // درج حداکثر ۲ سؤال MUTASHABIH_SPOT یا ENDING_CHOICE اگر در بانک واحد موجود است
  const existingSpecialCount = selected.filter((q) => SPECIAL_TYPES.has(q.type)).length;
  const neededSpecial = Math.max(0, 2 - existingSpecialCount);
  if (neededSpecial > 0) {
    const unusedSpecial = prioritizeCandidates(
      questions.filter((q) => SPECIAL_TYPES.has(q.type) && !pickedIds.has(q.id)),
      rand,
      recentIds,
    ).slice(0, neededSpecial);

    for (const sp of unusedSpecial) {
      // اول از همان مرحله یک سؤال غیرتولیدی و غیرویژه جایگزین کن؛ در غیر این صورت یک choice غیرویژه
      let replaceIdx = selected.findIndex(
        (q) => q.stage === sp.stage && !SPECIAL_TYPES.has(q.type) && !PRODUCTIVE_SHAPES.has(q.shape),
      );
      if (replaceIdx === -1) {
        replaceIdx = selected.findIndex(
          (q) => q.stage === sp.stage && !SPECIAL_TYPES.has(q.type),
        );
      }
      if (replaceIdx === -1) {
        replaceIdx = selected.findIndex(
          (q) => q.shape === "choice" && !SPECIAL_TYPES.has(q.type),
        );
      }
      if (replaceIdx !== -1) {
        pickedIds.delete(selected[replaceIdx].id);
        selected[replaceIdx] = sp;
        pickedIds.add(sp.id);
      }
    }
  }

  // تضمین حداقل ۴۰٪ شکل تولیدی (order یا cloze)
  const minProductive = Math.ceil(selected.length * TESTOUT_MIN_PRODUCTION_RATIO);
  let productiveCount = selected.filter((q) => PRODUCTIVE_SHAPES.has(q.shape)).length;
  if (productiveCount < minProductive) {
    const productiveStages = [3, 4, 7, 5, 6, 8, 2, 1];
    const unusedProductive: TestOutQuestion[] = [];
    for (const st of productiveStages) {
      const cands = prioritizeCandidates(
        (byStage.get(st) ?? []).filter(
          (q) => !pickedIds.has(q.id) && PRODUCTIVE_SHAPES.has(q.shape),
        ),
        rand,
        recentIds,
      );
      unusedProductive.push(...cands);
    }

    for (const prod of unusedProductive) {
      if (productiveCount >= minProductive) break;
      const replaceIdx = selected.findIndex(
        (q) => q.shape === "choice" && !SPECIAL_TYPES.has(q.type),
      );
      if (replaceIdx === -1) break;
      pickedIds.delete(selected[replaceIdx].id);
      selected[replaceIdx] = prod;
      pickedIds.add(prod.id);
      productiveCount++;
    }
  }

  return spreadByType(shuffle(selected, rand)) as TestOutQuestion[];
}

/**
 * ارزیابی نتیجهٔ آزمون میانبر:
 * قبولی = نسبت کلی ≥ ۰٫۹۰، هر گروه مرحلهای ≥ ۰٫۷۰، تجمیعی مراحل ۴+۷ ≥ ۰٫۸۵، بدون راهنما.
 */
export function testOutResult(
  attempts: StageAttempt[],
  requiredStages: readonly number[] = TESTOUT_QUOTAS.map((q) => q.stage),
): TestOutEvaluation {
  if (attempts.length === 0) {
    return {
      passed: false,
      ratio: 0,
      perStage: {},
      weakestStage: null,
      missingStages: [...requiredStages],
    };
  }

  const perStage: Record<number, StageScore> = {};
  let totalCorrect = 0;
  let anyHint = false;
  let recallTotal = 0;
  let recallCorrect = 0;

  for (const a of attempts) {
    if (a.usedHint) anyHint = true;
    const ok = a.correct && !a.usedHint;
    if (ok) totalCorrect++;

    const entry = perStage[a.stage] ?? { correct: 0, total: 0, ratio: 0 };
    entry.total += 1;
    if (ok) entry.correct += 1;
    perStage[a.stage] = entry;

    if (a.stage === 4 || a.stage === 7) {
      recallTotal += 1;
      if (ok) recallCorrect += 1;
    }
  }

  let weakestStage: number | null = null;
  let lowestRatio = Infinity;
  let allStagesMeetFloor = true;

  for (const [stStr, score] of Object.entries(perStage)) {
    const st = Number(stStr);
    score.ratio = score.total ? score.correct / score.total : 0;
    if (score.ratio < TESTOUT_SKILL_FLOOR) {
      allStagesMeetFloor = false;
    }
    if (score.ratio < lowestRatio || (score.ratio === lowestRatio && (weakestStage === null || st < weakestStage))) {
      lowestRatio = score.ratio;
      weakestStage = st;
    }
  }

  const missingStages = requiredStages.filter((st) => !perStage[st] || perStage[st].total === 0);
  const ratio = totalCorrect / attempts.length;
  const recallOk = recallTotal > 0 && recallCorrect / recallTotal >= TESTOUT_RECALL_FLOOR;
  const passed =
    !anyHint &&
    missingStages.length === 0 &&
    ratio >= TESTOUT_PASS_RATIO &&
    allStagesMeetFloor &&
    recallOk;

  return {
    passed,
    ratio,
    perStage,
    weakestStage,
    missingStages,
  };
}

/** جمع‌آوری همهٔ کلیدهای معتبر هدف یک واحد برای بذرپاشی FSRS */
export function collectUnitTargets(opts: {
  unitId: string;
  questions: { targets: string[] }[];
  verses: number[];
  lexiconWordIds: string[];
  surahNumber?: number;
}): string[] {
  const surah = opts.surahNumber ?? 28;
  const keys = new Set<string>();
  const tryAdd = (k: string) => {
    try {
      kindOfKey(k);
      keys.add(k);
    } catch {
      // نادیده گرفتن کلیدهای نامعتبر
    }
  };

  for (const q of opts.questions) {
    for (const t of q.targets) tryAdd(t);
  }
  for (const v of opts.verses) {
    tryAdd(formatSurahCardKey("vr", v, surah));
    tryAdd(formatSurahCardKey("vt", v, surah));
    tryAdd(formatSurahCardKey("vn", v, surah));
    tryAdd(formatSurahCardKey("sq", v, surah));
  }
  for (const wId of opts.lexiconWordIds) {
    tryAdd(formatSurahCardKey("w", wId, surah));
  }
  tryAdd(formatSurahCardKey("pg", opts.unitId, surah));

  return [...keys];
}

/**
 * برنامه‌ریزی بذرپاشی کارت‌های واحد پس از قبولی در آزمون میانبر:
 * - مستقیم آزموده‌شده و درست: فاصله بر اساس نوع کارت (14/17/21 روز) با stability سازگار با منحنی FSRS
 * - مستقیم آزموده‌شده و غلط: بذر نمی‌زند
 * - آزموده‌نشده: فاصلهٔ ۵ تا ۱۸ روز (پخش یکنواخت در ۱۴ روز آینده) با stability سازگار با FSRS
 */
export function planUnitSeeding(
  allTargets: string[],
  testedOutcomes: Map<string, boolean>,
  seed = 1,
): SeedPlanEntry[] {
  const plan: SeedPlanEntry[] = [];
  const untested: string[] = [];

  for (const key of allTargets) {
    let kind: CardKind;
    try {
      kind = kindOfKey(key);
    } catch {
      continue;
    }

    if (testedOutcomes.has(key)) {
      if (testedOutcomes.get(key) === true) {
        const intervalDays = TESTED_OK_INTERVAL[kind];
        plan.push({
          key,
          intervalDays,
          stability: stabilityForInterval(kind, intervalDays),
        });
      }
    } else {
      untested.push(key);
    }
  }

  const spreadUntested = shuffle(untested, rng(seed));
  spreadUntested.forEach((key, idx) => {
    const kind = kindOfKey(key);
    const intervalDays = 5 + (idx % 14);
    plan.push({
      key,
      intervalDays,
      stability: stabilityForInterval(kind, intervalDays),
    });
  });

  return plan;
}
