// src/pages/TajweedLessonsPage.tsx
// صفحه مینی‌درس‌های احکام تجوید با مثال‌های واقعی از سوره قصص و پخش صوتی منشاوی (B2)
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, Loader2, Play, Square } from "lucide-react";
import { ldb } from "../db/learningDb";
import {
  TAJWEED_RULES,
  extractTajweedExamples,
  type SurahTajweedData,
  type TajweedLessonExample,
} from "../learning/tajweed";
import { fetchAndCacheVerseAudio, getMenshawiUrls } from "../services/menshawiAudio";
import {
  loadQulAudioTimings,
  loadTajweedData,
  type WordAudioSegment,
} from "../services/qulReferenceService";
import type { BaseVerse } from "../types/learning";

interface Props {
  onBack: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function TajweedLessonsPage({ onBack }: Props) {
  const [verses, setVerses] = useState<BaseVerse[]>([]);
  const [tajweed, setTajweed] = useState<SurahTajweedData | null>(null);
  const [timings, setTimings] = useState<Record<string, WordAudioSegment[]>>({});
  const [loading, setLoading] = useState(true);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopAudio = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlayingKey(null);
  };

  useEffect(() => {
    let active = true;
    async function loadAll() {
      setLoading(true);
      try {
        const [dbVerses, tajData, audioTimings] = await Promise.all([
          ldb.baseVerses.toArray(),
          loadTajweedData("qasas"),
          loadQulAudioTimings("qasas"),
        ]);
        if (!active) return;
        const sortedVerses = (dbVerses as unknown as (BaseVerse & { surah?: number })[])
          .filter((v) => (v.surah ?? 28) === 28)
          .sort((a, b) => a.n - b.n);
        setVerses(sortedVerses);
        setTajweed(tajData);
        setTimings(audioTimings);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadAll();
    return () => {
      active = false;
      stopAudio();
    };
  }, []);

  const handlePlayExample = async (ex: TajweedLessonExample, exKey: string) => {
    if (playingKey === exKey) {
      stopAudio();
      return;
    }
    stopAudio();
    setAudioError(null);
    setPlayingKey(exKey);

    try {
      let url: string;
      try {
        const blob = await fetchAndCacheVerseAudio(ex.verse, undefined, 28);
        url = URL.createObjectURL(blob);
        urlRef.current = url;
      } catch {
        url = getMenshawiUrls(ex.verse, 28)[0];
      }

      const segs = timings[String(ex.verse)] ?? [];
      const seg = segs.find((s) => s[0] === ex.wordIndex1);
      const startSec = seg ? Math.max(0, (seg[1] - 250) / 1000) : 0;
      const endSec = seg ? (seg[2] + 350) / 1000 : null;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onloadedmetadata = () => {
        if (startSec > 0 && Number.isFinite(audio.duration) && startSec < audio.duration) {
          audio.currentTime = startSec;
        }
      };
      audio.onended = () => stopAudio();
      audio.onerror = () => {
        setAudioError(`پخش صوت آیه ${toFarsi(ex.verse)} ناموفق بود.`);
        stopAudio();
      };

      await audio.play();
      if (startSec > 0 && Number.isFinite(audio.duration) && startSec < audio.duration) {
        audio.currentTime = startSec;
      }
      if (endSec !== null) {
        timerRef.current = window.setInterval(() => {
          if (audio.currentTime >= endSec) {
            stopAudio();
          }
        }, 60);
      }
    } catch {
      setAudioError("خطا در پخش تلاوت منشاوی؛ اتصال اینترنت یا کش آفلاین را بررسی کنید.");
      stopAudio();
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#FAF7F2]/95 dark:bg-[#0B132B]/95 backdrop-blur border-b-2 border-[#d4af37]/50 dark:border-teal-800/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            title="بازگشت"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-black text-[#8a5b29] dark:text-amber-400">
              مینی‌درس‌های احکام تجوید
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              آموزش کوتاه ۸ حکم اصلی همراه با مثال‌های واقعی سوره قصص و صدای منشاوی
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-5 space-y-4">
        {audioError && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold">
            {audioError}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
            <BookOpen className="w-8 h-8 animate-pulse text-amber-500" />
            <span className="text-xs font-bold">در حال بارگذاری مثال‌های تجویدی سوره قصص...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {TAJWEED_RULES.map((rule) => {
              const examples = extractTajweedExamples(tajweed, verses, rule.id, 3);
              return (
                <section
                  key={rule.id}
                  className="bg-white dark:bg-[#1C2541] rounded-3xl border-2 border-[#E5DEC9] dark:border-[#3A506B] p-4 sm:p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-4 h-4 rounded-full shrink-0 ${rule.swatchClass}`} />
                      <h2 className={`text-base font-black ${rule.colorClass}`}>{rule.nameFa}</h2>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400">{rule.id}</span>
                  </div>

                  <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {rule.lessonFa}
                  </p>

                  {examples.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        نمونه‌های واقعی از سوره قصص:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {examples.map((ex) => {
                          const exKey = `${rule.id}:${ex.verse}:${ex.wordIndex0}`;
                          const isPlaying = playingKey === exKey;
                          return (
                            <div
                              key={exKey}
                              className="p-2.5 rounded-2xl bg-[#fcf9f2] dark:bg-slate-900/70 border border-[#e6dbc5] dark:border-slate-700 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div
                                  className={`quran-text text-xl leading-loose ${rule.colorClass}`}
                                  style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif" }}
                                >
                                  {ex.wordAr}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  آیه {toFarsi(ex.verse)}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handlePlayExample(ex, exKey)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                  isPlaying
                                    ? "bg-rose-600 text-white"
                                    : "bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                                }`}
                                title={isPlaying ? "توقف" : "پخش با صدای منشاوی"}
                              >
                                {isPlaying ? (
                                  <Square className="w-3.5 h-3.5 fill-white" />
                                ) : playingKey && playingKey.startsWith(`${rule.id}:`) ? (
                                  <Loader2 className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400">
                      در فایل تجوید QUL سوره قصص برچسب مجزا برای این حکم ثبت نشده است؛ تعریف و معیار تشخیص در بالا آمده است.
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
