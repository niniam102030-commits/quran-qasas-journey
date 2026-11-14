// src/store/useLearningStore.ts
// موتور جلسه‌ی یادگیری: صف سوال → تصحیح → ثبت FSRS برای هر هدف → تلاش/اشتباه → صف مجدد → تسلط/گشایش.
import { create } from "zustand";
import { ldb, type QuestionRow } from "../db/learningDb";
import { gradeQuestion } from "../services/grading";
import { newCard, review, ratingFor, reviewDebt, type StoredCard } from "../learning/cardScheduler";
import { planStage, requeue, type PlannerQuestion, type SessionType } from "../learning/sessionPlanner";
import { stagePassed, canUnlockNext, type StageAttempt } from "../learning/mastery";
import type { Question, GradeResult } from "../types/learning";

export interface SubmitMeta {
  usedHint?: boolean;
  changedAnswer?: boolean;
  responseMs: number;
}

export interface SessionSummary {
  total: number;
  correct: number;
  ratio: number;
  passed: boolean;
  unlockedNext: boolean;
  debt: number;
}

interface LearningState {
  status: "idle" | "loading" | "running" | "finished";
  sessionType: SessionType;
  unitId: string | null;
  stage: number;
  queue: QuestionRow[];
  index: number;
  wrongCounts: Record<string, number>;
  firstAttempts: StageAttempt[]; // فقط اولین تلاش هر سوال (برای پاس‌شدن مرحله)
  seen: Set<string>;
  lastResult: GradeResult | null;
  summary: SessionSummary | null;
  startStage: (unitId: string, stage: number, size?: number) => Promise<void>;
  startReview: (size?: number) => Promise<void>;
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

export const useLearningStore = create<LearningState>((set, get) => ({
  status: "idle",
  sessionType: "STAGE",
  unitId: null,
  stage: 1,
  queue: [],
  index: 0,
  wrongCounts: {},
  firstAttempts: [],
  seen: new Set(),
  lastResult: null,
  summary: null,

  current: () => get().queue[get().index] ?? null,

  startStage: async (unitId, stage, size = 20) => {
    set({ status: "loading", summary: null, lastResult: null });
    const stageQs = await ldb.questions.where("[unitId+stage]").equals([unitId, stage]).toArray();
    // مرور درهم: سوال‌های مرحله ۸ و ۷ واحدهای قبلی
    const prog = await ldb.unitProgress.toArray();
    const done = new Set(prog.filter((p) => p.stagePassed[8]).map((p) => p.unitId));
    const reviewQs = (await ldb.questions.where("stage").anyOf(7, 8).toArray()).filter((q) => done.has(q.unitId) && q.unitId !== unitId);
    const allTargets = [...stageQs, ...reviewQs].flatMap((q) => q.targets);
    const cards = await loadCards(allTargets);
    const recent = new Set((await ldb.attempts.where("unitId").equals(unitId).reverse().limit(30).toArray()).map((a) => a.qid));
    const plan = planStage(stageQs.map(asPlanner), reviewQs.map(asPlanner), cards, { size, seed: Date.now() & 0xffff, recentIds: recent });
    const byId = new Map([...stageQs, ...reviewQs].map((q) => [q.id, q]));
    set({
      status: plan.length ? "running" : "finished",
      sessionType: "STAGE",
      unitId,
      stage,
      queue: plan.map((p) => byId.get(p.id)!).filter(Boolean),
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      seen: new Set(),
    });
  },

  startReview: async (size = 20) => {
    set({ status: "loading", summary: null, lastResult: null });
    const now = new Date();
    const cards = await ldb.cards.toArray();
    const dueKeys = cards.filter((c) => c.state !== 0 && new Date(c.due) <= now).sort((a, b) => a.due.localeCompare(b.due)).map((c) => c.key);
    const picked = new Map<string, QuestionRow>();
    for (const k of dueKeys) {
      if (picked.size >= size) break;
      const qs = await ldb.questions.where("targets").equals(k).toArray();
      // سوال تک‌هدفه و در سطح پایدار کارت را ترجیح بده
      const cand = qs.filter((q) => q.stage >= 5 || q.targets.length === 1).sort((a, b) => a.targets.length - b.targets.length);
      const q = cand[Math.floor(Math.random() * Math.min(3, cand.length))];
      if (q) picked.set(q.id, q);
    }
    const queue = [...picked.values()];
    set({ status: queue.length ? "running" : "finished", sessionType: "REVIEW", unitId: null, stage: 0, queue, index: 0, wrongCounts: {}, firstAttempts: [], seen: new Set(),
      summary: queue.length ? null : { total: 0, correct: 0, ratio: 1, passed: true, unlockedNext: false, debt: 0 } });
  },

  submit: async (response, meta) => {
    const s = get();
    const q = s.queue[s.index];
    if (!q) return null;
    const res = gradeQuestion(q as unknown as Question, response);
    const now = new Date();
    const keys = Object.keys(res.perTarget);
    const cards = await loadCards(keys);

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

    const updated: StoredCard[] = keys.map((k) => {
      const c = cards.get(k) ?? newCard(k, now);
      const rating = ratingFor({ correct: res.perTarget[k], usedHint: !!meta.usedHint, changedAnswer: meta.changedAnswer, responseMs: meta.responseMs, medianMs: median });
      return review(c, rating, now);
    });
    await ldb.transaction("rw", ldb.cards, ldb.attempts, ldb.confusions, async () => {
      await ldb.cards.bulkPut(updated);
      await ldb.attempts.add({
        qid: q.id, unitId: q.unitId, stage: q.stage, at: now.getTime(), correct: res.correct, usedHint: !!meta.usedHint,
        responseMs: meta.responseMs, chosen: response, perTarget: res.perTarget, sessionType: s.sessionType,
      });
      if (!res.correct) {
        const tags = (q.distractorTags ?? {}) as Record<string, string>;
        const wrongTag = res.wrongOptionIds[0] ? tags[res.wrongOptionIds[0]] : undefined;
        await ldb.confusions.bulkAdd(keys.map((t) => ({ qid: q.id, target: t, chosenTag: wrongTag, at: now.getTime() })));
      }
    });

    const firstTime = !s.seen.has(q.id);
    const seen = new Set(s.seen).add(q.id);
    const wrongCounts = { ...s.wrongCounts };
    let queue = s.queue;
    // در مرحله ۸ سوال غلط به صف بازنمی‌گردد
    if (!res.correct && s.stage !== 8) {
      wrongCounts[q.id] = (wrongCounts[q.id] ?? 0) + 1;
      queue = requeue(s.queue, s.index, q, wrongCounts[q.id]);
    }
    set({
      lastResult: res, seen, wrongCounts, queue,
      firstAttempts: firstTime && (s.sessionType === "REVIEW" || q.stage === s.stage) ? [...s.firstAttempts, { stage: q.stage, correct: res.correct, usedHint: !!meta.usedHint }] : s.firstAttempts,
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
    // پایان جلسه
    const attempts = s.firstAttempts;
    const correct = attempts.filter((a) => a.correct).length;
    const passed = s.sessionType === "REVIEW" ? correct / Math.max(1, attempts.length) >= 0.8 : stagePassed(attempts, s.stage);
    let unlockedNext = false;
    const allCards = await ldb.cards.toArray();
    const debt = reviewDebt(allCards);
    if (s.unitId) {
      const p = await ldb.unitProgress.get(s.unitId);
      if (p) {
        if (passed) p.stagePassed[s.stage] = true;
        p.currentStage = passed ? Math.min(8, s.stage + 1) : s.stage;
        p.updatedAt = Date.now();
        await ldb.unitProgress.put(p);
        if (passed && s.stage === 8 && canUnlockNext(true, debt)) {
          const units = await ldb.unitProgress.toArray();
          const order = units.map((u) => u.unitId).sort();
          const nextId = order[order.indexOf(s.unitId) + 1];
          const nxt = nextId ? await ldb.unitProgress.get(nextId) : undefined;
          if (nxt && !nxt.unlocked) {
            await ldb.unitProgress.put({ ...nxt, unlocked: true, updatedAt: Date.now() });
            unlockedNext = true;
          }
        }
      }
    }
    set({
      status: "finished",
      lastResult: null,
      summary: { total: attempts.length, correct, ratio: attempts.length ? correct / attempts.length : 0, passed, unlockedNext, debt },
    });
  },
}));
