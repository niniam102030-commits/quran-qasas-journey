import { describe, expect, it } from "vitest";
import { buildBlindSpotPack, getLocalSaturdayWeekIso } from "../blindSpots";

describe("blindSpots (L3)", () => {
  const now = new Date(2026, 10, 24, 12, 0, 0); // Tuesday 2026-11-24
  const dayMs = 86400_000;

  it("keeps weekIso constant from Saturday to Friday and advances on next Saturday", () => {
    const sat = new Date(2026, 10, 21, 10, 0, 0);
    const tue = new Date(2026, 10, 24, 10, 0, 0);
    const fri = new Date(2026, 10, 27, 22, 0, 0);
    const nextSat = new Date(2026, 10, 28, 8, 0, 0);

    expect(getLocalSaturdayWeekIso(sat)).toBe(getLocalSaturdayWeekIso(tue));
    expect(getLocalSaturdayWeekIso(sat)).toBe(getLocalSaturdayWeekIso(fri));
    expect(getLocalSaturdayWeekIso(nextSat)).not.toBe(getLocalSaturdayWeekIso(sat));
  });

  it("scores 2*confusion + 1*wrong within 30d window, excludes day 31, and breaks ties by newer error", () => {
    const confusions = [
      { qid: "q1", target: "vr:12", at: now.getTime() - 2 * dayMs }, // +2
      { qid: "q1", target: "vr:12", at: now.getTime() - 1 * dayMs }, // +2 => 4
      { qid: "q2", target: "w:w28_002_004", at: now.getTime() - 5 * dayMs }, // +2
      { qid: "q3", target: "vr:15", at: now.getTime() - 1 * dayMs }, // +2 (newer than q2)
      // Day 31 -> must be ignored!
      { qid: "q_old", target: "vr:99", at: now.getTime() - 31 * dayMs },
    ];
    const attempts = [
      { qid: "q4", correct: false, at: now.getTime() - 3 * dayMs }, // +1
      { qid: "q5", correct: false, at: now.getTime() - 1 * dayMs }, // +1 (newer than q4)
      { qid: "q6", correct: true, at: now.getTime() - 1 * dayMs }, // correct -> ignored
      { qid: "q_old", correct: false, at: now.getTime() - 31 * dayMs }, // ignored
    ];

    const pack = buildBlindSpotPack({ confusions, attempts, now, size: 15 });
    expect(pack.questionIds).toEqual(["q1", "q3", "q2", "q5", "q4"]);
    expect(pack.questionIds).not.toContain("q_old");
    expect(pack.topTargets[0]).toBe("vr:12");
  });

  it("returns empty questionIds when fewer than 5 scored questions exist", () => {
    const pack = buildBlindSpotPack({
      confusions: [{ qid: "q1", target: "vr:1", at: now.getTime() - dayMs }],
      attempts: [{ qid: "q2", correct: false, at: now.getTime() - dayMs }],
      now,
    });
    expect(pack.questionIds).toEqual([]);
  });
});
