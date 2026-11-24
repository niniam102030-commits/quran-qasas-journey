// src/store/__tests__/useLearningStore.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { ldb, type QuestionRow } from "../../db/learningDb";
import { useLearningStore } from "../useLearningStore";
import { newCard, reviewDebt } from "../../learning/cardScheduler";

describe("useLearningStore - Requeue, unitProgress, and Unit Unlocking", () => {
  beforeEach(async () => {
    await ldb.delete();
    await ldb.open();
    // Reset store state
    useLearningStore.setState({
      status: "idle",
      sessionType: "STAGE",
      unitId: null,
      stage: 1,
      queue: [],
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      sessionAnyHint: false,
      sessionAnyRequeue: false,
      seen: new Set(),
      lastResult: null,
      summary: null,
    });
  });

  it("wrong answer triggers requeue at +3 on first fail and +7 on second fail", async () => {
    const q1: QuestionRow = {
      id: "q_test_1",
      unitId: "u_p385a",
      stage: 1,
      skill: "word",
      type: "WORD_AR_TO_FA",
      shape: "choice",
      difficulty: 1,
      targets: ["w:w28_001_001"],
      options: [{ id: "o1", fa: "درست" }, { id: "o2", fa: "غلط" }],
      answer: "o1",
      explanationFa: "توضیح",
    };
    const q2: QuestionRow = { ...q1, id: "q_test_2", targets: ["w:w28_001_002"] };
    const q3: QuestionRow = { ...q1, id: "q_test_3", targets: ["w:w28_001_003"] };
    const q4: QuestionRow = { ...q1, id: "q_test_4", targets: ["w:w28_001_004"] };
    const q5: QuestionRow = { ...q1, id: "q_test_5", targets: ["w:w28_001_005"] };

    // Set queue directly
    useLearningStore.setState({
      status: "running",
      sessionType: "STAGE",
      unitId: "u_p385a",
      stage: 1,
      queue: [q1, q2, q3, q4, q5],
      index: 0,
    });

    // Submit wrong answer for q1 (first time)
    await useLearningStore.getState().submit("o2", { responseMs: 2000 });

    const state1 = useLearningStore.getState();
    expect(state1.wrongCounts["q_test_1"]).toBe(1);
    // Queue should have q1 re-inserted at index 0 + 1 + 3 = index 4
    expect(state1.queue[4].id).toBe("q_test_1");

    // Advance to index 4 where q1 reappears
    useLearningStore.setState({ index: 4 });

    // Submit wrong answer for q1 second time
    await useLearningStore.getState().submit("o2", { responseMs: 2000 });

    const state2 = useLearningStore.getState();
    expect(state2.wrongCounts["q_test_1"]).toBe(2);
    // Requeued at min(queue.length, 4 + 1 + 7 = 12)
    expect(state2.queue[state2.queue.length - 1].id).toBe("q_test_1");

    // Third wrong answer does NOT requeue infinitely (capped at 2)
    const lenBefore3 = state2.queue.length;
    useLearningStore.setState({ index: lenBefore3 - 1 });
    await useLearningStore.getState().submit("o2", { responseMs: 2000 });
    const state3 = useLearningStore.getState();
    expect(state3.queue.length).toBe(lenBefore3);
  });

  it("stage completion requires 2 short lessons and then unlocks currentStage + 1", async () => {
    await ldb.unitProgress.put({
      unitId: "u_p385a",
      unlocked: true,
      stagePassed: {},
      stageLessons: {},
      currentStage: 1,
      mastered: false,
      updatedAt: Date.now(),
    });

    const fourCorrect = [
      { stage: 1, correct: true, usedHint: false },
      { stage: 1, correct: true, usedHint: false },
      { stage: 1, correct: true, usedHint: false },
      { stage: 1, correct: true, usedHint: false },
    ];

    // Lesson 1 of 2
    useLearningStore.setState({
      status: "running",
      unitId: "u_p385a",
      stage: 1,
      queue: [{ id: "q1", unitId: "u_p385a", stage: 1, skill: "word", type: "WORD_AR_TO_FA", shape: "choice", difficulty: 1, targets: [] }],
      index: 0,
      firstAttempts: fourCorrect,
    });
    await useLearningStore.getState().next();

    let prog = await ldb.unitProgress.get("u_p385a");
    expect(prog?.stageLessons?.[1]).toBe(1);
    expect(prog?.stagePassed[1]).toBeFalsy();
    expect(prog?.currentStage).toBe(1);

    // Lesson 2 of 2 -> completes stage 1
    useLearningStore.setState({
      status: "running",
      unitId: "u_p385a",
      stage: 1,
      queue: [{ id: "q2", unitId: "u_p385a", stage: 1, skill: "word", type: "WORD_AR_TO_FA", shape: "choice", difficulty: 1, targets: [] }],
      index: 0,
      firstAttempts: fourCorrect,
    });
    await useLearningStore.getState().next();

    prog = await ldb.unitProgress.get("u_p385a");
    expect(prog?.stageLessons?.[1]).toBe(2);
    expect(prog?.stagePassed[1]).toBe(true);
    expect(prog?.currentStage).toBe(2);
  });

  it("passing stage 8 unlocks next unit if debt < 40, but remains locked if debt >= 40", async () => {
    await ldb.unitProgress.put({
      unitId: "u_p385a",
      unlocked: true,
      stagePassed: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true },
      stageLessons: { 8: 1 }, // already completed 1 of 2 lessons
      currentStage: 8,
      mastered: false,
      updatedAt: Date.now(),
    });
    await ldb.unitProgress.put({
      unitId: "u_p385b",
      unlocked: false,
      stagePassed: {},
      currentStage: 1,
      mastered: false,
      updatedAt: Date.now(),
    });

    // Scenario A: Debt < 40 -> Next unit UNLOCKS
    useLearningStore.setState({
      status: "running",
      unitId: "u_p385a",
      stage: 8,
      queue: [{ id: "q1", unitId: "u_p385a", stage: 8, skill: "word", type: "WORD_AR_TO_FA", shape: "choice", difficulty: 3, targets: [] }],
      index: 0,
      firstAttempts: Array.from({ length: 10 }, () => ({ stage: 8, correct: true, usedHint: false })),
    });

    await useLearningStore.getState().next();

    let u2 = await ldb.unitProgress.get("u_p385b");
    expect(u2?.unlocked).toBe(true);

    // Scenario B: Debt >= 40 -> Next unit remains LOCKED
    // Reset unit 2
    await ldb.unitProgress.put({
      unitId: "u_p385b",
      unlocked: false,
      stagePassed: {},
      currentStage: 1,
      mastered: false,
      updatedAt: Date.now(),
    });

    // Create 45 overdue cards to simulate debt >= 40
    const past = new Date("2020-01-01").toISOString();
    const overdueCards = Array.from({ length: 45 }, (_, i) => ({
      ...newCard(`vr:${i + 1}`),
      state: 2 as const, // Review state
      due: past,
    }));
    await ldb.cards.bulkPut(overdueCards);

    useLearningStore.setState({
      status: "running",
      unitId: "u_p385a",
      stage: 8,
      queue: [{ id: "q1", unitId: "u_p385a", stage: 8, skill: "word", type: "WORD_AR_TO_FA", shape: "choice", difficulty: 3, targets: [] }],
      index: 0,
      firstAttempts: Array.from({ length: 10 }, () => ({ stage: 8, correct: true, usedHint: false })),
    });

    await useLearningStore.getState().next();

    u2 = await ldb.unitProgress.get("u_p385b");
    expect(u2?.unlocked).toBe(false);
  });

  it("F3: flawless lesson (10/10 no hint, no requeue) waives lesson 2 on stages 1..7, but not stage 8", async () => {
    await ldb.unitProgress.put({
      unitId: "u_p385a",
      unlocked: true,
      stagePassed: {},
      stageLessons: {},
      currentStage: 1,
      mastered: false,
      updatedAt: Date.now(),
    });

    // Stage 3 flawless lesson 1 -> waives lesson 2
    useLearningStore.setState({
      status: "running",
      sessionType: "STAGE",
      unitId: "u_p385a",
      stage: 3,
      queue: [{ id: "q1", unitId: "u_p385a", stage: 3, skill: "verse", type: "VERSE_ORDER", shape: "order", difficulty: 2, targets: [] }],
      index: 0,
      firstAttempts: Array.from({ length: 10 }, () => ({ stage: 3, correct: true, usedHint: false })),
      sessionAnyHint: false,
      sessionAnyRequeue: false,
    });
    await useLearningStore.getState().next();

    let prog = await ldb.unitProgress.get("u_p385a");
    expect(prog?.stageLessons?.[3]).toBe(2);
    expect(prog?.stagePassed[3]).toBe(true);
    expect(useLearningStore.getState().summary?.waivedLesson).toBe(true);
    expect(useLearningStore.getState().summary?.stageCompleted).toBe(true);

    // Stage 8 flawless lesson 1 -> NOT waived
    useLearningStore.setState({
      status: "running",
      sessionType: "STAGE",
      unitId: "u_p385a",
      stage: 8,
      queue: [{ id: "q8", unitId: "u_p385a", stage: 8, skill: "verse", type: "VERSE_ORDER", shape: "order", difficulty: 4, targets: [] }],
      index: 0,
      firstAttempts: Array.from({ length: 10 }, () => ({ stage: 8, correct: true, usedHint: false })),
      sessionAnyHint: false,
      sessionAnyRequeue: false,
    });
    await useLearningStore.getState().next();

    prog = await ldb.unitProgress.get("u_p385a");
    expect(prog?.stageLessons?.[8]).toBe(1);
    expect(prog?.stagePassed[8]).toBeFalsy();
    expect(useLearningStore.getState().summary?.waivedLesson).toBeUndefined();
  });

  it("F1: passing Test-Out passes all 8 stages, seeds FSRS cards with tomorrow debt < 10, and keeps mastered=false; failing records no stage", async () => {
    await ldb.unitProgress.put({
      unitId: "u_p385a",
      unlocked: true,
      stagePassed: {},
      stageLessons: {},
      currentStage: 1,
      mastered: false,
      updatedAt: Date.now(),
    });
    await ldb.chunks.bulkPut([
      { id: "c1", unitId: "u_p385a", verse: 1 },
      { id: "c2", unitId: "u_p385a", verse: 2 },
      { id: "c3", unitId: "u_p385a", verse: 3 },
    ]);
    await ldb.lexicon.bulkPut([
      { wordId: "w28_001_001", unitId: "u_p385a", ar: "طسم", meaningFa: "حروف مقطعه" },
      { wordId: "w28_002_001", unitId: "u_p385a", ar: "تلك", meaningFa: "این" },
    ]);

    // Fail at 85% -> no stage recorded
    const failAttempts = Array.from({ length: 20 }, (_, i) => ({
      stage: 1 + (i % 4),
      correct: i < 17,
      usedHint: false,
    }));
    useLearningStore.setState({
      status: "running",
      sessionType: "TESTOUT",
      unitId: "u_p385a",
      stage: -2,
      queue: [{ id: "qt1", unitId: "u_p385a", stage: 1, skill: "word", type: "WORD_AR_TO_FA", shape: "choice", difficulty: 3, targets: ["w:w28_001_001"] }],
      index: 0,
      firstAttempts: failAttempts,
      firstTargetOutcomes: { "w:w28_001_001": false },
    });
    await useLearningStore.getState().next();
    let prog = await ldb.unitProgress.get("u_p385a");
    expect(Object.values(prog?.stagePassed ?? {}).filter(Boolean)).toHaveLength(0);
    expect(useLearningStore.getState().summary?.passed).toBe(false);

    // Pass at 100% -> all 8 stages passed, seeded cards created, tomorrow debt < 10
    const passAttempts = [
      ...Array.from({ length: 5 }, () => ({ stage: 1, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 2, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 3, correct: true, usedHint: false })),
      ...Array.from({ length: 5 }, () => ({ stage: 4, correct: true, usedHint: false })),
      ...Array.from({ length: 4 }, () => ({ stage: 5, correct: true, usedHint: false })),
      ...Array.from({ length: 3 }, () => ({ stage: 6, correct: true, usedHint: false })),
      ...Array.from({ length: 2 }, () => ({ stage: 7, correct: true, usedHint: false })),
      { stage: 8, correct: true, usedHint: false },
    ];
    useLearningStore.setState({
      status: "running",
      sessionType: "TESTOUT",
      unitId: "u_p385a",
      stage: -2,
      queue: [{ id: "qt2", unitId: "u_p385a", stage: 1, skill: "word", type: "WORD_AR_TO_FA", shape: "choice", difficulty: 3, targets: ["w:w28_001_001"] }],
      index: 0,
      firstAttempts: passAttempts,
      firstTargetOutcomes: { "w:w28_001_001": true, "vr:1": true },
    });
    await useLearningStore.getState().next();
    prog = await ldb.unitProgress.get("u_p385a");
    expect(Object.values(prog?.stagePassed ?? {}).filter(Boolean)).toHaveLength(8);
    expect(prog?.mastered).toBe(false);
    const cards = await ldb.cards.toArray();
    expect(cards.length).toBeGreaterThanOrEqual(15);
    const tomorrow = new Date(Date.now() + 86400_000);
    expect(reviewDebt(cards, tomorrow)).toBeLessThan(10);
  });

  it("G3: tracks combo on first attempts, resets on wrong, ignores hint without breaking, and awards combo bonus XP", async () => {
    const makeQ = (i: number): QuestionRow => ({
      id: `qc_${i}`,
      unitId: "u_p385a",
      stage: 1,
      skill: "word",
      type: "WORD_AR_TO_FA",
      shape: "choice",
      difficulty: 1,
      targets: [`w:w28_001_00${i}`],
      options: [{ id: "o1", fa: "درست" }, { id: "o2", fa: "غلط" }],
      answer: "o1",
    });
    const qs = [1, 2, 3, 4, 5, 6, 7].map(makeQ);
    useLearningStore.setState({
      status: "running",
      sessionType: "STAGE",
      unitId: "u_p385a",
      stage: 1,
      combo: 0,
      maxCombo: 0,
      queue: qs,
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      seen: new Set(),
    });

    // 5 consecutive correct answers -> combo=5, maxCombo=5
    for (let i = 0; i < 5; i++) {
      await useLearningStore.getState().submit("o1", { responseMs: 1500 });
      await useLearningStore.getState().next();
    }
    expect(useLearningStore.getState().combo).toBe(5);
    expect(useLearningStore.getState().maxCombo).toBe(5);

    // Hint on 6th question does not increment and does not break combo
    await useLearningStore.getState().submit("o1", { responseMs: 1500, usedHint: true });
    expect(useLearningStore.getState().combo).toBe(5);
    await useLearningStore.getState().next();

    // Wrong on 7th question resets combo to 0 while keeping maxCombo=5
    await useLearningStore.getState().submit("o2", { responseMs: 1500 });
    expect(useLearningStore.getState().combo).toBe(0);
    expect(useLearningStore.getState().maxCombo).toBe(5);

    // Advance past requeued item to finish session
    while (useLearningStore.getState().status === "running") {
      const st = useLearningStore.getState();
      if (st.lastResult === null) {
        await st.submit("o1", { responseMs: 1500 });
      }
      await useLearningStore.getState().next();
    }

    const summary = useLearningStore.getState().summary!;
    expect(summary.maxCombo).toBe(5);
    // 6 correct * 10 + 20 (passed: 6/7 >= 0.85) + 5 (combo bonus for maxCombo=5) = 85 XP
    expect(summary.xpEarned).toBe(85);
  });

  it("A3: DRILL session records attempts with sessionType='DRILL' and does not modify FSRS cards or unitProgress", async () => {
    const existingCard = newCard("sq:5");
    await ldb.cards.put(existingCard);
    await ldb.unitProgress.put({
      unitId: "u_p385b",
      unlocked: true,
      stagePassed: {},
      stageLessons: {},
      currentStage: 1,
      mastered: false,
      updatedAt: 1000,
    });

    const drillQ: QuestionRow = {
      id: "exam:link:28:u_p385b:u_p386a",
      unitId: "u_p386a",
      stage: 5,
      skill: "sequence",
      type: "NEXT_VERSE_CHOICE",
      shape: "choice",
      difficulty: 4,
      targets: ["sq:5"],
      options: [{ id: "v:6", ar: "آیه ۶" }, { id: "v:10", ar: "آیه ۱۰" }],
      answer: "v:6",
    };

    useLearningStore.setState({
      status: "running",
      sessionType: "DRILL",
      unitId: null,
      stage: -5,
      queue: [drillQ],
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      seen: new Set(),
    });

    await useLearningStore.getState().submit("v:10", { responseMs: 2500 });
    await useLearningStore.getState().next();

    const attempts = await ldb.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].sessionType).toBe("DRILL");
    expect(attempts[0].correct).toBe(false);

    // کارت‌های FSRS نباید تغییر کنند
    const afterCard = await ldb.cards.get("sq:5");
    expect(afterCard).toEqual(existingCard);

    // پیشرفت واحد نباید تغییر کند
    const prog = await ldb.unitProgress.get("u_p385b");
    expect(prog?.updatedAt).toBe(1000);
  });
});
