import { describe, expect, it } from "vitest";
import { buildTodayPlan } from "../todayPlan";

describe("buildTodayPlan (U1)", () => {
  it("returns empty array when debt is zero, all units passed, no manzil/blindspots, and tasmi done today", () => {
    const plan = buildTodayPlan({
      dueCount: 0,
      reviewCap: 20,
      currentUnitId: null,
      currentStage: 8,
      allUnitsPassed: true,
      tasmiDoneToday: true,
      manzilUnitIds: [],
      blindSpotAvailable: false,
    });
    expect(plan).toEqual([]);
  });

  it("caps REVIEW count at reviewCap (due=30, cap=20 -> count=20)", () => {
    const plan = buildTodayPlan({
      dueCount: 30,
      reviewCap: 20,
      currentUnitId: "u_p385b",
      currentStage: 1,
      allUnitsPassed: false,
      tasmiDoneToday: false,
      manzilUnitIds: [],
      blindSpotAvailable: false,
      hasPassedUnit: false,
    });
    expect(plan[0].kind).toBe("REVIEW");
    expect(plan[0].count).toBe(20);
    expect(plan[0].titleFa).toBe("مرور امروز");
  });

  it("orders tasks strictly and enforces max 4 tasks", () => {
    const plan = buildTodayPlan({
      dueCount: 12,
      reviewCap: 20,
      currentUnitId: "u_p387a",
      currentStage: 3,
      allUnitsPassed: false,
      tasmiDoneToday: false,
      manzilUnitIds: ["u_p385b", "u_p386a"],
      blindSpotAvailable: true,
      lastPassedUnitId: "u_p386b",
      hasPassedUnit: true,
    });
    expect(plan).toHaveLength(4);
    expect(plan.map((t) => t.kind)).toEqual(["REVIEW", "LESSON", "MANZIL", "BLINDSPOTS"]);
  });

  it("includes TASMI when space permits and at least one unit is passed", () => {
    const plan = buildTodayPlan({
      dueCount: 0,
      reviewCap: 20,
      currentUnitId: "u_p386a",
      currentStage: 2,
      allUnitsPassed: false,
      tasmiDoneToday: false,
      manzilUnitIds: [],
      blindSpotAvailable: false,
      lastPassedUnitId: "u_p385b",
      hasPassedUnit: true,
    });
    expect(plan.map((t) => t.kind)).toEqual(["LESSON", "TASMI"]);
    expect(plan[1].unitId).toBe("u_p385b");
  });
});
