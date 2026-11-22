// src/components/audio/VerseAudioPlayer.tsx
// پخش‌کننده تلاوت استاد منشاوی با پشتیبانی آفلاین (IndexedDB)، تکرار و سرعت پخش
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Repeat, Loader2, Volume2, WifiOff, CheckCircle2 } from "lucide-react";
import { fetchAndCacheVerseAudio, isVerseAudioCached } from "../../services/menshawiAudio";

interface Props {
  /** آیه فعلی یا فهرست آیات برای پخش پیاپی */
  verses: number[];
  compact?: boolean;
  onActiveVerseChange?: (verse: number | null) => void;
}

const SPEEDS = [0.75, 1, 1.25] as const;
const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function VerseAudioPlayer({ verses, compact = false, onActiveVerseChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // 1x
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const repeatRef = useRef(repeat);
  const speedRef = useRef<number>(SPEEDS[1]);
  const versesKey = verses.join(",");

  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  useEffect(() => {
    speedRef.current = SPEEDS[speedIdx];
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[speedIdx];
    }
  }, [speedIdx]);

  const stopPlayback = () => {
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
    onActiveVerseChange?.(null);
  };

  useEffect(() => {
    let active = true;
    const first = verses[0];
    if (first) {
      isVerseAudioCached(first).then((ok) => {
        if (active) setCached(ok);
      });
    }
    return () => {
      active = false;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versesKey]);

  const playAtIndex = async (idx: number) => {
    const verse = verses[idx];
    if (!verse) {
      stopPlayback();
      return;
    }
    stopPlayback();
    setCurrentIdx(idx);
    setLoading(true);
    setError(null);
    onActiveVerseChange?.(verse);

    try {
      const blob = await fetchAndCacheVerseAudio(verse);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setCached(true);

      const audio = new Audio(url);
      audio.playbackRate = speedRef.current;
      audioRef.current = audio;

      audio.onended = () => {
        if (idx + 1 < verses.length) {
          void playAtIndex(idx + 1);
        } else if (repeatRef.current) {
          void playAtIndex(0);
        } else {
          stopPlayback();
        }
      };

      await audio.play();
      setPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در پخش تلاوت");
      stopPlayback();
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlay = () => {
    if (playing) {
      stopPlayback();
    } else {
      void playAtIndex(0);
    }
  };

  const cycleSpeed = () => {
    setSpeedIdx((prev) => (prev + 1) % SPEEDS.length);
  };

  if (verses.length === 0) return null;

  const activeVerse = verses[currentIdx] ?? verses[0];

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
            disabled={loading}
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
                  ? `در حال تلاوت آیه ${toFarsi(activeVerse)} (${toFarsi(currentIdx + 1)} از ${toFarsi(verses.length)})`
                  : `تلاوت منشاوی (${toFarsi(verses.length)} آیه)`}
              </span>
            </div>
            {!compact && (
              <div className="text-[11px] text-amber-800/75 dark:text-slate-400 flex items-center gap-1">
                {cached ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>ذخیره‌شده برای پخش آفلاین</span>
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
            onClick={() => setRepeat((r) => !r)}
            title={repeat ? "تکرار فعال" : "تکرار غیرفعال"}
            className={`p-1.5 rounded-xl border transition-colors ${
              repeat
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white dark:bg-slate-900 text-slate-500 border-amber-200 dark:border-slate-700 hover:text-amber-700"
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1 px-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
