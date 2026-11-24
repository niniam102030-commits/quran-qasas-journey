// src/learning/reverseVocab.ts
// منطق خالص ساخت زمان‌اجرای فلش‌کارت معکوس معنا (فارسی ← عربی) برای مرحلهٔ ۲ (L6)
import type { QuestionRow } from "../db/learningDb";
import { rng, shuffle, type PlannerQuestion } from "./sessionPlanner";

export interface ReverseLexiconInput {
  wordId: string;
  unitId: string;
  ar: string;
  meaningFa: string;
  rootAr?: string;
}

export interface ReverseVocabQuestion extends PlannerQuestion, QuestionRow {
  promptFa: string;
  stem: { fa: string };
  options: { id: string; ar: string }[];
  answer: string;
  distractorTags: Record<string, string>;
  explanationFa: string;
}

export const MAX_REVERSE_PER_LESSON = 3;

function bareArLen(ar: string): number {
  return ar.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/g, "").length;
}

export function buildReverseVocabQuestions(
  lexicon: ReverseLexiconInput[],
  unitId: string,
  count: number,
  seed: number,
): ReverseVocabQuestion[] {
  if (count <= 0) return [];

  // فیلتر واژگان معتبر همین واحد با متن عربی متمایز
  const byAr = new Map<string, ReverseLexiconInput>();
  for (const item of lexicon) {
    if (item.unitId !== unitId) continue;
    const ar = (item.ar ?? "").trim();
    const fa = (item.meaningFa ?? "").trim();
    if (!ar || !fa) continue;
    if (!byAr.has(ar)) {
      byAr.set(ar, { ...item, ar, meaningFa: fa });
    }
  }

  const pool = [...byAr.values()];
  if (pool.length < 4) return [];

  const rand = rng(seed);
  const chosenTargets = shuffle(pool, rand).slice(0, Math.min(count, pool.length));
  const out: ReverseVocabQuestion[] = [];

  for (const target of chosenTargets) {
    const targetLen = bareArLen(target.ar);
    const targetRoot = (target.rootAr ?? "").trim();

    // اولویت گزینه‌های انحرافی: ۱) ریشه متفاوت ۲) طول نزدیک‌تر
    const distractorCands = shuffle(
      pool.filter((w) => w.wordId !== target.wordId && w.ar !== target.ar),
      rand,
    ).sort((a, b) => {
      const aSameRoot =
        targetRoot && targetRoot !== "-" && a.rootAr?.trim() === targetRoot ? 1 : 0;
      const bSameRoot =
        targetRoot && targetRoot !== "-" && b.rootAr?.trim() === targetRoot ? 1 : 0;
      if (aSameRoot !== bSameRoot) return aSameRoot - bSameRoot;
      return Math.abs(bareArLen(a.ar) - targetLen) - Math.abs(bareArLen(b.ar) - targetLen);
    });

    const distractors = distractorCands.slice(0, 3);
    if (distractors.length < 3) continue;

    const rawOpts = [
      { id: "o1", ar: target.ar },
      { id: "o2", ar: distractors[0].ar },
      { id: "o3", ar: distractors[1].ar },
      { id: "o4", ar: distractors[2].ar },
    ];
    const options = shuffle(rawOpts, rand);

    out.push({
      id: `rev:${target.wordId}`,
      unitId,
      stage: 2,
      skill: "word",
      type: "REVERSE_MEANING",
      shape: "choice",
      difficulty: 2,
      targets: [`w:${target.wordId}`],
      promptFa: "کدام واژهٔ قرآنی با معنای زیر مطابقت دارد؟",
      stem: { fa: target.meaningFa },
      options,
      answer: "o1",
      distractorTags: {
        o2: "neighbor_word",
        o3: "neighbor_word",
        o4: "neighbor_word",
      },
      explanationFa: `واژهٔ «${target.ar}» به معنای «${target.meaningFa}» است.`,
    });
  }

  return out;
}

/**
 * ادغام حداکثر ۳ سؤال معکوس در صف مرحلهٔ ۲:
 * - اگر صف کوتاه‌تر از size است، کسری را تا سقف ۳ سؤال پر می‌کند.
 * - اگر صف به اندازهٔ size پر است، حداکثر ۲ سؤال غیرمعکوس انتهایی را جایگزین می‌کند تا سقف ۳ سؤال معکوس و طول size حفظ شود.
 */
export function mergeReverseIntoStage2Queue(
  plannedQueue: QuestionRow[],
  reverseQs: ReverseVocabQuestion[],
  size: number,
): QuestionRow[] {
  if (reverseQs.length === 0) return plannedQueue;
  const existingRevCount = plannedQueue.filter((q) => q.type === "REVERSE_MEANING").length;
  const maxAdd = Math.max(0, MAX_REVERSE_PER_LESSON - existingRevCount);
  if (maxAdd === 0) return plannedQueue;

  if (plannedQueue.length < size) {
    const deficit = Math.min(size - plannedQueue.length, maxAdd, reverseQs.length);
    return [...plannedQueue, ...reverseQs.slice(0, deficit)];
  }

  // صف کامل است: جایگزینی حداکثر ۲ سؤال مرحله ۲ در انتهای صف تا سؤال‌های معکوس عملاً در درس دیده شوند
  const replaceCount = Math.min(2, maxAdd, reverseQs.length, Math.max(0, plannedQueue.length - 4));
  if (replaceCount <= 0) return plannedQueue;
  const next = plannedQueue.slice(0, plannedQueue.length - replaceCount);
  return [...next, ...reverseQs.slice(0, replaceCount)];
}
