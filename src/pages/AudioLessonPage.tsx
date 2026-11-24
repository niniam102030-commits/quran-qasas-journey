// src/pages/AudioLessonPage.tsx
// درس شنیداری چشم‌بسته (مورد ۱۶): پخش پیوسته منشاوی + مکث شمارش معکوس برای تکرار، بدون ثبت داده
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Headphones, Pause, Play, RotateCcw } from "lucide-react";
import { ldb } from "../db/learningDb";
import { getActiveSurahNumber } from "../config/surahConfig";
import { fetchAndCacheVerseAudio } from "../services/menshawiAudio";
import { usePreferencesStore } from "../store/usePreferencesStore";

interface Props {
  onExit: () => void;
}

type LessonState = "idle" | "playing" | "pausing" | "done";
type PauseScale = 0.6 | 1 | 1.3;

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function AudioLessonPage({ onExit }: Props) {
  const activeSurah = usePreferencesStore((s) => s.activeSurah);
  const [verseNums, setVerseNums] = useState<number[]>([]);
  const [startVerse, setStartVerse] = useState<number>(1);
  const [count, setCount] = useState<number>(10);
  const [pauseScale, setPauseScale] = useState<PauseScale>(1);
  const [phase, setPhase] = useState<LessonState>("idle");
  const [sessionVerses, setSessionVerses] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const pausedRef = useRef<boolean>(false);
  const pauseScaleRef = useRef<PauseScale>(1);
  const versesRef = useRef<number[]>([]);

  useEffect(() => {
    pauseScaleRef.current = pauseScale;
  }, [pauseScale]);

  const cleanupPlayback = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const releaseWakeLock = () => {
    try {
      void wakeLockRef.current?.release();
    } catch {
      // ignore
    }
    wakeLockRef.current = null;
  };

  useEffect(() => {
    let active = true;
    const surah = getActiveSurahNumber();
    ldb.baseVerses
      .where("surah")
      .equals(surah)
      .sortBy("n")
      .then((rows) => {
        if (!active) return;
        const nums = rows.map((r) => r.n);
        setVerseNums(nums);
        if (nums.length) setStartVerse(nums[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
      cleanupPlayback();
      releaseWakeLock();
    };
  }, [activeSurah]);

  const playAt = async (idx: number, queue: number[]) => {
    cleanupPlayback();
    if (idx >= queue.length) {
      setPhase("done");
      setStatusMsg("جلسهٔ شنیداری کامل شد");
      releaseWakeLock();
      return;
    }
    const verse = queue[idx];
    setCurrentIdx(idx);
    setPhase("playing");
    setIsPaused(false);
    pausedRef.current = false;
    setStatusMsg(`آیهٔ ${toFarsi(idx + 1)} از ${toFarsi(queue.length)} — در حال پخش (آیه ${toFarsi(verse)})`);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const blob = await fetchAndCacheVerseAudio(verse, controller.signal, getActiveSurahNumber());
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => {
        const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 5;
        const pauseSec = Math.min(30, Math.max(3, Math.round(dur * pauseScaleRef.current)));
        setPhase("pausing");
        setCountdown(pauseSec);
        setStatusMsg(`حالا شما تکرار کنید... (${toFarsi(pauseSec)} ثانیه)`);
        let rem = pauseSec;
        countdownIntervalRef.current = window.setInterval(() => {
          if (pausedRef.current) return;
          rem -= 1;
          if (rem <= 0) {
            if (countdownIntervalRef.current !== null) {
              window.clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setCountdown(0);
            void playAt(idx + 1, queue);
          } else {
            setCountdown(rem);
            setStatusMsg(`حالا شما تکرار کنید... (${toFarsi(rem)} ثانیه)`);
          }
        }, 1000);
      };
      audio.onerror = () => {
        setStatusMsg(`خطا در پخش آیه ${toFarsi(verse)} — رفتن به آیهٔ بعد`);
        pauseTimerRef.current = window.setTimeout(() => void playAt(idx + 1, queue), 1500);
      };
      await audio.play();
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatusMsg(
        `دریافت صدای آیه ${toFarsi(verse)} ممکن نشد${err instanceof Error ? "" : ""} — رد شد`,
      );
      pauseTimerRef.current = window.setTimeout(() => void playAt(idx + 1, queue), 1800);
    }
  };

  const handleStart = async () => {
    const startIdx = Math.max(0, verseNums.indexOf(startVerse));
    const queue = verseNums.slice(startIdx, startIdx + count);
    if (!queue.length) return;
    versesRef.current = queue;
    setSessionVerses(queue);
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      // نبود wakeLock خطا نیست
    }
    void playAt(0, queue);
  };

  const handleTogglePause = () => {
    const next = !isPaused;
    setIsPaused(next);
    pausedRef.current = next;
    if (phase === "playing" && audioRef.current) {
      if (next) audioRef.current.pause();
      else void audioRef.current.play();
    }
  };

  const handleExit = () => {
    cleanupPlayback();
    releaseWakeLock();
    onExit();
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-termeh-bg dark:bg-lapis-bg text-slate-900 dark:text-slate-100 pb-24 select-none">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-termeh-bg/95 dark:bg-lapis-bg/95 backdrop-blur border-b-2 border-brand-amber/40 dark:border-lapis-border">
        <button
          type="button"
          onClick={handleExit}
          className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
          title="بازگشت"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5 font-black text-sm">
          <Headphones className="w-4 h-4 text-brand-primary" />
          <span>درس شنیداری چشم‌بسته</span>
        </div>
        <div className="w-8" />
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center gap-5">
        {phase === "idle" && (
          <div className="p-5 rounded-3xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border shadow-sm space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              تلاوت استاد منشاوی پخش می‌شود و پس از هر آیه به‌اندازهٔ تکرار شما مکث می‌کند — مناسب تمرین بدون نگاه به صفحه.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="audio-start-verse" className="text-xs font-bold block">
                از آیه:
              </label>
              <select
                id="audio-start-verse"
                value={startVerse}
                onChange={(e) => setStartVerse(Number(e.target.value))}
                className="w-full rounded-2xl border border-termeh-border dark:border-lapis-border bg-termeh-bg dark:bg-lapis-bg px-3 py-2.5 text-sm font-bold"
              >
                {verseNums.map((n) => (
                  <option key={n} value={n}>
                    آیه {toFarsi(n)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold block">تعداد آیات:</span>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={`py-2 rounded-xl border-2 text-xs font-black transition-all ${
                      count === n
                        ? "bg-brand-primary border-brand-primaryDark text-white"
                        : "bg-termeh-bg/60 dark:bg-lapis-bg/60 border-termeh-border dark:border-lapis-border"
                    }`}
                  >
                    {toFarsi(n)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold block">مکث تکرار:</span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { val: 0.6, label: "کوتاه‌تر (۰٫۶×)" },
                    { val: 1, label: "هم‌اندازه (۱×)" },
                    { val: 1.3, label: "طولانی‌تر (۱٫۳×)" },
                  ] as { val: PauseScale; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setPauseScale(opt.val)}
                    className={`py-2 px-1 rounded-xl border-2 text-[11px] font-bold transition-all ${
                      pauseScale === opt.val
                        ? "bg-brand-primary border-brand-primaryDark text-white"
                        : "bg-termeh-bg/60 dark:bg-lapis-bg/60 border-termeh-border dark:border-lapis-border"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!verseNums.length}
              onClick={() => void handleStart()}
              className="w-full py-3.5 rounded-2xl bg-brand-primary hover:brightness-105 text-white font-black text-sm shadow-md disabled:opacity-40"
            >
              شروع درس شنیداری
            </button>
          </div>
        )}

        {(phase === "playing" || phase === "pausing") && (
          <div className="p-6 rounded-3xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border shadow-md text-center space-y-6">
            <div className="text-base sm:text-lg font-black leading-relaxed text-brand-primary">
              {statusMsg}
            </div>

            {phase === "pausing" && countdown > 0 && (
              <div className="text-4xl font-black text-brand-amber">{toFarsi(countdown)}</div>
            )}

            <button
              type="button"
              onClick={handleTogglePause}
              className="w-28 h-28 mx-auto rounded-full bg-brand-primary text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
              aria-label={isPaused ? "ادامه" : "توقف"}
            >
              {isPaused ? <Play className="w-12 h-12 fill-white" /> : <Pause className="w-12 h-12 fill-white" />}
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => void playAt(Math.max(0, currentIdx - 1), versesRef.current)}
                className="flex-1 py-3 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
                <span>آیهٔ قبل</span>
              </button>
              <button
                type="button"
                onClick={() => void playAt(currentIdx + 1, versesRef.current)}
                className="flex-1 py-3 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border text-xs font-bold flex items-center justify-center gap-1"
              >
                <span>آیهٔ بعد</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleExit}
              className="w-full py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold"
            >
              پایان جلسه
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="p-6 rounded-3xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border shadow-md text-center space-y-4">
            <Headphones className="w-12 h-12 mx-auto text-brand-success" />
            <h2 className="text-lg font-black">جلسهٔ شنیداری کامل شد</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {toFarsi(sessionVerses.length)} آیه گوش داده و تکرار شد.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setStatusMsg("");
                }}
                className="flex-1 py-3 rounded-2xl bg-brand-primary text-white font-bold text-xs flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-4 h-4" />
                <span>شروع دوباره</span>
              </button>
              <button
                type="button"
                onClick={handleExit}
                className="flex-1 py-3 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border font-bold text-xs"
              >
                بازگشت
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
