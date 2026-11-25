// src/services/recitationJudgeService.ts
// تنظیمات داور تلاوت (پنل آزمایش) و دفتر ثبت ساخت‌یافتهٔ تلاش‌های تلاوت — روی جدول meta
import {
  DEFAULT_JUDGE_PROFILE,
  JUDGE_PROFILES,
  resolveJudgeParams,
  type JudgeParams,
  type JudgeProfileName,
  type RecitationAttemptOutcome,
  type WordAlignState,
} from "../learning/recitationAlign";
import { getMeta, setMeta } from "./metaStore";

export const META_RECITATION_JUDGE_SETTINGS = "recitationJudgeSettings";
export const META_RECITATION_ATTEMPT_LOG = "recitationAttemptLog";
export const MAX_ATTEMPT_LOG_ENTRIES = 200;

export interface RecitationJudgeSettings {
  profile: JudgeProfileName;
  /** اگر true باشد، پارامترهای دستی (custom) به‌جای بستهٔ پروفایل اعمال می‌شوند */
  useCustom: boolean;
  custom: JudgeParams;
  /** در تست: نادیده‌گرفتن کالیبراسیون شخصی (مصونیت «درست خواندم») */
  bypassCalibration: boolean;
}

export function defaultJudgeSettings(): RecitationJudgeSettings {
  return {
    profile: DEFAULT_JUDGE_PROFILE,
    useCustom: false,
    custom: { ...JUDGE_PROFILES[DEFAULT_JUDGE_PROFILE] },
    bypassCalibration: false,
  };
}

export async function loadJudgeSettings(): Promise<RecitationJudgeSettings> {
  const saved = await getMeta<Partial<RecitationJudgeSettings> | null>(
    META_RECITATION_JUDGE_SETTINGS,
    null,
  );
  const base = defaultJudgeSettings();
  if (!saved) return base;
  return {
    profile: saved.profile && saved.profile in JUDGE_PROFILES ? saved.profile : base.profile,
    useCustom: Boolean(saved.useCustom),
    custom: { ...base.custom, ...(saved.custom ?? {}) },
    bypassCalibration: Boolean(saved.bypassCalibration),
  };
}

export async function saveJudgeSettings(settings: RecitationJudgeSettings): Promise<void> {
  await setMeta(META_RECITATION_JUDGE_SETTINGS, settings);
}

/** پارامترهای مؤثر داور بر اساس تنظیمات فعلی */
export function effectiveJudgeParams(settings: RecitationJudgeSettings): JudgeParams {
  return settings.useCustom
    ? { ...settings.custom }
    : resolveJudgeParams(settings.profile);
}

export interface RecitationAttemptWordLog {
  ref: string;
  state: WordAlignState;
  heard?: string;
  sim?: number;
  reason?: string;
  userConfirmed?: boolean;
}

export interface RecitationAttemptLog {
  at: number;
  verse: number;
  segmentIndex: number;
  outcome: RecitationAttemptOutcome;
  coverage: number;
  heardRatio: number;
  matched: number;
  substituted: number;
  missed: number;
  uncertain: number;
  extraWords: number;
  transcript: string;
  profile: JudgeProfileName | "custom";
  bypassCalibration: boolean;
  words: RecitationAttemptWordLog[];
}

export async function loadAttemptLog(): Promise<RecitationAttemptLog[]> {
  const saved = await getMeta<RecitationAttemptLog[] | null>(META_RECITATION_ATTEMPT_LOG, null);
  return Array.isArray(saved) ? saved : [];
}

export async function appendAttemptLog(entry: RecitationAttemptLog): Promise<void> {
  const current = await loadAttemptLog();
  const next = [...current, entry].slice(-MAX_ATTEMPT_LOG_ENTRIES);
  await setMeta(META_RECITATION_ATTEMPT_LOG, next);
}

export async function clearAttemptLog(): Promise<void> {
  await setMeta(META_RECITATION_ATTEMPT_LOG, []);
}

/** خروجی متنی (JSON) از دفتر تلاش‌ها برای ارسال و تحلیل کالیبراسیون */
export async function exportAttemptLogJson(): Promise<string> {
  const [settings, log] = await Promise.all([loadJudgeSettings(), loadAttemptLog()]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      settings,
      effectiveParams: effectiveJudgeParams(settings),
      attempts: log,
    },
    null,
    2,
  );
}
