import { describe, it, expect } from "vitest";
import { STORY_CHAPTERS, chapterOfUnit, chapterProgress } from "../chapters";

describe("story chapters (G1)", () => {
  it("maps boundary verses to the exact expected chapters", () => {
    expect(chapterOfUnit(1).id).toBe("ch1");
    expect(chapterOfUnit(6).id).toBe("ch1");
    expect(chapterOfUnit(7).id).toBe("ch2");
    expect(chapterOfUnit(76).id).toBe("ch9");
    expect(chapterOfUnit(88).id).toBe("ch10");
  });

  it("computes chapterProgress and complete status accurately", () => {
    const ch2 = STORY_CHAPTERS.find((c) => c.id === "ch2")!;
    const partial = chapterProgress(ch2, [
      { verseFrom: 7, stage8Passed: true },
      { verseFrom: 11, stage8Passed: false },
      { verseFrom: 1, stage8Passed: true },
    ]);
    expect(partial).toEqual({ total: 2, done: 1, complete: false });

    const done = chapterProgress(ch2, [
      { verseFrom: 7, stage8Passed: true },
      { verseFrom: 11, stage8Passed: true },
    ]);
    expect(done).toEqual({ total: 2, done: 2, complete: true });

    const empty = chapterProgress(ch2, []);
    expect(empty).toEqual({ total: 0, done: 0, complete: false });
  });
});
