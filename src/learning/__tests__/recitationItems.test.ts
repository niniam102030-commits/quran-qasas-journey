import { describe, expect, it } from "vitest";
import {
  evaluateReciteItem,
  fadeDisplayFor,
  fadeLevelForCleanStreak,
  stageRecitePlan,
  voiceGradeOf,
  type ReciteAttemptSummary,
} from "../recitationItems";

const summary = (over: Partial<ReciteAttemptSummary> = {}): ReciteAttemptSummary => ({
  totalWords: 10,
  matched: 10,
  uncertain: 0,
  confirmedErrors: 0,
  judgedSegments: 2,
  totalSegments: 2,
  coverageComplete: true,
  ...over,
});

describe("evaluateReciteItem — blind gate", () => {
  it("passes a clean blind recitation at ≥90%", () => {
    expect(evaluateReciteItem("blind", summary({ matched: 9, uncertain: 1 }), 0).passed).toBe(true);
  });
  it("fails the gate when uncertain drags accuracy below 90% (uncertain is not a pass)", () => {
    expect(evaluateReciteItem("blind", summary({ matched: 8, uncertain: 2 }), 0).passed).toBe(false);
  });
  it("fails the gate on any confirmed error", () => {
    expect(evaluateReciteItem("blind", summary({ matched: 9, confirmedErrors: 1 }), 0).passed).toBe(false);
  });
  it("fails when coverage is incomplete", () => {
    expect(evaluateReciteItem("blind", summary({ coverageComplete: false }), 0).passed).toBe(false);
  });
});

describe("evaluateReciteItem — other modes", () => {
  it("follow passes on complete coverage even with errors", () => {
    expect(evaluateReciteItem("follow", summary({ matched: 5, confirmedErrors: 3 }), 0).passed).toBe(true);
  });
  it("witness never fails on errors, only needs a judged segment", () => {
    expect(evaluateReciteItem("witness", summary({ matched: 0, confirmedErrors: 4 }), 0).passed).toBe(true);
    expect(
      evaluateReciteItem("witness", summary({ judgedSegments: 0, coverageComplete: false }), 0).passed,
    ).toBe(false);
  });
  it("fade enforces the peek cap and at most one confirmed error", () => {
    expect(evaluateReciteItem("fade", summary(), 2).passed).toBe(true);
    expect(evaluateReciteItem("fade", summary(), 3).passed).toBe(false);
    expect(evaluateReciteItem("fade", summary({ confirmedErrors: 2 }), 0).passed).toBe(false);
  });
  it("link allows one error at ≥80% accuracy", () => {
    expect(evaluateReciteItem("link", summary({ matched: 8, confirmedErrors: 1 }), 0).passed).toBe(true);
    expect(evaluateReciteItem("link", summary({ matched: 7, confirmedErrors: 1 }), 0).passed).toBe(false);
  });
  it("hunt requires a fully clean re-recitation", () => {
    expect(evaluateReciteItem("hunt", summary({ matched: 9, uncertain: 1 }), 0).passed).toBe(true);
    expect(evaluateReciteItem("hunt", summary({ confirmedErrors: 1 }), 0).passed).toBe(false);
  });
});

describe("voiceGradeOf", () => {
  it("clean → good, islands of uncertain → hard, errors or gaps → again", () => {
    expect(voiceGradeOf(summary())).toBe("good");
    expect(voiceGradeOf(summary({ matched: 9, uncertain: 1 }))).toBe("hard");
    expect(voiceGradeOf(summary({ confirmedErrors: 1 }))).toBe("again");
    expect(voiceGradeOf(summary({ coverageComplete: false }))).toBe("again");
  });
  it("voice item passes unless graded again", () => {
    expect(evaluateReciteItem("voice", summary({ matched: 9, uncertain: 1 }), 0)).toEqual({
      passed: true,
      grade: "hard",
    });
    expect(evaluateReciteItem("voice", summary({ confirmedErrors: 1 }), 0).passed).toBe(false);
  });
});

describe("fadeDisplayFor / fadeLevelForCleanStreak", () => {
  it("level 0 shows everything, level 3 hides everything", () => {
    expect(fadeDisplayFor(3, 0, new Set([1]))).toEqual(["full", "full", "full"]);
    expect(fadeDisplayFor(3, 3, new Set())).toEqual(["hidden", "hidden", "hidden"]);
  });
  it("level 1 hides only weak words; level 2 reduces the rest to first letters", () => {
    expect(fadeDisplayFor(3, 1, new Set([1]))).toEqual(["full", "hidden", "full"]);
    expect(fadeDisplayFor(3, 2, new Set([1]))).toEqual(["first", "hidden", "first"]);
  });
  it("clean streak maps to a clamped level", () => {
    expect(fadeLevelForCleanStreak(0)).toBe(0);
    expect(fadeLevelForCleanStreak(2)).toBe(2);
    expect(fadeLevelForCleanStreak(9)).toBe(3);
  });
});

describe("stageRecitePlan", () => {
  const verses = [1, 2, 3, 4, 5];
  const noFade = new Map<number, number>();
  it("stage 1 is an optional follow-along on the first verse; stage 2 has none", () => {
    const p1 = stageRecitePlan(1, verses, 7, noFade);
    expect(p1).toHaveLength(1);
    expect(p1[0]).toMatchObject({ mode: "follow", verse: 1, optional: true });
    expect(stageRecitePlan(2, verses, 7, noFade)).toEqual([]);
  });
  it("stages 7 and 8 are blind gates", () => {
    expect(stageRecitePlan(7, verses, 7, noFade)[0].mode).toBe("blind");
    expect(stageRecitePlan(8, verses, 7, noFade)[0].mode).toBe("blind");
  });
  it("stage 5 links consecutive verses; single-verse units fall back to follow", () => {
    const link = stageRecitePlan(5, verses, 7, noFade)[0];
    expect(link.mode).toBe("link");
    expect(link.linkFromVerse).toBe(link.verse - 1);
    expect(stageRecitePlan(5, [3], 7, noFade)[0].mode).toBe("follow");
  });
  it("empty verse list yields no items", () => {
    expect(stageRecitePlan(7, [], 7, noFade)).toEqual([]);
  });
});
