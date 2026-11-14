// src/types/learning.ts

export type Skill = "word" | "translation" | "recall" | "number" | "sequence" | "page";
export type QuestionShape = "choice" | "match" | "order" | "cloze";

export type QuestionType =
  | "WORD_AR_TO_FA"
  | "WORD_FA_TO_AR"
  | "VERSE_TO_TRANSLATION"
  | "TRANSLATION_TO_VERSE"
  | "VERSE_TO_NUMBER"
  | "NUMBER_TO_VERSE_START"
  | "NEXT_VERSE_CHOICE"
  | "PREV_VERSE_CHOICE"
  | "ENDING_CHOICE"
  | "MUTASHABIH_SPOT"
  | "MATCH_WORDS"
  | "MATCH_PHRASES"
  | "MATCH_NUMBER_OPENING"
  | "BUILD_FROM_TRANSLATION"
  | "BUILD_FROM_NUMBER"
  | "BUILD_NEXT_VERSE"
  | "BUILD_PREV_VERSE"
  | "ORDER_TRANSLATION_CHUNKS"
  | "ORDER_VERSES"
  | "CLOZE_AR"
  | "CLOZE_COMPLETE_REST"
  | "CLOZE_FA";

export type CardKey = string; // "w:<wordId>" | "vr:10" | "vt:10" | "vn:10" | "sq:10" | "pg:<unitId>"
export type CardKind = "w" | "vr" | "vt" | "vn" | "sq" | "pg";

export interface Option {
  id: string;
  ar?: string;
  fa?: string;
  num?: number;
  words?: string[];
  wordRange?: { verse: number; from: number; to: number };
}

export interface BankItem {
  id: string;
  ar?: string;
  fa?: string;
  wordIdx?: number[];
  decoy?: boolean;
}

export interface QuestionBase {
  id: string;
  unitId: string;
  part: string;
  type: QuestionType;
  shape: QuestionShape;
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  difficulty: 1 | 2 | 3 | 4 | 5;
  skill: Skill;
  verse?: number;
  targets: CardKey[];
  promptFa: string;
  stem: Record<string, unknown>;
  distractorTags?: Record<string, string>;
  explanationFa: string;
}

export interface ChoiceQuestion extends QuestionBase {
  shape: "choice";
  options: Option[];
  answer: string;
}

export interface MatchQuestion extends QuestionBase {
  shape: "match";
  left: { id: string; ar?: string; num?: number }[];
  right: { id: string; fa?: string; ar?: string }[];
  pairs: [string, string][];
}

export interface OrderQuestion extends QuestionBase {
  shape: "order";
  bank: BankItem[];
  answer: string[];
}

export interface ClozeQuestion extends QuestionBase {
  shape: "cloze";
  bank: BankItem[];
  answer: Record<string, string>;
}

export type Question = ChoiceQuestion | MatchQuestion | OrderQuestion | ClozeQuestion;

export interface LexiconEntry {
  wordId: string;
  gloss: string;
  hard: boolean;
  meaningFa?: string;
  rootAr?: string;
  trapFa?: string | null;
  tipFa?: string;
  segments?: { text: string; type: "prefix" | "root" | "pronoun" }[];
}

export interface VerseChunks {
  verse: number;
  chunks: { from: number; to: number; fa: string }[];
  faSegments: string[];
}

/** نتیجه تصحیح هر سوال برای ثبت در FSRS و کارنامه */
export interface GradeResult {
  correct: boolean;
  score: number;
  perTarget: Record<CardKey, boolean>;
  wrongOptionIds: string[];
}

export interface BaseWord {
  id: string;
  i: number;
  ar: string;
  page: number;
  line: number;
}

export interface BaseVerse {
  id: string;
  n: number;
  page: number;
  words: BaseWord[];
  arText: string;
  fa: string;
  endPage: number;
  endLine: number;
}

export interface UnitPlan {
  id: string;
  page: number;
  half: "a" | "b";
  verseFrom: number;
  verseTo: number;
  verses: string[];
  lines: { from: number; to: number };
  order: number;
}
