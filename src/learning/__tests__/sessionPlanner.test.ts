// src/learning/__tests__/sessionPlanner.test.ts
import { describe, expect, it } from "vitest";
import { adaptRemainingQueue } from "../sessionPlanner";

describe("adaptRemainingQueue", () => {
  const qs = [
    { id: "a", difficulty: 3 },
    { id: "b", difficulty: 1 },
    { id: "c", difficulty: 5 },
  ];
  it("دو غلط پیاپی: آسان‌ترین جلو می‌آید", () => {
    expect(adaptRemainingQueue(qs, [true, false, false]).map((q) => q.id)).toEqual(["b", "a", "c"]);
  });
  it("سه درست پیاپی: سخت‌ترین جلو می‌آید", () => {
    expect(adaptRemainingQueue(qs, [true, true, true]).map((q) => q.id)).toEqual(["c", "a", "b"]);
  });
  it("بدون الگو: ترتیب دست نمی‌خورد", () => {
    expect(adaptRemainingQueue(qs, [false, true]).map((q) => q.id)).toEqual(["a", "b", "c"]);
  });
});
