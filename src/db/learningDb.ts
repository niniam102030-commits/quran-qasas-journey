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
  currentStage: number;
  mastered: boolean;
  updatedAt: number;
}
export interface MetaRow { key: string; value: unknown }

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
  }
}

export const ldb = new LearningDB();
