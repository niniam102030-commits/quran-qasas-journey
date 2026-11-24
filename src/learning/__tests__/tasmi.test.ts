import { describe, expect, it } from "vitest";
import { isDue } from "../cardScheduler";
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
});
