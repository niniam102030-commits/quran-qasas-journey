import { describe, it, expect } from "vitest";
import { buildReviewHeatmap } from "../heatmap";

describe("heatmap.buildReviewHeatmap", () => {
  it("builds 84-day grid with streaks and intensity levels", () => {
    const now = new Date(2026, 10, 24, 12, 0, 0); // 2026-11-24
    const dayMs = 24 * 60 * 60 * 1000;
    const attempts = [
      // Today: 10 attempts (level 2)
      ...Array.from({ length: 10 }, (_, i) => ({ at: now.getTime() - i * 1000, correct: i < 8 })),
      // Yesterday: 3 attempts (level 1)
      ...Array.from({ length: 3 }, (_, i) => ({ at: now.getTime() - dayMs - i * 1000, correct: true })),
      // 4 days ago: 35 attempts (level 4)
      ...Array.from({ length: 35 }, (_, i) => ({ at: now.getTime() - 4 * dayMs - i * 1000, correct: true })),
    ];

    const summary = buildReviewHeatmap(attempts, 84, now);
    expect(summary.cells).toHaveLength(84);
    expect(summary.activeDays).toBe(3);
    expect(summary.totalAttempts).toBe(48);
    expect(summary.currentStreak).toBe(2);
    expect(summary.longestStreak).toBe(2);

    const today = summary.cells[summary.cells.length - 1];
    expect(today.count).toBe(10);
    expect(today.accuracy).toBe(80);
    expect(today.level).toBe(2);
  });
});
