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
export interface BaseVerseRow { n: number; [k: string]: unknown }
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
  verse: number; // 1..88
  blob?: Blob;
  data?: ArrayBuffer;
  size: number;
  cachedAt: number;
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

export class LearningDB extends Dexie {
  questions!: Table<QuestionRow, string>;
  lexicon!: Table<LexiconRow, string>;
  chunks!: Table<ChunkRow, string>;
  baseVerses!: Table<BaseVerseRow, number>;
  cards!: Table<StoredCard, string>;
  attempts!: Table<AttemptRow, number>;
  confusions!: Table<ConfusionRow, number>;
  unitProgress!: Table<UnitProgressRow, string>;
  meta!: Table<MetaRow, string>;
  audioCache!: Table<AudioCacheRow, number>;
  profile!: Table<UserProfileRow, string>;

  constructor() {
    super("QasasLearningDB");
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
  }
}

export const ldb = new LearningDB();
