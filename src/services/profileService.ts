// src/services/profileService.ts
// مدیریت یکپارچه پروفایل کاربر در QasasLearningDB: چله انس (Streak)، امتیاز نور (XP)، عقیق و سپر محافظ چله
import { ldb, DEFAULT_USER_PROFILE, type UserProfileRow } from "../db/learningDb";
import { getMeta, setMeta } from "./metaStore";

export const SHIELD_COST_GEMS = 30;
const MAX_GEM_LEDGER = 100;

export interface GemLedgerEntry {
  at: number;
  amount: number;
  reason: string;
}

export function getLocalDateIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayDiff(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

function stageForStreak(days: number): 7 | 14 | 40 {
  if (days >= 14) return 40;
  if (days >= 7) return 14;
  return 7;
}

export async function getUserProfile(): Promise<UserProfileRow> {
  const existing = await ldb.profile.get("main");
  if (existing) return existing;
  const fresh: UserProfileRow = {
    ...DEFAULT_USER_PROFILE,
    chillehShieldActive:
      typeof window !== "undefined" && localStorage.getItem("quran_journey_chilleh_shield_v1") === "true",
    updatedAt: Date.now(),
  };
  await ldb.profile.put(fresh);
  return fresh;
}

/**
 * ثبت فعالیت روزانه چله انس + افزودن XP و عقیق پس از هر جلسه یادگیری یا ثبت دستی
 */
export async function recordLearningReward(opts: {
  xpDelta?: number;
  gemsDelta?: number;
  markDailyActivity?: boolean;
  now?: Date;
}): Promise<UserProfileRow> {
  const profile = await getUserProfile();
  const today = getLocalDateIso(opts.now);
  const next: UserProfileRow = {
    ...profile,
    noorXp: profile.noorXp + (opts.xpDelta ?? 0),
    aqeeqGems: profile.aqeeqGems + (opts.gemsDelta ?? 0),
    updatedAt: Date.now(),
  };

  if (opts.markDailyActivity !== false) {
    if (profile.lastActivityDate === null) {
      next.chillehCurrentDays = 1;
    } else {
      const diff = dayDiff(profile.lastActivityDate, today);
      if (diff === 0) {
        // امروز قبلاً ثبت شده
      } else if (diff === 1) {
        next.chillehCurrentDays = profile.chillehCurrentDays + 1;
      } else if (diff === 2 && profile.chillehShieldActive) {
        // یک روز غیبت با سپر محافظ عقیق پوشش داده شد
        next.chillehCurrentDays = profile.chillehCurrentDays + 1;
        next.chillehShieldActive = false;
      } else if (diff > 1) {
        next.chillehCurrentDays = 1;
      }
    }
    next.lastActivityDate = today;
    next.chillehBestDays = Math.max(profile.chillehBestDays, next.chillehCurrentDays);
    next.chillehStage = stageForStreak(next.chillehCurrentDays);
  }

  await ldb.profile.put(next);
  return next;
}

export async function spendGems(
  amount: number,
  reason: string,
): Promise<{ ok: boolean; message: string; profile: UserProfileRow }> {
  const profile = await getUserProfile();
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      message: "مقدار عقیق باید عددی بزرگ‌تر از صفر باشد.",
      profile,
    };
  }
  if (profile.aqeeqGems < amount) {
    return {
      ok: false,
      message: `موجودی عقیق کافی نیست (نیاز: ${amount}، موجودی فعلی: ${profile.aqeeqGems} عقیق).`,
      profile,
    };
  }
  const now = Date.now();
  const updated: UserProfileRow = {
    ...profile,
    aqeeqGems: profile.aqeeqGems - amount,
    updatedAt: now,
  };
  await ldb.profile.put(updated);

  const ledger = await getMeta<GemLedgerEntry[]>("gemLedger", []);
  const nextLedger = [...ledger, { at: now, amount: -amount, reason }].slice(-MAX_GEM_LEDGER);
  await setMeta("gemLedger", nextLedger);

  return {
    ok: true,
    message: `${amount} عقیق با موفقیت کسر شد.`,
    profile: updated,
  };
}

export async function buyChillehShield(): Promise<{ ok: boolean; message: string; profile: UserProfileRow }> {
  const profile = await getUserProfile();
  if (profile.chillehShieldActive) {
    return {
      ok: false,
      message: "سپر محافظ چله شما هم‌اکنون فعال است و از روزشمار شما محافظت می‌کند.",
      profile,
    };
  }
  if (profile.aqeeqGems < SHIELD_COST_GEMS) {
    return {
      ok: false,
      message: `برای فعال‌سازی محافظ چله به ${SHIELD_COST_GEMS} عقیق نیاز دارید (موجودی فعلی: ${profile.aqeeqGems} عقیق).`,
      profile,
    };
  }
  const spent = await spendGems(SHIELD_COST_GEMS, "shield");
  if (!spent.ok) {
    return spent;
  }
  const updated: UserProfileRow = {
    ...spent.profile,
    chillehShieldActive: true,
    updatedAt: Date.now(),
  };
  await ldb.profile.put(updated);
  return {
    ok: true,
    message: "🛡️ محافظ چله با موفقیت فعال شد! در صورت یک روز غیبت، چله شما نخواهد شکست.",
    profile: updated,
  };
}
