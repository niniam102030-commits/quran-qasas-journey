import { describe, expect, it } from "vitest";
import { buildReviewForecast } from "../forecast";
import { seedKnownCard } from "../cardScheduler";
import { dailyReviewCapFor, summarizeForecastLoad, isPaceMode, estimateCompletion } from "../pace";

describe("pace modes and 7-day forecast load (F5)", () => {
  it("maps calm/standard/intensive to 10/20/40 daily review caps", () => {
    expect(dailyReviewCapFor("calm")).toBe(10);
    expect(dailyReviewCapFor("standard")).toBe(20);
    expect(dailyReviewCapFor("intensive")).toBe(40);
    expect(isPaceMode("calm")).toBe(true);
    expect(isPaceMode("unknown")).toBe(false);
  });

  it("summarizes 7-day forecast load and detects over-cap days", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const cards = Array.from({ length: 15 }, (_, i) =>
      seedKnownCard(`vr:${i + 1}`, { now, intervalDays: 2, stability: 7 }),
    );
    const days = buildReviewForecast(cards, now);

    const calmSummary = summarizeForecastLoad(days, "calm");
    expect(calmSummary.total7Days).toBe(15);
    expect(calmSummary.peakDay?.dueCount).toBe(15);
    expect(calmSummary.overCapDays).toBe(1);

    const standardSummary = summarizeForecastLoad(days, "standard");
    expect(standardSummary.overCapDays).toBe(0);
  });

  it("estimateCompletion (U4): rate=0 returns null; 1 unit/week & 10 remaining -> +70d; intensive sooner than standard < calm", () => {
    const zero = estimateCompletion({
      completedUnits: 2,
      totalUnits: 22,
      unitsCompletedLast14Days: 0,
      paceMode: "standard",
      todayIso: "2026-11-24",
    });
    expect(zero.etaIso).toBeNull();
    expect(zero.scenarios).toEqual({ calm: null, standard: null, intensive: null });

    // 2 units in 14 days = 1 unit/week; 10 remaining -> 10 weeks = 70 days -> 2027-02-02
    const active = estimateCompletion({
      completedUnits: 12,
      totalUnits: 22,
      unitsCompletedLast14Days: 2,
      paceMode: "standard",
      todayIso: "2026-11-24",
    });
    expect(active.perWeek).toBe(1);
    expect(active.etaIso).toBe("2027-02-02");
    expect(active.scenarios.standard).toBe("2027-02-02");
    expect(active.scenarios.intensive! < active.scenarios.standard!).toBe(true);
    expect(active.scenarios.calm! > active.scenarios.standard!).toBe(true);
  });
});
