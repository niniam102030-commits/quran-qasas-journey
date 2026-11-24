import { describe, expect, it } from "vitest";
import { gardenState } from "../garden";

describe("gardenState (G4)", () => {
  it("maps stagePassedCount and mastered to plant stages 0..4", () => {
    const res = gardenState([
      { unitId: "u0", stagePassedCount: 0, mastered: false, dueCards: 0, totalCards: 0 },
      { unitId: "u1", stagePassedCount: 2, mastered: false, dueCards: 0, totalCards: 10 },
      { unitId: "u2", stagePassedCount: 5, mastered: false, dueCards: 0, totalCards: 10 },
      { unitId: "u3", stagePassedCount: 8, mastered: false, dueCards: 0, totalCards: 20 },
      { unitId: "u4", stagePassedCount: 8, mastered: true, dueCards: 0, totalCards: 20 },
    ]);
    expect(res.map((p) => p.stage)).toEqual([0, 1, 2, 3, 4]);
  });

  it("marks wilted strictly above 0.30 overdue ratio (0.30 -> false, 0.31 -> true)", () => {
    const res = gardenState([
      { unitId: "u_exact", stagePassedCount: 4, mastered: false, dueCards: 30, totalCards: 100 },
      { unitId: "u_over", stagePassedCount: 4, mastered: false, dueCards: 31, totalCards: 100 },
      { unitId: "u_empty", stagePassedCount: 0, mastered: false, dueCards: 0, totalCards: 0 },
    ]);
    expect(res[0].wilted).toBe(false);
    expect(res[1].wilted).toBe(true);
    expect(res[2].wilted).toBe(false);
  });
});
