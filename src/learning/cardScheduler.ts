// src/learning/cardScheduler.ts
// زمان‌بندی عمومی کارت‌های w:/vr:/vt:/vn:/sq:/pg: با FSRS — تابع‌های خالص (بدون Dexie) تا قابل تست باشند.
import { fsrs, generatorParameters, createEmptyCard, Rating, type Card, type Grade } from "ts-fsrs";

export type CardKind = "w" | "vr" | "vt" | "vn" | "sq" | "pg";
export type RatingKind = "again" | "hard" | "good" | "easy";

export interface StoredCard {
  key: string; // مثل "vr:5"
  kind: CardKind;
  due: string; // ISO
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReview: string | null;
  /** مجموع پاسخ‌های درست متوالی (برای مسترى) */
  streak: number;
}

const RETENTION: Record<CardKind, number> = { w: 0.9, vt: 0.9, vr: 0.93, vn: 0.93, sq: 0.93, pg: 0.93 };

const engines = new Map<CardKind, ReturnType<typeof fsrs>>();
function engine(kind: CardKind) {
  let e = engines.get(kind);
  if (!e) {
    e = fsrs(generatorParameters({ request_retention: RETENTION[kind], maximum_interval: 120, enable_fuzz: false, enable_short_term: true }));
    engines.set(kind, e);
  }
  return e;
}

export function kindOfKey(key: string): CardKind {
  const k = key.split(":")[0];
  if (k === "w" || k === "vr" || k === "vt" || k === "vn" || k === "sq" || k === "pg") return k;
  throw new Error(`کلید کارت نامعتبر: ${key}`);
}

/** کارت جدید */
export function newCard(key: string, now: Date = new Date()): StoredCard {
  return toStored(key, createEmptyCard(now), 0);
}

export interface SeedOpts {
  now?: Date;
  intervalDays: number;
  /** در صورت عدم تعیین، دقیقاً از روی منحنی فراموشی FSRS و retention نوع کارت مشتق می‌شود */
  stability?: number;
}

const FSRS_FACTOR = 19 / 81;
const FSRS_DECAY = 0.5;

/**
 * محاسبهٔ stability سازگار با منحنی FSRS برای فاصلهٔ هدف (intervalDays) و retention هر نوع کارت:
 * R(t, S) = (1 + F * t / S)^(-C)  ==>  S = (F * t) / (R^(-1/C) - 1)
 */
export function stabilityForInterval(kind: CardKind, intervalDays: number): number {
  const r = RETENTION[kind];
  const denom = Math.pow(r, -1 / FSRS_DECAY) - 1;
  if (denom <= 0 || intervalDays <= 0) return Math.max(0.5, intervalDays);
  return Number(((FSRS_FACTOR * intervalDays) / denom).toFixed(2));
}

/** آیا کارت دارای سابقهٔ واقعی مرور FSRS است؟ (قاعده: کارت با state !== 0 و reps > 0 هرگز نباید با بذر بازنویسی شود) */
export function hasRealFsrsHistory(card: StoredCard | undefined): boolean {
  return !!card && card.state !== 0 && card.reps > 0;
}

/** بذرپاشی کارت برای اهداف ازپیش‌بلدشده (مثلاً در آزمون میانبر، پیش‌غربال یا تسمیع) */
export function seedKnownCard(key: string, opts: SeedOpts): StoredCard {
  const now = opts.now ?? new Date();
  const kind = kindOfKey(key);
  const due = new Date(now.getTime() + opts.intervalDays * 86400_000);
  const stability = opts.stability ?? stabilityForInterval(kind, opts.intervalDays);
  return {
    key,
    kind,
    due: due.toISOString(),
    stability,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: opts.intervalDays,
    reps: 2,
    lapses: 0,
    state: 2,
    lastReview: now.toISOString(),
    streak: 2,
  };
}

function toStored(key: string, c: Card, streak: number): StoredCard {
  return {
    key,
    kind: kindOfKey(key),
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: (c as unknown as { elapsed_days?: number }).elapsed_days ?? 0,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: (c.state >= 0 && c.state <= 3 ? c.state : 0) as 0 | 1 | 2 | 3,
    lastReview: c.last_review ? c.last_review.toISOString() : null,
    streak,
  };
}

function fromStored(s: StoredCard): Card {
  const base = createEmptyCard(new Date(s.due));
  return {
    ...base,
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.lastReview ? new Date(s.lastReview) : undefined,
  } as Card;
}

export interface RatingInput {
  correct: boolean;
  usedHint: boolean;
  changedAnswer?: boolean;
  responseMs: number;
  /** میانه‌ی زمان پاسخ درست همین نوع سوال (برای تشخیص سریع/کند)؛ اگر نبود حد ثابت */
  medianMs?: number;
}

/** نگاشت: غلط→again؛ درست+راهنما/کند→hard؛ درست→good؛ درست و سریع و بدون تردید→easy */
export function ratingFor(i: RatingInput): RatingKind {
  if (!i.correct) return "again";
  const median = i.medianMs && i.medianMs > 0 ? i.medianMs : 5000;
  if (i.usedHint || i.changedAnswer || i.responseMs > 2 * median) return "hard";
  if (i.responseMs < 0.6 * median) return "easy";
  return "good";
}

const GRADE: Record<RatingKind, Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

export function review(card: StoredCard, rating: RatingKind, now: Date = new Date()): StoredCard {
  const out = engine(card.kind).next(fromStored(card), now, GRADE[rating]).card;
  const streak = rating === "again" ? 0 : card.streak + 1;
  return toStored(card.key, out, streak);
}

export function isDue(card: StoredCard, now: Date = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

/** «بدهی مرور»: کارت‌های سررسیدشده‌ی یادگرفته‌شده (state ≠ New) */
export function reviewDebt(cards: StoredCard[], now: Date = new Date()): number {
  return cards.filter((c) => c.state !== 0 && isDue(c, now)).length;
}

/** سطح ثبات برای نردبان سختی: 1 تازه … 5 بسیار پایدار */
export function stabilityLevel(card: StoredCard | undefined): 1 | 2 | 3 | 4 | 5 {
  if (!card || card.state === 0) return 1;
  const s = card.stability;
  if (s < 2) return 2;
  if (s < 7) return 3;
  if (s < 21) return 4;
  return 5;
}
