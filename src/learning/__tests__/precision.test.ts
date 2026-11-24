import { describe, it, expect } from "vitest";
import { precisionIndex } from "../precision";

describe("precisionIndex (L4)", () => {
  it("returns null score when all sources are empty", () => {
    const res = precisionIndex({ tasmi: [], testOutRatios: [], verifier: [] });
    expect(res.score).toBeNull();
    expect(res.tasmiAvg).toBeNull();
    expect(res.testOutAvg).toBeNull();
    expect(res.verifierAvg).toBeNull();
    expect(res.trend).toEqual([]);
  });

  it("redistributes weights proportionally when only one source is present", () => {
    const res = precisionIndex({
      tasmi: [
        { total: 10, slipped: 2, at: 1000 }, // 80%
        { total: 10, slipped: 1, at: 2000 }, // 90%
      ],
      testOutRatios: [],
      verifier: [],
    });
    expect(res.tasmiAvg).toBe(85);
    expect(res.score).toBe(85);
    expect(res.testOutAvg).toBeNull();
    expect(res.verifierAvg).toBeNull();
  });

  it("computes ascending trend capped at 8 points", () => {
    const verifier = Array.from({ length: 10 }, (_, i) => ({
      accuracy: 50 + i * 5,
      at: (i + 1) * 1000,
    }));
    const res = precisionIndex({
      tasmi: [],
      testOutRatios: [],
      verifier,
    });
    expect(res.trend.length).toBe(8);
    for (let i = 1; i < res.trend.length; i++) {
      expect(res.trend[i]).toBeGreaterThanOrEqual(res.trend[i - 1]);
    }
  });
});
