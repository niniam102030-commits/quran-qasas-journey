import { describe, expect, it } from "vitest";
import { newCard, ratingFor, review, kindOfKey, reviewDebt } from "../cardScheduler";
import { stagePassed, canUnlockNext } from "../mastery";
import { planStage, requeue, type PlannerQuestion } from "../sessionPlanner";

const q = (i: number, type = "t" + (i % 3), difficulty = 1 + (i % 3)): PlannerQuestion => ({
  id: "q" + i, unitId: "u_p385a", stage: 3, difficulty, type, targets: ["vr:" + (1 + (i % 4))],
});

describe("ratingFor", () => {
  it("غلط → again", () => expect(ratingFor({ correct: false, usedHint: false, responseMs: 1000 })).toBe("again"));
  it("راهنما → hard", () => expect(ratingFor({ correct: true, usedHint: true, responseMs: 1000 })).toBe("hard"));
  it("کند → hard", () => expect(ratingFor({ correct: true, usedHint: false, responseMs: 20000, medianMs: 5000 })).toBe("hard"));
  it("سریع → easy", () => expect(ratingFor({ correct: true, usedHint: false, responseMs: 1000, medianMs: 5000 })).toBe("easy"));
  it("معمولی → good", () => expect(ratingFor({ correct: true, usedHint: false, responseMs: 5000, medianMs: 5000 })).toBe("good"));
});

describe("cardScheduler", () => {
  it("kindOfKey", () => {
    expect(kindOfKey("sq:5")).toBe("sq");
    expect(() => kindOfKey("x:1")).toThrow();
  });
  it("سقف فاصله ۱۲۰ روز", () => {
    let c = newCard("vr:1", new Date("2026-01-01"));
    let now = new Date("2026-01-01");
    for (let i = 0; i < 25; i++) {
      c = review(c, "easy", now);
      now = new Date(c.due);
    }
    expect(c.scheduledDays).toBeLessThanOrEqual(120);
  });
  it("غلط streak را صفر می‌کند", () => {
    let c = newCard("w:w28_001_001");
    c = review(c, "good");
    expect(c.streak).toBe(1);
    c = review(c, "again");
    expect(c.streak).toBe(0);
  });
  it("reviewDebt کارت جدید را نمی‌شمارد", () => {
    expect(reviewDebt([newCard("vr:1", new Date("2020-01-01"))])).toBe(0);
  });
});

describe("mastery", () => {
  it("پاس مرحله: ≥۸۵٪ و دو درست آخر", () => {
    const ok = Array.from({ length: 10 }, () => ({ stage: 3, correct: true, usedHint: false }));
    expect(stagePassed(ok, 3)).toBe(true);
    const bad = ok.slice(0, 8).concat([{ stage: 3, correct: false, usedHint: false }, { stage: 3, correct: true, usedHint: false }]);
    expect(stagePassed(bad, 3)).toBe(false);
  });
  it("مرحله ۸ با راهنما پاس نمی‌شود", () => {
    const a = Array.from({ length: 10 }, () => ({ stage: 8, correct: true, usedHint: true }));
    expect(stagePassed(a, 8)).toBe(false);
  });
  it("گشایش با بدهی", () => {
    expect(canUnlockNext(true, 39)).toBe(true);
    expect(canUnlockNext(true, 40)).toBe(false);
  });
});

describe("sessionPlanner", () => {
  const pool = Array.from({ length: 30 }, (_, i) => q(i));
  const rev = Array.from({ length: 10 }, (_, i) => ({ ...q(100 + i), unitId: "u_p384b", stage: 8 }));
  it("اندازه و سهم مرور", () => {
    const plan = planStage(pool, rev, new Map(), { size: 20, seed: 7 });
    expect(plan.length).toBe(20);
    expect(plan.filter((x) => x.unitId === "u_p384b").length).toBe(4);
  });
  it("قطعی با seed یکسان", () => {
    const a = planStage(pool, rev, new Map(), { seed: 3 }).map((x) => x.id);
    const b = planStage(pool, rev, new Map(), { seed: 3 }).map((x) => x.id);
    expect(a).toEqual(b);
  });
  it("requeue پس از ۳ و ۷", () => {
    const base = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
    expect(requeue(base, 0, "X", 1).indexOf("X")).toBe(4);
    expect(requeue(base, 0, "X", 2).indexOf("X")).toBe(8);
  });
});
