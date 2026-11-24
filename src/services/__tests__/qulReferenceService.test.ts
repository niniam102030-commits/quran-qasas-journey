import { describe, it, expect } from "vitest";
import { findActiveWordAtMs, type WordAudioSegment } from "../qulReferenceService";

const SAMPLE_SEGMENTS: WordAudioSegment[] = [
  [1, 450, 980],
  [2, 990, 2010],
  [3, 2020, 3150],
  [4, 3160, 4210],
];

describe("qulReferenceService.findActiveWordAtMs", () => {
  it("returns null before first word or after last word", () => {
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 100)).toBeNull();
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 5000)).toBeNull();
    expect(findActiveWordAtMs([], 500)).toBeNull();
  });

  it("matches exact word inside its millisecond window", () => {
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 450)).toBe(1);
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 1500)).toBe(2);
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 3150)).toBe(3);
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 4000)).toBe(4);
  });

  it("bridges tiny micro-gaps between adjacent words smoothly", () => {
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 985)).toBe(1);
    expect(findActiveWordAtMs(SAMPLE_SEGMENTS, 2015)).toBe(2);
  });
});
