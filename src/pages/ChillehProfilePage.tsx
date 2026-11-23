// src/pages/ChillehProfilePage.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Download, Trash2, Volume2, XCircle, CheckCircle2 } from "lucide-react";
import { ldb, type UserProfileRow } from "../db/learningDb";
import {
  buyChillehShield,
  getUserProfile,
  recordLearningReward,
  SHIELD_COST_GEMS,
} from "../services/profileService";
import {
  clearAudioCache,
  getAudioCacheStats,
  prefetchVersesAudio,
} from "../services/menshawiAudio";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { ACTIVE_SURAH, getAllVerseNumbers } from "../config/surahConfig";
import AqeeqIcon from "../components/common/AqeeqIcon";

interface VocabularyMasteryStats {
  totalWordsCount: number;
  learnedWordsCount: number;
  hardTotal: number;
  hardLearned: number;
  hardPercentage: number;
  overallPercentage: number;
  practicedWordsCount: number;
}

const ALL_SURAH_VERSES = getAllVerseNumbers();
const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export const ChillehProfilePage: React.FC = () => {
  const darkMode = usePreferencesStore((s) => s.darkMode);
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const toggleDarkMode = usePreferencesStore((s) => s.toggleDarkMode);
  const toggleSoundEnabled = usePreferencesStore((s) => s.toggleSoundEnabled);

  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [masteryStats, setMasteryStats] = useState<VocabularyMasteryStats>({
    totalWordsCount: 0,
    learnedWordsCount: 0,
    hardTotal: 0,
    hardLearned: 0,
    hardPercentage: 0,
    overallPercentage: 0,
    practicedWordsCount: 0,
  });
  const [audioStats, setAudioStats] = useState<{ count: number; totalMb: number }>({
    count: 0,
    totalMb: 0,
  });
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number; verse: number } | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadProfileData = useCallback(async () => {
    const [prof, lexicon, cards, attempts, cacheStats] = await Promise.all([
      getUserProfile(),
      ldb.lexicon.toArray(),
      ldb.cards.toArray(),
      ldb.attempts.toArray(),
      getAudioCacheStats(),
    ]);

    setProfile(prof);
    const wordCards = new Map(
      cards.filter((card) => card.key.startsWith("w:")).map((card) => [card.key.slice(2), card]),
    );
    const practiced = new Set(
      attempts.flatMap((attempt) =>
        Object.keys(attempt.perTarget || {})
          .filter((key) => key.startsWith("w:"))
          .map((key) => key.slice(2)),
      ),
    );
    const totalWordsCount = lexicon.length;
    const learnedWordsCount = lexicon.filter((word) => (wordCards.get(word.wordId)?.state ?? 0) > 0).length;
    const hardWords = lexicon.filter((word) => word.hard);
    const hardLearned = hardWords.filter((word) => (wordCards.get(word.wordId)?.state ?? 0) > 0).length;

    setMasteryStats({
      totalWordsCount,
      learnedWordsCount,
      hardTotal: hardWords.length,
      hardLearned,
      hardPercentage: hardWords.length ? Math.round((hardLearned / hardWords.length) * 100) : 0,
      overallPercentage: totalWordsCount ? Math.round((learnedWordsCount / totalWordsCount) * 100) : 0,
      practicedWordsCount: lexicon.filter((word) => practiced.has(word.wordId)).length,
    });
    setAudioStats({
      count: cacheStats.cachedVerses.length,
      totalMb: cacheStats.totalMb,
    });
  }, []);

  useEffect(() => {
    void loadProfileData();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadProfileData]);

  const handleManualDailyCheckIn = async () => {
    const updated = await recordLearningReward({ markDailyActivity: true, xpDelta: 5 });
    setProfile(updated);
    setStatusBanner("✨ انس امروز شما در تقویم چله ثبت شد (+۵ نور).");
  };

  const handleBuyChillehShield = async () => {
    const res = await buyChillehShield();
    setProfile(res.profile);
    setStatusBanner(res.message);
  };

  const handleDownloadAllMenshawi = async () => {
    if (downloadProgress) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatusBanner(null);
    setDownloadProgress({ done: 0, total: ACTIVE_SURAH.verseCount, verse: 1 });

    try {
      const res = await prefetchVersesAudio(
        ALL_SURAH_VERSES,
        (done, total, currentVerse) => setDownloadProgress({ done, total, verse: currentVerse }),
        controller.signal,
      );
      await loadProfileData();
      if (controller.signal.aborted) {
        setStatusBanner("دانلود آفلاین متوقف شد؛ آیات دریافت‌شده ذخیره ماندند.");
      } else if (res.failed === 0) {
        setStatusBanner("✅ تمام ۸۸ آیه سوره قصص با تلاوت استاد منشاوی برای پخش کاملاً آفلاین ذخیره شد.");
      } else {
        setStatusBanner(
          `${toFarsi(res.downloaded)} آیه ذخیره شد و ${toFarsi(res.failed)} آیه ناموفق بود. با اتصال اینترنت دوباره تلاش کنید.`,
        );
      }
    } finally {
      abortRef.current = null;
      setDownloadProgress(null);
    }
  };

  const handleCancelDownload = () => {
    abortRef.current?.abort();
  };

  const handleClearAudioCache = async () => {
    await clearAudioCache();
    await loadProfileData();
    setStatusBanner("حافظه آفلاین صوت تلاوت استاد منشاوی پاکسازی شد.");
  };

  if (!profile) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        در حال بارگذاری اطلاعات چله انس...
      </div>
    );
  }

  const currentStreak = profile.chillehCurrentDays;
  const bestStreak = profile.chillehBestDays;
  const currentStage = profile.chillehStage;

  return (
    <div dir="rtl" className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-6">
      {statusBanner && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs font-bold flex items-center justify-between gap-2">
          <span>{statusBanner}</span>
          <button
            onClick={() => setStatusBanner(null)}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-white px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ۱. کارت اصلی «چله انس با قرآن» */}
      <section className="rounded-3xl bg-white dark:bg-[#1a2332] border-2 border-[#e6dbc5] dark:border-slate-800 p-5 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex flex-col items-center justify-center shadow-md">
              <span className="text-2xl leading-none">🔥</span>
              <span className="text-[11px] font-black mt-0.5">{toFarsi(currentStreak)} روز</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black text-slate-800 dark:text-white">
                  چله انس با قرآن
                </h1>
                {profile.chillehShieldActive && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-[11px] font-bold">
                    🛡️ سپر عقیق فعال
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                هدف فعلی: <strong>{toFarsi(currentStage)} روزه</strong> | بهترین رکورد:{" "}
                <strong>{toFarsi(bestStreak)} روز</strong> | عقیق:{" "}
                <strong className="inline-flex items-center gap-1">
                  {toFarsi(profile.aqeeqGems)} <AqeeqIcon className="w-3.5 h-3.5" />
                </strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => void handleManualDailyCheckIn()}
            className="py-2.5 px-4 rounded-2xl font-bold text-xs text-white bg-amber-600 hover:bg-amber-700 active:scale-95 shadow-sm transition-all"
          >
            ثبت انس امروز ✨
          </button>
        </div>

        {/* نشانگر ۳ پله چله */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {[
            { days: 7, title: "میثاق هفته", icon: "🌱" },
            { days: 14, title: "دو هفته نور", icon: "🌿" },
            { days: 40, title: "چله کامل انس", icon: "👑" },
          ].map((milestone) => {
            const isAchieved = currentStreak >= milestone.days || bestStreak >= milestone.days;
            const isCurrentTarget = currentStage === milestone.days;
            return (
              <div
                key={milestone.days}
                className={`p-3 rounded-2xl border-2 text-center transition-all ${
                  isAchieved
                    ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-500 text-emerald-900 dark:text-emerald-200"
                    : isCurrentTarget
                    ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-500 text-amber-900 dark:text-amber-200"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                <div className="text-lg">{milestone.icon}</div>
                <div className="font-black text-xs mt-1">{toFarsi(milestone.days)} روز</div>
                <div className="text-[10px] opacity-85 mt-0.5">{milestone.title}</div>
              </div>
            );
          })}
        </div>

        {/* تقویم ۴۰ روزه */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>تقویم ۴۰ روزه سفر انس</span>
            <span>
              {toFarsi(currentStreak)} از {toFarsi(currentStage)} روز پله فعلی
            </span>
          </div>

          <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 p-3 rounded-2xl bg-[#fcf9f2] dark:bg-slate-900 border border-[#e6dbc5] dark:border-slate-800">
            {Array.from({ length: 40 }, (_, i) => i + 1).map((dayNum) => {
              const isCompleted = dayNum <= currentStreak;
              const isNextDay = dayNum === currentStreak + 1;
              const isMilestone = dayNum === 7 || dayNum === 14 || dayNum === 40;

              return (
                <div
                  key={dayNum}
                  className={`h-8 rounded-xl flex items-center justify-center text-xs font-extrabold relative transition-all ${
                    isCompleted
                      ? "bg-emerald-500 text-white shadow-sm"
                      : isNextDay
                      ? "bg-amber-100 border-2 border-amber-500 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse"
                      : isMilestone
                      ? "bg-amber-50 dark:bg-amber-900/30 border border-amber-300 text-amber-800 dark:text-amber-300"
                      : "bg-white dark:bg-slate-800 text-slate-400 border border-slate-200/70 dark:border-slate-700"
                  }`}
                  title={`روز ${dayNum} چله`}
                >
                  <span>{toFarsi(dayNum)}</span>
                  {isMilestone && !isCompleted && (
                    <span className="absolute -top-1 -left-1 text-[9px]">⭐</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* کارت خرید محافظ چله */}
        <div className="p-4 rounded-2xl bg-gradient-to-l from-amber-50 to-orange-50/60 dark:from-slate-900 dark:to-slate-800 border border-amber-300/60 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-extrabold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
              <span>🛡️ محافظ چله (سپر عقیق)</span>
              <span className="text-xs font-bold text-rose-700 dark:text-rose-400 inline-flex items-center gap-1">
                ({toFarsi(SHIELD_COST_GEMS)} عقیق <AqeeqIcon className="w-3.5 h-3.5" />)
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              با فعال‌سازی سپر عقیق، در صورت یک روز غیبت پیوستگی چله انس شما حفظ خواهد شد.
            </p>
          </div>
          <button
            onClick={() => void handleBuyChillehShield()}
            disabled={profile.chillehShieldActive}
            className={`shrink-0 text-xs py-2.5 px-4 rounded-2xl font-bold transition-all inline-flex items-center gap-1.5 ${
              profile.chillehShieldActive
                ? "bg-emerald-600 text-white cursor-default"
                : "bg-amber-600 hover:bg-amber-700 text-white active:scale-95"
            }`}
          >
            {profile.chillehShieldActive ? (
              "✓ محافظ فعال است"
            ) : (
              <>
                <span>خرید محافظ ({toFarsi(SHIELD_COST_GEMS)}</span>
                <AqeeqIcon className="w-3.5 h-3.5" />
                <span>)</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* ۲. آمار تسلط واژگان */}
      <section className="rounded-3xl bg-white dark:bg-[#1a2332] border-2 border-[#e6dbc5] dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-black text-slate-800 dark:text-white">
            گالری تسلط واژگان سوره قصص
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            بر اساس مرورهای هوشمند و جلسات تکمیل‌شده شما
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-l from-amber-600 to-amber-700 text-white space-y-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">تسلط بر واژگان سوره</span>
            <span className="text-2xl font-black">{toFarsi(masteryStats.overallPercentage)}٪</span>
          </div>
          <p className="text-sm font-extrabold leading-relaxed">
            {toFarsi(masteryStats.learnedWordsCount)} واژه از {toFarsi(masteryStats.totalWordsCount)} واژه کارت یادگیری فعال دارند.
          </p>
          <div className="w-full h-2.5 bg-black/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-300 rounded-full transition-all duration-500"
              style={{ width: `${masteryStats.overallPercentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/90 pt-0.5">
            <span>
              واژگان تمرین‌شده: {toFarsi(masteryStats.practicedWordsCount)} از {toFarsi(masteryStats.totalWordsCount)}
            </span>
            <span>امتیاز کل نور: {toFarsi(profile.noorXp)} ✨</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-[#e6dbc5] dark:border-slate-800 p-3">
            <div className="text-xs text-slate-500">واژگان دشوارِ تثبیت‌شده</div>
            <strong>
              {toFarsi(masteryStats.hardLearned)} از {toFarsi(masteryStats.hardTotal)}
            </strong>
            <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${masteryStats.hardPercentage}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-[#e6dbc5] dark:border-slate-800 p-3">
            <div className="text-xs text-slate-500">موجودی عقیق و نور</div>
            <strong className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                {toFarsi(profile.aqeeqGems)} عقیق <AqeeqIcon className="w-3.5 h-3.5" />
              </span>
              <span>•</span>
              <span>{toFarsi(profile.noorXp)} نور ✨</span>
            </strong>
          </div>
        </div>
      </section>

      {/* ۳. مدیریت آفلاین صوت استاد منشاوی (۸۸ آیه) + کلیدهای سریع */}
      <section className="rounded-3xl bg-white dark:bg-[#1a2332] border-2 border-[#e6dbc5] dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-amber-600" />
          <h2 className="text-base font-black text-slate-800 dark:text-white">
            تلاوت آفلاین استاد منشاوی (سوره قصص)
          </h2>
        </div>

        <div className="p-4 rounded-2xl bg-[#fcf9f2] dark:bg-slate-900 border border-[#e6dbc5] dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              {audioStats.count === ACTIVE_SURAH.verseCount && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              <span>
                وضعیت کش آفلاین: {toFarsi(audioStats.count)} از {toFarsi(ACTIVE_SURAH.verseCount)} آیه ({toFarsi(audioStats.totalMb)} مگابایت)
              </span>
            </span>
          </div>

          {downloadProgress && (
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded-full bg-amber-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-600 transition-all duration-150"
                  style={{ width: `${Math.round((downloadProgress.done / downloadProgress.total) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>در حال دریافت آیه {toFarsi(downloadProgress.verse)}...</span>
                <span>
                  {toFarsi(downloadProgress.done)} / {toFarsi(downloadProgress.total)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!downloadProgress ? (
              <button
                type="button"
                onClick={() => void handleDownloadAllMenshawi()}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <Download className="w-4 h-4" />
                <span>{audioStats.count === ACTIVE_SURAH.verseCount ? `بررسی مجدد ${toFarsi(ACTIVE_SURAH.verseCount)} آیه` : `دانلود آفلاین کل ${toFarsi(ACTIVE_SURAH.verseCount)} آیه (منشاوی)`}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancelDownload}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>توقف دانلود</span>
              </button>
            )}

            {audioStats.count > 0 && !downloadProgress && (
              <button
                type="button"
                onClick={() => void handleClearAudioCache()}
                className="py-2.5 px-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-bold text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف کش</span>
              </button>
            )}
          </div>
        </div>

        {/* کلیدهای سریع همگام با تنظیمات اصلی */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            onClick={toggleDarkMode}
            className="flex items-center justify-between py-3 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
          >
            <span>🌓 حالت نمایش</span>
            <span className="font-black text-amber-700 dark:text-amber-400">
              {darkMode ? "شب لاجوردی" : "روز ترمه‌ای"}
            </span>
          </button>

          <button
            onClick={toggleSoundEnabled}
            className="flex items-center justify-between py-3 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
          >
            <span>🔊 افکت‌های صوتی</span>
            <span className="font-black text-amber-700 dark:text-amber-400">
              {soundEnabled ? "فعال" : "غیرفعال"}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default ChillehProfilePage;
