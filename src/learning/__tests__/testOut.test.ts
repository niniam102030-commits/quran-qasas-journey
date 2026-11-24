import { describe, expect, it } from "vitest";
import { seedKnownCard, reviewDebt } from "../cardScheduler";
import {
  TESTOUT_SIZE,
  buildTestOutPlan,
  testOutResult,
  collectUnitTargets,
  planUnitSeeding,
  type TestOutQuestion,
} from "../testOut";

function makeUnitBank(): TestOutQuestion[] {
  const qs: TestOutQuestion[] = [];
  const stageConfigs: { stage: number; count: number; shape: TestOutQuestion["shape"]; type: string }[] = [
    { stage: 1, count: 10, shape: "choice", type: "WORD_AR_TO_FA" },
    { stage: 2, count: 8, shape: "choice", type: "VERSE_TRANSLATION" },
    { stage: 3, count: 8, shape: "order", type: "VERSE_ORDER" },
    { stage: 4, count: 10, shape: "cloze", type: "VERSE_CLOZE" },
    { stage: 5, count: 8, shape: "choice", type: "NEXT_VERSE" },
    { stage: 6, count: 6, shape: "choice", type: "VERSE_NUMBER" },
    { stage: 7, count: 6, shape: "cloze", type: "HALF_PAGE_RECALL" },
    { stage: 8, count: 6, shape: "choice", type: "STAGE8_EXAM" },
  ];
  let idx = 1;
  for (const cfg of stageConfigs) {
    for (let i = 0; i < cfg.count; i++) {
      qs.push({
        id: `q_${cfg.stage}_${idx++}`,
        unitId: "u_p385a",
        stage: cfg.stage,
        difficulty: 1 + (i % 5),
        type: i === 0 && cfg.stage === 5 ? "MUTASHABIH_SPOT" : i === 0 && cfg.stage === 6 ? "ENDING_CHOICE" : cfg.type,
        shape: cfg.shape,
        targets: [`vr:${1 + (i % 4)}`],
      });
    }
  }
  return qs;
}

describe("seedKnownCard", () => {
  it("creates a Review card with expected stability, due date, and streak", () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    const c = seedKnownCard("vr:5", { now, intervalDays: 17, stability: 14 });
    expect(c.state).toBe(2);
    expect(c.reps).toBe(2);
    expect(c.lapses).toBe(0);
    expect(c.streak).toBe(2);
    expect(c.difficulty).toBe(5);
    expect(c.stability).toBe(14);
    expect(c.scheduledDays).toBe(17);
    expect(c.due).toBe("2026-05-18T00:00:00.000Z");
  });
});

describe("buildTestOutPlan", () => {
  it("picks 28 questions with >=40% productive shapes and includes special types", () => {
    const bank = makeUnitBank();
    const plan = buildTestOutPlan(bank, 42);
    expect(plan).toHaveLength(TESTOUT_SIZE);
    const productive = plan.filter((q) => q.shape === "order" || q.shape === "cloze").length;
    expect(productive / plan.length).toBeGreaterThanOrEqual(0.4);
    const specials = plan.filter((q) => q.type === "MUTASHABIH_SPOT" || q.type === "ENDING_CHOICE");
    expect(specials.length).toBeGreaterThanOrEqual(1);
    expect(specials.length).toBeLessThanOrEqual(2);
  });

  it("deprioritizes recent questions", () => {
    const bank = makeUnitBank();
    const stage1Ids = bank.filter((q) => q.stage === 1).slice(0, 5).map((q) => q.id);
    const plan = buildTestOutPlan(bank, 7, new Set(stage1Ids));
    const pickedStage1 = plan.filter((q) => q.stage === 1).map((q) => q.id);
    expect(pickedStage1.every((id) => !stage1Ids.includes(id))).toBe(true);
  });
});

describe("testOutResult", () => {
  it("passes at >=90% overall, >=70% per stage, >=85% recall (4+7), and no hint", () => {
    const attempts = [
      ...Array.from({ length: 5 }, () => ({ stage: 1, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 2, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 3, correct: true, usedHint: false })),
      ...Array.from({ length: 5 }, () => ({ stage: 4, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, (_, i) => ({ stage: 5, correct: i > 0, usedHint: false })), // 75%
      ...Array.from({ length: 3 }, () => ({ stage: 6, correct: true, usedHint: false })),
      ...Array.from({ length: 2 }, () => ({ stage: 7, correct: true, usedHint: false })),
      { stage: 8, correct: true, usedHint: false },
    ];
    const res = testOutResult(attempts);
    expect(res.passed).toBe(true);
    expect(res.ratio).toBeGreaterThanOrEqual(0.9);
  });

  it("fails at 85% overall (criterion 2)", () => {
    const attempts = Array.from({ length: 20 }, (_, i) => ({
      stage: 1 + (i % 4),
      correct: i < 17, // 85%
      usedHint: false,
    }));
    const res = testOutResult(attempts);
    expect(res.passed).toBe(false);
    expect(res.ratio).toBeCloseTo(0.85, 2);
  });

  it("fails at 92% overall when one stage is below 70% and reports weakestStage (criterion 3)", () => {
    const attempts = [
      ...Array.from({ length: 5 }, () => ({ stage: 1, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 2, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 3, correct: true, usedHint: false })),
      ...Array.from({ length: 5 }, () => ({ stage: 4, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 5, correct: true, usedHint: false })),
      // stage 6: 1/3 = 33% (< 70%)
      { stage: 6, correct: true, usedHint: false },
      { stage: 6, correct: false, usedHint: false },
      { stage: 6, correct: false, usedHint: false },
      ...Array.from({ length: 2 }, () => ({ stage: 7, correct: true, usedHint: false })),
      { stage: 8, correct: true, usedHint: false },
    ];
    const res = testOutResult(attempts);
    expect(res.ratio).toBeGreaterThanOrEqual(0.9);
    expect(res.passed).toBe(false);
    expect(res.weakestStage).toBe(6);
  });
});

describe("planUnitSeeding", () => {
  it("seeds tested-correct with kind intervals, skips tested-wrong, and spreads untested so tomorrow debt < 10 (criterion 1)", () => {
    const targets = collectUnitTargets({
      unitId: "u_p385a",
      questions: [{ targets: ["vr:1", "w:w28_001_001"] }],
      verses: [1, 2, 3, 4, 5],
      lexiconWordIds: ["w28_001_001", "w28_001_002", "w28_001_003"],
    });
    const outcomes = new Map<string, boolean>([
      ["vr:1", true],
      ["w:w28_001_001", true],
      ["vr:2", false],
    ]);
    const plan = planUnitSeeding(targets, outcomes, 99);
    expect(plan.find((p) => p.key === "vr:1")).toEqual({ key: "vr:1", intervalDays: 17, stability: 14 });
    expect(plan.find((p) => p.key === "w:w28_001_001")).toEqual({ key: "w:w28_001_001", intervalDays: 14, stability: 14 });
    expect(plan.find((p) => p.key === "vr:2")).toBeUndefined();

    const now = new Date("2026-05-01T00:00:00.000Z");
    const seededCards = plan.map((p) => seedKnownCard(p.key, { now, intervalDays: p.intervalDays, stability: p.stability }));
    const tomorrow = new Date(now.getTime() + 86400_000);
    expect(reviewDebt(seededCards, tomorrow)).toBeLessThan(10);
  });
});
