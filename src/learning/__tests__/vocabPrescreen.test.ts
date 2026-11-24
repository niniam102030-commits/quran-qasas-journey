import { describe, expect, it } from "vitest";
import { seedKnownCard, type StoredCard } from "../cardScheduler";
import {
  PRESCREEN_MAX_WORDS,
  PRESCREEN_KNOWN_INTERVAL_DAYS,
  selectPrescreenWords,
  applyPrescreenOutcomes,
  filterPrescreenedStage1Questions,
  type PrescreenWord,
} from "../vocabPrescreen";

const makeWord = (i: number, hard = false): PrescreenWord => ({
  wordId: `w28_001_${String(i).padStart(3, "0")}`,
  ar: `کلمه${i}`,
  gloss: `معنی${i}`,
  meaningFa: `توضیح معنی ${i}`,
  hard,
  verse: 1 + (i % 4),
});

describe("vocabPrescreen", () => {
  it("caps screened words at PRESCREEN_MAX_WORDS and prioritizes hard words", () => {
    const words = Array.from({ length: 20 }, (_, i) => makeWord(i + 1, i >= 15));
    const selected = selectPrescreenWords(words, new Map());
    expect(selected).toHaveLength(PRESCREEN_MAX_WORDS);
    // All 5 hard words must be included first
    expect(selected.slice(0, 5).every((w) => w.hard)).toBe(true);
  });

  it("excludes already-known words from prescreen selection", () => {
    const w1 = makeWord(1, true);
    const w2 = makeWord(2, true);
    const cards = new Map<string, StoredCard>([
      [`w:${w1.wordId}`, seedKnownCard(`w:${w1.wordId}`, { intervalDays: 10, stability: 10 })],
    ]);
    const selected = selectPrescreenWords([w1, w2], cards);
    expect(selected.map((w) => w.wordId)).toEqual([w2.wordId]);
  });

  it("criterion 5: confirmed-known word gets 10-day FSRS card and is excluded from stage 1, while mistaken word stays", () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    const knownId = "w28_001_001";
    const wrongId = "w28_001_002";

    const updated = applyPrescreenOutcomes(
      [
        { wordId: knownId, confirmedKnown: true },
        { wordId: wrongId, confirmedKnown: false },
      ],
      new Map(),
      now,
    );

    const knownCard = updated.find((c) => c.key === `w:${knownId}`);
    const wrongCard = updated.find((c) => c.key === `w:${wrongId}`);
    expect(knownCard?.state).toBe(2);
    expect(knownCard?.scheduledDays).toBe(PRESCREEN_KNOWN_INTERVAL_DAYS);
    expect(wrongCard?.state).toBe(0);

    const cardsMap = new Map(updated.map((c) => [c.key, c]));
    const stage1Qs = [
      { id: "q1", targets: [`w:${knownId}`] },
      { id: "q2", targets: [`w:${wrongId}`] },
    ];
    const remaining = filterPrescreenedStage1Questions(stage1Qs, cardsMap, now);
    expect(remaining.map((q) => q.id)).toEqual(["q2"]);
  });
});
