import { describe, expect, it } from "vitest";
import { bestReminderHour } from "../reminderService";

describe("bestReminderHour (U3)", () => {
  const baseNow = new Date(2026, 10, 24, 12, 0, 0).getTime();

  function atHour(daysAgo: number, hour: number): { at: number } {
    const d = new Date(2026, 10, 24 - daysAgo, hour, 15, 0);
    return { at: d.getTime() };
  }

  it("returns 20 when there are fewer than 10 recent attempts", () => {
    expect(bestReminderHour([], baseNow)).toBe(20);
    const nine = Array.from({ length: 9 }, () => atHour(1, 8));
    expect(bestReminderHour(nine, baseNow)).toBe(20);
  });

  it("picks the most frequent local hour within the last 30 days and ignores older ones", () => {
    const list = [
      ...Array.from({ length: 7 }, () => atHour(2, 18)),
      ...Array.from({ length: 5 }, () => atHour(3, 9)),
      // 15 attempts older than 30 days at hour 6 (must be ignored)
      ...Array.from({ length: 15 }, () => atHour(35, 6)),
    ];
    expect(bestReminderHour(list, baseNow)).toBe(18);
  });

  it("breaks ties in favor of the earlier hour", () => {
    const tied = [
      ...Array.from({ length: 6 }, () => atHour(1, 21)),
      ...Array.from({ length: 6 }, () => atHour(2, 7)),
    ];
    expect(bestReminderHour(tied, baseNow)).toBe(7);
  });
});
