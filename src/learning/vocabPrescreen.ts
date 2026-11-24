// src/learning/vocabPrescreen.ts
// منطق خالص پیش‌غربال واژگان (فلش‌کارت تأیید دومرحله‌ای) — بدون وابستگی به UI/DB.
import { newCard, seedKnownCard, type StoredCard } from "./cardScheduler";

export const PRESCREEN_MAX_WORDS = 12;
export const PRESCREEN_KNOWN_INTERVAL_DAYS = 10;
export const PRESCREEN_KNOWN_STABILITY = 10;

export interface PrescreenWord {
  wordId: string;
  ar: string;
  gloss: string;
  meaningFa: string;
  hard?: boolean;
  verse: number;
}

export interface PrescreenOutcome {
  wordId: string;
  confirmedKnown: boolean;
}

/**
 * انتخاب واژگان واجد شرایط پیش‌غربال یک واحد با سقف PRESCREEN_MAX_WORDS
 * تا پیش‌غربال از خود درس مرحله ۱ طولانی‌تر نشود.
 * واژگانی که از قبل کارت مرور پایدار دارند حذف می‌شوند و واژگان سخت در اولویت‌اند.
 */
export function selectPrescreenWords(
  words: PrescreenWord[],
  cards: Map<string, StoredCard>,
  maxWords: number = PRESCREEN_MAX_WORDS,
): PrescreenWord[] {
  const eligible = words.filter((w) => {
    const c = cards.get(`w:${w.wordId}`);
    return !(c && c.state === 2 && c.stability >= 7);
  });

  const sorted = eligible.slice().sort((a, b) => {
    const aHard = a.hard ? 0 : 1;
    const bHard = b.hard ? 0 : 1;
    if (aHard !== bHard) return aHard - bHard;
    return a.verse - b.verse || a.wordId.localeCompare(b.wordId);
  });

  return sorted.slice(0, maxWords);
}

/**
 * تبدیل نتایج پیش‌غربال به کارت‌های FSRS:
 * - «بلدم + درست گفتم»: کارت مرور با فاصلهٔ ۱۰ روز و stability=10
 * - «بلد نیستم» یا «اشتباه گفتم»: اگر کارتی ندارد، کارت تازه (newCard)
 */
export function applyPrescreenOutcomes(
  outcomes: PrescreenOutcome[],
  existingCards: Map<string, StoredCard>,
  now: Date = new Date(),
): StoredCard[] {
  const out: StoredCard[] = [];
  for (const item of outcomes) {
    const key = `w:${item.wordId}`;
    const prev = existingCards.get(key);
    if (item.confirmedKnown) {
      if (prev && prev.state === 2 && prev.stability >= PRESCREEN_KNOWN_STABILITY) continue;
      out.push(
        seedKnownCard(key, {
          now,
          intervalDays: PRESCREEN_KNOWN_INTERVAL_DAYS,
          stability: PRESCREEN_KNOWN_STABILITY,
        }),
      );
    } else if (!prev) {
      out.push(newCard(key, now));
    }
  }
  return out;
}

/**
 * حذف سؤال‌های مرحلهٔ ۱ که همهٔ هدف‌های واژگانی‌شان (w:*) در پیش‌غربال تأیید شده و هنوز سررسید نشده‌اند.
 * اگر همهٔ سؤال‌ها حذف شوند، لیست اصلی به‌عنوان fallback برگردانده می‌شود تا درس خالی نماند.
 */
export function filterPrescreenedStage1Questions<T extends { targets: string[] }>(
  stage1Questions: T[],
  cards: Map<string, StoredCard>,
  now: Date = new Date(),
): T[] {
  const nowMs = now.getTime();
  const filtered = stage1Questions.filter((q) => {
    const wordTargets = q.targets.filter((t) => t.startsWith("w:"));
    if (wordTargets.length === 0) return true;
    const allKnown = wordTargets.every((t) => {
      const c = cards.get(t);
      return (
        !!c &&
        c.state === 2 &&
        c.scheduledDays >= PRESCREEN_KNOWN_INTERVAL_DAYS &&
        new Date(c.due).getTime() > nowMs
      );
    });
    return !allKnown;
  });

  return filtered.length > 0 ? filtered : stage1Questions;
}
