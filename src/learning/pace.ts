// src/learning/pace.ts
// حالت‌های سرعت یادگیری، سقف مرور روزانه و تحلیل بار ۷ روز آینده — منطق خالص.
import type { ForecastDay } from "./forecast";

export type PaceMode = "calm" | "standard" | "intensive";

export interface PaceConfig {
  id: PaceMode;
  labelFa: string;
  descriptionFa: string;
  dailyReviewCap: number;
}

export const PACE_MODES: Record<PaceMode, PaceConfig> = {
  calm: {
    id: "calm",
    labelFa: "آرام",
    descriptionFa: "سقف ۱۰ سؤال مرور روزانه — سبک و بدون فشار",
    dailyReviewCap: 10,
  },
  standard: {
    id: "standard",
    labelFa: "استاندارد",
    descriptionFa: "سقف ۲۰ سؤال مرور روزانه — تعادل بین پیشروی و تثبیت",
    dailyReviewCap: 20,
  },
  intensive: {
    id: "intensive",
    labelFa: "فشرده",
    descriptionFa: "سقف ۴۰ سؤال مرور روزانه — برای پیشروی سریع",
    dailyReviewCap: 40,
  },
};

export const PACE_MODE_LIST: PaceConfig[] = [
  PACE_MODES.calm,
  PACE_MODES.standard,
  PACE_MODES.intensive,
];

export function isPaceMode(value: unknown): value is PaceMode {
  return value === "calm" || value === "standard" || value === "intensive";
}

export function dailyReviewCapFor(mode: PaceMode): number {
  return (PACE_MODES[mode] ?? PACE_MODES.standard).dailyReviewCap;
}

export interface ForecastLoadSummary {
  total7Days: number;
  peakDay: ForecastDay | null;
  overCapDays: number;
  cap: number;
}

export function summarizeForecastLoad(
  days: ForecastDay[],
  mode: PaceMode,
): ForecastLoadSummary {
  const cap = dailyReviewCapFor(mode);
  let total7Days = 0;
  let overCapDays = 0;
  let peakDay: ForecastDay | null = null;

  for (const d of days) {
    total7Days += d.dueCount;
    if (d.dueCount > cap) overCapDays++;
    if (!peakDay || d.dueCount > peakDay.dueCount) {
      peakDay = d;
    }
  }

  return { total7Days, peakDay, overCapDays, cap };
}

function addDaysUtcIso(todayIso: string, daysToAdd: number): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d) + daysToAdd * 86400_000);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * پیش‌بینی تاریخ پایان سوره (U4) بر اساس نرخ پیشروی ۱۴ روز اخیر و حالت سرعت انتخاب‌شده
 */
export function estimateCompletion(input: {
  completedUnits: number;
  totalUnits: number;
  unitsCompletedLast14Days: number;
  paceMode: PaceMode;
  todayIso: string;
  /** سهم حجم کار مسیر انتخابی از مسیر کامل (مورد ۱۷)؛ پیش‌فرض ۱ */
  workRatio?: number;
}): { etaIso: string | null; perWeek: number; scenarios: Record<PaceMode, string | null> } {
  const basePerWeek = input.unitsCompletedLast14Days / 2;
  if (basePerWeek <= 0) {
    return {
      etaIso: null,
      perWeek: 0,
      scenarios: { calm: null, standard: null, intensive: null },
    };
  }

  const remaining = Math.max(0, input.totalUnits - input.completedUnits) * (input.workRatio ?? 1);
  const baseDays = Math.ceil((remaining / basePerWeek) * 7);
  const etaIso = addDaysUtcIso(input.todayIso, baseDays);
  const currentCap = dailyReviewCapFor(input.paceMode);

  const scenarios = {} as Record<PaceMode, string | null>;
  for (const mode of ["calm", "standard", "intensive"] as const) {
    if (mode === input.paceMode) {
      scenarios[mode] = etaIso;
    } else {
      const rate = basePerWeek * (dailyReviewCapFor(mode) / currentCap);
      const days = Math.ceil((remaining / rate) * 7);
      scenarios[mode] = addDaysUtcIso(input.todayIso, days);
    }
  }

  return {
    etaIso,
    perWeek: basePerWeek,
    scenarios,
  };
}
