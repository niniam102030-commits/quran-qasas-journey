// src/services/menshawiAudio.ts
// سرویس پخش و کش آفلاین تلاوت استاد محمد صدیق منشاوی (مرتل) — پارامتریک برای هر سوره
import { ldb, type SurahAudioCacheRow } from "../db/learningDb";
import { ACTIVE_SURAH } from "../config/surahConfig";

const PER_MIRROR_TIMEOUT_MS = 12000;

export function getMenshawiUrls(
  verse: number,
  surahNumber: number = ACTIVE_SURAH.number,
): string[] {
  const paddedSurah = String(surahNumber).padStart(3, "0");
  const paddedVerse = String(verse).padStart(3, "0");
  const code = `${paddedSurah}${paddedVerse}`;
  return [
    `https://verses.quran.com/Minshawi/Murattal/mp3/${code}.mp3`,
    `https://audio.qurancdn.com/Minshawi/Murattal/mp3/${code}.mp3`,
    `https://everyayah.com/data/Minshawy_Murattal_128kbps/${code}.mp3`,
  ];
}

function rowToBlob(row: SurahAudioCacheRow | undefined): Blob | null {
  if (!row) return null;
  if (row.data && row.data.byteLength > 1024) {
    return new Blob([row.data], { type: "audio/mpeg" });
  }
  if (row.blob && row.blob.size > 1024) {
    return row.blob;
  }
  return null;
}

export async function isVerseAudioCached(
  verse: number,
  surahNumber: number = ACTIVE_SURAH.number,
): Promise<boolean> {
  const row = await ldb.surahAudioCache.get([surahNumber, verse]);
  return rowToBlob(row) !== null;
}

export async function getAudioCacheStats(
  surahNumber: number = ACTIVE_SURAH.number,
): Promise<{
  cachedVerses: number[];
  totalBytes: number;
  totalMb: number;
}> {
  const rows = await ldb.surahAudioCache.where("surah").equals(surahNumber).toArray();
  const valid = rows.filter((r) => rowToBlob(r) !== null);
  const totalBytes = valid.reduce((acc, r) => acc + (r.size || r.data?.byteLength || r.blob?.size || 0), 0);
  return {
    cachedVerses: valid.map((r) => r.verse).sort((a, b) => a - b),
    totalBytes,
    totalMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
  };
}

async function fetchWithTimeout(url: string, outerSignal?: AbortSignal): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort();
    } else {
      outerSignal.addEventListener("abort", onOuterAbort, { once: true });
    }
  }
  const timer = setTimeout(() => controller.abort(), PER_MIRROR_TIMEOUT_MS);

  try {
    const res = await fetch(url, { mode: "cors", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 1024) throw new Error("فایل صوتی ناقص دریافت شد");
    return buffer;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * دریافت Blob صوتی آیه از کش آفلاین؛ اگر در کش نبود، از سریع‌ترین سرور دارای CORS دانلود و به‌صورت ArrayBuffer (سازگار با Android WebView) در IndexedDB ذخیره می‌شود
 */
export async function fetchAndCacheVerseAudio(
  verse: number,
  signal?: AbortSignal,
  surahNumber: number = ACTIVE_SURAH.number,
): Promise<Blob> {
  const existing = rowToBlob(await ldb.surahAudioCache.get([surahNumber, verse]));
  if (existing) return existing;

  let lastError: unknown = null;
  for (const url of getMenshawiUrls(verse, surahNumber)) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const data = await fetchWithTimeout(url, signal);
      try {
        await ldb.surahAudioCache.put({
          surah: surahNumber,
          verse,
          data,
          size: data.byteLength,
          cachedAt: Date.now(),
        });
      } catch {
        // اگر حافظه IndexedDB پر باشد، حداقل صوت برای پخش برگردانده می‌شود
      }
      return new Blob([data], { type: "audio/mpeg" });
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
 * دانلود یکجای فهرستی از آیات با ۳ دانلود هم‌زمان + تلاش مجدد خودکار برای سرعت و پایداری بالا
 */
export async function prefetchVersesAudio(
  verses: number[],
  onProgress?: (done: number, total: number, currentVerse: number) => void,
  signal?: AbortSignal,
  maxVerse: number = ACTIVE_SURAH.verseCount,
): Promise<{ downloaded: number; failed: number }> {
  let downloaded = 0;
  let failed = 0;
  let doneCount = 0;
  const unique = [...new Set(verses)].filter((v) => v >= 1 && v <= maxVerse).sort((a, b) => a - b);
  let cursor = 0;

  const worker = async () => {
    while (cursor < unique.length && !signal?.aborted) {
      const v = unique[cursor++];
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok && !signal?.aborted; attempt++) {
        try {
          await fetchAndCacheVerseAudio(v, signal);
          ok = true;
        } catch {
          if (signal?.aborted) return;
        }
      }
      if (ok) downloaded++;
      else failed++;
      doneCount++;
      onProgress?.(doneCount, unique.length, v);
    }
  };

  const concurrency = Math.min(3, unique.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { downloaded, failed };
}

export async function clearAudioCache(
  verses?: number[],
  surahNumber: number = ACTIVE_SURAH.number,
): Promise<void> {
  if (!verses || verses.length === 0) {
    await ldb.surahAudioCache.where("surah").equals(surahNumber).delete();
    return;
  }
  await ldb.surahAudioCache.bulkDelete(verses.map((v) => [surahNumber, v] as [number, number]));
}
