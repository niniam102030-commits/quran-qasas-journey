// src/learning/muraja.ts
// منطق خالص چرخهٔ مراجعهٔ کلاسیک: سبق (۷ روز اخیر)، سبقی (۸ تا ۳۰ روز پیش)، منزل (سطل‌های چرخشی ۷تایی) — L2
import { getLocalDateIso } from "../services/profileService";

export interface MurajaUnitInput {
  unitId: string;
  order: number;
  /** زمان پاس‌شدن مرحله ۸ (تقریب از unitProgress.updatedAt واحدهایی که stagePassed[8] دارند) */
  stage8PassedAt: number | null;
}

export interface MurajaPlan {
  sabq: string[];
  sabqi: string[];
  manzil: string[];
  manzilBucket: number;
  bucketCount: number;
}

function localDayDiff(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400_000);
}

function localDayOfYear(d: Date): number {
  const startUtc = Date.UTC(d.getFullYear(), 0, 1);
  const curUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((curUtc - startUtc) / 86400_000);
}

export function planMuraja(units: MurajaUnitInput[], today: Date): MurajaPlan {
  const sorted = units.slice().sort((a, b) => a.order - b.order);
  const passed = sorted.filter((u) => u.stage8PassedAt !== null);
  const todayIso = getLocalDateIso(today);

  const sabq: string[] = [];
  const sabqi: string[] = [];

  for (const u of passed) {
    const passedIso = getLocalDateIso(new Date(u.stage8PassedAt!));
    const daysAgo = localDayDiff(passedIso, todayIso);
    if (daysAgo >= 0 && daysAgo <= 7) {
      sabq.push(u.unitId);
    } else if (daysAgo >= 8 && daysAgo <= 30) {
      sabqi.push(u.unitId);
    }
  }

  if (passed.length < 3) {
    return {
      sabq,
      sabqi,
      manzil: [],
      manzilBucket: 0,
      bucketCount: 0,
    };
  }

  const bucketCount = Math.min(7, passed.length);
  const buckets: string[][] = Array.from({ length: bucketCount }, () => []);
  passed.forEach((u, i) => {
    buckets[i % bucketCount].push(u.unitId);
  });

  const doy = localDayOfYear(today);
  const manzilBucket = ((doy % bucketCount) + bucketCount) % bucketCount;

  return {
    sabq,
    sabqi,
    manzil: buckets[manzilBucket],
    manzilBucket,
    bucketCount,
  };
}
