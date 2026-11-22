// src/learning/mutashabihat.ts
// کشف هوشمند و ۱۰۰٪ آفلاین متشابهات لفظی در ۸۸ آیه سوره قصص + مقایسه کلمه‌به‌کلمه (Diff)

export interface SimpleVerse {
  n: number;
  arText: string;
  fa?: string;
  words?: { i: number; ar: string }[];
}

export interface MutashabihatPair {
  verseA: number;
  verseB: number;
  score: number; // 0..1
  sharedTokens: string[];
}

export interface DiffWord {
  ar: string;
  shared: boolean;
}

const STOP_WORDS = new Set([
  "و", "في", "من", "الي", "علي", "عن", "ان", "انا", "اني", "انك", "انه", "انهم",
  "ما", "لا", "لم", "لن", "قد", "هو", "هي", "هم", "قال", "قالوا", "كان", "كانوا",
  "التي", "الذي", "الذين", "ذلك", "هذا", "هذه", "لكم", "لهم", "به", "بها", "بهم",
  "منهم", "منها", "فيه", "فيها", "عليهم", "اليه", "اليهم", "يا", "ثم", "او", "بل", "اذ", "اذا",
]);

/** نرمال‌سازی رسم‌الخط عثمانی برای مقایسه لفظی دقیق */
export function normalizeArabic(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200C-\u200F]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractWords(verse: SimpleVerse): string[] {
  if (verse.words?.length) return verse.words.map((w) => w.ar);
  return verse.arText.split(/\s+/).filter(Boolean);
}

/**
 * استخراج زوج‌های متشابه در سوره قصص بر اساس شباهت واژگانی و عبارات ۲-کلمه‌ای مشترک
 */
export function findMutashabihatPairs(
  verses: SimpleVerse[],
  minScore = 0.22,
  maxPairs = 30,
): MutashabihatPair[] {
  const prepared = verses.map((v) => {
    const raw = extractWords(v);
    const normWords = raw.map(normalizeArabic).filter(Boolean);
    const contentSet = new Set(normWords.filter((w) => w.length >= 2 && !STOP_WORDS.has(w)));
    const bigrams = new Set<string>();
    for (let i = 0; i < normWords.length - 1; i++) {
      bigrams.add(`${normWords[i]} ${normWords[i + 1]}`);
    }
    return { n: v.n, contentSet, bigrams };
  });

  const pairs: MutashabihatPair[] = [];

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];
      if (a.contentSet.size === 0 || b.contentSet.size === 0) continue;

      const sharedContent: string[] = [];
      for (const w of a.contentSet) {
        if (b.contentSet.has(w)) sharedContent.push(w);
      }

      let sharedBigrams = 0;
      for (const bg of a.bigrams) {
        if (b.bigrams.has(bg)) sharedBigrams++;
      }

      if (sharedContent.length < 2 && sharedBigrams === 0) continue;

      const minSize = Math.min(a.contentSet.size, b.contentSet.size);
      const wordOverlap = sharedContent.length / Math.max(1, minSize);
      const bigramBoost = Math.min(0.45, sharedBigrams * 0.18);
      const score = Math.min(1, Number((wordOverlap * 0.65 + bigramBoost).toFixed(3)));

      if (score >= minScore && (sharedContent.length >= 2 || sharedBigrams >= 1)) {
        pairs.push({
          verseA: a.n,
          verseB: b.n,
          score,
          sharedTokens: sharedContent,
        });
      }
    }
  }

  return pairs.sort((x, y) => y.score - x.score || x.verseA - y.verseA).slice(0, maxPairs);
}

/**
 * مشخص‌کردن کلمات مشترک در مقابل کلمات متفاوت بین دو آیه برای نمایش رنگی کنار هم
 */
export function diffVersePair(
  verseA: SimpleVerse,
  verseB: SimpleVerse,
): { wordsA: DiffWord[]; wordsB: DiffWord[] } {
  const rawA = extractWords(verseA);
  const rawB = extractWords(verseB);
  const setA = new Set(rawA.map(normalizeArabic).filter(Boolean));
  const setB = new Set(rawB.map(normalizeArabic).filter(Boolean));

  return {
    wordsA: rawA.map((ar) => ({ ar, shared: setB.has(normalizeArabic(ar)) })),
    wordsB: rawB.map((ar) => ({ ar, shared: setA.has(normalizeArabic(ar)) })),
  };
}
