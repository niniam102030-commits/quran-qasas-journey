import { describe, it, expect } from "vitest";
import { buildReviewForecast, findNearGoldenVerses } from "../forecast";
import type { StoredCard } from "../cardScheduler";

function makeCard(key: string, overrides: Partial<StoredCard> = {}): StoredCard {
  return {
    key,
    kind: key.split(":")[0] as StoredCard["kind"],
    due: new Date().toISOString(),
    stability: 10,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 3,
    lapses: 0,
    state: 2,
    lastReview: new Date().toISOString(),
    streak: 3,
    ...overrides,
  };
}

describe("forecast", () => {
  it("buckets overdue and upcoming due cards across 7 days", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    const cards: StoredCard[] = [
      makeCard("vr:1", { due: "2026-11-20T10:00:00Z", state: 2 }), // overdue -> day 0
      makeCard("vr:2", { due: "2026-11-22T11:00:00Z", state: 2 }), // due today -> day 0
      makeCard("vr:3", { due: "2026-11-23T15:00:00Z", state: 2 }), // tomorrow -> day 1
      makeCard("vr:4", { due: "2026-11-25T15:00:00Z", state: 2 }), // +3 days -> day 3
      makeCard("vr:5", { due: "2026-11-22T08:00:00Z", state: 0 }), // New (ignored)
    ];

    const out = buildReviewForecast(cards, now);
    expect(out).toHaveLength(7);
    expect(out[0].dueCount).toBe(2);
    expect(out[1].dueCount).toBe(1);
    expect(out[3].dueCount).toBe(1);
  });

  it("identifies near-golden verses (2 or 3 of 4 skills at level 3) and excludes already golden ones", () => {
    const map = new Map<string, StoredCard>([
      // Verse 1: all 4 at level 3 -> golden (excluded)
      ["vr:1", makeCard("vr:1")],
      ["vt:1", makeCard("vt:1")],
      ["vn:1", makeCard("vn:1")],
      ["sq:1", makeCard("sq:1")],
      // Verse 2: 3 at level 3 -> near-golden
      ["vr:2", makeCard("vr:2")],
      ["vt:2", makeCard("vt:2")],
      ["vn:2", makeCard("vn:2")],
      // Verse 3: 2 at level 3 -> near-golden
      ["vr:3", makeCard("vr:3")],
      ["vt:3", makeCard("vt:3")],
    ]);

    const near = findNearGoldenVerses(map);
    expect(near.map((x) => x.verse)).toEqual([2, 3]);
    expect(near[0].level3Count).toBe(3);
    expect(near[0].missingSkills).toEqual(["sq"]);
  });
});
