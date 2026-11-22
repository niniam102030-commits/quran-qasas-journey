// src/services/menshawiAudio.ts
// سرویس پخش و کش آفلاین تلاوت استاد محمد صدیق منشاوی (مرتل) برای ۸۸ آیه سوره قصص
import { ldb } from "../db/learningDb";

// سوره قصص (شماره ۲۸) در کل قرآن از آیه جهانی ۳۲۵۳ آغاز می‌شود
const QASAS_GLOBAL_OFFSET = 3252;

export function getMenshawiUrls(verse: number): string[] {
  const padded = String(verse).padStart(3, "0");
  const globalAyah = QASAS_GLOBAL_OFFSET + verse;
  return [
    `https://everyayah.com/data/Minshawy_Murattal_128kbps/028${padded}.mp3`,
    `https://cdn.islamic.network/quran/audio/128/ar.minshawi/${globalAyah}.mp3`,
  ];
}

export async function isVerseAudioCached(verse: number): Promise<boolean> {
  const row = await ldb.audioCache.get(verse);
  return Boolean(row && row.blob && row.blob.size > 1024);
}

export async function getAudioCacheStats(): Promise<{
  cachedVerses: number[];
  totalBytes: number;
  totalMb: number;
}> {
  const rows = await ldb.audioCache.toArray();
  const valid = rows.filter((r) => r.blob && r.blob.size > 1024);
  const totalBytes = valid.reduce((acc, r) => acc + (r.size || r.blob.size), 0);
  return {
    cachedVerses: valid.map((r) => r.verse).sort((a, b) => a - b),
    totalBytes,
    totalMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
  };
}

/**
 * دریافت Blob صوتی آیه از کش آفلاین؛ اگر در کش نبود، دانلود و ذخیره در IndexedDB
 */
export async function fetchAndCacheVerseAudio(
  verse: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const existing = await ldb.audioCache.get(verse);
  if (existing && existing.blob && existing.blob.size > 1024) {
    return existing.blob;
  }

  let lastError: unknown = null;
  for (const url of getMenshawiUrls(verse)) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size < 1024) continue;
      await ldb.audioCache.put({
        verse,
        blob,
        size: blob.size,
        cachedAt: Date.now(),
      });
      return blob;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`دریافت صوت تلاوت آیه ${verse} ناموفق بود (اتصال اینترنت را بررسی کنید).`);
}

/**
 * دانلود یکجای فهرستی از آیات (مثلاً یک واحد یا کل ۸۸ آیه سوره قصص)
 */
export async function prefetchVersesAudio(
  verses: number[],
  onProgress?: (done: number, total: number, currentVerse: number) => void,
  signal?: AbortSignal,
): Promise<{ downloaded: number; failed: number }> {
  let downloaded = 0;
  let failed = 0;
  const unique = [...new Set(verses)].filter((v) => v >= 1 && v <= 88).sort((a, b) => a - b);
  for (let i = 0; i < unique.length; i++) {
    if (signal?.aborted) break;
    const v = unique[i];
    try {
      await fetchAndCacheVerseAudio(v, signal);
      downloaded++;
    } catch {
      if (signal?.aborted) break;
      failed++;
    }
    onProgress?.(i + 1, unique.length, v);
  }
  return { downloaded, failed };
}

export async function clearAudioCache(verses?: number[]): Promise<void> {
  if (!verses || verses.length === 0) {
    await ldb.audioCache.clear();
    return;
  }
  await ldb.audioCache.bulkDelete(verses);
}
