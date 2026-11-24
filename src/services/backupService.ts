// src/services/backupService.ts
// سرویس پشتیبان‌گیری و بازیابی با اعتبارسنجی سخت‌گیرانه اسکیما و پاک‌سازی فیلدها
import {
  ldb,
  DEFAULT_USER_PROFILE,
  type AttemptRow,
  type ConfusionRow,
  type UnitProgressRow,
  type UserProfileRow,
} from "../db/learningDb";
import type { CardKind, StoredCard } from "../learning/cardScheduler";

export const BACKUP_APP_ID = "quran-qasas-journey";
export const BACKUP_SCHEMA_VERSION = 2;
const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const MAX_RECORDS_PER_TABLE = 100_000;
const VALID_CARD_KINDS = new Set<CardKind>(["w", "vr", "vt", "vn", "sq", "pg"]);
const VALID_CHILLEH_STAGES = new Set<7 | 14 | 40>([7, 14, 40]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface ValidatedBackup {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  cards: StoredCard[];
  attempts: AttemptRow[];
  confusions: ConfusionRow[];
  unitProgress: UnitProgressRow[];
  profile: UserProfileRow | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isNonEmptyString(v: unknown, maxLen = 256): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function isValidIsoDate(v: unknown): v is string {
  return typeof v === "string" && v.length <= 64 && !Number.isNaN(Date.parse(v));
}

function validateCard(raw: unknown, idx: number): StoredCard {
  if (!isPlainObject(raw)) {
    throw new Error(`رکورد کارت #${idx + 1} ساختار نامعتبر دارد.`);
  }
  const { key, kind, due, stability, difficulty, elapsedDays, scheduledDays, reps, lapses, state, lastReview, streak } = raw;

  if (!isNonEmptyString(key, 128) || !key.includes(":")) {
    throw new Error(`کلید کارت #${idx + 1} نامعتبر است.`);
  }
  const prefix = key.split(":")[0] as CardKind;
  if (!VALID_CARD_KINDS.has(prefix) || kind !== prefix) {
    throw new Error(`نوع کارت #${idx + 1} با کلید آن مطابقت ندارد.`);
  }
  if (!isValidIsoDate(due)) {
    throw new Error(`تاریخ سررسید کارت #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(stability, 0, 100_000)) {
    throw new Error(`مقدار stability کارت #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(difficulty, 0, 100)) {
    throw new Error(`مقدار difficulty کارت #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(elapsedDays, 0, 100_000) || !isFiniteInRange(scheduledDays, 0, 100_000)) {
    throw new Error(`بازه زمانی کارت #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(reps, 0, 1_000_000) || !Number.isInteger(reps)) {
    throw new Error(`تعداد مرور کارت #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(lapses, 0, 1_000_000) || !Number.isInteger(lapses)) {
    throw new Error(`تعداد خطای کارت #${idx + 1} نامعتبر است.`);
  }
  if (state !== 0 && state !== 1 && state !== 2 && state !== 3) {
    throw new Error(`وضعیت state کارت #${idx + 1} نامعتبر است.`);
  }
  if (lastReview !== null && lastReview !== undefined && !isValidIsoDate(lastReview)) {
    throw new Error(`تاریخ آخرین مرور کارت #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(streak, 0, 1_000_000) || !Number.isInteger(streak)) {
    throw new Error(`مقدار streak کارت #${idx + 1} نامعتبر است.`);
  }

  return {
    key,
    kind: prefix,
    due,
    stability,
    difficulty,
    elapsedDays,
    scheduledDays,
    reps,
    lapses,
    state,
    lastReview: lastReview ?? null,
    streak,
  };
}

function validateAttempt(raw: unknown, idx: number): AttemptRow {
  if (!isPlainObject(raw)) {
    throw new Error(`رکورد تلاش #${idx + 1} ساختار نامعتبر دارد.`);
  }
  const { id, qid, unitId, stage, at, correct, usedHint, responseMs, perTarget, sessionType } = raw;

  if (id !== undefined && (!isFiniteInRange(id, 1, Number.MAX_SAFE_INTEGER) || !Number.isInteger(id))) {
    throw new Error(`شناسه تلاش #${idx + 1} نامعتبر است.`);
  }
  if (!isNonEmptyString(qid, 128) || !isNonEmptyString(unitId, 64)) {
    throw new Error(`شناسه سوال یا واحد در تلاش #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(stage, 0, 20) || !Number.isInteger(stage)) {
    throw new Error(`شماره مرحله در تلاش #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(at, 0, 9_000_000_000_000) || !isFiniteInRange(responseMs, 0, 86_400_000)) {
    throw new Error(`زمان ثبت‌شده در تلاش #${idx + 1} نامعتبر است.`);
  }
  if (typeof correct !== "boolean" || typeof usedHint !== "boolean") {
    throw new Error(`مقادیر منطقی در تلاش #${idx + 1} نامعتبر است.`);
  }
  if (!isNonEmptyString(sessionType, 64)) {
    throw new Error(`نوع جلسه در تلاش #${idx + 1} نامعتبر است.`);
  }
  if (!isPlainObject(perTarget)) {
    throw new Error(`ساختار perTarget در تلاش #${idx + 1} نامعتبر است.`);
  }

  const cleanPerTarget: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(perTarget)) {
    if (FORBIDDEN_KEYS.has(k) || !isNonEmptyString(k, 128) || typeof v !== "boolean") {
      throw new Error(`داده perTarget در تلاش #${idx + 1} نامعتبر است.`);
    }
    cleanPerTarget[k] = v;
  }

  const row: AttemptRow = {
    qid,
    unitId,
    stage,
    at,
    correct,
    usedHint,
    responseMs,
    perTarget: cleanPerTarget,
    sessionType,
  };
  if (typeof id === "number") row.id = id;
  return row;
}

function validateConfusion(raw: unknown, idx: number): ConfusionRow {
  if (!isPlainObject(raw)) {
    throw new Error(`رکورد خطای پرتکرار #${idx + 1} ساختار نامعتبر دارد.`);
  }
  const { id, qid, target, chosenTag, at } = raw;

  if (id !== undefined && (!isFiniteInRange(id, 1, Number.MAX_SAFE_INTEGER) || !Number.isInteger(id))) {
    throw new Error(`شناسه خطای پرتکرار #${idx + 1} نامعتبر است.`);
  }
  if (!isNonEmptyString(qid, 128) || !isNonEmptyString(target, 128)) {
    throw new Error(`فیلدهای خطای پرتکرار #${idx + 1} نامعتبر است.`);
  }
  if (chosenTag !== undefined && !isNonEmptyString(chosenTag, 128)) {
    throw new Error(`برچسب خطای پرتکرار #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(at, 0, 9_000_000_000_000)) {
    throw new Error(`زمان خطای پرتکرار #${idx + 1} نامعتبر است.`);
  }

  const row: ConfusionRow = { qid, target, at };
  if (typeof id === "number") row.id = id;
  if (typeof chosenTag === "string") row.chosenTag = chosenTag;
  return row;
}

function validateUnitProgress(raw: unknown, idx: number): UnitProgressRow {
  if (!isPlainObject(raw)) {
    throw new Error(`رکورد پیشرفت واحد #${idx + 1} ساختار نامعتبر دارد.`);
  }
  const { unitId, unlocked, stagePassed, stageLessons, currentStage, mastered, updatedAt } = raw;

  if (!isNonEmptyString(unitId, 64)) {
    throw new Error(`شناسه واحد در پیشرفت #${idx + 1} نامعتبر است.`);
  }
  if (typeof unlocked !== "boolean" || typeof mastered !== "boolean") {
    throw new Error(`وضعیت قفل/تسلط واحد #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(currentStage, 0, 20) || !Number.isInteger(currentStage)) {
    throw new Error(`مرحله فعلی واحد #${idx + 1} نامعتبر است.`);
  }
  if (!isFiniteInRange(updatedAt, 0, 9_000_000_000_000)) {
    throw new Error(`زمان به‌روزرسانی واحد #${idx + 1} نامعتبر است.`);
  }
  if (!isPlainObject(stagePassed)) {
    throw new Error(`فیلد stagePassed در واحد #${idx + 1} نامعتبر است.`);
  }

  const cleanStagePassed: Record<number, boolean> = {};
  for (const [k, v] of Object.entries(stagePassed)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 0 || n > 20 || typeof v !== "boolean") {
      throw new Error(`مقدار stagePassed در واحد #${idx + 1} نامعتبر است.`);
    }
    cleanStagePassed[n] = v;
  }

  let cleanStageLessons: Record<number, number> | undefined;
  if (stageLessons !== undefined) {
    if (!isPlainObject(stageLessons)) {
      throw new Error(`فیلد stageLessons در واحد #${idx + 1} نامعتبر است.`);
    }
    cleanStageLessons = {};
    for (const [k, v] of Object.entries(stageLessons)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 0 || n > 20 || !isFiniteInRange(v, 0, 1000) || !Number.isInteger(v)) {
        throw new Error(`مقدار stageLessons در واحد #${idx + 1} نامعتبر است.`);
      }
      cleanStageLessons[n] = v;
    }
  }

  const row: UnitProgressRow = {
    unitId,
    unlocked,
    stagePassed: cleanStagePassed,
    currentStage,
    mastered,
    updatedAt,
  };
  if (cleanStageLessons) row.stageLessons = cleanStageLessons;
  return row;
}

function validateProfile(raw: unknown): UserProfileRow {
  if (!isPlainObject(raw) || raw.id !== "main") {
    throw new Error("اطلاعات پروفایل در فایل پشتیبان نامعتبر است.");
  }
  const {
    chillehCurrentDays,
    chillehBestDays,
    chillehStage,
    lastActivityDate,
    chillehShieldActive,
    noorXp,
    aqeeqGems,
    updatedAt,
  } = raw;

  if (
    !isFiniteInRange(chillehCurrentDays, 0, 100_000) || !Number.isInteger(chillehCurrentDays) ||
    !isFiniteInRange(chillehBestDays, 0, 100_000) || !Number.isInteger(chillehBestDays) ||
    !isFiniteInRange(noorXp, 0, 100_000_000) || !Number.isInteger(noorXp) ||
    !isFiniteInRange(aqeeqGems, 0, 100_000_000) || !Number.isInteger(aqeeqGems) ||
    !isFiniteInRange(updatedAt, 0, 9_000_000_000_000)
  ) {
    throw new Error("مقادیر عددی پروفایل در فایل پشتیبان نامعتبر است.");
  }
  if (!VALID_CHILLEH_STAGES.has(chillehStage as 7 | 14 | 40)) {
    throw new Error("مرحله چله در فایل پشتیبان نامعتبر است.");
  }
  if (lastActivityDate !== null && (typeof lastActivityDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(lastActivityDate))) {
    throw new Error("تاریخ آخرین فعالیت در فایل پشتیبان نامعتبر است.");
  }
  if (typeof chillehShieldActive !== "boolean") {
    throw new Error("وضعیت سپر چله در فایل پشتیبان نامعتبر است.");
  }

  return {
    id: "main",
    chillehCurrentDays,
    chillehBestDays,
    chillehStage: chillehStage as 7 | 14 | 40,
    lastActivityDate,
    chillehShieldActive,
    noorXp,
    aqeeqGems,
    updatedAt,
  };
}

function validateArray<T>(
  raw: unknown,
  fieldName: string,
  required: boolean,
  validator: (item: unknown, idx: number) => T,
): T[] {
  if (raw === undefined) {
    if (required) throw new Error(`فیلد ${fieldName} در فایل پشتیبان وجود ندارد.`);
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`فیلد ${fieldName} باید آرایه باشد.`);
  }
  if (raw.length > MAX_RECORDS_PER_TABLE) {
    throw new Error(`تعداد رکوردهای ${fieldName} بیش از حد مجاز است.`);
  }
  return raw.map((item, idx) => validator(item, idx));
}

export function parseAndValidateBackup(rawText: string): ValidatedBackup {
  if (typeof rawText !== "string" || rawText.length === 0) {
    throw new Error("فایل پشتیبان خالی است.");
  }
  if (rawText.length > MAX_BACKUP_BYTES) {
    throw new Error("حجم فایل پشتیبان بیش از حد مجاز (۲۵ مگابایت) است.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("ساختار JSON فایل پشتیبان خراب است.");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("قالب فایل پشتیبان نامعتبر است.");
  }
  if (parsed.app !== BACKUP_APP_ID) {
    throw new Error("این فایل متعلق به برنامه «سفر قرآنی سوره قصص» نیست.");
  }

  const schemaVersion = parsed.schemaVersion ?? 1;
  if (typeof schemaVersion !== "number" || !SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
    throw new Error(`نسخه فایل پشتیبان (${String(schemaVersion)}) پشتیبانی نمی‌شود.`);
  }

  const exportedAt = isValidIsoDate(parsed.exportedAt)
    ? parsed.exportedAt
    : new Date().toISOString();

  const cards = validateArray(parsed.cards, "cards", true, validateCard);
  const attempts = validateArray(parsed.attempts, "attempts", false, validateAttempt);
  const confusions = validateArray(parsed.confusions, "confusions", false, validateConfusion);
  const unitProgress = validateArray(parsed.unitProgress, "unitProgress", false, validateUnitProgress);
  const profile =
    parsed.profile === undefined || parsed.profile === null
      ? null
      : validateProfile(parsed.profile);

  return {
    app: BACKUP_APP_ID,
    schemaVersion,
    exportedAt,
    cards,
    attempts,
    confusions,
    unitProgress,
    profile,
  };
}

export async function createBackupPayload(): Promise<ValidatedBackup> {
  const [cards, attempts, confusions, unitProgress, profile] = await Promise.all([
    ldb.cards.toArray(),
    ldb.attempts.toArray(),
    ldb.confusions.toArray(),
    ldb.unitProgress.toArray(),
    ldb.profile.get("main"),
  ]);

  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    cards,
    attempts,
    confusions,
    unitProgress,
    profile: profile ?? DEFAULT_USER_PROFILE,
  };
}

export async function restoreValidatedBackup(backup: ValidatedBackup): Promise<void> {
  // حذف شناسه خودکار دستگاه مبدأ از attempts و confusions برای جلوگیری از تداخل شناسه بین دستگاه‌ها
  const cleanAttempts: AttemptRow[] = backup.attempts.map(({ id: _id, ...rest }) => rest);
  const cleanConfusions: ConfusionRow[] = backup.confusions.map(({ id: _id, ...rest }) => rest);

  await ldb.transaction(
    "rw",
    [ldb.cards, ldb.attempts, ldb.confusions, ldb.unitProgress, ldb.profile],
    async () => {
      // جایگزینی کامل (Replace) به جای ادغام (Merge) تا وضعیت دقیق پشتیبان بازیابی شود
      await ldb.cards.clear();
      await ldb.attempts.clear();
      await ldb.confusions.clear();
      await ldb.unitProgress.clear();

      if (backup.cards.length) await ldb.cards.bulkPut(backup.cards);
      if (cleanAttempts.length) await ldb.attempts.bulkAdd(cleanAttempts);
      if (cleanConfusions.length) await ldb.confusions.bulkAdd(cleanConfusions);
      if (backup.unitProgress.length) await ldb.unitProgress.bulkPut(backup.unitProgress);
      if (backup.profile) {
        await ldb.profile.put(backup.profile);
      } else {
        await ldb.profile.put({ ...DEFAULT_USER_PROFILE, updatedAt: Date.now() });
      }
    },
  );
}
