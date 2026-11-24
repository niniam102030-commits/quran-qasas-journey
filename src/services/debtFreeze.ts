// src/services/debtFreeze.ts
// سرویس یخبندان بدهی مرور و خرید اقلام فروشگاه عقیق (G2)
import { ldb, type UserProfileRow } from "../db/learningDb";
import { SHOP_ITEMS } from "../learning/shop";
import { getMeta, setMeta } from "./metaStore";
import { buyChillehShield, recordLearningReward, spendGems } from "./profileService";

const SEVEN_DAYS_MS = 7 * 86400_000;

function endOfDayMs(now: Date): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
}

export async function countEligibleDebtFreezeCards(now: Date = new Date()): Promise<number> {
  const cutoff = endOfDayMs(now);
  const all = await ldb.cards.toArray();
  return all.filter((c) => c.state !== 0 && new Date(c.due).getTime() <= cutoff).length;
}

export async function applyDebtFreeze(now: Date = new Date()): Promise<{ shifted: number }> {
  const lastAt = await getMeta<number | null>("debtFreezeLastAt", null);
  if (lastAt !== null && now.getTime() - lastAt < SEVEN_DAYS_MS) {
    throw new Error("یخبندان بدهی مرور حداکثر یک بار در هر ۷ روز قابل استفاده است.");
  }

  const cutoff = endOfDayMs(now);
  const all = await ldb.cards.toArray();
  const eligible = all.filter((c) => c.state !== 0 && new Date(c.due).getTime() <= cutoff);

  if (eligible.length > 0) {
    const shiftedRows = eligible.map((c) => ({
      ...c,
      due: new Date(new Date(c.due).getTime() + 86400_000).toISOString(),
    }));
    await ldb.cards.bulkPut(shiftedRows);
  }

  await setMeta("debtFreezeLastAt", now.getTime());
  return { shifted: eligible.length };
}

export async function purchaseShopItem(
  itemId: string,
  now: Date = new Date(),
): Promise<{ ok: boolean; message: string; profile?: UserProfileRow; shifted?: number }> {
  const item = SHOP_ITEMS.find((x) => x.id === itemId);
  if (!item) {
    return { ok: false, message: "آیتم مورد نظر در فروشگاه یافت نشد." };
  }

  if (item.kind === "shield") {
    return buyChillehShield();
  }

  if (item.kind === "debtFreeze") {
    const lastAt = await getMeta<number | null>("debtFreezeLastAt", null);
    if (lastAt !== null && now.getTime() - lastAt < SEVEN_DAYS_MS) {
      return {
        ok: false,
        message: "یخبندان بدهی مرور در ۷ روز گذشته استفاده شده است؛ لطفاً بعداً تلاش کنید.",
      };
    }

    const spent = await spendGems(item.price, "debt_freeze");
    if (!spent.ok) {
      return spent;
    }

    try {
      const { shifted } = await applyDebtFreeze(now);
      return {
        ok: true,
        message: `یخبندان بدهی اعمال شد؛ سررسید ${shifted} کارت یک روز به تعویق افتاد.`,
        profile: spent.profile,
        shifted,
      };
    } catch (err) {
      // تراکنش جبرانی در صورت خطا در شیفت کارت‌ها
      const refunded = await recordLearningReward({
        gemsDelta: item.price,
        markDailyActivity: false,
        now,
      });
      return {
        ok: false,
        message: err instanceof Error ? err.message : "خطا در اعمال یخبندان بدهی؛ عقیق شما بازگردانده شد.",
        profile: refunded,
      };
    }
  }

  // اقلام دائمی (theme / sound)
  const owned = await getMeta<string[]>("ownedItems", []);
  if (owned.includes(item.id)) {
    return { ok: false, message: "این آیتم قبلاً خریداری شده است." };
  }

  const spent = await spendGems(item.price, item.id);
  if (!spent.ok) {
    return spent;
  }

  await setMeta("ownedItems", [...owned, item.id]);
  return {
    ok: true,
    message: `«${item.titleFa}» با موفقیت خریداری و به دارایی‌های شما اضافه شد.`,
    profile: spent.profile,
  };
}
