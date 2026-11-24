// src/db/learningDb.ts
// پایگاه‌داده‌ی جدید و مستقل برای موتور یادگیری (محتوای واقعی + کارت‌ها + تلاش‌ها).
// جدا از QuranJourneyDB قدیمی است تا مهاجرت و seed قدیمی (qasas_full_seed.json) لازم نباشد.
import Dexie, { type Table } from "dexie";
import type { StoredCard } from "../learning/cardScheduler";
export type { StoredCard };

export interface QuestionRow {
  id: string;
  unitId: string;
  stage: number;
  skill: string;
  type: string;
  shape: "choice" | "match" | "order" | "cloze";
  difficulty: number;
  targets: string[]; // multiEntry index
  [k: string]: unknown;
}
export interface LexiconRow { wordId: string; unitId: string; [k: string]: unknown }
export interface ChunkRow { id: string; unitId: string; verse: number; [k: string]: unknown }
export interface BaseVerseRow { id: string; surah: number; n: number; verseId?: string; [k: string]: unknown }

/** کلید مرکب جدول baseVerses در مهاجرت نسخهٔ ۵ */
export function verseKey(surah: number, n: number): string {
  return `${surah}:${n}`;
}
export interface AttemptRow {
  id?: number;
  qid: string;
  unitId: string;
  stage: number;
  at: number;
  correct: boolean;
  usedHint: boolean;
  responseMs: number;
  chosen?: unknown;
  perTarget: Record<string, boolean>;
  sessionType: string;
}
export interface ConfusionRow {
  id?: number;
  qid: string;
  target: string;
  chosenTag?: string;
  at: number;
}
export interface UnitProgressRow {
  unitId: string;
  unlocked: boolean;
  stagePassed: Record<number, boolean>;
  /** تعداد درس‌های کوتاهِ گذرانده‌شده در هر مرحله (مثلاً ۰، ۱ یا ۲ از ۲) */
  stageLessons?: Record<number, number>;
  currentStage: number;
  mastered: boolean;
  updatedAt: number;
}
export interface MetaRow { key: string; value: unknown }

export interface AudioCacheRow {
  verse: number; // 1..verseCount
  surah?: number; // شماره سوره (پیش‌فرض ۲۸ برای سازگاری با نسخه‌های قبلی)
  blob?: Blob;
  data?: ArrayBuffer;
  size: number;
  cachedAt: number;
}

export interface SurahAudioCacheRow {
  surah: number; // 1..114
  verse: number; // 1..verseCount
  blob?: Blob;
  data?: ArrayBuffer;
  size: number;
  cachedAt: number;
}

export interface SurahPackRow {
  surahNumber: number;
  slug: string;
  nameFa: string;
  installed: boolean;
  contentHash?: string;
  updatedAt: number;
}

export interface UserProfileRow {
  id: "main";
  chillehCurrentDays: number;
  chillehBestDays: number;
  chillehStage: 7 | 14 | 40;
  lastActivityDate: string | null; // YYYY-MM-DD (local)
  chillehShieldActive: boolean;
  noorXp: number;
  aqeeqGems: number;
  updatedAt: number;
}

export const DEFAULT_USER_PROFILE: UserProfileRow = {
  id: "main",
  chillehCurrentDays: 0,
  chillehBestDays: 0,
  chillehStage: 7,
  lastActivityDate: null,
  chillehShieldActive: false,
  noorXp: 0,
  aqeeqGems: 0,
  updatedAt: 0,
};

export const MAIN_PROFILE_ID = "main";
export const LEGACY_DB_NAME = "QasasLearningDB";
export const ACTIVE_PROFILE_STORAGE_KEY = "qasas.activeProfile.v1";

/** نگاشت صریح نام دیتابیس برای هر پروفایل: پروفایل اصلی دقیقاً روی نام قدیمی می‌ماند */
export function dbNameForProfile(profileId: string): string {
  if (!profileId || profileId === MAIN_PROFILE_ID) {
    return LEGACY_DB_NAME;
  }
  return `${LEGACY_DB_NAME}__${profileId}`;
}

function readInitialProfileId(): string {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
      return globalThis.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || MAIN_PROFILE_ID;
    }
  } catch {
    // ignore storage access errors
  }
  return MAIN_PROFILE_ID;
}

export class LearningDB extends Dexie {
  questions!: Table<QuestionRow, string>;
  lexicon!: Table<LexiconRow, string>;
  chunks!: Table<ChunkRow, string>;
  baseVerses!: Table<BaseVerseRow, string>;
  cards!: Table<StoredCard, string>;
  attempts!: Table<AttemptRow, number>;
  confusions!: Table<ConfusionRow, number>;
  unitProgress!: Table<UnitProgressRow, string>;
  meta!: Table<MetaRow, string>;
  audioCache!: Table<AudioCacheRow, number>;
  surahAudioCache!: Table<SurahAudioCacheRow, [number, number]>;
  profile!: Table<UserProfileRow, string>;
  surahPacks!: Table<SurahPackRow, number>;

  constructor(dbName: string = LEGACY_DB_NAME) {
    super(dbName);
    this.version(1).stores({
      questions: "id, unitId, [unitId+stage], stage, type, *targets",
      lexicon: "wordId, unitId",
      chunks: "id, unitId, verse",
      baseVerses: "n",
      cards: "key, kind, due, state",
      attempts: "++id, qid, unitId, [unitId+stage], at",
      confusions: "++id, qid, target, at",
      unitProgress: "unitId",
      meta: "key",
    });
    this.version(2).stores({
      questions: "id, unitId, [unitId+stage], stage, type, *targets",
      lexicon: "wordId, unitId",
      chunks: "id, unitId, verse",
      baseVerses: "n",
      cards: "key, kind, due, state",
      attempts: "++id, qid, unitId, [unitId+stage], at",
      confusions: "++id, qid, target, at",
      unitProgress: "unitId",
      meta: "key",
      audioCache: "verse",
      profile: "id",
    });
    this.version(3)
      .stores({
        questions: "id, unitId, [unitId+stage], stage, type, *targets",
        lexicon: "wordId, unitId",
        chunks: "id, unitId, verse",
        baseVerses: "n",
        cards: "key, kind, due, state",
        attempts: "++id, qid, unitId, [unitId+stage], at",
        confusions: "++id, qid, target, at",
        unitProgress: "unitId",
        meta: "key",
        audioCache: "verse, surah",
        profile: "id",
        surahPacks: "surahNumber, slug",
      })
      .upgrade(async (tx) => {
        // مهاجرت امن: برچسب‌گذاری کش صوتی قبلی با سوره ۲۸ بدون حذف داده‌های کاربر
        await tx.table("audioCache").toCollection().modify((row: AudioCacheRow) => {
          if (row.surah === undefined) row.surah = 28;
        });
        await tx.table("surahPacks").put({
          surahNumber: 28,
          slug: "qasas",
          nameFa: "قصص",
          installed: true,
          updatedAt: Date.now(),
        });
      });
    this.version(4)
      .stores({
        questions: "id, unitId, [unitId+stage], stage, type, *targets",
        lexicon: "wordId, unitId",
        chunks: "id, unitId, verse",
        baseVerses: "n",
        cards: "key, kind, due, state",
        attempts: "++id, qid, unitId, [unitId+stage], at",
        confusions: "++id, qid, target, at",
        unitProgress: "unitId",
        meta: "key",
        audioCache: "verse, surah",
        surahAudioCache: "[surah+verse], surah",
        profile: "id",
        surahPacks: "surahNumber, slug",
      })
      .upgrade(async (tx) => {
        // انتقال امن کش صوتی قدیمی به جدول با کلید مرکب [surah+verse] جهت جلوگیری از تداخل بین سوره‌ها
        const oldRows = (await tx.table("audioCache").toArray()) as AudioCacheRow[];
        if (oldRows.length > 0) {
          await tx.table("surahAudioCache").bulkPut(
            oldRows.map((r) => ({
              surah: r.surah ?? 28,
              verse: r.verse,
              blob: r.blob,
              data: r.data,
              size: r.size,
              cachedAt: r.cachedAt,
            })),
          );
        }
      });
    // مهاجرت نسخه ۵ (تنها استثنای مجاز اسکیما): تغییر کلید اصلی baseVerses از n به رشتهٔ مرکب "<surah>:<verse>" در فیلد id
    this.version(4.5)
      .stores({
        questions: "id, unitId, [unitId+stage], stage, type, *targets",
        lexicon: "wordId, unitId",
        chunks: "id, unitId, verse",
        baseVerses: "n",
        cards: "key, kind, due, state",
        attempts: "++id, qid, unitId, [unitId+stage], at",
        confusions: "++id, qid, target, at",
        unitProgress: "unitId",
        meta: "key",
        audioCache: "verse, surah",
        surahAudioCache: "[surah+verse], surah",
        profile: "id",
        surahPacks: "surahNumber, slug",
      })
      .upgrade(async (tx) => {
        const oldRows = await tx.table("baseVerses").toArray();
        if (oldRows.length > 0) {
          await tx.table("meta").put({ key: "__v5_baseVerses_tmp", value: oldRows });
        }
      });
    this.version(4.6).stores({
      questions: "id, unitId, [unitId+stage], stage, type, *targets",
      lexicon: "wordId, unitId",
      chunks: "id, unitId, verse",
      baseVerses: null,
      cards: "key, kind, due, state",
      attempts: "++id, qid, unitId, [unitId+stage], at",
      confusions: "++id, qid, target, at",
      unitProgress: "unitId",
      meta: "key",
      audioCache: "verse, surah",
      surahAudioCache: "[surah+verse], surah",
      profile: "id",
      surahPacks: "surahNumber, slug",
    });
    this.version(5)
      .stores({
        questions: "id, unitId, [unitId+stage], stage, type, *targets",
        lexicon: "wordId, unitId",
        chunks: "id, unitId, verse",
        baseVerses: "id, surah, n",
        cards: "key, kind, due, state",
        attempts: "++id, qid, unitId, [unitId+stage], at",
        confusions: "++id, qid, target, at",
        unitProgress: "unitId",
        meta: "key",
        audioCache: "verse, surah",
        surahAudioCache: "[surah+verse], surah",
        profile: "id",
        surahPacks: "surahNumber, slug",
      })
      .upgrade(async (tx) => {
        const tmp = (await tx.table("meta").get("__v5_baseVerses_tmp")) as MetaRow | undefined;
        const oldRows = Array.isArray(tmp?.value) ? (tmp!.value as Record<string, unknown>[]) : [];
        if (oldRows.length > 0) {
          await tx.table("baseVerses").bulkPut(
            oldRows.map((r) => {
              const surah = typeof r.surah === "number" ? r.surah : 28;
              const n = Number(r.n);
              const prevId = typeof r.id === "string" && !r.id.includes(":") ? r.id : undefined;
              return {
                ...r,
                surah,
                n,
                ...(prevId ? { verseId: prevId } : {}),
                id: verseKey(surah, n),
              };
            }),
          );
        }
        await tx.table("meta").delete("__v5_baseVerses_tmp");
      });
  }
}

export let ldb = new LearningDB(dbNameForProfile(readInitialProfileId()));

/** تغییر دیتابیس فعال روی binding زنده ESM برای جابه‌جایی بین پروفایل‌ها */
export function setActiveProfileDb(profileId: string): LearningDB {
  const targetDbName = dbNameForProfile(profileId);
  if (ldb.name !== targetDbName) {
    ldb.close();
    ldb = new LearningDB(targetDbName);
  }
  return ldb;
}
