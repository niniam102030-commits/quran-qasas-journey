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
