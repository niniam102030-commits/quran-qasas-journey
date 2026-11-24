import { describe, expect, it } from "vitest";
import { newCard, ratingFor, review, kindOfKey, reviewDebt } from "../cardScheduler";
import { stagePassed, canUnlockNext, isFlawlessLesson } from "../mastery";
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
  it("پاس درس: مراحل ۱–۲ ≥۷۵٪، مراحل ۳–۷ ≥۸۰٪ (بدون شرط ۲ سوال آخر)", () => {
    const ok8 = Array.from({ length: 8 }, () => ({ stage: 3, correct: true, usedHint: false }))
      .concat([
        { stage: 3, correct: false, usedHint: false },
        { stage: 3, correct: false, usedHint: false },
      ]);
    expect(stagePassed(ok8, 3)).toBe(true); // 80% even if last 2 are wrong

    const bad7 = Array.from({ length: 7 }, () => ({ stage: 3, correct: true, usedHint: false }))
      .concat(Array.from({ length: 3 }, () => ({ stage: 3, correct: false, usedHint: false })));
    expect(stagePassed(bad7, 3)).toBe(false); // 70% < 80%

    const introOk = Array.from({ length: 8 }, (_, i) => ({ stage: 1, correct: i < 6, usedHint: false }));
    expect(stagePassed(introOk, 1)).toBe(true); // 75% passes stage 1
  });
  it("مرحله ۸ با راهنما پاس نمی‌شود", () => {
    const a = Array.from({ length: 10 }, () => ({ stage: 8, correct: true, usedHint: true }));
    expect(stagePassed(a, 8)).toBe(false);
  });
  it("گشایش با بدهی", () => {
    expect(canUnlockNext(true, 39)).toBe(true);
    expect(canUnlockNext(true, 40)).toBe(false);
  });
  it("isFlawlessLesson: ۱۰/۱۰ بدون راهنما و بدون برگشتی ⇒ true", () => {
    const perfect = Array.from({ length: 10 }, () => ({ stage: 3, correct: true, usedHint: false }));
    expect(isFlawlessLesson(perfect, { anyHint: false, anyRequeue: false })).toBe(true);
  });
  it("isFlawlessLesson: ۹/۱۰ ⇒ false", () => {
    const nineOfTen = Array.from({ length: 9 }, () => ({ stage: 3, correct: true, usedHint: false }))
      .concat([{ stage: 3, correct: false, usedHint: false }]);
    expect(isFlawlessLesson(nineOfTen, { anyHint: false, anyRequeue: false })).toBe(false);
  });
  it("isFlawlessLesson: ۱۰/۱۰ با یک راهنما ⇒ false", () => {
    const withHint = Array.from({ length: 10 }, (_, i) => ({ stage: 3, correct: true, usedHint: i === 0 }));
    expect(isFlawlessLesson(withHint, { anyHint: true, anyRequeue: false })).toBe(false);
    expect(isFlawlessLesson(withHint, { anyHint: false, anyRequeue: false })).toBe(false);
  });
  it("isFlawlessLesson: ۱۰/۱۰ با یک سؤال برگشتی ⇒ false", () => {
    const perfectAttempts = Array.from({ length: 10 }, () => ({ stage: 3, correct: true, usedHint: false }));
    expect(isFlawlessLesson(perfectAttempts, { anyHint: false, anyRequeue: true })).toBe(false);
  });
  it("isFlawlessLesson: کمتر از ۸ تلاش ⇒ false", () => {
    const seven = Array.from({ length: 7 }, () => ({ stage: 3, correct: true, usedHint: false }));
    expect(isFlawlessLesson(seven, { anyHint: false, anyRequeue: false })).toBe(false);
  });
});

describe("sessionPlanner", () => {
  const pool = Array.from({ length: 30 }, (_, i) => q(i));
  const rev = Array.from({ length: 10 }, (_, i) => ({ ...q(100 + i), unitId: "u_p384b", stage: 8 }));
  it("empty question pool returns an empty plan", () => {
    expect(planStage([], [], new Map(), { size: 20 })).toEqual([]);
  });
  it("اندازه و سهم مرور", () => {
    const plan = planStage(pool, rev, new Map(), { size: 20, seed: 7 });
    expect(plan.length).toBe(20);
    expect(plan.filter((x) => x.unitId === "u_p384b").length).toBe(4);
  });
  it("recent questions are avoided but used as fallback for a tiny pool", () => {
    const tiny = [q(1), q(2), q(3), q(4)];
    const allRecent = new Set(tiny.map((item) => item.id));
    const plan = planStage(tiny, [], new Map(), { size: 20, recentIds: allRecent, seed: 11 });
    expect(plan).toHaveLength(4);
    expect(new Set(plan.map((item) => item.id))).toEqual(allRecent);
  });
  it("prefers unseen questions when a tiny pool contains both", () => {
    const tiny = [q(1), q(2), q(3), q(4)];
    const recent = new Set([tiny[0].id, tiny[1].id, tiny[2].id]);
    const plan = planStage(tiny, [], new Map(), { size: 20, recentIds: recent, seed: 11 });
    expect(plan.map((item) => item.id)).toEqual([tiny[3].id]);
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
