// src/components/audio/MutedAudioQuiz.tsx
// کامپوننت تمرین «صوت ناقص» (تلاوت منشاوی با سکوت روی کلمهٔ هدف — L1)
import { useEffect, useRef, useState } from "react";
import { VolumeX, Play, RotateCcw, CheckCircle2, XCircle, X, Award } from "lucide-react";
import { planMutedSession, recordMutedTargetOutcome, type MutedTarget } from "../../learning/mutedAudio";
import { fetchAndCacheVerseAudio, getMenshawiUrls } from "../../services/menshawiAudio";
import { recordLearningReward } from "../../services/profileService";
import type { WordAudioSegment } from "../../services/qulReferenceService";
import { usePreferencesStore } from "../../store/usePreferencesStore";

interface Props {
  unitId: string;
  verses: { n: number; words: string[] }[];
  timings: Record<string, WordAudioSegment[]>;
  onClose: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function MutedAudioQuiz({ unitId, verses, timings, onClose }: Props) {
  const fontSize = usePreferencesStore((s) => s.arabicFontSize);
  const [hardMode, setHardMode] = useState(false);
  const [targets, setTargets] = useState<MutedTarget[]>(() =>
    planMutedSession(verses, timings, { count: 8, seed: Date.now() & 0xffff, hard: false }),
  );
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"ready" | "playing" | "answering" | "revealHard" | "feedback" | "done">("ready");
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [xpAwarded, setXpAwarded] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const muteIntervalRef = useRef<number | null>(null);
  const answerStartRef = useRef<number>(Date.now());

  const stopAudio = () => {
    if (muteIntervalRef.current !== null) {
      window.clearInterval(muteIntervalRef.current);
      muteIntervalRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopAudio();
  }, []);

  const current = targets[idx];

  const handleToggleHardMode = (nextHard: boolean) => {
    stopAudio();
    setHardMode(nextHard);
    setTargets(planMutedSession(verses, timings, { count: 8, seed: Date.now() & 0xffff, hard: nextHard }));
    setIdx(0);
    setCorrectCount(0);
    setLastCorrect(null);
    setPhase("ready");
  };

  const playMutedVerse = async () => {
    if (!current) return;
    stopAudio();
    setPlayError(null);
    setPhase("playing");

    let playUrl: string;
    try {
      const blob = await fetchAndCacheVerseAudio(current.verse);
      playUrl = URL.createObjectURL(blob);
      objectUrlRef.current = playUrl;
    } catch {
      playUrl = getMenshawiUrls(current.verse)[0];
    }

    const audio = new Audio(playUrl);
    audioRef.current = audio;

    const updateMute = () => {
      const ms = audio.currentTime * 1000;
      if (ms >= current.startMs - 50 && ms <= current.endMs + 100) {
        audio.volume = 0;
      } else {
        audio.volume = 1;
      }
    };

    audio.ontimeupdate = updateMute;
    muteIntervalRef.current = window.setInterval(updateMute, 30);

    audio.onended = () => {
      stopAudio();
      answerStartRef.current = Date.now();
      setPhase("answering");
    };

    audio.onerror = () => {
      stopAudio();
      setPlayError("پخش صوت آیه ناموفق بود. اتصال شبکه یا کش صوتی را بررسی کنید.");
      setPhase("ready");
    };

    try {
      await audio.play();
    } catch {
      stopAudio();
      setPlayError("پخش خودکار صوت انجام نشد؛ دوباره روی دکمه پخش بزنید.");
      setPhase("ready");
    }
  };

  const submitAnswer = async (correct: boolean) => {
    if (!current) return;
    const responseMs = Math.max(300, Date.now() - answerStartRef.current);
    await recordMutedTargetOutcome({
      unitId,
      verse: current.verse,
      wordIndex: current.wordIndex,
      correct,
      responseMs,
    });
    setLastCorrect(correct);
    if (correct) setCorrectCount((c) => c + 1);
    setPhase("feedback");
  };

  const handleNext = async () => {
    if (idx + 1 < targets.length) {
      setIdx(idx + 1);
      setLastCorrect(null);
      setPhase("ready");
      return;
    }
    const finalCorrect = correctCount;
    const xp = finalCorrect * 10;
    setXpAwarded(xp);
    if (xp > 0) {
      try {
        await recordLearningReward({ xpDelta: xp, markDailyActivity: true });
      } catch {
        // ignore
      }
    }
    setPhase("done");
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-[#1a2332] w-full max-w-md rounded-3xl border-2 border-[#d4af37]/60 dark:border-teal-800 shadow-2xl p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <VolumeX className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-black text-base text-slate-900 dark:text-white">تمرین صوت ناقص</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              stopAudio();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {phase === "done" ? (
          <div className="text-center space-y-4 py-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Award className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-black text-slate-900 dark:text-white">
              {toFarsi(correctCount)} از {toFarsi(targets.length)} پاسخ درست
            </h4>
            {xpAwarded > 0 && (
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                +{toFarsi(xpAwarded)} امتیاز نور ثبت شد
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs"
            >
              بازگشت به مصحف
            </button>
          </div>
        ) : !current ? (
          <div className="py-8 text-center text-xs font-bold text-slate-500">
            دادهٔ زمان‌بندی کافی برای آیات این نیم‌صفحه موجود نیست.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500">
                هدف {toFarsi(idx + 1)} از {toFarsi(targets.length)} • آیه {toFarsi(current.verse)}
              </span>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleToggleHardMode(false)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                    !hardMode ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm" : "text-slate-500"
                  }`}
                >
                  گزینه‌ای
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleHardMode(true)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                    hardMode ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm" : "text-slate-500"
                  }`}
                >
                  حالت سخت
                </button>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                به تلاوت آیهٔ {toFarsi(current.verse)} گوش دهید؛ صدای یک کلمه در میانهٔ آیه قطع می‌شود. کلمهٔ بی‌پخش را تشخیص دهید.
              </p>

              <button
                type="button"
                onClick={() => void playMutedVerse()}
                disabled={phase === "playing"}
                className="mx-auto py-2.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-xs flex items-center gap-2 transition-all"
              >
                {phase === "ready" ? <Play className="w-4 h-4 fill-white" /> : <RotateCcw className="w-4 h-4" />}
                <span>{phase === "playing" ? "در حال پخش آیه با سکوت..." : phase === "ready" ? "پخش تلاوت با سکوت" : "پخش دوباره"}</span>
              </button>

              {playError && <p className="text-[11px] text-rose-600 font-bold">{playError}</p>}
            </div>

            {/* پاسخ‌دهی در حالت عادی */}
            {(phase === "answering" || phase === "feedback") && !hardMode && (
              <div className="grid grid-cols-2 gap-2">
                {current.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={phase === "feedback"}
                    onClick={() => void submitAnswer(opt === current.wordAr)}
                    style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif", fontSize: `${Math.min(28, fontSize)}px` }}
                    className={`p-3 rounded-2xl border-2 text-center transition-all ${
                      phase === "feedback" && opt === current.wordAr
                        ? "bg-emerald-100 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-200"
                        : "bg-white dark:bg-[#1C2541] border-slate-200 dark:border-slate-700 hover:border-emerald-500"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* پاسخ‌دهی در حالت سخت */}
            {phase === "answering" && hardMode && (
              <div className="space-y-2 text-center">
                <p className="text-xs text-slate-500">کلمهٔ بی‌پخش را از حفظ بگویید، سپس نمایش دهید:</p>
                <button
                  type="button"
                  onClick={() => setPhase("revealHard")}
                  className="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs"
                >
                  نمایش کلمهٔ درست
                </button>
              </div>
            )}

            {phase === "revealHard" && hardMode && (
              <div className="space-y-3 text-center">
                <div
                  className="p-4 rounded-2xl bg-amber-50 dark:bg-slate-900 border border-amber-300 dark:border-slate-700"
                  style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif", fontSize: `${fontSize}px` }}
                >
                  {current.wordAr}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void submitAnswer(true)}
                    className="py-2.5 rounded-2xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>درست گفتم</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitAnswer(false)}
                    className="py-2.5 rounded-2xl bg-rose-600 text-white font-black text-xs flex items-center justify-center gap-1"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>اشتباه گفتم</span>
                  </button>
                </div>
              </div>
            )}

            {phase === "feedback" && (
              <div className="space-y-2.5 pt-1">
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between ${
                    lastCorrect
                      ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800"
                      : "bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800"
                  }`}
                >
                  <span>{lastCorrect ? "آفرین! تشخیص درست بود." : `کلمهٔ درست: ${current.wordAr}`}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleNext()}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs"
                >
                  ادامه
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
