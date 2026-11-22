// src/components/audio/VerseAudioPlayer.tsx
// پخش‌کننده تلاوت استاد منشاوی با پشتیبانی آفلاین (IndexedDB)، حلقه حفظ (تکرار هر آیه + وقفه تکرار + ربط بازه) و سرعت پخش
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Repeat, Loader2, Volume2, WifiOff, CheckCircle2, SlidersHorizontal, Timer } from "lucide-react";
import { fetchAndCacheVerseAudio, getMenshawiUrls, isVerseAudioCached } from "../../services/menshawiAudio";

interface Props {
  /** آیه فعلی یا فهرست آیات برای پخش پیاپی */
  verses: number[];
  compact?: boolean;
  onActiveVerseChange?: (verse: number | null) => void;
}

const SPEEDS = [0.75, 1, 1.25] as const;
const REPEAT_COUNTS = [1, 2, 3, 5] as const;
type PauseMode = "none" | "auto" | "3s" | "5s";

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function VerseAudioPlayer({ verses, compact = false, onActiveVerseChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [repeatRange, setRepeatRange] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // 1x
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // تنظیمات پیشرفته حلقه حفظ (Hifz Loop)
  const [showHifzSettings, setShowHifzSettings] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<number>(verses[0] ?? 1);
  const [rangeTo, setRangeTo] = useState<number>(verses[verses.length - 1] ?? 1);
  const [perVerseRepeat, setPerVerseRepeat] = useState<number>(1);
  const [pauseMode, setPauseMode] = useState<PauseMode>("none");
  const [linkRangeAfter, setLinkRangeAfter] = useState<boolean>(false);

  // وضعیت زنده پخش
  const [activeVerse, setActiveVerse] = useState<number>(verses[0] ?? 1);
  const [repStep, setRepStep] = useState<{ current: number; total: number } | null>(null);
  const [linkingPhase, setLinkingPhase] = useState(false);
  const [pauseCountdown, setPauseCountdown] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const repeatRangeRef = useRef(repeatRange);
  const speedRef = useRef<number>(SPEEDS[1]);
  const perVerseRepeatRef = useRef(perVerseRepeat);
  const pauseModeRef = useRef<PauseMode>(pauseMode);
  const linkRangeAfterRef = useRef(linkRangeAfter);
  const versesKey = verses.join(",");

  useEffect(() => { repeatRangeRef.current = repeatRange; }, [repeatRange]);
  useEffect(() => { perVerseRepeatRef.current = perVerseRepeat; }, [perVerseRepeat]);
  useEffect(() => { pauseModeRef.current = pauseMode; }, [pauseMode]);
  useEffect(() => { linkRangeAfterRef.current = linkRangeAfter; }, [linkRangeAfter]);

  useEffect(() => {
    speedRef.current = SPEEDS[speedIdx];
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[speedIdx];
    }
  }, [speedIdx]);

  const clearTimers = () => {
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setPauseCountdown(null);
  };

  const stopPlayback = () => {
    cancelledRef.current = true;
    clearTimers();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlaying(false);
    setLoading(false);
    setRepStep(null);
    setLinkingPhase(false);
    onActiveVerseChange?.(null);
  };

  useEffect(() => {
    let active = true;
    if (verses.length > 0) {
      setRangeFrom(verses[0]);
      setRangeTo(verses[verses.length - 1]);
      setActiveVerse(verses[0]);
      isVerseAudioCached(verses[0]).then((ok) => {
        if (active) setCached(ok);
      });
    }
    return () => {
      active = false;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versesKey]);

  const waitPauseGap = (durationSec: number): Promise<void> => {
    return new Promise((resolve) => {
      const mode = pauseModeRef.current;
      let ms = 0;
      if (mode === "3s") ms = 3000;
      else if (mode === "5s") ms = 5000;
      else if (mode === "auto") ms = Math.min(15000, Math.max(2500, Math.round(durationSec * 1000)));
      if (ms <= 0 || cancelledRef.current) {
        resolve();
        return;
      }

      const endAt = Date.now() + ms;
      setPauseCountdown(Math.ceil(ms / 1000));
      countdownIntervalRef.current = window.setInterval(() => {
        const rem = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        setPauseCountdown(rem);
      }, 250);

      pauseTimerRef.current = window.setTimeout(() => {
        clearTimers();
        resolve();
      }, ms);
    });
  };

  const playSingleVerseOnce = async (verse: number): Promise<number> => {
    let playUrl: string;
    try {
      const blob = await fetchAndCacheVerseAudio(verse);
      if (cancelledRef.current) return 0;

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      playUrl = URL.createObjectURL(blob);
      objectUrlRef.current = playUrl;
      setCached(true);
    } catch {
      // Fallback پخش مستقیم در صورت خطای کش/CORS روی شبکه محدود
      if (cancelledRef.current) return 0;
      playUrl = getMenshawiUrls(verse)[0];
    }

    return new Promise<number>((resolve, reject) => {
      const audio = new Audio(playUrl);
      audio.playbackRate = speedRef.current;
      audioRef.current = audio;

      audio.onended = () => {
        const dur = Number.isFinite(audio.duration) ? audio.duration / speedRef.current : 4;
        resolve(dur);
      };
      audio.onerror = () => reject(new Error(`خطا در پخش صوت آیه ${verse}`));

      audio.play().catch(reject);
    });
  };

  const runPlaybackSequence = async () => {
    const activeSlice = compact
      ? verses
      : verses.filter((v) => v >= Math.min(rangeFrom, rangeTo) && v <= Math.max(rangeFrom, rangeTo));
    const list = activeSlice.length > 0 ? activeSlice : verses;
    if (list.length === 0) return;

    cancelledRef.current = false;
    setPlaying(true);
    setError(null);

    try {
      do {
        // فاز ۱: پخش هر آیه با تعداد تکرار و وقفه تکرار انتخاب‌شده
        setLinkingPhase(false);
        for (const verse of list) {
          if (cancelledRef.current) return;
          const totalReps = compact ? 1 : perVerseRepeatRef.current;
          for (let r = 1; r <= totalReps; r++) {
            if (cancelledRef.current) return;
            setActiveVerse(verse);
            onActiveVerseChange?.(verse);
            setRepStep(totalReps > 1 ? { current: r, total: totalReps } : null);
            setLoading(true);
            const durationSec = await playSingleVerseOnce(verse);
            setLoading(false);
            if (cancelledRef.current) return;
            if (!compact && pauseModeRef.current !== "none") {
              await waitPauseGap(durationSec);
            }
          }
        }

        // فاز ۲ (ربط آیات): پخش پیوسته کل بازه بدون مکث برای تثبیت اتصال آیات
        if (!compact && linkRangeAfterRef.current && list.length > 1 && !cancelledRef.current) {
          setLinkingPhase(true);
          setRepStep(null);
          for (const verse of list) {
            if (cancelledRef.current) return;
            setActiveVerse(verse);
            onActiveVerseChange?.(verse);
            setLoading(true);
            await playSingleVerseOnce(verse);
            setLoading(false);
          }
          setLinkingPhase(false);
        }
      } while (repeatRangeRef.current && !cancelledRef.current);

      if (!cancelledRef.current) stopPlayback();
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "خطا در پخش تلاوت");
        stopPlayback();
      }
    }
  };

  const handleTogglePlay = () => {
    if (playing) {
      stopPlayback();
    } else {
      void runPlaybackSequence();
    }
  };

  const cycleSpeed = () => {
    setSpeedIdx((prev) => (prev + 1) % SPEEDS.length);
  };

  if (verses.length === 0) return null;

  return (
    <div dir="rtl" className={compact ? "space-y-1" : "space-y-2"}>
      <div
        className={`flex items-center justify-between gap-2 rounded-2xl border border-amber-200/80 dark:border-slate-700 bg-amber-50/70 dark:bg-slate-800/70 ${
          compact ? "px-3 py-2" : "px-4 py-2.5"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={loading && !playing}
            aria-label={playing ? "توقف تلاوت" : "پخش تلاوت استاد منشاوی"}
            className="w-9 h-9 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white flex items-center justify-center shrink-0 shadow-sm transition-all disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : playing ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
          </button>

          <div className="min-w-0">
            <div className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5 truncate">
              <Volume2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                {verses.length === 1
                  ? `تلاوت منشاوی • آیه ${toFarsi(activeVerse)}`
                  : playing
                  ? linkingPhase
                    ? `ربط آیات • آیه ${toFarsi(activeVerse)}`
                    : `آیه ${toFarsi(activeVerse)}${repStep ? ` (تکرار ${toFarsi(repStep.current)} از ${toFarsi(repStep.total)})` : ""}`
                  : `تلاوت منشاوی (آیات ${toFarsi(rangeFrom)} تا ${toFarsi(rangeTo)})`}
              </span>
            </div>
            {!compact && (
              <div className="text-[11px] text-amber-800/75 dark:text-slate-400 flex items-center gap-1">
                {cached ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>پخش آفلاین فعال</span>
                  </>
                ) : (
                  <span>پخش و ذخیره خودکار آفلاین</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={cycleSpeed}
            title="سرعت پخش"
            className="px-2 py-1 rounded-xl text-[11px] font-bold bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-amber-900 dark:text-amber-300 hover:bg-amber-100/50 transition-colors"
          >
            {SPEEDS[speedIdx]}x
          </button>

          <button
            type="button"
            onClick={() => setRepeatRange((r) => !r)}
            title={repeatRange ? "تکرار حلقه فعال" : "تکرار حلقه غیرفعال"}
            className={`p-1.5 rounded-xl border transition-colors ${
              repeatRange
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white dark:bg-slate-900 text-slate-500 border-amber-200 dark:border-slate-700 hover:text-amber-700"
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          {!compact && (
            <button
              type="button"
              onClick={() => setShowHifzSettings((s) => !s)}
              title="تنظیمات حلقه حفظ و وقفه تکرار"
              className={`p-1.5 rounded-xl border transition-colors ${
                showHifzSettings || perVerseRepeat > 1 || pauseMode !== "none"
                  ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-400"
                  : "bg-white dark:bg-slate-900 text-slate-500 border-amber-200 dark:border-slate-700 hover:text-amber-700"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* بنر شمارش معکوس وقفه تکرار حافظ */}
      {pauseCountdown !== null && (
        <div className="px-3.5 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-1.5">
            <Timer className="w-4 h-4 text-emerald-600" />
            <span>نوبت تکرار شما (آیه {toFarsi(activeVerse)})...</span>
          </span>
          <span>{toFarsi(pauseCountdown)} ثانیه</span>
        </div>
      )}

      {/* پنل تنظیمات حلقه حفظ (Hifz Loop) */}
      {!compact && showHifzSettings && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-slate-700 text-xs space-y-3 shadow-sm">
          <div className="font-bold text-amber-900 dark:text-amber-300">
            تنظیمات حلقه صوتی حفظ (تلقین و ربط)
          </div>

          {verses.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500">از آیه:</span>
                <select
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(Number(e.target.value))}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                >
                  {verses.map((v) => (
                    <option key={v} value={v}>آیه {toFarsi(v)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500">تا آیه:</span>
                <select
                  value={rangeTo}
                  onChange={(e) => setRangeTo(Number(e.target.value))}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                >
                  {verses.map((v) => (
                    <option key={v} value={v}>آیه {toFarsi(v)}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[11px] text-slate-500">تکرار هر آیه:</span>
            <div className="flex gap-1.5">
              {REPEAT_COUNTS.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setPerVerseRepeat(cnt)}
                  className={`flex-1 py-1.5 rounded-xl font-bold border transition-colors ${
                    perVerseRepeat === cnt
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {toFarsi(cnt)} بار
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] text-slate-500">وقفه مکث پس از هر آیه (برای تکرار حافظ):</span>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: "none", label: "بدون مکث" },
                  { id: "auto", label: "هم‌اندازه آیه" },
                  { id: "3s", label: "۳ ثانیه" },
                  { id: "5s", label: "۵ ثانیه" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPauseMode(opt.id)}
                  className={`py-1.5 px-1 rounded-xl font-bold border text-[11px] transition-colors ${
                    pauseMode === opt.id
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {verses.length > 1 && (
            <label className="flex items-center justify-between pt-1 cursor-pointer">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                پخش پیوسته بازه در پایان (ربط آیات)
              </span>
              <input
                type="checkbox"
                checked={linkRangeAfter}
                onChange={(e) => setLinkRangeAfter(e.target.checked)}
                className="w-4 h-4 accent-amber-600 rounded"
              />
            </label>
          )}
        </div>
      )}

      {error && (
        <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1 px-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
