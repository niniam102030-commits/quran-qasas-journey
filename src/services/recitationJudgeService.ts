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
import { APP_VERSION } from "../appVersion";
import { getMeta, setMeta } from "./metaStore";

export const META_RECITATION_JUDGE_SETTINGS = "recitationJudgeSettings";
export const META_RECITATION_ATTEMPT_LOG = "recitationAttemptLog";
export const META_RECITATION_EVENT_LOG = "recitationEventLog";
export const MAX_ATTEMPT_LOG_ENTRIES = 2000;
export const MAX_EVENT_LOG_ENTRIES = 500;

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
  /** موتور تشخیص گفتار این تلاش (دادهٔ میدانی کالیبراسیون) */
  engine?: "sherpa" | "weblive";
  /** آیا تلاش از مسیر دیکود تکه‌ای (مکث وقفی) آمده است؟ */
  chunked?: boolean;
  /** زمان دیکود این تکه (میلی‌ثانیه) — فقط مسیر sherpa */
  decodeMs?: number;
  words: RecitationAttemptWordLog[];
}

/** رویدادهای پیرامونی مدل/داور برای دادهٔ میدانی: نصب و خطای مدل، خطای ASR، دیکود خالی، اصلاح با لمس */
export interface RecitationEventLog {
  at: number;
  kind:
    | "model_installed"
    | "model_deleted"
    | "model_error"
    | "asr_error"
    | "asr_empty_decode"
    | "asr_decode_error"
    | "tap_correct";
  detail?: string;
}

export async function loadEventLog(): Promise<RecitationEventLog[]> {
  const saved = await getMeta<RecitationEventLog[] | null>(META_RECITATION_EVENT_LOG, null);
  return Array.isArray(saved) ? saved : [];
}

/** ثبت رویداد؛ هرگز نباید مسیر اصلی کاربر را مختل کند، پس خطاها بلعیده می‌شوند */
export async function appendEventLog(kind: RecitationEventLog["kind"], detail?: string): Promise<void> {
  try {
    const current = await loadEventLog();
    const next = [...current, { at: Date.now(), kind, ...(detail ? { detail } : {}) }].slice(
      -MAX_EVENT_LOG_ENTRIES,
    );
    await setMeta(META_RECITATION_EVENT_LOG, next);
  } catch {
    // ثبت لاگ نباید تجربهٔ کاربر را بشکند
  }
}

export async function clearEventLog(): Promise<void> {
  await setMeta(META_RECITATION_EVENT_LOG, []);
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
  const [settings, log, events] = await Promise.all([
    loadJudgeSettings(),
    loadAttemptLog(),
    loadEventLog(),
  ]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      settings,
      effectiveParams: effectiveJudgeParams(settings),
      attempts: log,
      events,
    },
    null,
    2,
  );
}

export type ShareAttemptLogResult = "shared" | "unsupported";

/**
 * ارسال مستقیم فایل لاگ برای توسعه‌دهنده با پنجرهٔ اشتراک‌گذاری بومی دستگاه.
 * اول فایل JSON امتحان می‌شود؛ اگر دستگاه اشتراک فایل را نپذیرد و حجم متن معقول باشد، متن ارسال می‌شود.
 */
export async function shareAttemptLogJson(): Promise<ShareAttemptLogResult> {
  const json = await exportAttemptLogJson();
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
  };
  if (typeof nav.share !== "function") return "unsupported";
  const file = new File([json], "recitation-judge-log.json", { type: "application/json" });
  if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title: "لاگ داور تلاوت" });
    return "shared";
  }
  if (json.length <= 400_000) {
    await nav.share({ title: "لاگ داور تلاوت", text: json });
    return "shared";
  }
  return "unsupported";
}
