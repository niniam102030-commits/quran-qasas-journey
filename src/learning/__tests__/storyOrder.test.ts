import { describe, it, expect } from "vitest";
import { shuffleEvents, scoreOrder } from "../storyOrder";

describe("storyOrder (L5)", () => {
  const sample = ["واقعه ۱", "واقعه ۲", "واقعه ۳", "واقعه ۴"];

  it("never returns the original order across multiple seeds", () => {
    for (let seed = 0; seed < 50; seed++) {
      const shuffled = shuffleEvents(sample, seed);
      expect(shuffled).toHaveLength(sample.length);
      expect(shuffled.slice().sort()).toEqual(sample.slice().sort());
      expect(shuffled).not.toEqual(sample);
    }
  });

  it("scores exact matches and full correctness accurately", () => {
    expect(scoreOrder(sample, sample)).toEqual({ exact: 4, fullyCorrect: true });
    expect(
      scoreOrder(sample, ["واقعه ۲", "واقعه ۱", "واقعه ۳", "واقعه ۴"]),
    ).toEqual({ exact: 2, fullyCorrect: false });
    expect(
      scoreOrder(sample, ["واقعه ۴", "واقعه ۳", "واقعه ۲", "واقعه ۱"]),
    ).toEqual({ exact: 0, fullyCorrect: false });
  });
});
