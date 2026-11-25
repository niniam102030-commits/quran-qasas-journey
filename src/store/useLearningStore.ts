// src/store/useLearningStore.ts
// موتور جلسه‌ی یادگیری: صف سوال → تصحیح → ثبت FSRS برای هر هدف → تلاش/اشتباه → صف مجدد → تسلط/گشایش.
import { create } from "zustand";
import { ldb, verseKey, type QuestionRow } from "../db/learningDb";
import { getActiveSurahNumber } from "../config/surahConfig";
import { gradeQuestion } from "../services/grading";
import { hasRealFsrsHistory, newCard, seedKnownCard, review, ratingFor, reviewDebt, isDueForDailyReview, dailyReviewDebt, type StoredCard } from "../learning/cardScheduler";
import { planStage, requeue, shuffle, rng, adaptRemainingQueue, type PlannerQuestion, type SessionType } from "../learning/sessionPlanner";
import { questionAllowedByGoals, targetAllowedByGoals } from "../learning/tracks";
import {
  buildTestOutPlan,
  testOutResult,
  collectUnitTargets,
  planUnitSeeding,
  type TestOutEvaluation,
  type TestOutQuestion,
} from "../learning/testOut";
import { filterPrescreenedStage1Questions } from "../learning/vocabPrescreen";
import { faClozeServable, type FaClozeQuestion } from "../learning/faCloze";
import {
  buildReverseVocabQuestions,
  mergeReverseIntoStage2Queue,
  MAX_REVERSE_PER_LESSON,
} from "../learning/reverseVocab";
import { dailyReviewCapFor } from "../learning/pace";
import { buildBlindSpotPack, getLocalSaturdayWeekIso, type BlindSpotPack } from "../learning/blindSpots";
import { planMuraja } from "../learning/muraja";
import { buildConnectionDrillQueue, dailyDrillSeed } from "../learning/connectionDrills";
import {
  appendExamLog,
  assembleExamQueue,
  CHAPTER_BOSS_GEMS,
  CHAPTER_BOSS_PASS_SCORE,
  classifyExamQuestion,
  examConfusionTagFor,
  scoreExam,
  type ExamErrorType,
  type ExamLogEntry,
  type ExamScope,
  type ExamScoreResult,
} from "../learning/examEngine";
import { loadQulMorphology } from "../services/qulReferenceService";
import { getMeta, setMeta } from "../services/metaStore";
import { usePreferencesStore } from "./usePreferencesStore";
import {
  stagePassed,
  canUnlockNext,
  passRatioForStage,
  isFlawlessLesson,
  LESSONS_PER_STAGE,
  LESSON_SIZE,
  MAX_REQUEUE_PER_QUESTION,
  type StageAttempt,
} from "../learning/mastery";
import { recordLearningReward } from "../services/profileService";
import type { Question, GradeResult, MatchQuestion, BaseVerse, UnitPlan } from "../types/learning";
import type { ReciteItemResult, RecitePurpose } from "../learning/recitationItems";
import {
  applyVoiceReviewResults,
  buildExamItems,
  buildHuntItems,
  buildStageReciteItems,
  buildVoiceReviewItems,
  buildWitnessItems,
  recitationAvailable,
  recordReciteFadeOutcome,
  type ReciteSessionItem,
} from "../services/recitationSessionService";

/** بلوک آیتم‌های تلاوتِ پیوستِ یک جلسه (ساخته‌شده از آیات همان واحد؛ سؤال بانکی نیست) */
export interface ReciteSessionState {
  items: ReciteSessionItem[];
  idx: number;
  results: ReciteItemResult[];
  purpose: RecitePurpose;
  active: boolean;
  done: boolean;
}

export interface SubmitMeta {
  usedHint?: boolean;
  changedAnswer?: boolean;
  responseMs: number;
  /** تعداد تلاش‌های غلط در سؤال تطبیقِ فوری (مورد ۸): اگر > ۰ باشد سؤال غلط محسوب می‌شود */
  matchMistakes?: number;
  /** جفت‌های غلط تلاش‌شده با قالب `leftId>rightId` برای نمایش در کشوی بازخورد */
  matchWrongPairs?: string[];
}

export interface SessionSummary {
  total: number;
  correct: number;
  ratio: number;
  passed: boolean;
  unlockedNext: boolean;
  debt: number;
  xpEarned?: number;
  gemsEarned?: number;
  lessonNumber?: number;
  lessonsRequired?: number;
  stageCompleted?: boolean;
  requiredRatio?: number;
  passMinAttempts?: number;
  waivedLesson?: boolean;
  testOut?: TestOutEvaluation;
  maxCombo?: number;
  /** نتیجهٔ بلوک تلاوت پیوست جلسه */
  recitePassedCount?: number;
  reciteTotal?: number;
  /** گیت تلاوت نابینا قبول نشد و مرحله به همین دلیل پاس نشد */
  reciteGateFailed?: boolean;
}

export type CycleKind = "SABQ" | "SABQI" | "MANZIL";

export interface ExamAnswerRecord {
  qid: string;
  promptFa: string;
  stemAr?: string;
  errorType: ExamErrorType;
  correct: boolean;
  chosen: unknown;
  expectedLabel?: string;
  explanationFa?: string;
}

export interface ExamRuntimeState {
  scope: ExamScope;
  startedAt: number;
  shortfallNotes: string[];
  answers: ExamAnswerRecord[];
  result: ExamScoreResult | null;
  logEntry: ExamLogEntry | null;
  bossAwarded: boolean;
  bossGemsAwarded: number;
}

interface LearningState {
  status: "idle" | "loading" | "running" | "finished";
  sessionType: SessionType;
  unitId: string | null;
  stage: number;
  remedialTag: string | null;
  cycleKind: CycleKind | null;
  combo: number;
  maxCombo: number;
  queue: QuestionRow[];
  index: number;
  wrongCounts: Record<string, number>;
  firstAttempts: StageAttempt[]; // فقط اولین تلاش هر سوال (برای پاس‌شدن مرحله)
  firstTargetOutcomes: Record<string, boolean>; // نتیجه اولین تلاش هر هدف (برای بذرپاشی آزمون میانبر)
  sessionAnyHint: boolean;
  sessionAnyRequeue: boolean;
  /** حداقل تلاش اول برای پاس‌شدن این جلسه‌ی مرحله؛ startStage آن را برابر
   * min(۴، طول صف واقعی) می‌گذارد تا درس ذاتاً کوتاه ناپاس نماند. */
  passMinAttempts: number;
  seen: Set<string>;
  lastResult: GradeResult | null;
  /** شناسهٔ سؤال‌های غلطِ تلاش اولِ جلسهٔ مرحله‌ای جاری (مورد ۱۰) */
  wrongQids: string[];
  /** جلسهٔ صرفاً تمرینی (دور مرور اشتباه‌ها): بدون اثر روی FSRS و confusions */
  practiceOnly: boolean;
  /** سه نتیجهٔ اخیر تلاش اول برای سختی تطبیقی داخل جلسه (مورد ۱۵) */
  recentOutcomes: boolean[];
  summary: SessionSummary | null;
  examState: ExamRuntimeState | null;
  reciteSession: ReciteSessionState | null;
  startStage: (unitId: string, stage: number, size?: number) => Promise<void>;
  startTestOut: (unitId: string) => Promise<void>;
  startReview: (size?: number) => Promise<void>;
  startRemedial: (tag?: string | null, size?: number) => Promise<void>;
  startBlindSpots: (size?: number) => Promise<void>;
  startCycleReview: (kind: CycleKind, size?: number) => Promise<void>;
  startDrill: (unitId?: string | null, size?: number) => Promise<void>;
  startMistakeReview: () => Promise<void>;
  startExam: (scope: ExamScope) => Promise<void>;
  startReciteDrill: (kind: "hunt" | "exam" | "witness") => Promise<void>;
  submitReciteResult: (result: ReciteItemResult) => Promise<void>;
  submit: (response: unknown, meta: SubmitMeta) => Promise<GradeResult | null>;
  next: () => Promise<void>;
  current: () => QuestionRow | null;
}

const asPlanner = (q: QuestionRow): PlannerQuestion => ({ id: q.id, unitId: q.unitId, stage: q.stage, difficulty: q.difficulty, type: q.type, targets: q.targets });

async function loadCards(keys: string[]): Promise<Map<string, StoredCard>> {
  const rows = await ldb.cards.bulkGet([...new Set(keys)]);
  const m = new Map<string, StoredCard>();
  rows.forEach((r) => r && m.set(r.key, r));
  return m;
}

type VerseRef = { verse?: number; stem?: { verse?: number }; [k: string]: unknown };
const verseOf = (q: VerseRef): number | undefined => {
  const n = q.verse ?? q.stem?.verse;
  return typeof n === "number" ? n : undefined;
};

/** نگاشت شماره‌ی آیه ← ترجمه‌ی پایه، فقط برای آیه‌هایی که سؤال‌ها ارجاع می‌دهند. */
async function loadBaseFaMap(qs: VerseRef[]): Promise<Map<number, string>> {
  const surah = getActiveSurahNumber();
  const nums = [...new Set(qs.map(verseOf).filter((n): n is number => typeof n === "number" && n > 0))];
  const rows = await Promise.all(nums.map((n) => ldb.baseVerses.get(verseKey(surah, n))));
  const m = new Map<number, string>();
  rows.forEach((r, i) => {
    const fa = (r as { fa?: string } | undefined)?.fa;
    if (fa) m.set(nums[i], fa);
  });
  return m;
}

/** حذف CLOZE_FAهایی که هیچ قالب جای‌خالی‌ای برایشان ساخته نمی‌شود؛ سرو
 * آن‌ها کاربر را با دکمه‌های لختِ بدون متن ترجمه روبه‌رو می‌کند. */
function dropUnservableClozeFa<T extends VerseRef & { type: string }>(qs: T[], baseFa: Map<number, string>): T[] {
  return qs.filter((q) => {
    if (q.type !== "CLOZE_FA") return true;
    const v = verseOf(q);
    return faClozeServable(q as unknown as FaClozeQuestion, (v !== undefined && baseFa.get(v)) || null);
  });
}

export const useLearningStore = create<LearningState>((set, get) => ({
  status: "idle",
  sessionType: "STAGE",
  unitId: null,
  stage: 1,
  remedialTag: null,
  cycleKind: null,
  combo: 0,
  maxCombo: 0,
  queue: [],
  index: 0,
  wrongCounts: {},
  firstAttempts: [],
  firstTargetOutcomes: {},
  sessionAnyHint: false,
  sessionAnyRequeue: false,
  passMinAttempts: 4,
  seen: new Set(),
  lastResult: null,
  summary: null,
  examState: null,
  reciteSession: null,
  wrongQids: [],
  practiceOnly: false,
  recentOutcomes: [],

  current: () => get().queue[get().index] ?? null,

  startStage: async (unitId, stage, size = LESSON_SIZE) => {
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const goals = usePreferencesStore.getState().goals;
    const rawStageQs = await ldb.questions.where("[unitId+stage]").equals([unitId, stage]).toArray();
    let stageQs = rawStageQs.filter((q) => questionAllowedByGoals(q.type, goals));
    // مرور درهم: سوال‌های مرحله ۸ و ۷ واحدهای قبلی
    const prog = await ldb.unitProgress.toArray();
    const done = new Set(prog.filter((p) => p.stagePassed[8]).map((p) => p.unitId));
    let reviewQs = (await ldb.questions.where("stage").anyOf(7, 8).toArray()).filter(
      (q) => done.has(q.unitId) && q.unitId !== unitId && questionAllowedByGoals(q.type, goals),
    );
    // CLOZE_FAهای بدون قالبِ قابل‌ساخت در هیچ درسی سرو نمی‌شوند
    const baseFa = await loadBaseFaMap([...stageQs, ...reviewQs]);
    stageQs = dropUnservableClozeFa(stageQs, baseFa);
    reviewQs = dropUnservableClozeFa(reviewQs, baseFa);
    const allTargets = [...stageQs, ...reviewQs].flatMap((q) => q.targets);
    const cards = await loadCards(allTargets);
    const effectiveStageQs = stage === 1 ? filterPrescreenedStage1Questions(stageQs, cards) : stageQs;
    const recent = new Set((await ldb.attempts.where("unitId").equals(unitId).reverse().limit(30).toArray()).map((a) => a.qid));
    const plan = planStage(effectiveStageQs.map(asPlanner), reviewQs.map(asPlanner), cards, { size, seed: Date.now() & 0xffff, recentIds: recent });
    if (!stageQs.length) {
      if (rawStageQs.length > 0) {
        const p = await ldb.unitProgress.get(unitId);
        if (p && !p.stagePassed[stage]) {
          p.stagePassed = { ...p.stagePassed, [stage]: true };
          p.stageLessons = { ...p.stageLessons, [stage]: LESSONS_PER_STAGE };
          if (p.currentStage === stage && stage < 8) p.currentStage = stage + 1;
          p.updatedAt = Date.now();
          await ldb.unitProgress.put(p);
        }
      }
      set({ status: "finished", sessionType: "STAGE", unitId, stage, cycleKind: null, combo: 0, maxCombo: 0, queue: [], index: 0, wrongCounts: {}, firstAttempts: [], firstTargetOutcomes: {}, sessionAnyHint: false, sessionAnyRequeue: false, seen: new Set(), wrongQids: [], practiceOnly: false, recentOutcomes: [], summary: { total: 0, correct: 0, ratio: 0, passed: false, unlockedNext: false, debt: 0, maxCombo: 0 } });
      return;
    }
    const byId = new Map([...stageQs, ...reviewQs].map((q) => [q.id, q]));
    let finalQueue = plan.map((p) => byId.get(p.id)!).filter(Boolean);

    // درس نباید از حداقلِ لازم برای پاس‌شدن (۴ سؤال) کوتاه‌تر شود: اگر
    // فیلترها (پیش‌غربال واژگان/تازگی) صف را لاغر کرده‌اند، اول بدون
    // ترجیحِ تازگی و بعد بدون فیلتر پیش‌غربال دوباره برنامه‌ریزی کن.
    if (finalQueue.length < 4 && stageQs.length >= 4) {
      const replan = (pool: QuestionRow[], recentIds: Set<string>) =>
        planStage(pool.map(asPlanner), reviewQs.map(asPlanner), cards, { size, seed: Date.now() & 0xffff, recentIds })
          .map((p) => byId.get(p.id)!)
          .filter(Boolean);
      let retry = replan(effectiveStageQs, new Set());
      if (retry.length < 4) retry = replan(stageQs, new Set());
      if (retry.length > finalQueue.length) finalQueue = retry;
    }

    // L6: افزودن حداکثر ۳ فلش‌کارت معکوس معنا (فارسی ← عربی) فقط در مرحلهٔ ۲ (در حافظه، بدون ذخیره در questions)
    if (stage === 2) {
      const unitLex = await ldb.lexicon.where("unitId").equals(unitId).toArray();
      if (unitLex.length >= 4) {
        const verseNums = [
          ...new Set(
            unitLex.map((l) => {
              const m = /^w\d+_(\d+)_/.exec(l.wordId);
              return m ? Number(m[1]) : 0;
            }).filter((n) => n > 0),
          ),
        ];
        const surah = getActiveSurahNumber();
        const baseRows = await Promise.all(verseNums.map((n) => ldb.baseVerses.get(verseKey(surah, n))));
        const wordArById = new Map<string, string>();
        for (const bv of baseRows) {
          if (!bv) continue;
          const ws = (bv.words as { id: string; ar: string }[] | undefined) ?? [];
          for (const w of ws) wordArById.set(w.id, w.ar);
        }
        const lexInputs = unitLex.map((l) => ({
          wordId: l.wordId,
          unitId: l.unitId,
          ar: wordArById.get(l.wordId) || String(l.ar ?? ""),
          meaningFa: String(l.meaningFa ?? l.gloss ?? ""),
          rootAr: typeof l.rootAr === "string" ? l.rootAr : undefined,
        }));
        const revQs = buildReverseVocabQuestions(
          lexInputs,
          unitId,
          MAX_REVERSE_PER_LESSON,
          Date.now() & 0xffff,
        );
        finalQueue = mergeReverseIntoStage2Queue(finalQueue, revQs, size);
      }
    }

    set({
      status: finalQueue.length ? "running" : "finished",
      sessionType: "STAGE",
      unitId,
      stage,
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue: finalQueue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      firstTargetOutcomes: {},
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      passMinAttempts: Math.min(4, Math.max(1, finalQueue.length)),
      seen: new Set(),
      wrongQids: [],
      practiceOnly: false,
      recentOutcomes: [],
      reciteSession: null,
    });

    // بلوک تلاوت پیوست درس: از آیات همین واحد، با قالبِ مخصوص این مرحله.
    // اگر موتور آفلاین آماده نباشد یا حالت «بدون صدا» فعال باشد، هیچ آیتمی
    // ساخته نمی‌شود و درس دقیقاً مثل قبل با معادل‌های لمسی پیش می‌رود.
    if (finalQueue.length > 0) {
      try {
        if (await recitationAvailable()) {
          const items = await buildStageReciteItems(unitId, stage);
          if (items.length > 0) {
            set({
              reciteSession: {
                items,
                idx: 0,
                results: [],
                purpose: stage >= 7 ? "gate" : "stage",
                active: false,
                done: false,
              },
            });
          }
        }
      } catch {
        // خرابی مسیر تلاوت نباید جلسهٔ اصلی را متوقف کند
      }
    }
  },

  startTestOut: async (unitId) => {
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const goals = usePreferencesStore.getState().goals;
    const rawUnitQs = await ldb.questions.where("unitId").equals(unitId).toArray();
    const goalFilteredQs = rawUnitQs.filter((q) => questionAllowedByGoals(q.type, goals));
    const unitQs = dropUnservableClozeFa(goalFilteredQs, await loadBaseFaMap(goalFilteredQs));
    const weekAgo = Date.now() - 7 * 86400_000;
    const recentAttempts = await ldb.attempts.where("unitId").equals(unitId).toArray();
    const recentIds = new Set(recentAttempts.filter((a) => a.at >= weekAgo).map((a) => a.qid));

    const testQs: TestOutQuestion[] = unitQs.map((q) => ({
      ...asPlanner(q),
      shape: q.shape,
    }));
    const plan = buildTestOutPlan(testQs, Date.now() & 0xffff, recentIds);
    const byId = new Map(unitQs.map((q) => [q.id, q]));
    const queue = plan.map((p) => byId.get(p.id)!).filter(Boolean);

    set({
      status: queue.length ? "running" : "finished",
      sessionType: "TESTOUT",
      unitId,
      stage: -2,
      remedialTag: null,
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      firstTargetOutcomes: {},
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      summary: queue.length ? null : { total: 0, correct: 0, ratio: 0, passed: false, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  startReview: async (size) => {
    const reviewLimit = size ?? dailyReviewCapFor(usePreferencesStore.getState().paceMode);
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const now = new Date();
    const cards = await ldb.cards.toArray();
    const goals = usePreferencesStore.getState().goals;
    const dueKeys = cards.filter((c) => isDueForDailyReview(c, now) && targetAllowedByGoals(c.key, goals)).sort((a, b) => a.due.localeCompare(b.due)).map((c) => c.key);
    const picked = new Map<string, QuestionRow>();
    for (const k of dueKeys) {
      if (picked.size >= reviewLimit) break;
      const qs = await ldb.questions.where("targets").equals(k).toArray();
      const goalQs = dropUnservableClozeFa(
        qs.filter((q) => questionAllowedByGoals(q.type, goals)),
        await loadBaseFaMap(qs),
      );
      // سوال تک‌هدفه و در سطح پایدار کارت را ترجیح بده
      let cand = goalQs.filter((q) => q.stage >= 5 || q.targets.length === 1).sort((a, b) => a.targets.length - b.targets.length);
      // کارت یتیم: اگر هیچ سؤال «ترجیحی»ای ندارد (مثلاً تنها سؤالش تطبیقِ
      // چندهدفه‌ی مراحل پایین است)، از هر سؤالِ خودِ کارت استفاده کن تا
      // کارت برای همیشه از چرخه‌ی مرور بیرون نماند و بدهی صفرشدنی بماند.
      if (!cand.length) cand = [...goalQs].sort((a, b) => a.targets.length - b.targets.length || a.stage - b.stage);
      const q = cand[Math.floor(Math.random() * Math.min(3, cand.length))];
      if (q) picked.set(q.id, q);
    }
    const queue = [...picked.values()];
    // مرور صوتی: تا سقف روزانه، چند کارت «یادآوری آیه» به‌صورت تلاوت از حفظ
    // سرو می‌شوند و نمرهٔ داور مستقیم روی همان کارت‌های FSRS می‌نشیند.
    let voiceSession: ReciteSessionState | null = null;
    try {
      if (await recitationAvailable()) {
        const items = await buildVoiceReviewItems();
        if (items.length > 0) {
          voiceSession = { items, idx: 0, results: [], purpose: "review", active: true, done: false };
        }
      }
    } catch {
      // مرور لمسی بدون وقفه ادامه پیدا می‌کند
    }
    const running = queue.length > 0 || voiceSession !== null;
    set({ status: running ? "running" : "finished", sessionType: "REVIEW", unitId: null, stage: 0, remedialTag: null, cycleKind: null, combo: 0, maxCombo: 0, queue, index: 0, wrongCounts: {}, firstAttempts: [], sessionAnyHint: false, sessionAnyRequeue: false, seen: new Set(),
      reciteSession: voiceSession,
      summary: running ? null : { total: 0, correct: 0, ratio: 1, passed: true, unlockedNext: false, debt: 0, maxCombo: 0 } });
  },

  startRemedial: async (tag = null, size = 15) => {
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const allConfusions = await ldb.confusions.toArray();
    const tagSet = tag
      ? new Set(
          tag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        )
      : null;
    const filtered = tagSet && tagSet.size > 0
      ? allConfusions.filter((c) => tagSet.has(c.chosenTag || "random"))
      : allConfusions;

    // اولویت‌بندی بر اساس بیشترین تکرار اشتباه روی هر هدف و سوال
    const qidCounts = new Map<string, number>();
    const targetCounts = new Map<string, number>();
    for (const c of filtered) {
      qidCounts.set(c.qid, (qidCounts.get(c.qid) ?? 0) + 1);
      targetCounts.set(c.target, (targetCounts.get(c.target) ?? 0) + 1);
    }

    const picked = new Map<string, QuestionRow>();
    const topQids = [...qidCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    if (topQids.length) {
      const directQs = await ldb.questions.bulkGet(topQids.slice(0, size * 2));
      for (const q of directQs) {
        if (q && picked.size < size) picked.set(q.id, q);
      }
    }

    if (picked.size < size) {
      const topTargets = [...targetCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
      for (const t of topTargets) {
        if (picked.size >= size) break;
        const qs = await ldb.questions.where("targets").equals(t).toArray();
        for (const q of shuffle(qs, rng(Date.now() & 0xffff))) {
          if (!picked.has(q.id)) {
            picked.set(q.id, q);
            break;
          }
        }
      }
    }

    const queue = shuffle([...picked.values()], rng(Date.now() & 0xffff)).slice(0, size);
    set({
      status: queue.length ? "running" : "finished",
      sessionType: "REMEDIAL",
      unitId: null,
      stage: -1,
      remedialTag: tag,
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      summary: queue.length ? null : { total: 0, correct: 0, ratio: 1, passed: true, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  startBlindSpots: async (size = 15) => {
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const now = new Date();
    const weekIso = getLocalSaturdayWeekIso(now);
    let pack = await getMeta<BlindSpotPack | null>("blindSpotPack", null);
    if (!pack || pack.weekIso !== weekIso) {
      const [confusions, attempts] = await Promise.all([
        ldb.confusions.toArray(),
        ldb.attempts.toArray(),
      ]);
      pack = buildBlindSpotPack({ confusions, attempts, now, size });
      await setMeta("blindSpotPack", pack);
    }
    const rawQs = pack.questionIds.length
      ? await ldb.questions.bulkGet(pack.questionIds.slice(0, size))
      : [];
    let queue = rawQs.filter((q): q is QuestionRow => Boolean(q));
    if (queue.length === 0 && usePreferencesStore.getState().devMode) {
      const allQs = await ldb.questions.toArray();
      queue = shuffle(allQs, rng(Date.now() & 0xffff)).slice(0, size);
    }
    set({
      status: queue.length ? "running" : "finished",
      sessionType: "REMEDIAL",
      unitId: null,
      stage: -3,
      remedialTag: "blindspots",
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      summary: queue.length
        ? null
        : { total: 0, correct: 0, ratio: 1, passed: true, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  startCycleReview: async (kind, size) => {
    const reviewLimit = size ?? dailyReviewCapFor(usePreferencesStore.getState().paceMode);
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const now = new Date();
    const [progressRows, allCards] = await Promise.all([
      ldb.unitProgress.toArray(),
      ldb.cards.toArray(),
    ]);
    let manifestOrder = new Map<string, number>();
    const activeSurah = getActiveSurahNumber();
    if (activeSurah === 28) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}content/manifest.json`);
        if (res.ok) {
          const m = (await res.json()) as { units?: { id: string; order: number }[] };
          manifestOrder = new Map((m.units ?? []).map((u) => [u.id, u.order]));
        }
      } catch {
        // fallback به ترتیب الفبایی
      }
    } else {
      const packMeta = await getMeta<{ units?: { id: string; order?: number }[] } | null>(
        `surahPackMeta:${activeSurah}`,
        null,
      );
      manifestOrder = new Map((packMeta?.units ?? []).map((u, i) => [u.id, u.order ?? i + 1]));
    }
    const scopedProgress =
      manifestOrder.size > 0
        ? progressRows.filter((p) => manifestOrder.has(p.unitId))
        : progressRows;
    const plan = planMuraja(
      scopedProgress.map((p, idx) => ({
        unitId: p.unitId,
        order: manifestOrder.get(p.unitId) ?? idx + 1,
        stage8PassedAt: p.stagePassed[8] ? p.updatedAt : null,
      })),
      now,
    );
    let targetUnitIds =
      kind === "SABQ" ? plan.sabq : kind === "SABQI" ? plan.sabqi : plan.manzil;
    if (targetUnitIds.length === 0 && usePreferencesStore.getState().devMode) {
      targetUnitIds = scopedProgress.slice(0, 3).map((p) => p.unitId);
    }

    const dueSet = new Set(
      allCards.filter((c) => c.state !== 0 && new Date(c.due) <= now).map((c) => c.key),
    );
    const candidates: QuestionRow[] = [];
    for (const uid of targetUnitIds) {
      const uQs = await ldb.questions.where("unitId").equals(uid).toArray();
      for (const q of uQs) {
        if (q.stage >= 5 && q.stage <= 8) {
          candidates.push(q);
        }
      }
    }
    const dueCandidates = shuffle(
      candidates.filter((q) => q.targets.some((t) => dueSet.has(t))),
      rng(Date.now() & 0xffff),
    );
    const otherCandidates = shuffle(
      candidates.filter((q) => !q.targets.some((t) => dueSet.has(t))),
      rng((Date.now() + 17) & 0xffff),
    );
    const queue = [...dueCandidates, ...otherCandidates].slice(0, reviewLimit);

    set({
      status: queue.length ? "running" : "finished",
      sessionType: "REVIEW",
      unitId: null,
      stage: -4,
      remedialTag: null,
      cycleKind: kind,
      combo: 0,
      maxCombo: 0,
      queue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      summary: queue.length
        ? null
        : { total: 0, correct: 0, ratio: 1, passed: true, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  startDrill: async (unitId = null, size = 12) => {
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const surah = getActiveSurahNumber();
    const baseVersesRaw = await ldb.baseVerses.where("surah").equals(surah).toArray();
    const verses = baseVersesRaw as unknown as (BaseVerse & { surah?: number })[];
    let units: UnitPlan[] = [];
    if (surah === 28) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL || "/"}content/base/units-plan.json`);
        if (res.ok) units = (await res.json()) as UnitPlan[];
      } catch {
        // fallback از unitProgress
      }
    } else {
      const packMeta = await getMeta<{ units?: UnitPlan[] } | null>(`surahPackMeta:${surah}`, null);
      units = packMeta?.units ?? [];
    }

    const drillQs = buildConnectionDrillQueue({
      units,
      verses,
      scopeUnitId: unitId,
      seed: dailyDrillSeed(),
      surah,
      size,
    });
    const queue = drillQs as unknown as QuestionRow[];
    set({
      status: queue.length ? "running" : "finished",
      sessionType: "DRILL",
      unitId: unitId ?? null,
      stage: -5,
      remedialTag: null,
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      firstTargetOutcomes: {},
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      examState: null,
      summary: queue.length
        ? null
        : { total: 0, correct: 0, ratio: 1, passed: true, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  startMistakeReview: async () => {
    const ids = get().wrongQids;
    if (!ids.length) return;
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    const rows = await ldb.questions.bulkGet(ids);
    const queue = rows.filter((q): q is NonNullable<typeof q> => !!q);
    set({
      status: queue.length ? "running" : "finished",
      sessionType: "REMEDIAL",
      remedialTag: "mistake-review",
      practiceOnly: true,
      wrongQids: [],
      recentOutcomes: [],
      unitId: null,
      stage: 0,
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      firstTargetOutcomes: {},
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      lastResult: null,
      summary: queue.length
        ? null
        : { total: 0, correct: 0, ratio: 1, passed: true, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  startExam: async (scope) => {
    set({ status: "loading", summary: null, lastResult: null, examState: null, reciteSession: null });
    const surah = getActiveSurahNumber();
    const [versesRaw, allQuestions, allLexRows] = await Promise.all([
      ldb.baseVerses.where("surah").equals(surah).toArray(),
      ldb.questions.toArray(),
      ldb.lexicon.toArray(),
    ]);
    const verses = versesRaw as unknown as (BaseVerse & { surah?: number })[];
    let units: UnitPlan[] = [];
    if (surah === 28) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL || "/"}content/base/units-plan.json`);
        if (res.ok) units = (await res.json()) as UnitPlan[];
      } catch {
        // ignore
      }
    } else {
      const packMeta = await getMeta<{ units?: UnitPlan[] } | null>(`surahPackMeta:${surah}`, null);
      units = packMeta?.units ?? [];
    }
    const unitIdSet = new Set(units.map((u) => u.id));
    const examBaseFa = new Map<number, string>();
    verses.forEach((v) => {
      if (v.fa) examBaseFa.set(v.n, v.fa);
    });
    const bankQuestions = dropUnservableClozeFa(
      unitIdSet.size > 0 ? allQuestions.filter((q) => unitIdSet.has(q.unitId)) : allQuestions,
      examBaseFa,
    );
    const lexRows = unitIdSet.size > 0 ? allLexRows.filter((l) => unitIdSet.has(l.unitId)) : allLexRows;

    let morphologyMap: Record<string, { segments?: { text: string; type: string; pos: string }[] }> = {};
    if (surah === 28) {
      try {
        morphologyMap = await loadQulMorphology("qasas");
      } catch {
        // ignore
      }
    } else {
      morphologyMap =
        (await getMeta<Record<string, { segments?: { text: string; type: string; pos: string }[] }>>(
          `surahMorph:${surah}`,
          {},
        )) ?? {};
    }

    const lexiconSet = new Set(
      lexRows
        .map((l) => String(l.ar ?? l.wordId ?? "").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\s]/g, ""))
        .filter(Boolean),
    );

    const assembled = assembleExamQueue({
      scope,
      units,
      verses,
      bankQuestions,
      lexiconSet,
      morphologyMap,
      seed: Date.now() & 0xffff,
      surah,
    });

    const startedAt = Date.now();
    set({
      status: assembled.queue.length ? "running" : "finished",
      sessionType: "EXAM",
      unitId: scope.type === "unit" ? scope.id : null,
      stage: -6,
      remedialTag: null,
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue: assembled.queue,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      firstTargetOutcomes: {},
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      examState: {
        scope,
        startedAt,
        shortfallNotes: assembled.shortfallNotes,
        answers: [],
        result: null,
        logEntry: null,
        bossAwarded: false,
        bossGemsAwarded: 0,
      },
      summary: assembled.queue.length
        ? null
        : { total: 0, correct: 0, ratio: 0, passed: false, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  startReciteDrill: async (kind) => {
    set({ status: "loading", summary: null, lastResult: null, reciteSession: null });
    let items: ReciteSessionItem[] = [];
    try {
      if (await recitationAvailable()) {
        items =
          kind === "hunt"
            ? await buildHuntItems()
            : kind === "exam"
              ? await buildExamItems()
              : await buildWitnessItems();
      }
    } catch {
      items = [];
    }
    set({
      status: items.length ? "running" : "finished",
      sessionType: "DRILL",
      unitId: null,
      stage: -6,
      remedialTag: null,
      cycleKind: null,
      combo: 0,
      maxCombo: 0,
      queue: [],
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      firstTargetOutcomes: {},
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      passMinAttempts: 4,
      seen: new Set(),
      wrongQids: [],
      practiceOnly: false,
      recentOutcomes: [],
      examState: null,
      reciteSession: items.length
        ? { items, idx: 0, results: [], purpose: kind, active: true, done: false }
        : null,
      summary: items.length
        ? null
        : { total: 0, correct: 0, ratio: 0, passed: false, unlockedNext: false, debt: 0, maxCombo: 0 },
    });
  },

  submitReciteResult: async (result) => {
    const s = get();
    const rs = s.reciteSession;
    if (!rs || rs.done) return;
    void recordReciteFadeOutcome(result).catch(() => {});
    const results = [...rs.results, result];
    const nextIdx = rs.idx + 1;
    if (nextIdx < rs.items.length) {
      set({ reciteSession: { ...rs, results, idx: nextIdx } });
      return;
    }
    const finishedRs: ReciteSessionState = { ...rs, results, idx: nextIdx, active: false, done: true };
    if (rs.purpose === "review") {
      // مرور صوتی اول جلسه اجرا شده؛ نمره‌ها روی کارت‌ها می‌نشینند و بعد
      // صف لمسی مرور از سؤال اول ادامه پیدا می‌کند.
      try {
        await applyVoiceReviewResults(results);
      } catch {
        // ignore
      }
      set({ reciteSession: finishedRs });
      if (s.queue.length === 0) await get().next();
      return;
    }
    set({ reciteSession: finishedRs });
    await get().next();
  },

  submit: async (response, meta) => {
    const s = get();
    const q = s.queue[s.index];
    if (!q) return null;
    const res0 = gradeQuestion(q as unknown as Question, response);
    // تطبیق فوری: همهٔ جفت‌های نهایی درست‌اند، اما هر تلاش غلط یعنی سؤال در تلاش اول غلط بوده است
    const res: GradeResult =
      q.shape === "match" && (meta.matchMistakes ?? 0) > 0
        ? {
            correct: false,
            score: Math.max(0, 1 - (meta.matchMistakes ?? 0) / Math.max(1, (q as unknown as MatchQuestion).pairs?.length ?? 1)),
            perTarget: Object.fromEntries(Object.keys(res0.perTarget).map((k) => [k, false])) as GradeResult["perTarget"],
            wrongOptionIds: meta.matchWrongPairs ?? [],
          }
        : res0;
    const now = new Date();
    const keys = Object.keys(res.perTarget);
    // کارتِ دسته‌ای که در هدف‌ها خاموش است تمرین داده نمی‌شود (مثلاً کارت
    // شماره‌ی صفحه وقتی «شماره‌ی صفحه» تیک نخورده)؛ پس نه ساخته می‌شود و
    // نه در مرور روزانه برمی‌گردد.
    const goals = usePreferencesStore.getState().goals;
    const cardKeys = keys.filter((k) => targetAllowedByGoals(k, goals));
    const cards = await loadCards(cardKeys);

    // محاسبه میانه‌ی واقعی زمان پاسخ از روی جدول attempts (با fallback منطقی بر اساس شکل سوال)
    const defaultMedians: Record<string, number> = {
      choice: 5000,
      match: 12000,
      order: 15000,
      cloze: 10000,
    };
    const defaultMedian = defaultMedians[q.shape] ?? 5000;
    let median = defaultMedian;
    try {
      const recentAttempts = await ldb.attempts
        .where("unitId")
        .equals(q.unitId)
        .reverse()
        .limit(30)
        .toArray();
      const validTimes = recentAttempts
        .map((a) => a.responseMs)
        .filter((t) => t > 600 && t < 120000)
        .sort((a, b) => a - b);
      if (validTimes.length >= 3) {
        const mid = Math.floor(validTimes.length / 2);
        median = validTimes.length % 2 !== 0 ? validTimes[mid] : (validTimes[mid - 1] + validTimes[mid]) / 2;
      }
    } catch {
      // در صورت بروز خطا در کوئری، مقدار پیش‌فرض استفاده می‌شود
    }

    const isDrill = s.sessionType === "DRILL";
    const isExam = s.sessionType === "EXAM";
    const skipFsrsMutation = isDrill || isExam || s.practiceOnly;
    const updated: StoredCard[] = skipFsrsMutation
      ? []
      : cardKeys.map((k) => {
          const c = cards.get(k) ?? newCard(k, now);
          const rating = ratingFor({ correct: res.perTarget[k], usedHint: !!meta.usedHint, changedAnswer: meta.changedAnswer, responseMs: meta.responseMs, medianMs: median });
          return review(c, rating, now);
        });
    const recordedSessionType = s.cycleKind ? `CYCLE:${s.cycleKind}` : s.sessionType;
    const examErrorType = isExam
      ? classifyExamQuestion(q as unknown as QuestionRow & { kind?: string; distractorTags?: Record<string, string> })
      : null;

    await ldb.transaction("rw", ldb.cards, ldb.attempts, ldb.confusions, async () => {
      if (!skipFsrsMutation && updated.length > 0) {
        await ldb.cards.bulkPut(updated);
      }
      await ldb.attempts.add({
        qid: q.id, unitId: q.unitId, stage: q.stage, at: now.getTime(), correct: res.correct, usedHint: !!meta.usedHint,
        responseMs: meta.responseMs, chosen: response, perTarget: res.perTarget, sessionType: recordedSessionType,
      });
      if (!res.correct && !isDrill && !s.practiceOnly) {
        const tags = (q.distractorTags ?? {}) as Record<string, string>;
        const wrongTag = isExam && examErrorType
          ? examConfusionTagFor(examErrorType)
          : res.wrongOptionIds[0]
          ? tags[res.wrongOptionIds[0]]
          : undefined;
        await ldb.confusions.bulkAdd(keys.map((t) => ({ qid: q.id, target: t, chosenTag: wrongTag, at: now.getTime() })));
      }
    });

    const firstTime = !s.seen.has(q.id);
    const seen = new Set(s.seen).add(q.id);
    const wrongCounts = { ...s.wrongCounts };
    let queue = s.queue;
    const isCurrentStageQ = s.sessionType !== "STAGE" || q.stage === s.stage;
    const sessionAnyHint = s.sessionAnyHint || (isCurrentStageQ && !!meta.usedHint);
    let sessionAnyRequeue = s.sessionAnyRequeue;
    // در مرحله ۸، آزمون میانبر، دریل و آزمون رسمی سوال غلط به صف بازنمی‌گردد؛ در مراحل ۱ تا ۷ حداکثر ۲ بار
    if (!res.correct && s.stage !== 8 && s.sessionType !== "TESTOUT" && !isDrill && !isExam) {
      const prevWrong = wrongCounts[q.id] ?? 0;
      if (prevWrong < MAX_REQUEUE_PER_QUESTION) {
        wrongCounts[q.id] = prevWrong + 1;
        queue = requeue(s.queue, s.index, q, wrongCounts[q.id]);
        if (isCurrentStageQ) {
          sessionAnyRequeue = true;
        }
      }
    }
    const firstTargetOutcomes = { ...s.firstTargetOutcomes };
    if (firstTime && s.sessionType === "TESTOUT") {
      for (const [k, ok] of Object.entries(res.perTarget)) {
        const effOk = ok && !meta.usedHint;
        firstTargetOutcomes[k] = firstTargetOutcomes[k] === false ? false : effOk;
      }
    }
    // کمبو (G3): فقط در اولین تلاش هر سوال؛ پاسخ غلط صفر می‌کند، راهنما کمبو را نمی‌شکند ولی افزایش هم نمی‌دهد
    let combo = s.combo;
    let maxCombo = s.maxCombo;
    if (firstTime) {
      if (!res.correct) {
        combo = 0;
      } else if (!meta.usedHint) {
        combo = s.combo + 1;
        if (combo > maxCombo) maxCombo = combo;
      }
    }
    let nextExamState = s.examState;
    if (isExam && s.examState && examErrorType) {
      const rq = q as unknown as { promptFa?: string; stem?: { ar?: string }; options?: { id: string; ar?: string; fa?: string }[]; answer?: unknown; explanationFa?: string };
      const expectedOpt = Array.isArray(rq.options) ? rq.options.find((o) => o.id === rq.answer) : undefined;
      nextExamState = {
        ...s.examState,
        answers: [
          ...s.examState.answers,
          {
            qid: q.id,
            promptFa: String(rq.promptFa ?? ""),
            stemAr: rq.stem?.ar,
            errorType: examErrorType,
            correct: res.correct,
            chosen: response,
            expectedLabel: expectedOpt?.ar || expectedOpt?.fa || (typeof rq.answer === "string" ? rq.answer : ""),
            explanationFa: rq.explanationFa,
          },
        ],
      };
    }

    const wrongQids =
      s.sessionType === "STAGE"
        ? (() => {
            const base = s.index === 0 && firstTime ? [] : s.wrongQids;
            return firstTime && !res.correct && !base.includes(q.id) ? [...base, q.id] : base;
          })()
        : s.wrongQids;
    const recentOutcomes = firstTime ? [...s.recentOutcomes, res.correct].slice(-3) : s.recentOutcomes;
    let finalQueue = queue;
    if (s.sessionType === "STAGE" && firstTime) {
      const head = queue.slice(0, s.index + 1);
      const tail = adaptRemainingQueue(queue.slice(s.index + 1), recentOutcomes);
      finalQueue = [...head, ...tail];
    }

    set({
      lastResult: res, seen, wrongCounts, queue: finalQueue, wrongQids, recentOutcomes, sessionAnyHint, sessionAnyRequeue, firstTargetOutcomes, combo, maxCombo, examState: nextExamState,
      firstAttempts: firstTime && (s.sessionType === "REVIEW" || s.sessionType === "REMEDIAL" || s.sessionType === "TESTOUT" || s.sessionType === "DRILL" || isExam || q.stage === s.stage) ? [...s.firstAttempts, { stage: q.stage, correct: res.correct, usedHint: !!meta.usedHint }] : s.firstAttempts,
    });
    return res;
  },

  next: async () => {
    const s = get();
    const idx = s.index + 1;
    if (idx < s.queue.length) {
      set({ index: idx, lastResult: null });
      return;
    }
    // صف سؤال تمام شد ولی بلوک تلاوت پیوست هنوز اجرا نشده: اول بلوک فعال
    // می‌شود و پایان جلسه به بعد از آخرین آیتم تلاوت می‌افتد.
    const rs = s.reciteSession;
    if (rs && !rs.done && !rs.active && rs.items.length > 0) {
      set({ reciteSession: { ...rs, active: true }, lastResult: null });
      return;
    }
    // پایان جلسه
    const attempts = s.firstAttempts;
    const correct = attempts.filter((a) => a.correct).length;

    // مسیر ویژه پایان آزمون تخصصی (EXAM) — بدون اثر روی مراحل و FSRS، با ثبت کارنامه و باس فصل
    if (s.sessionType === "EXAM" && s.examState) {
      const scoreRes = scoreExam(s.examState.answers);
      const nowMs = Date.now();
      const entry: ExamLogEntry = {
        id: `ex_${nowMs}`,
        at: nowMs,
        scope: {
          type: s.examState.scope.type,
          id: s.examState.scope.id,
          ...(s.examState.scope.labelFa ? { label: s.examState.scope.labelFa } : {}),
        },
        total: scoreRes.total,
        score: scoreRes.score,
        level: scoreRes.level,
        byType: scoreRes.byType,
        ...(s.examState.shortfallNotes.length ? { shortfallNotes: s.examState.shortfallNotes } : {}),
      };

      const prevLog = await getMeta<ExamLogEntry[]>("examLog", []);
      await setMeta("examLog", appendExamLog(prevLog, entry));

      let bossAwarded = false;
      let bossGemsAwarded = 0;
      if (s.examState.scope.type === "chapter" && scoreRes.score >= CHAPTER_BOSS_PASS_SCORE) {
        const chapterId = s.examState.scope.id;
        const medals = await getMeta<string[]>("chapterMedals", []);
        if (!medals.includes(chapterId)) {
          await setMeta("chapterMedals", [...medals, chapterId]);
        }
        const rewardedKey = `chapterBossRewarded:${chapterId}`;
        const alreadyRewarded = await getMeta<boolean>(rewardedKey, false);
        if (!alreadyRewarded) {
          await setMeta(rewardedKey, true);
          bossAwarded = true;
          bossGemsAwarded = CHAPTER_BOSS_GEMS;
        }
      }

      if (scoreRes.xpEarned > 0 || bossGemsAwarded > 0) {
        try {
          await recordLearningReward({
            xpDelta: scoreRes.xpEarned,
            gemsDelta: bossGemsAwarded,
            markDailyActivity: true,
          });
        } catch {
          // ignore
        }
      }

      const allCards = await ldb.cards.toArray();
      const debt = reviewDebt(allCards);

      set({
        status: "finished",
        lastResult: null,
        examState: {
          ...s.examState,
          result: scoreRes,
          logEntry: entry,
          bossAwarded,
          bossGemsAwarded,
        },
        summary: {
          total: scoreRes.total,
          correct: scoreRes.correctCount,
          ratio: scoreRes.total ? scoreRes.correctCount / scoreRes.total : 0,
          passed: scoreRes.score >= CHAPTER_BOSS_PASS_SCORE,
          unlockedNext: false,
          debt,
          xpEarned: scoreRes.xpEarned,
          gemsEarned: bossGemsAwarded,
          maxCombo: s.maxCombo,
        },
      });
      return;
    }

    // مسیر ویژه پایان دریل‌های تلاوت (شکار خطا / آزمون تلاوت / همراهی آزاد):
    // نمره از خود آیتم‌های تلاوت می‌آید، نه از تلاش‌های بانکی.
    if (
      s.sessionType === "DRILL" &&
      s.reciteSession &&
      (s.reciteSession.purpose === "hunt" || s.reciteSession.purpose === "exam" || s.reciteSession.purpose === "witness")
    ) {
      const results = s.reciteSession.results;
      const total = results.length;
      const correct = results.filter((r) => r.status === "passed").length;
      const ratio = total ? correct / total : 0;
      const passed = s.reciteSession.purpose === "witness" ? total > 0 : ratio >= 0.7;
      const xpEarned = correct * 5;
      if (xpEarned > 0) {
        try {
          await recordLearningReward({ xpDelta: xpEarned, gemsDelta: 0, markDailyActivity: true });
        } catch {
          // ignore
        }
      }
      const allCards = await ldb.cards.toArray();
      const debt = reviewDebt(allCards);
      set({
        status: "finished",
        lastResult: null,
        summary: {
          total,
          correct,
          ratio,
          passed,
          unlockedNext: false,
          debt,
          xpEarned,
          gemsEarned: 0,
          maxCombo: s.maxCombo,
          recitePassedCount: correct,
          reciteTotal: total,
        },
      });
      return;
    }

    // مسیر ویژه پایان دریل اتصال و شروع از وسط (بدون تغییر FSRS و unitProgress)
    if (s.sessionType === "DRILL") {
      const allCards = await ldb.cards.toArray();
      const debt = reviewDebt(allCards);
      const ratio = attempts.length ? correct / attempts.length : 0;
      const passed = ratio >= 0.7;
      const xpEarned = correct * 5;
      if (xpEarned > 0) {
        try {
          await recordLearningReward({ xpDelta: xpEarned, gemsDelta: 0, markDailyActivity: true });
        } catch {
          // ignore
        }
      }
      set({
        status: "finished",
        lastResult: null,
        summary: {
          total: attempts.length,
          correct,
          ratio,
          passed,
          unlockedNext: false,
          debt,
          xpEarned,
          gemsEarned: 0,
          maxCombo: s.maxCombo,
        },
      });
      return;
    }

    // مسیر ویژه پایان آزمون میانبر (Test-Out)
    if (s.sessionType === "TESTOUT") {
      const evalRes = testOutResult(attempts);
      const passed = evalRes.passed;
      const now = new Date();

      if (passed && s.unitId) {
        const p = await ldb.unitProgress.get(s.unitId);
        if (p) {
          const allPassed: Record<number, boolean> = {};
          const allLessons: Record<number, number> = {};
          for (let st = 1; st <= 8; st++) {
            allPassed[st] = true;
            allLessons[st] = LESSONS_PER_STAGE;
          }
          p.stagePassed = allPassed;
          p.stageLessons = allLessons;
          p.currentStage = 8;
          p.updatedAt = Date.now();
          await ldb.unitProgress.put(p);
        }

        // بذرپاشی کارت‌های FSRS برای کل اهداف واحد
        const [unitQs, unitChunks, unitLex] = await Promise.all([
          ldb.questions.where("unitId").equals(s.unitId).toArray(),
          ldb.chunks.where("unitId").equals(s.unitId).toArray(),
          ldb.lexicon.where("unitId").equals(s.unitId).toArray(),
        ]);
        const verses = [...new Set(unitChunks.map((c) => c.verse))];
        const lexiconWordIds = unitLex.map((l) => l.wordId);
        const allTargets = collectUnitTargets({
          unitId: s.unitId,
          questions: unitQs,
          verses,
          lexiconWordIds,
        });
        const testedMap = new Map<string, boolean>(Object.entries(s.firstTargetOutcomes));
        const seedPlan = planUnitSeeding(allTargets, testedMap, Date.now() & 0xffff);
        const existingCards = await loadCards(allTargets);
        const toSave: StoredCard[] = [];

        for (const entry of seedPlan) {
          const prev = existingCards.get(entry.key);
          // قاعدهٔ حفاظت: کارت موجود با سابقهٔ واقعی FSRS (از جمله کارت‌هایی که در همین آزمون با submit() مرور شده‌اند) هرگز با بذر بازنویسی نمی‌شود
          if (hasRealFsrsHistory(prev)) continue;
          toSave.push(
            seedKnownCard(entry.key, {
              now,
              intervalDays: entry.intervalDays,
              stability: entry.stability,
            }),
          );
        }
        // برای اهداف مستقیمِ غلط که هنوز کارتی ندارند، کارت تازه معمولی بساز
        for (const [key, ok] of testedMap.entries()) {
          if (!ok && !existingCards.has(key)) {
            toSave.push(newCard(key, now));
          }
        }
        if (toSave.length > 0) {
          await ldb.cards.bulkPut(toSave);
        }
      }

      const allCards = await ldb.cards.toArray();
      const debt = reviewDebt(allCards, now);
      const comboBonusXp = Math.min(25, Math.floor(s.maxCombo / 5) * 5);
      const xpEarned = attempts.length > 0 ? correct * 10 + (passed ? 20 : 0) + comboBonusXp : 0;
      const gemsEarned = passed ? 15 : 0;
      if (attempts.length > 0) {
        try {
          await recordLearningReward({
            xpDelta: xpEarned,
            gemsDelta: gemsEarned,
            markDailyActivity: true,
          });
        } catch {
          // عدم مسدودسازی پایان جلسه در صورت خطای ذخیره پروفایل
        }
      }

      set({
        status: "finished",
        lastResult: null,
        summary: {
          total: attempts.length,
          correct,
          ratio: evalRes.ratio,
          passed,
          unlockedNext: false,
          debt,
          xpEarned,
          gemsEarned,
          stageCompleted: passed,
          requiredRatio: 0.9,
          testOut: evalRes,
          maxCombo: s.maxCombo,
        },
      });
      return;
    }

    let passed =
      s.sessionType === "REVIEW" || s.sessionType === "REMEDIAL"
        ? correct / Math.max(1, attempts.length) >= 0.8
        : stagePassed(attempts, s.stage, s.sessionType === "STAGE" ? (s.passMinAttempts ?? 4) : 4);
    // گیت تلاوت نابینا (مراحل ۷ و ۸): حتی با نسبت بانکی کافی، بدون قبولی
    // تلاوتِ از حفظِ بدون خطای قطعی و با دقت ≥۹۰٪ مرحله پاس نمی‌شود.
    let reciteGateFailed = false;
    if (s.sessionType === "STAGE" && s.reciteSession?.purpose === "gate") {
      const gateOk =
        s.reciteSession.results.length > 0 &&
        s.reciteSession.results.every((r) => r.status === "passed");
      if (!gateOk) {
        passed = false;
        reciteGateFailed = true;
      }
    }
    let unlockedNext = false;
    let lessonNumber: number | undefined;
    let lessonsRequired: number | undefined;
    let stageCompleted = false;
    let waivedLesson = false;
    const requiredRatio = s.sessionType === "STAGE" ? passRatioForStage(s.stage) : 0.8;
    const allCards = await ldb.cards.toArray();
    const debt = dailyReviewDebt(allCards);
    if (s.unitId) {
      const p = await ldb.unitProgress.get(s.unitId);
      if (p) {
        lessonsRequired = LESSONS_PER_STAGE;
        const stageLessons = { ...(p.stageLessons ?? {}) };
        const prevDone = p.stagePassed[s.stage] ? LESSONS_PER_STAGE : (stageLessons[s.stage] ?? 0);
        const stageAttempts = attempts.filter((a) => a.stage === s.stage);
        const flawless =
          s.sessionType === "STAGE" &&
          s.stage !== 8 &&
          passed &&
          isFlawlessLesson(stageAttempts, { anyHint: s.sessionAnyHint, anyRequeue: s.sessionAnyRequeue });
        const nextDone = passed
          ? flawless
            ? LESSONS_PER_STAGE
            : Math.min(LESSONS_PER_STAGE, prevDone + 1)
          : prevDone;
        waivedLesson = flawless && prevDone < LESSONS_PER_STAGE - 1;
        lessonNumber = nextDone;
        stageLessons[s.stage] = nextDone;
        p.stageLessons = stageLessons;
        stageCompleted = passed && nextDone >= LESSONS_PER_STAGE;
        if (stageCompleted) {
          p.stagePassed[s.stage] = true;
          p.currentStage = Math.max(p.currentStage, Math.min(8, s.stage + 1));
        }
        p.updatedAt = Date.now();
        await ldb.unitProgress.put(p);
        if (stageCompleted && s.stage === 8 && canUnlockNext(true, debt)) {
          let orderedIds: string[] = [];
          const activeSurah = getActiveSurahNumber();
          if (activeSurah === 28) {
            try {
              const manifestUrl = typeof window !== "undefined"
                ? `${import.meta.env.BASE_URL || "/"}content/manifest.json`
                : "http://localhost/content/manifest.json";
              const manifestResponse = await fetch(manifestUrl);
              if (manifestResponse.ok) {
                const manifest = await manifestResponse.json() as { units: { id: string; order: number }[] };
                orderedIds = manifest.units.slice().sort((a, b) => a.order - b.order).map((u) => u.id);
              }
            } catch {
              // fallback
            }
          } else {
            const packMeta = await getMeta<{ units?: { id: string; order?: number }[] } | null>(
              `surahPackMeta:${activeSurah}`,
              null,
            );
            orderedIds = (packMeta?.units ?? [])
              .slice()
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((u) => u.id);
          }
          if (!orderedIds.length) {
            const units = await ldb.unitProgress.toArray();
            orderedIds = units.map((u) => u.unitId).sort();
          }
          const nextId = orderedIds[orderedIds.indexOf(s.unitId) + 1];
          const nxt = nextId ? await ldb.unitProgress.get(nextId) : undefined;
          if (nxt && !nxt.unlocked) {
            await ldb.unitProgress.put({ ...nxt, unlocked: true, updatedAt: Date.now() });
            unlockedNext = true;
          }
        }
      }
    }

    // ثبت پاداش یکپارچه در پروفایل (چله انس + امتیاز نور + عقیق + پاداش کمبو)
    const comboBonusXp = Math.min(25, Math.floor(s.maxCombo / 5) * 5);
    const xpEarned = attempts.length > 0 ? correct * 10 + (passed ? 20 : 0) + comboBonusXp : 0;
    const gemsEarned = passed ? (stageCompleted && s.stage === 8 ? 15 : 5) : 0;
    if (attempts.length > 0) {
      try {
        await recordLearningReward({
          xpDelta: xpEarned,
          gemsDelta: gemsEarned,
          markDailyActivity: true,
        });
      } catch {
        // عدم مسدودسازی پایان جلسه در صورت خطای ذخیره پروفایل
      }
    }

    set({
      status: "finished",
      lastResult: null,
      summary: {
        total: attempts.length,
        correct,
        ratio: attempts.length ? correct / attempts.length : 0,
        passed,
        unlockedNext,
        debt,
        xpEarned,
        gemsEarned,
        lessonNumber,
        lessonsRequired,
        stageCompleted,
        requiredRatio,
        passMinAttempts: s.passMinAttempts ?? 4,
        maxCombo: s.maxCombo,
        ...(waivedLesson ? { waivedLesson: true } : {}),
        ...(s.reciteSession
          ? {
              recitePassedCount: s.reciteSession.results.filter((r) => r.status === "passed").length,
              reciteTotal: s.reciteSession.results.length,
            }
          : {}),
        ...(reciteGateFailed ? { reciteGateFailed: true } : {}),
      },
    });
  },
}));
