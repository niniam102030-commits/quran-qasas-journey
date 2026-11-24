// src/store/__tests__/useLearningStore.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { ldb, type QuestionRow } from "../../db/learningDb";
import { useLearningStore } from "../useLearningStore";
import { newCard } from "../../learning/cardScheduler";

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
});
