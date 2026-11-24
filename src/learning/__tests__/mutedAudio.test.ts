import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ldb } from "../../db/learningDb";
import type { WordAudioSegment } from "../../services/qulReferenceService";
import { seedKnownCard } from "../cardScheduler";
import { planMutedSession, recordMutedTargetOutcome } from "../mutedAudio";

const VERSES = [
  { n: 1, words: ["طسم"] }, // < 5 words -> excluded
  { n: 2, words: ["تِلْكَ", "ءَايَـٰتُ", "ٱلْكِتَـٰبِ", "ٱلْمُبِينِ"] }, // 4 words -> excluded
  { n: 3, words: ["نَتْلُوا۟", "عَلَيْكَ", "مِن", "نَّبَإِ", "مُوسَىٰ", "وَفِرْعَوْنَ", "بِٱلْحَقِّ"] }, // 7 words + has timing
  { n: 4, words: ["إِنَّ", "فِرْعَوْنَ", "عَلَا", "فِى", "ٱلْأَرْضِ", "وَجَعَلَ", "أَهْلَهَا"] }, // no timing -> excluded
];

const TIMINGS: Record<string, WordAudioSegment[]> = {
  "3": [
    [1, 0, 800],
    [2, 810, 1500],
    [3, 1510, 1900],
    [4, 1910, 2600],
    [5, 2610, 3400],
    [6, 3410, 4300],
    [7, 4310, 5200],
  ],
};

describe("mutedAudio (L1)", () => {
  beforeEach(async () => {
    await ldb.delete();
    await ldb.open();
  });

  it("excludes verses without timing or <5 words, never picks first/last word, builds distinct options, and empties options in hard mode", () => {
    const normal = planMutedSession(VERSES, TIMINGS, { count: 8, seed: 10, hard: false });
    expect(normal.length).toBeGreaterThan(0);

    for (const t of normal) {
      expect(t.verse).toBe(3);
      expect(t.wordIndex).toBeGreaterThan(1);
      expect(t.wordIndex).toBeLessThan(7);
      expect(t.options).toContain(t.wordAr);
      expect(new Set(t.options).size).toBe(t.options.length);
      expect(t.options).toHaveLength(4);
    }

    const hard = planMutedSession(VERSES, TIMINGS, { count: 4, seed: 10, hard: true });
    expect(hard.every((t) => t.options.length === 0)).toBe(true);
  });

  it("records MUTED attempt, updates new vr card, and leaves existing vr card with real history untouched", async () => {
    const now = new Date("2026-11-24T10:00:00.000Z");

    // Case 1: no existing card -> creates & reviews vr:3 + logs MUTED attempt
    await recordMutedTargetOutcome({
      unitId: "u_p385b",
      verse: 3,
      wordIndex: 5,
      correct: true,
      responseMs: 2500,
      now,
    });

    const attempts = await ldb.attempts.where("qid").equals("muted:3:5").toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].sessionType).toBe("MUTED");
    expect(attempts[0].perTarget).toEqual({ "vr:3": true });
    const createdCard = await ldb.cards.get("vr:3");
    expect(createdCard?.reps).toBe(1);

    // Case 2: card with real FSRS history -> must NOT be modified!
    const realCard = seedKnownCard("vr:5", { now, intervalDays: 17 });
    await ldb.cards.put(realCard);

    await recordMutedTargetOutcome({
      unitId: "u_p385b",
      verse: 5,
      wordIndex: 3,
      correct: false,
      responseMs: 4000,
      now: new Date(now.getTime() + 60_000),
    });

    const untouched = await ldb.cards.get("vr:5");
    expect(untouched).toEqual(realCard);
  });
});
