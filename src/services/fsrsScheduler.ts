// src/services/fsrsScheduler.ts
import {
    fsrs,
    generatorParameters,
    createEmptyCard,
    Rating,
    State,
    type Card,
    type Grade,
} from "ts-fsrs";
import { db } from "../db/database";
import type {
    FSRSCardState,
    FSRSRating,
    WordMorphology,
} from "../types/schema";

/**
 * تنظیمات بهینه‌شده الگوریتم FSRS برای یادگیری واژگان قرآنی
 * ضریب ماندگاری هدف ۹۰٪ و سقف فاصله مرور ۱۸۰ روز
 */
const fsrsParams = generatorParameters({
    request_retention: 0.9,
    maximum_interval: 180,
    enable_fuzz: true,
    enable_short_term: true,
});

const scheduler = fsrs(fsrsParams);

export interface ImplicitGradingInput {
    isCorrect: boolean;
    responseTimeMs: number;
    hasChangedSelection: boolean;
}

export interface WordWithFSRSState {
    word: WordMorphology;
    card: FSRSCardState;
}

/**
 * محاسبه نامحسوس نمره FSRS (۱ تا ۴) بر اساس تله‌متری زمان پاسخ و تردید کاربر
 * طبق فرمول قفل‌شده در PROJECT_CONTRACT.md:
 * - پاسخ غلط -> Rating 1 (Again)
 * - پاسخ درست + زمان > 8000ms یا تغییر گزینه -> Rating 2 (Hard)
 * - پاسخ درست + زمان بین 3000ms تا 8000ms -> Rating 3 (Good)
 * - پاسخ درست + زمان < 3000ms در اولین تلاش -> Rating 4 (Easy)
 */
export function calculateImplicitFsrsRating(
    input: ImplicitGradingInput
): FSRSRating {
    const { isCorrect, responseTimeMs, hasChangedSelection } = input;

    if (!isCorrect) {
        return 1; // Rating.Again
    }

    if (hasChangedSelection || responseTimeMs > 8000) {
        return 2; // Rating.Hard
    }

    if (responseTimeMs < 3000) {
        return 4; // Rating.Easy
    }

    return 3; // Rating.Good
}

/**
 * تبدیل شیء Card کتابخانه ts-fsrs به اینترفیس سریالایز شده FSRSCardState دیتابیس
 */
function mapTsFsrsCardToDbState(wordId: string, card: Card): FSRSCardState {
    const normalizedState = (
        card.state >= 0 && card.state <= 3 ? card.state : 0
    ) as 0 | 1 | 2 | 3;

    return {
        wordId,
        due: card.due.toISOString(),
        stability: Number(card.stability.toFixed(4)),
        difficulty: Number(card.difficulty.toFixed(4)),
        elapsedDays: (card as unknown as { elapsed_days?: number }).elapsed_days ?? 0,
        scheduledDays: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: normalizedState,
        lastReview: card.last_review ? card.last_review.toISOString() : null,
    };
}

/**
 * تبدیل رکورد FSRSCardState دیتابیس به شیء Card استاندارد کتابخانه ts-fsrs
 */
function mapDbStateToTsFsrsCard(dbCard: FSRSCardState): Card {
    const baseCard = createEmptyCard(new Date(dbCard.due));
    return {
        ...baseCard,
        due: new Date(dbCard.due),
        stability: dbCard.stability,
        difficulty: dbCard.difficulty,
        scheduled_days: dbCard.scheduledDays,
        reps: dbCard.reps,
        lapses: dbCard.lapses,
        state: dbCard.state as State,
        last_review: dbCard.lastReview ? new Date(dbCard.lastReview) : undefined,
    };
}

/**
 * تبدیل امتیاز عددی ۱ تا ۴ قرارداد به Grade استاندارد ts-fsrs
 */
function mapRatingToGrade(rating: FSRSRating): Grade {
    switch (rating) {
        case 1:
            return Rating.Again;
        case 2:
            return Rating.Hard;
        case 3:
            return Rating.Good;
        case 4:
            return Rating.Easy;
    }
}

/**
 * ساخت وضعیت اولیه کارت FSRS برای کلمه‌ای که نخستین بار دیده می‌شود
 */
export function createInitialFSRSCardState(
    wordId: string,
    now: Date = new Date()
): FSRSCardState {
    const emptyCard = createEmptyCard(now);
    return mapTsFsrsCardToDbState(wordId, emptyCard);
}

/**
 * ثبت مرور یک کلمه، محاسبه زمان‌بندی بعدی توسط ts-fsrs و ذخیره در IndexedDB
 */
export async function recordWordReview(
    wordId: string,
    rating: FSRSRating,
    now: Date = new Date()
): Promise<FSRSCardState> {
    const existingDbCard = await db.fsrsCards.get(wordId);
    const currentCard: Card = existingDbCard
        ? mapDbStateToTsFsrsCard(existingDbCard)
        : createEmptyCard(now);

    const grade = mapRatingToGrade(rating);
    const schedulingCards = scheduler.repeat(currentCard, now);
    const nextCard = schedulingCards[grade].card;

    const updatedState = mapTsFsrsCardToDbState(wordId, nextCard);
    await db.fsrsCards.put(updatedState);

    return updatedState;
}

/**
 * دریافت کلمات سررسید شده (Due) و رو به فراموشی برای صفحه «مرور هوشمند»
 */
export async function getDueWordsForReview(
    limit = 15,
    now: Date = new Date()
): Promise<WordWithFSRSState[]> {
    const nowIso = now.toISOString();

    const dueCards = await db.fsrsCards
        .where("due")
        .belowOrEqual(nowIso)
        .toArray();

    // اولویت‌بندی: ابتدا کارت‌های در حال بازآموزی (Relearning)، سپس قدیمی‌ترین سررسیدها
    dueCards.sort((a, b) => {
        if (a.state === 3 && b.state !== 3) return -1;
        if (b.state === 3 && a.state !== 3) return 1;
        return a.due.localeCompare(b.due);
    });

    const selectedCards = dueCards.slice(0, limit);
    if (selectedCards.length === 0) return [];

    const wordIds = selectedCards.map((c) => c.wordId);
    const words = await db.words.bulkGet(wordIds);

    const result: WordWithFSRSState[] = [];
    for (let i = 0; i < selectedCards.length; i++) {
        const word = words[i];
        if (word) {
            result.push({
                word,
                card: selectedCards[i],
            });
        }
    }

    return result;
}

/**
 * استخراج کلمات نیازمند «ترکیب و ترمیم» (کلمات دارای بیشترین خطا یا کمترین پایداری حافظه)
 * ویژه استفاده در مینی‌گیم شارژ ۵ چراغ (LampRefillModal) و تمرین‌های ترمیمی
 */
export async function getWeakWordsForRecovery(
    limit = 5
): Promise<WordMorphology[]> {
    const allCards = await db.fsrsCards.toArray();

    if (allCards.length > 0) {
        // مرتب‌سازی بر اساس: ۱. وضعیت بازآموزی (state=3) ۲. بیشترین خطا (lapses) ۳. کمترین پایداری (stability)
        allCards.sort((a, b) => {
            if (a.state === 3 && b.state !== 3) return -1;
            if (b.state === 3 && a.state !== 3) return 1;
            if (b.lapses !== a.lapses) return b.lapses - a.lapses;
            return a.stability - b.stability;
        });

        const targetIds = allCards.slice(0, limit).map((c) => c.wordId);
        const words = await db.words.bulkGet(targetIds);
        const validWords = words.filter(
            (w): w is WordMorphology => w !== undefined
        );

        if (validWords.length >= limit) {
            return validWords;
        }

        // اگر تعداد کارت‌های مرور شده کمتر از حد نصاب بود، بقیه را از جدول کلمات تکمیل کن
        const extraWords = await db.words.limit(limit * 2).toArray();
        for (const extra of extraWords) {
            if (
                validWords.length < limit &&
                !validWords.some((vw) => vw.id === extra.id)
            ) {
                validWords.push(extra);
            }
        }
        return validWords;
    }

    // اگر کاربر در اولین درس خود تمام چراغ‌ها را از دست داده و هنوز کارتی ثبت نشده است
    return db.words.limit(limit).toArray();
}

/**
 * دریافت آمار خلاصه وضعیت حافظه کاربر برای نمایش در صفحه پروفایل و نوار مرور
 */
export async function getFSRSMemorySummary(now: Date = new Date()): Promise<{
    totalTrackedWords: number;
    dueNowCount: number;
    masteredCount: number;
    strugglingCount: number;
}> {
    const nowIso = now.toISOString();
    const allCards = await db.fsrsCards.toArray();

    let dueNowCount = 0;
    let masteredCount = 0;
    let strugglingCount = 0;

    for (const card of allCards) {
        if (card.due <= nowIso) {
            dueNowCount += 1;
        }
        if (card.state === 2 && card.stability >= 14) {
            masteredCount += 1;
        }
        if (card.state === 3 || card.lapses >= 2) {
            strugglingCount += 1;
        }
    }

    return {
        totalTrackedWords: allCards.length,
        dueNowCount,
        masteredCount,
        strugglingCount,
    };
}