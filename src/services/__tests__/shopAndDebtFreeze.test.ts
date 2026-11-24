import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ldb } from "../../db/learningDb";
import { newCard, seedKnownCard } from "../../learning/cardScheduler";
import { applyDebtFreeze, purchaseShopItem } from "../debtFreeze";
import { getMeta } from "../metaStore";
import { recordLearningReward, spendGems, type GemLedgerEntry } from "../profileService";

describe("spendGems & shop / debtFreeze (G2)", () => {
  beforeEach(async () => {
    await ldb.delete();
    await ldb.open();
  });

  it("spendGems rejects invalid amounts, rejects insufficient balance, and logs deduction in gemLedger", async () => {
    await recordLearningReward({ gemsDelta: 60, markDailyActivity: false });

    const badAmount = await spendGems(0, "invalid");
    expect(badAmount.ok).toBe(false);
    expect(badAmount.profile.aqeeqGems).toBe(60);

    const insufficient = await spendGems(100, "too_expensive");
    expect(insufficient.ok).toBe(false);
    expect(insufficient.message).toContain("60");
    expect(insufficient.profile.aqeeqGems).toBe(60);

    const okRes = await spendGems(50, "theme_gold");
    expect(okRes.ok).toBe(true);
    expect(okRes.profile.aqeeqGems).toBe(10);

    const ledger = await getMeta<GemLedgerEntry[]>("gemLedger", []);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(-50);
    expect(ledger[0].reason).toBe("theme_gold");
  });

  it("purchaseShopItem buys permanent item once and prevents duplicate purchase", async () => {
    await recordLearningReward({ gemsDelta: 120, markDailyActivity: false });

    const first = await purchaseShopItem("theme_gold");
    expect(first.ok).toBe(true);
    expect(first.profile?.aqeeqGems).toBe(70);

    const second = await purchaseShopItem("theme_gold");
    expect(second.ok).toBe(false);

    const owned = await getMeta<string[]>("ownedItems", []);
    expect(owned).toEqual(["theme_gold"]);
  });

  it("applyDebtFreeze shifts only overdue/today non-New cards by +1 day and enforces 7-day cooldown", async () => {
    const now = new Date("2026-11-24T12:00:00.000Z");
    const yesterday = new Date("2026-11-23T10:00:00.000Z");
    const todayEvening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);
    const future = new Date("2026-11-30T10:00:00.000Z");

    const overdueReview = {
      ...seedKnownCard("vr:1", { now: yesterday, intervalDays: 0 }),
      due: yesterday.toISOString(),
      stability: 12,
      scheduledDays: 5,
    };
    const todayReview = {
      ...seedKnownCard("vr:2", { now, intervalDays: 0 }),
      due: todayEvening.toISOString(),
      stability: 8,
      scheduledDays: 4,
    };
    const futureReview = {
      ...seedKnownCard("vr:3", { now, intervalDays: 6 }),
      due: future.toISOString(),
    };
    const newStateCard = {
      ...newCard("vr:4", yesterday),
      due: yesterday.toISOString(),
      state: 0 as const,
    };

    await ldb.cards.bulkPut([overdueReview, todayReview, futureReview, newStateCard]);

    const res = await applyDebtFreeze(now);
    expect(res.shifted).toBe(2);

    const c1 = (await ldb.cards.get("vr:1"))!;
    const c2 = (await ldb.cards.get("vr:2"))!;
    const c3 = (await ldb.cards.get("vr:3"))!;
    const c4 = (await ldb.cards.get("vr:4"))!;

    expect(new Date(c1.due).getTime() - yesterday.getTime()).toBe(86400_000);
    expect(c1.stability).toBe(12);
    expect(c1.scheduledDays).toBe(5);

    expect(new Date(c2.due).getTime() - todayEvening.getTime()).toBe(86400_000);
    expect(c3.due).toBe(future.toISOString());
    expect(c4.due).toBe(yesterday.toISOString());

    // Second call within 7 days must throw without modifying cards
    await expect(applyDebtFreeze(new Date(now.getTime() + 2 * 86400_000))).rejects.toThrow();
  });
});
