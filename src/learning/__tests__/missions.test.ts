import { describe, expect, it } from "vitest";
import { missionsForDate, missionProgress } from "../missions";

describe("missions (G3)", () => {
  it("returns 3 distinct deterministic missions for a fixed date and excludes CYCLE_ONE when hasPassedUnit=false", () => {
    const m1 = missionsForDate("2026-11-24", false);
    const m2 = missionsForDate("2026-11-24", false);
    expect(m1).toEqual(m2);
    expect(m1).toHaveLength(3);
    expect(new Set(m1.map((m) => m.kind)).size).toBe(3);
    expect(m1.some((m) => m.kind === "CYCLE_ONE")).toBe(false);

    // Check across several dates that hasPassedUnit=false never yields CYCLE_ONE
    for (let d = 1; d <= 20; d++) {
      const list = missionsForDate(`2026-11-${String(d).padStart(2, "0")}`, false);
      expect(list.some((m) => m.kind === "CYCLE_ONE")).toBe(false);
    }
  });

  it("can include CYCLE_ONE when hasPassedUnit=true", () => {
    let foundCycle = false;
    for (let d = 1; d <= 30; d++) {
      const list = missionsForDate(`2026-11-${String(d).padStart(2, "0")}`, true);
      if (list.some((m) => m.kind === "CYCLE_ONE")) foundCycle = true;
    }
    expect(foundCycle).toBe(true);
  });

  it("computes missionProgress accurately and caps done at target", () => {
    const missions = [
      { kind: "REVIEW_N" as const, titleFa: "مرور ۱۰ کارت", target: 10, rewardGems: 3 },
      { kind: "LESSON_ONE" as const, titleFa: "یک درس", target: 1, rewardGems: 3 },
      { kind: "PRECISION_N" as const, titleFa: "۱۰ پاسخ دقیق", target: 10, rewardGems: 3 },
    ];
    const prog = missionProgress(missions, {
      reviewAnswers: 25,
      lessonsCompleted: 0,
      tasmiCount: 0,
      precisionCorrect: 10,
      testOutAttempts: 0,
      cycleSessions: 0,
    });
    expect(prog[0]).toEqual({ mission: missions[0], done: 10, complete: true });
    expect(prog[1]).toEqual({ mission: missions[1], done: 0, complete: false });
    expect(prog[2]).toEqual({ mission: missions[2], done: 10, complete: true });
  });
});
