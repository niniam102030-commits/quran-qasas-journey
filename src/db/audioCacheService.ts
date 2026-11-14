// src/db/audioCacheService.ts
import { db } from "./database";
import type { VoiceClip, Lesson, VerseData, WordMorphology, AudioCacheEntry } from "../types/schema";

export interface CityAudioDownloadProgress {
    cityId: string;
    totalFiles: number;
    completedFiles: number;
    percentage: number;
    isComplete: boolean;
}

class AudioCacheService {
    // نگهداری ObjectURLهای ساخته‌شده در حافظه برای جلوگیری از ساخت تکراری و نشت حافظه
    private activeObjectUrls: Map<string, string> = new Map();

    /**
     * دریافت آدرس قابل پخش برای تگ Audio:
     * ابتدا IndexedDB را بررسی می‌کند؛ اگر فایل آفلاین موجود بود Blob URL برمی‌گرداند،
     * در غیر این صورت آدرس شبکه را برمی‌گرداند و در پس‌زمینه کش می‌کند.
     */
    async resolvePlayableUrl(url: string, cityId: string = "global"): Promise<string> {
        if (!url) return "";

        const memCached = this.activeObjectUrls.get(url);
        if (memCached) return memCached;

        try {
            const cachedEntry = await db.audioCache.get(url);
            if (cachedEntry && cachedEntry.blob) {
                const objectUrl = URL.createObjectURL(cachedEntry.blob);
                this.activeObjectUrls.set(url, objectUrl);
                return objectUrl;
            }
        } catch (err) {
            console.warn("[AudioCacheService] خطا در خواندن کش آفلاین:", err);
        }

        // کش کردن غیرمسدودکننده در پس‌زمینه برای دفعات بعد
        this.fetchAndCacheSingleAudio(url, cityId).catch(() => {
            // در صورت آفلاین بودن شبکه، خطا را نادیده می‌گیریم تا برنامه متوقف نشود
        });

        return url;
    }

    /**
     * دانلود و ذخیره یک فایل صوتی در IndexedDB
     */
    async fetchAndCacheSingleAudio(url: string, cityId: string): Promise<boolean> {
        if (!url) return false;

        try {
            const existing = await db.audioCache.get(url);
            if (existing) return true;

            const response = await fetch(url);
            if (!response.ok) return false;

            const blob = await response.blob();
            await db.audioCache.put({
                url,
                cityId,
                blob,
                cachedAtIso: new Date().toISOString(),
            });

            const objectUrl = URL.createObjectURL(blob);
            this.activeObjectUrls.set(url, objectUrl);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * جمع‌آوری تمام آدرس‌های صوتی مرتبط با یک شهر (آیات، تک‌کلمات و صوت‌های میزبان)
     */
    async collectCityAudioUrls(cityId: string): Promise<string[]> {
        const urlSet = new Set<string>();

        const city = await db.cities.get(cityId);
        if (city && city.voiceClipIds.length > 0) {
            const clips = await db.voiceClips.bulkGet(city.voiceClipIds);
            clips.forEach((clip: VoiceClip | undefined) => {
                if (clip?.audioUrl) urlSet.add(clip.audioUrl);
            });
        }

        const lessons: Lesson[] = await db.lessons.where("cityId").equals(cityId).toArray();
        const verseIds = new Set<string>();
        const wordIds = new Set<string>();

        lessons.forEach((lesson: Lesson) => {
            if (lesson.targetVerseId) verseIds.add(lesson.targetVerseId);
            lesson.wordIds.forEach((wId: string) => wordIds.add(wId));
        });

        if (verseIds.size > 0) {
            const verses = await db.verses.bulkGet(Array.from(verseIds));
            verses.forEach((v: VerseData | undefined) => {
                if (v?.menshawiAudioUrl) urlSet.add(v.menshawiAudioUrl);
            });
        }

        if (wordIds.size > 0) {
            const words = await db.words.bulkGet(Array.from(wordIds));
            words.forEach((w: WordMorphology | undefined) => {
                if (w?.audioWbwUrl) urlSet.add(w.audioWbwUrl);
            });
        }

        return Array.from(urlSet);
    }

    /**
     * بررسی وضعیت کش آفلاین یک شهر
     */
    async getCityCacheStatus(cityId: string): Promise<CityAudioDownloadProgress> {
        const urls = await this.collectCityAudioUrls(cityId);
        if (urls.length === 0) {
            return {
                cityId,
                totalFiles: 0,
                completedFiles: 0,
                percentage: 100,
                isComplete: true,
            };
        }

        const cachedEntries = await db.audioCache.bulkGet(urls);
        const completedFiles = cachedEntries.filter(Boolean).length;
        const percentage = Math.round((completedFiles / urls.length) * 100);

        return {
            cityId,
            totalFiles: urls.length,
            completedFiles,
            percentage,
            isComplete: completedFiles === urls.length,
        };
    }

    /**
     * دانلود یکجای تمام فایل‌های صوتی یک شهر با گزارش پیشرفت لحظه‌ای
     */
    async downloadCityAudioPack(
        cityId: string,
        onProgress?: (progress: CityAudioDownloadProgress) => void
    ): Promise<CityAudioDownloadProgress> {
        const urls = await this.collectCityAudioUrls(cityId);
        const totalFiles = urls.length;

        if (totalFiles === 0) {
            const emptyProgress: CityAudioDownloadProgress = {
                cityId,
                totalFiles: 0,
                completedFiles: 0,
                percentage: 100,
                isComplete: true,
            };
            onProgress?.(emptyProgress);
            return emptyProgress;
        }

        let completedFiles = 0;

        for (const url of urls) {
            await this.fetchAndCacheSingleAudio(url, cityId);
            completedFiles += 1;

            const progress: CityAudioDownloadProgress = {
                cityId,
                totalFiles,
                completedFiles,
                percentage: Math.round((completedFiles / totalFiles) * 100),
                isComplete: completedFiles === totalFiles,
            };
            onProgress?.(progress);
        }

        return {
            cityId,
            totalFiles,
            completedFiles,
            percentage: 100,
            isComplete: true,
        };
    }

    /**
     * آزادسازی حافظه و حذف کش صوتی یک شهر خاص (برای مدیریت فضای ذخیره‌سازی)
     */
    async clearCityAudioCache(cityId: string): Promise<void> {
        const entries: AudioCacheEntry[] = await db.audioCache.where("cityId").equals(cityId).toArray();
        entries.forEach((entry: AudioCacheEntry) => {
            const objUrl = this.activeObjectUrls.get(entry.url);
            if (objUrl) {
                URL.revokeObjectURL(objUrl);
                this.activeObjectUrls.delete(entry.url);
            }
        });
        await db.audioCache.where("cityId").equals(cityId).delete();
    }
}

export const audioCacheService = new AudioCacheService();
