import { describe, expect, it } from "vitest";
import { isDue, type StoredCard } from "../cardScheduler";
import {
  planTasmiCards,
  TASMI_CLEAN_RECALL_DAYS,
  TASMI_CLEAN_SUPPORT_DAYS,
} from "../tasmi";

describe("planTasmiCards (F2)", () => {
  it("criterion 6: 2 slipped verses get vr due today; clean verses get 17d (vr/sq) and 7d (vt/vn)", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const verses = [1, 2, 3, 4, 5];
    const slipped = new Set([2, 4]);

    const cards = planTasmiCards({
      verses,
      slippedVerses: slipped,
      existingCards: new Map(),
      unitId: "u_p385b",
      now,
    });

    const byKey = new Map(cards.map((c) => [c.key, c]));

    // Only slipped verses get vr due today
    for (const v of [2, 4]) {
      const vr = byKey.get(`vr:${v}`);
      expect(vr).toBeDefined();
      expect(isDue(vr!, now)).toBe(true);
      expect(vr!.streak).toBe(0);
      // Slipped verses do not receive clean seeded cards
      expect(byKey.get(`sq:${v}`)).toBeUndefined();
      expect(byKey.get(`vt:${v}`)).toBeUndefined();
      expect(byKey.get(`vn:${v}`)).toBeUndefined();
    }

    // Clean verses get 17d for vr/sq and 7d for vt/vn
    for (const v of [1, 3, 5]) {
      expect(byKey.get(`vr:${v}`)?.scheduledDays).toBe(TASMI_CLEAN_RECALL_DAYS);
      expect(byKey.get(`sq:${v}`)?.scheduledDays).toBe(TASMI_CLEAN_RECALL_DAYS);
      expect(byKey.get(`vt:${v}`)?.scheduledDays).toBe(TASMI_CLEAN_SUPPORT_DAYS);
      expect(byKey.get(`vn:${v}`)?.scheduledDays).toBe(TASMI_CLEAN_SUPPORT_DAYS);
      expect(isDue(byKey.get(`vr:${v}`)!, now)).toBe(false);
    }

    // No pg seed when there are slipped verses
    expect(byKey.get("pg:u_p385b")).toBeUndefined();
  });

  it("seeds pg:<unitId> when 0 verses slipped", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const cards = planTasmiCards({
      verses: [1, 2],
      slippedVerses: new Set(),
      existingCards: new Map(),
      unitId: "u_p385b",
      now,
    });
    expect(cards.find((c) => c.key === "pg:u_p385b")?.scheduledDays).toBe(TASMI_CLEAN_RECALL_DAYS);
  });

  it("never fabricates lapses on slipped cards and never overwrites existing Learning/Review cards with real FSRS history", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const existingSlipped = {
      key: "vr:2",
      kind: "vr" as const,
      due: "2026-05-20T10:00:00.000Z",
      stability: 12,
      difficulty: 5,
      elapsedDays: 3,
      scheduledDays: 15,
      reps: 4,
      lapses: 0,
      state: 2 as const,
      lastReview: "2026-04-28T10:00:00.000Z",
      streak: 4,
    };
    const existingLearning = {
      key: "vr:1",
      kind: "vr" as const,
      due: "2026-05-02T10:00:00.000Z",
      stability: 1.5,
      difficulty: 6,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      state: 1 as const,
      lastReview: "2026-05-01T08:00:00.000Z",
      streak: 1,
    };
    const cards = planTasmiCards({
      verses: [1, 2],
      slippedVerses: new Set([2]),
      existingCards: new Map<string, StoredCard>([
        ["vr:1", existingLearning],
        ["vr:2", existingSlipped],
      ]),
      now,
    });
    // Existing Learning card on clean verse 1 must NOT be overwritten
    expect(cards.find((c) => c.key === "vr:1")).toBeUndefined();
    // Slipped verse 2 gets due = now ONLY; lapses/reps/stability remain untouched
    const slippedOut = cards.find((c) => c.key === "vr:2")!;
    expect(slippedOut.due).toBe(now.toISOString());
    expect(slippedOut.lapses).toBe(0);
    expect(slippedOut.reps).toBe(4);
    expect(slippedOut.stability).toBe(12);
  });
});
