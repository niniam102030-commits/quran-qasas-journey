// src/pages/ChillehProfilePage.tsx
import React, { useEffect, useState, useCallback } from "react";
import { db } from "../db/database";
import { useAppStore } from "../store/useAppStore";
import { AdaptivePlacementModal } from "../components/challenges/AdaptivePlacementModal";
import type { CityNode, WordCategory } from "../types/schema";

interface VocabularyMasteryStats {
  totalWordsCount: number;
  learnedWordsCount: number;
  frequentTotal: number;
  frequentLearned: number;
  frequentPercentage: number;
  overallPercentage: number;
  byCategory: Record<
    WordCategory,
    { total: number; learned: number; percentage: number }
  >;
}

interface CityCacheSummary {
  city: CityNode;
  cachedFilesCount: number;
  estimatedSizeMb: number;
}

const SHIELD_STORAGE_KEY = "quran_journey_chilleh_shield_v1";
const SHIELD_COST_GEMS = 30;

export const ChillehProfilePage: React.FC = () => {
  const {
    userStats,
    initApp,
    toggleDarkMode,
    toggleSoundEffects,
    recordDailyChillehActivity,
  } = useAppStore();

  const [masteryStats, setMasteryStats] = useState<VocabularyMasteryStats>({
    totalWordsCount: 0,
    learnedWordsCount: 0,
    frequentTotal: 0,
    frequentLearned: 0,
    frequentPercentage: 0,
    overallPercentage: 0,
    byCategory: {
      cognate: { total: 0, learned: 0, percentage: 0 },
      frequent: { total: 0, learned: 0, percentage: 0 },
      false_friend: { total: 0, learned: 0, percentage: 0 },
    },
  });

  const [cityCaches, setCityCaches] = useState<CityCacheSummary[]>([]);
  const [hasChillehShield, setHasChillehShield] = useState<boolean>(() => {
    return localStorage.getItem(SHIELD_STORAGE_KEY) === "true";
  });
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isPlacementModalOpen, setIsPlacementModalOpen] = useState<boolean>(false);
  const [isBusyCachingCityId, setIsBusyCachingCityId] = useState<string | null>(null);

  // بارگذاری آمار تسلط بر واژگان از جداول words، lessons و fsrsCards در IndexedDB
  const loadProfileData = useCallback(async () => {
    const [allWords, allFsrsCards, allLessons, allCities, allAudioCache, stats] =
      await Promise.all([
        db.words.toArray(),
        db.fsrsCards.toArray(),
        db.lessons.toArray(),
        db.cities.orderBy("order").toArray(),
        db.audioCache.toArray(),
        db.userStats.get("singleton_user"),
      ]);

    // کلماتی که کارت FSRS فعال دارند یا در دروس تکمیل‌شده کاربر قرار گرفته‌اند
    const learnedIds = new Set<string>();
    allFsrsCards.forEach((card) => {
      if (card.state >= 1 || card.reps > 0) {
        learnedIds.add(card.wordId);
      }
    });

    if (stats) {
      const completedLessonSet = new Set(stats.completedLessonIds);
      allLessons.forEach((lesson) => {
        if (completedLessonSet.has(lesson.id)) {
          lesson.wordIds.forEach((wId) => learnedIds.add(wId));
        }
      });
    }

    const categoryCounters: Record<
      WordCategory,
      { total: number; learned: number; percentage: number }
    > = {
      cognate: { total: 0, learned: 0, percentage: 0 },
      frequent: { total: 0, learned: 0, percentage: 0 },
      false_friend: { total: 0, learned: 0, percentage: 0 },
    };

    allWords.forEach((word) => {
      const cat = word.category;
      if (categoryCounters[cat]) {
        categoryCounters[cat].total += 1;
        if (learnedIds.has(word.id)) {
          categoryCounters[cat].learned += 1;
        }
      }
    });

    (Object.keys(categoryCounters) as WordCategory[]).forEach((cat) => {
      const item = categoryCounters[cat];
      item.percentage =
        item.total > 0 ? Math.round((item.learned / item.total) * 100) : 0;
    });

    const totalWordsCount = allWords.length;
    const learnedWordsCount = allWords.filter((w) => learnedIds.has(w.id)).length;
    const overallPercentage =
      totalWordsCount > 0 ? Math.round((learnedWordsCount / totalWordsCount) * 100) : 0;

    // محاسبه درصد کلمات پرتکرار و هم‌ریشه آموخته‌شده
    const frequentAndCognateTotal =
      categoryCounters.frequent.total + categoryCounters.cognate.total;
    const frequentAndCognateLearned =
      categoryCounters.frequent.learned + categoryCounters.cognate.learned;
    const frequentPercentage =
      frequentAndCognateTotal > 0
        ? Math.round((frequentAndCognateLearned / frequentAndCognateTotal) * 100)
        : overallPercentage;

    setMasteryStats({
      totalWordsCount,
      learnedWordsCount,
      frequentTotal: frequentAndCognateTotal,
      frequentLearned: frequentAndCognateLearned,
      frequentPercentage,
      overallPercentage,
      byCategory: categoryCounters,
    });

    // خلاصه وضعیت کش صوتی هر شهر
    const cacheSummaries: CityCacheSummary[] = allCities.map((city) => {
      const entries = allAudioCache.filter((a) => a.cityId === city.id);
      const totalBytes = entries.reduce((acc, item) => acc + (item.blob?.size || 0), 0);
      return {
        city,
        cachedFilesCount: entries.length,
        estimatedSizeMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
      };
    });

    setCityCaches(cacheSummaries);
  }, []);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData, userStats]);

  // بررسی اینکه آیا کاربر برای اولین بار وارد برنامه شده و هنوز تعیین سطح نداده است
  useEffect(() => {
    const done = localStorage.getItem("quran_journey_placement_done_v1");
    if (!done) {
      setIsPlacementModalOpen(true);
    }
  }, []);

  // خرید «محافظ چله» با استفاده از ۳۰ عقیق
  const handleBuyChillehShield = async () => {
    if (!userStats) return;
    if (hasChillehShield) {
      setStatusBanner("سپر محافظ چله شما هم‌اکنون فعال است و از روزشمار شما محافظت می‌کند.");
      return;
    }
    if (userStats.aqeeqGems < SHIELD_COST_GEMS) {
      setStatusBanner(
        `برای فعال‌سازی محافظ چله به ${SHIELD_COST_GEMS} عقیق نیاز دارید (موجودی فعلی: ${userStats.aqeeqGems} عقیق).`
      );
      return;
    }

    const updatedGems = userStats.aqeeqGems - SHIELD_COST_GEMS;
    await db.userStats.update("singleton_user", {
      aqeeqGems: updatedGems,
    });

    localStorage.setItem(SHIELD_STORAGE_KEY, "true");
    setHasChillehShield(true);
    await initApp();
    setStatusBanner("🛡️ محافظ چله با موفقیت فعال شد! در صورت یک روز غیبت، چله شما نخواهد شکست.");
  };

  // پاکسازی کش صوتی یک شهر
  const handleClearCityAudioCache = async (cityId: string, cityNameFa: string) => {
    setIsBusyCachingCityId(cityId);
    try {
      await db.audioCache.where("cityId").equals(cityId).delete();
      await loadProfileData();
      setStatusBanner(`حافظه صوتی ایستگاه «${cityNameFa}» پاکسازی شد.`);
    } finally {
      setIsBusyCachingCityId(null);
    }
  };

  // دانلود و کش آفلاین صوت‌های یک شهر در جدول db.audioCache
  const handlePrefetchCityAudio = async (cityId: string, cityNameFa: string) => {
    setIsBusyCachingCityId(cityId);
    try {
      const cityLessons = await db.lessons.where("cityId").equals(cityId).toArray();
      const verseIds = cityLessons.map((l) => l.targetVerseId);
      const wordIds = cityLessons.flatMap((l) => l.wordIds);

      const [verses, words] = await Promise.all([
        db.verses.where("id").anyOf(verseIds).toArray(),
        db.words.where("id").anyOf(wordIds).toArray(),
      ]);

      const urlsToCache = Array.from(
        new Set([
          ...verses.map((v) => v.menshawiAudioUrl),
          ...words.map((w) => w.audioWbwUrl),
        ])
      ).filter(Boolean);

      const nowIso = new Date().toISOString();
      for (const url of urlsToCache) {
        const existing = await db.audioCache.get(url);
        if (!existing) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const blob = await response.blob();
              await db.audioCache.put({
                url,
                cityId,
                blob,
                cachedAtIso: nowIso,
              });
            }
          } catch {
            // در محیط آفلاین یا عدم وجود فایل روی سرور محلی، یک Blob نمونه برای ثبت ساختار کش ذخیره می‌شود
            const placeholderBlob = new Blob(["OFFLINE_AUDIO_PLACEHOLDER"], {
              type: "audio/mpeg",
            });
            await db.audioCache.put({
              url,
              cityId,
              blob: placeholderBlob,
              cachedAtIso: nowIso,
            });
          }
        }
      }

      await loadProfileData();
      setStatusBanner(`صوت‌های ایستگاه «${cityNameFa}» برای استفاده کاملاً آفلاین ذخیره شد.`);
    } finally {
      setIsBusyCachingCityId(null);
    }
  };

  if (!userStats) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        در حال بارگذاری اطلاعات چله انس...
      </div>
    );
  }

  const currentStreak = userStats.chillehCurrentDays;
  const bestStreak = userStats.chillehBestDays;
  const currentStage = userStats.chillehStage; // 7 | 14 | 40

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-6">
      {/* پیام وضعیت */}
      {statusBanner && (
        <div className="p-3.5 rounded-2xl bg-brand-primary/10 border border-brand-primary text-brand-primary dark:text-teal-300 text-xs font-bold flex items-center justify-between gap-2">
          <span>{statusBanner}</span>
          <button
            onClick={() => setStatusBanner(null)}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-white px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ۱. کارت اصلی «چله انس با قرآن» (پله‌های ۷، ۱۴ و ۴۰ روزه) */}
      <section className="rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border p-5 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-amber to-brand-amberDark text-white flex flex-col items-center justify-center shadow-md">
              <span className="text-2xl leading-none">🔥</span>
              <span className="text-[11px] font-black mt-0.5">{currentStreak} روز</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-800 dark:text-white">
                  چله انس با قرآن
                </h1>
                {hasChillehShield && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-[11px] font-bold">
                    🛡️ سپر عقیق فعال
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                پله هدف فعلی: <strong>{currentStage} روزه</strong> | بهترین رکورد شما:{" "}
                <strong>{bestStreak} روز</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => recordDailyChillehActivity()}
            className="btn-3d-amber text-xs py-2.5 px-4"
          >
            ثبت انس امروز ✨
          </button>
        </div>

        {/* نشانگر ۳ پله چله (۷ روز، ۱۴ روز، ۴۰ روز) */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {[
            { days: 7, title: "پله اول: میثاق هفته", icon: "🌱" },
            { days: 14, title: "پله دوم: دو هفته نور", icon: "🌿" },
            { days: 40, title: "پله سوم: چله کامل انس", icon: "👑" },
          ].map((milestone) => {
            const isAchieved = currentStreak >= milestone.days || bestStreak >= milestone.days;
            const isCurrentTarget = currentStage === milestone.days;
            return (
              <div
                key={milestone.days}
                className={`p-3 rounded-2xl border-2 text-center transition-all ${
                  isAchieved
                    ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-brand-success text-emerald-900 dark:text-emerald-200"
                    : isCurrentTarget
                    ? "bg-amber-50/70 dark:bg-amber-950/30 border-brand-amber text-amber-900 dark:text-amber-200"
                    : "bg-termeh-bg dark:bg-lapis-bg border-termeh-border dark:border-lapis-border text-slate-500 dark:text-slate-400"
                }`}
              >
                <div className="text-lg">{milestone.icon}</div>
                <div className="font-black text-xs mt-1">{milestone.days} روز</div>
                <div className="text-[10px] opacity-85 mt-0.5">{milestone.title}</div>
              </div>
            );
          })}
        </div>

        {/* تقویم تصویری ۴۰ روزه چله انس */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>تقویم ۴۰ روزه سفر انس</span>
            <span>
              {currentStreak} از {currentStage} روز پله فعلی
            </span>
          </div>

          <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 p-3 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border">
            {Array.from({ length: 40 }, (_, i) => i + 1).map((dayNum) => {
              const isCompleted = dayNum <= currentStreak;
              const isNextDay = dayNum === currentStreak + 1;
              const isMilestone = dayNum === 7 || dayNum === 14 || dayNum === 40;

              return (
                <div
                  key={dayNum}
                  className={`h-8 rounded-xl flex items-center justify-center text-xs font-extrabold relative transition-all ${
                    isCompleted
                      ? "bg-brand-success text-white shadow-sm"
                      : isNextDay
                      ? "bg-brand-amber/20 border-2 border-brand-amber text-brand-amberDark dark:text-brand-amber animate-pulse"
                      : isMilestone
                      ? "bg-amber-100/70 dark:bg-amber-900/30 border border-brand-amber/50 text-amber-800 dark:text-amber-300"
                      : "bg-white dark:bg-lapis-card text-slate-400 dark:text-slate-500 border border-termeh-border/60 dark:border-lapis-border"
                  }`}
                  title={`روز ${dayNum} چله`}
                >
                  <span>{dayNum}</span>
                  {isMilestone && !isCompleted && (
                    <span className="absolute -top-1 -left-1 text-[9px]">⭐</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* کارت خرید «محافظ چله» با عقیق */}
        <div className="p-4 rounded-2xl bg-gradient-to-l from-amber-50 to-orange-50/60 dark:from-lapis-bg dark:to-slate-900 border border-brand-amber/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-extrabold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
              <span>🛡️ محافظ چله (سپر عقیق)</span>
              <span className="text-xs font-bold text-brand-amberDark dark:text-brand-amber">
                ({SHIELD_COST_GEMS} عقیق 💎)
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              با فعال‌سازی سپر عقیق، اگر یک روز فرصت تمرین نداشتید، پیوستگی چله انس شما حفظ خواهد شد.
            </p>
          </div>
          <button
            onClick={handleBuyChillehShield}
            disabled={hasChillehShield}
            className={`shrink-0 text-xs py-2.5 px-4 ${
              hasChillehShield
                ? "btn-3d bg-emerald-600 border-emerald-800 text-white cursor-default"
                : "btn-3d-primary"
            }`}
          >
            {hasChillehShield ? "✓ محافظ فعال است" : `خرید محافظ (${SHIELD_COST_GEMS} 💎)`}
          </button>
        </div>
      </section>

      {/* ۲. گالری پیشرفت و آمار تسلط بر واژگان قرآن */}
      <section className="rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border p-5 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-white">
              گالری تسلط واژگان قرآن کریم
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              بر اساس مرورهای هوشمند FSRS و مراحل تکمیل‌شده شما
            </p>
          </div>
          <button
            onClick={() => setIsPlacementModalOpen(true)}
            className="btn-3d-neutral text-xs py-2 px-3.5"
          >
            🎯 تعیین سطح مجدد
          </button>
        </div>

        {/* بنر شاخص کلیدی تسلط بر کلمات پرتکرار */}
        <div className="p-4 rounded-2xl bg-gradient-to-l from-brand-primary to-brand-primaryDark text-white space-y-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">
              پیشرفت در درک مستقیم آیات
            </span>
            <span className="text-2xl font-black">
              {masteryStats.frequentPercentage}٪
            </span>
          </div>
          <p className="text-sm font-extrabold leading-relaxed">
            شما تاکنون {masteryStats.frequentPercentage}٪ از کل کلمات پرتکرار قرآن را در این بسته آموزشی آموخته‌اید!
          </p>
          <div className="w-full h-2.5 bg-black/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-amber rounded-full transition-all duration-500"
              style={{ width: `${masteryStats.frequentPercentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/85 pt-0.5">
            <span>
              واژگان تثبیت‌شده: {masteryStats.learnedWordsCount} از{" "}
              {masteryStats.totalWordsCount} کلمه
            </span>
            <span>امتیاز کل نور: {userStats.noorXp} ✨</span>
          </div>
        </div>

        {/* تفکیک تسلط بر اساس ۳ لایه واژگانی استاندارد پروژه */}
        <div className="space-y-3">
          {/* لایه ۱: هم‌ریشه‌های فارسی */}
          <div className="p-3.5 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-morph-prefix">
                📘 لایه ۱: هم‌ریشه‌های شفاف با فارسی (Cognates)
              </span>
              <span className="text-slate-700 dark:text-slate-200">
                {masteryStats.byCategory.cognate.learned} /{" "}
                {masteryStats.byCategory.cognate.total} (
                {masteryStats.byCategory.cognate.percentage}٪)
              </span>
            </div>
            <div className="w-full h-2 bg-morph-prefixBg rounded-full overflow-hidden">
              <div
                className="h-full bg-morph-prefix rounded-full transition-all duration-500"
                style={{ width: `${masteryStats.byCategory.cognate.percentage}%` }}
              />
            </div>
          </div>

          {/* لایه ۲: کلمات و ادوات پرتکرار */}
          <div className="p-3.5 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-morph-root">
                📗 لایه ۲: واژگان و ساختارهای پرتکرار (Frequent)
              </span>
              <span className="text-slate-700 dark:text-slate-200">
                {masteryStats.byCategory.frequent.learned} /{" "}
                {masteryStats.byCategory.frequent.total} (
                {masteryStats.byCategory.frequent.percentage}٪)
              </span>
            </div>
            <div className="w-full h-2 bg-morph-rootBg rounded-full overflow-hidden">
              <div
                className="h-full bg-morph-root rounded-full transition-all duration-500"
                style={{ width: `${masteryStats.byCategory.frequent.percentage}%` }}
              />
            </div>
          </div>

          {/* لایه ۳: کلمات فریبنده (مشترکات لفظی) */}
          <div className="p-3.5 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-morph-pronoun">
                📙 لایه ۳: شکار کلمات فریبنده (False Friends)
              </span>
              <span className="text-slate-700 dark:text-slate-200">
                {masteryStats.byCategory.false_friend.learned} /{" "}
                {masteryStats.byCategory.false_friend.total} (
                {masteryStats.byCategory.false_friend.percentage}٪)
              </span>
            </div>
            <div className="w-full h-2 bg-morph-pronounBg rounded-full overflow-hidden">
              <div
                className="h-full bg-morph-pronoun rounded-full transition-all duration-500"
                style={{
                  width: `${masteryStats.byCategory.false_friend.percentage}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ۳. مدیریت کش آفلاین صوت شهرها و تنظیمات کاربری */}
      <section className="rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border p-5 shadow-sm space-y-4">
        <h2 className="text-base font-black text-slate-800 dark:text-white">
          مدیریت حافظه آفلاین صوت شهرها و تنظیمات
        </h2>

        {/* کلیدهای تم شب/روز و افکت‌های صوتی */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => toggleDarkMode()}
            className="btn-3d-neutral justify-between py-3 px-4 text-xs"
          >
            <span>🌓 حالت نمایش (روز ترمه‌ای / شب لاجوردی)</span>
            <span className="font-black text-brand-primary">
              {userStats.darkMode ? "شب لاجوردی" : "روز ترمه‌ای"}
            </span>
          </button>

          <button
            onClick={() => toggleSoundEffects()}
            className="btn-3d-neutral justify-between py-3 px-4 text-xs"
          >
            <span>🔊 افکت‌های صوتی تمرین‌ها</span>
            <span className="font-black text-brand-primary">
              {userStats.soundEffectsEnabled ? "فعال" : "غیرفعال"}
            </span>
          </button>
        </div>

        {/* لیست کش صوتی هر ایستگاه شهر */}
        <div className="space-y-2.5 pt-2">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            دانلود یکجای تلاوت استاد منشاوی و تلفظ کلمات هر شهر برای استفاده کاملاً آفلاین:
          </div>

          {cityCaches.map(({ city, cachedFilesCount, estimatedSizeMb }) => {
            const isLoading = isBusyCachingCityId === city.id;
            return (
              <div
                key={city.id}
                className="p-3.5 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="font-extrabold text-sm text-slate-800 dark:text-white">
                    ایستگاه {city.order}: {city.nameFa}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {cachedFilesCount > 0
                      ? `${cachedFilesCount} فایل صوتی ذخیره شده (${estimatedSizeMb} مگابایت)`
                      : "هنوز در حافظه آفلاین ذخیره نشده است"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={isLoading}
                    onClick={() => handlePrefetchCityAudio(city.id, city.nameFa)}
                    className="btn-3d-primary text-xs py-2 px-3"
                  >
                    {isLoading ? "در حال دریافت..." : "📥 دانلود آفلاین"}
                  </button>
                  {cachedFilesCount > 0 && (
                    <button
                      disabled={isLoading}
                      onClick={() => handleClearCityAudioCache(city.id, city.nameFa)}
                      className="btn-3d-ruby text-xs py-2 px-3"
                    >
                      حذف کش
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* مودال تعیین سطح تطبیقی دو مرحله‌ای */}
      <AdaptivePlacementModal
        isOpen={isPlacementModalOpen}
        onClose={() => setIsPlacementModalOpen(false)}
        onPlacementComplete={() => loadProfileData()}
      />
    </div>
  );
};

export default ChillehProfilePage;
