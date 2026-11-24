// src/services/qulReferenceService.ts
// بارگذاری و کوئری داده‌های مرجع قرآنی (QUL / Quran.com API v4 + Quranic Arabic Corpus)
// شامل تایم‌استمپ کلمه‌به‌کلمه تلاوت استاد منشاوی و صرف/ریشه‌شناسی رسمی واژگان
import { ACTIVE_SURAH, getActiveSurahNumber } from "../config/surahConfig";
import { ldb } from "../db/learningDb";
import type { SurahTajweedData } from "../learning/tajweed";

/** [wordIndex1Based, startMs, endMs] */
export type WordAudioSegment = [number, number, number];

export interface QulAudioTimingFile {
  schema: string;
  source: string;
  surah: number;
  verseCount: number;
  verses: Record<string, WordAudioSegment[]>;
}

export interface QulMorphologySegment {
  text: string;
  type: "prefix" | "root" | "pronoun";
  pos: string;
}

export interface QulMorphologyEntry {
  wordId: string;
  verse: number;
  wordIndex: number;
  rootAr: string;
  lemmaAr: string;
  pos: string;
  posFa: string;
  segments: QulMorphologySegment[];
}

export interface QulMorphologyFile {
  schema: string;
  source: string;
  surah: number;
  wordCount: number;
  words: Record<string, QulMorphologyEntry>;
}

const timingCache = new Map<string, Record<string, WordAudioSegment[]>>();
const morphCache = new Map<string, Record<string, QulMorphologyEntry>>();
const tajweedCache = new Map<string, SurahTajweedData | null>();

function basePrefix(): string {
  const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL;
  return b || "/";
}

export function clearQulReferenceCache(): void {
  timingCache.clear();
  morphCache.clear();
  tajweedCache.clear();
}

export async function loadQulAudioTimings(
  slug: string = ACTIVE_SURAH.slug,
  surahNumber: number = getActiveSurahNumber(),
): Promise<Record<string, WordAudioSegment[]>> {
  const cacheKey = `${slug}:${surahNumber}`;
  const cached = timingCache.get(cacheKey);
  if (cached) return cached;
  if (surahNumber !== 28) {
    try {
      const row = await ldb.meta.get(`surahTimings:${surahNumber}`);
      const verses = (row?.value as Record<string, WordAudioSegment[]> | undefined) ?? {};
      timingCache.set(cacheKey, verses);
      return verses;
    } catch {
      return {};
    }
  }
  try {
    const res = await fetch(`${basePrefix()}content/base/${slug}.audio-timing.json`);
    if (!res.ok) return {};
    const data = (await res.json()) as QulAudioTimingFile;
    const verses = data.verses ?? {};
    timingCache.set(cacheKey, verses);
    return verses;
  } catch {
    return {};
  }
}

export async function loadQulMorphology(
  slug: string = ACTIVE_SURAH.slug,
  surahNumber: number = getActiveSurahNumber(),
): Promise<Record<string, QulMorphologyEntry>> {
  const cacheKey = `${slug}:${surahNumber}`;
  const cached = morphCache.get(cacheKey);
  if (cached) return cached;
  if (surahNumber !== 28) {
    try {
      const row = await ldb.meta.get(`surahMorph:${surahNumber}`);
      const words = (row?.value as Record<string, QulMorphologyEntry> | undefined) ?? {};
      morphCache.set(cacheKey, words);
      return words;
    } catch {
      return {};
    }
  }
  try {
    const res = await fetch(`${basePrefix()}content/base/${slug}.morphology.json`);
    if (!res.ok) return {};
    const data = (await res.json()) as QulMorphologyFile;
    const words = data.words ?? {};
    morphCache.set(cacheKey, words);
    return words;
  } catch {
    return {};
  }
}

export async function loadTajweedData(
  slug: string = ACTIVE_SURAH.slug,
): Promise<SurahTajweedData | null> {
  if (tajweedCache.has(slug)) return tajweedCache.get(slug) ?? null;
  try {
    const res = await fetch(`${basePrefix()}content/base/${slug}.tajweed.json`);
    if (!res.ok) {
      tajweedCache.set(slug, null);
      return null;
    }
    const data = (await res.json()) as SurahTajweedData;
    tajweedCache.set(slug, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * یافتن شماره کلمه فعال (۱-مبنا) بر اساس زمان فعلی پخش صوت (میلی‌ثانیه)
 */
export function findActiveWordAtMs(
  segments: WordAudioSegment[] | undefined,
  currentTimeMs: number,
): number | null {
  if (!segments || segments.length === 0 || !Number.isFinite(currentTimeMs) || currentTimeMs < 0) {
    return null;
  }

  for (let i = 0; i < segments.length; i++) {
    const [wordIdx, startMs, endMs] = segments[i];
    if (currentTimeMs >= startMs && currentTimeMs <= endMs) {
      return wordIdx;
    }
    // در فاصله بسیار کوتاه بین دو کلمه، کلمه قبلی را تا شروع کلمه بعدی فعال نگه می‌داریم
    if (i + 1 < segments.length && currentTimeMs > endMs && currentTimeMs < segments[i + 1][1]) {
      return wordIdx;
    }
  }

  return null;
}
