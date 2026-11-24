import { describe, expect, it } from "vitest";
import { planMuraja } from "../muraja";

describe("planMuraja (L2)", () => {
  const today = new Date(2026, 10, 24, 12, 0, 0); // 2026-11-24
  const dayMs = 86400_000;

  it("splits 10 passed units into 7 round-robin buckets (sizes 2,2,2,1,1,1,1) with deterministic daily bucket", () => {
    const units = Array.from({ length: 10 }, (_, i) => ({
      unitId: `u_${i + 1}`,
      order: i + 1,
      stage8PassedAt: today.getTime() - 40 * dayMs,
    }));

    const p1 = planMuraja(units, today);
    const p2 = planMuraja(units, today);
    expect(p1).toEqual(p2);
    expect(p1.bucketCount).toBe(7);

    // Check across 7 consecutive days that all 7 bucket sizes are [2,2,2,1,1,1,1]
    const sizesByBucket = new Map<number, number>();
    for (let d = 0; d < 7; d++) {
      const dt = new Date(2026, 10, 24 + d, 12, 0, 0);
      const plan = planMuraja(units, dt);
      sizesByBucket.set(plan.manzilBucket, plan.manzil.length);
    }
    const orderedSizes = [0, 1, 2, 3, 4, 5, 6].map((b) => sizesByBucket.get(b));
    expect(orderedSizes).toEqual([2, 2, 2, 1, 1, 1, 1]);
  });

  it("enforces exact sabq/sabqi boundaries: day 7 = sabq, day 8 = sabqi, day 31 = neither (manzil only)", () => {
    const units = [
      { unitId: "u_d7", order: 1, stage8PassedAt: today.getTime() - 7 * dayMs },
      { unitId: "u_d8", order: 2, stage8PassedAt: today.getTime() - 8 * dayMs },
      { unitId: "u_d30", order: 3, stage8PassedAt: today.getTime() - 30 * dayMs },
      { unitId: "u_d31", order: 4, stage8PassedAt: today.getTime() - 31 * dayMs },
    ];

    const plan = planMuraja(units, today);
    expect(plan.sabq).toEqual(["u_d7"]);
    expect(plan.sabqi).toEqual(["u_d8", "u_d30"]);
    expect(plan.sabq).not.toContain("u_d31");
    expect(plan.sabqi).not.toContain("u_d31");
    expect(plan.bucketCount).toBe(4);
  });

  it("leaves manzil empty when fewer than 3 units are passed", () => {
    const units = [
      { unitId: "u_1", order: 1, stage8PassedAt: today.getTime() - 2 * dayMs },
      { unitId: "u_2", order: 2, stage8PassedAt: today.getTime() - 10 * dayMs },
    ];
    const plan = planMuraja(units, today);
    expect(plan.manzil).toEqual([]);
    expect(plan.bucketCount).toBe(0);
  });
});
