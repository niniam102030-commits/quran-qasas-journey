// src/db/database.ts
import Dexie, { type Table } from "dexie";
import type {
  CityNode,
  Unit,
  Lesson,
  VerseData,
  WordMorphology,
  Challenge,
  VoiceClip,
  FSRSCardState,
  UserStats,
  AudioCacheEntry,
} from "../types/schema";

export class QuranJourneyDB extends Dexie {
  cities!: Table<CityNode, string>;
  units!: Table<Unit, string>;
  lessons!: Table<Lesson, string>;
  verses!: Table<VerseData, string>;
  words!: Table<WordMorphology, string>;
  challenges!: Table<Challenge, string>;
  voiceClips!: Table<VoiceClip, string>;
  fsrsCards!: Table<FSRSCardState, string>;
  userStats!: Table<UserStats, string>;
  audioCache!: Table<AudioCacheEntry, string>;

  constructor() {
    // دیتابیس مستقل ویژه سوره مبارکه قصص نسخه ۲ با ساختار هماهنگ ۵ ایستگاه قرآنی
    super("QuranQasasOfflineDB_v2");

    this.version(1).stores({
      cities: "id, order",
      units: "id, cityId, order",
      lessons: "id, cityId, unitId, order, targetVerseId",
      verses: "id, surahNumber, ayahNumber",
      words: "id, category, rootLetters",
      challenges: "id, lessonId, order, layer, type, targetWordId",
      voiceClips: "id, speakerName",
      fsrsCards: "wordId, due, state, [state+due]",
      userStats: "id",
      audioCache: "url, cityId",
    });
  }
}

export const db = new QuranJourneyDB();

/**
 * مقداردهی اولیه وضعیت کاربر در اولین اجرای برنامه سوره قصص
 */
export async function ensureDefaultUserStats(): Promise<UserStats> {
  const existing = await db.userStats.get("singleton_user");
  if (existing) return existing;

  const initialStats: UserStats = {
    id: "singleton_user",
    noorXp: 0,
    aqeeqGems: 50,
    lampsCount: 5,
    chillehCurrentDays: 0,
    chillehBestDays: 0,
    chillehStage: 7,
    lastActiveDateIso: null,
    unlockedCityIds: ["qasas_station_nile"],
    completedLessonIds: [],
    currentCityId: "qasas_station_nile",
    currentLessonId: "lesson_u_p385b",
    darkMode: false,
    soundEffectsEnabled: true,
  };

  await db.userStats.put(initialStats);
  return initialStats;
}

/**
 * محتوای پایگاه‌داده از طریق contentLoader.syncContent() از فایل‌های JSON بارگذاری می‌شود.
 */
export async function seedInitialDatabase(): Promise<void> {
  // مهاجرت داده‌ها به QasasLearningDB انجام شده است.
}

/**
 * استخراج لیست یکتای تمام فایل‌های صوتی وابسته به یک شهر
 */
export async function collectCityAudioUrls(cityId: string): Promise<string[]> {
  const [city, lessons] = await Promise.all([
    db.cities.get(cityId),
    db.lessons.where("cityId").equals(cityId).toArray(),
  ]);

  const urlSet = new Set<string>();

  if (city && city.voiceClipIds.length > 0) {
    const clips = await db.voiceClips.bulkGet(city.voiceClipIds);
    for (const clip of clips) {
      if (clip?.audioUrl) {
        urlSet.add(clip.audioUrl);
      }
    }
  }

  const verseIds = Array.from(new Set(lessons.map((l) => l.targetVerseId)));
  const wordIds = Array.from(new Set(lessons.flatMap((l) => l.wordIds)));

  const [verses, words] = await Promise.all([
    db.verses.bulkGet(verseIds),
    db.words.bulkGet(wordIds),
  ]);

  for (const verse of verses) {
    if (verse?.menshawiAudioUrl) {
      urlSet.add(verse.menshawiAudioUrl);
    }
  }

  for (const word of words) {
    if (word?.audioWbwUrl) {
      urlSet.add(word.audioWbwUrl);
    }
  }

  return Array.from(urlSet);
}

/**
 * دانلود و کش کردن باینری (Blob) صوت‌ها
 */
export async function cacheCityAudioPack(
  cityId: string,
  onProgress?: (cachedCount: number, totalCount: number) => void
): Promise<{ cachedCount: number; totalCount: number }> {
  const urls = await collectCityAudioUrls(cityId);
  const totalCount = urls.length;
  let cachedCount = 0;

  if (totalCount === 0) {
    onProgress?.(0, 0);
    return { cachedCount: 0, totalCount: 0 };
  }

  for (const url of urls) {
    const existing = await db.audioCache.get(url);
    if (existing) {
      cachedCount += 1;
      onProgress?.(cachedCount, totalCount);
      continue;
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const entry: AudioCacheEntry = {
          url,
          cityId,
          blob,
          cachedAtIso: new Date().toISOString(),
        };
        await db.audioCache.put(entry);
      }
    } catch {
      // عبور بدون وقفه در نبود شبکه
    } finally {
      cachedCount += 1;
      onProgress?.(cachedCount, totalCount);
    }
  }

  return { cachedCount, totalCount };
}

/**
 * بازیابی فایل صوتی از کش آفلاین IndexedDB
 */
export async function resolveOfflineAudioUrl(url: string): Promise<{
  playbackUrl: string;
  isBlobUrl: boolean;
}> {
  const cached = await db.audioCache.get(url);
  if (cached && cached.blob.size > 0) {
    return {
      playbackUrl: URL.createObjectURL(cached.blob),
      isBlobUrl: true,
    };
  }
  return {
    playbackUrl: url,
    isBlobUrl: false,
  };
}

/**
 * پاک‌سازی کش صوتی
 */
export async function clearCityAudioCache(cityId: string): Promise<number> {
  return db.audioCache.where("cityId").equals(cityId).delete();
}
