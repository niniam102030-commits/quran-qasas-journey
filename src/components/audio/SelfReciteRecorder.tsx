// src/components/audio/SelfReciteRecorder.tsx
// ضبط صدای خود به‌صورت ۱۰۰٪ آفلاین (MediaRecorder) + حالت همراهی تلاوت تکه‌به‌تکه با لایهٔ هم‌ترازی و کالیبراسیون شخصی
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Info,
  RotateCcw,
  SkipForward,
  Check,
} from "lucide-react";
import {
  alignTranscriptToVerse,
  buildVerifierTranscriptFromAlignment,
  computePrecisionAccuracy,
  segmentVerse,
  type WordAlignment,
  type WordAlignState,
} from "../../learning/recitationAlign";
import {
  loadRecitationCalibration,
  recordUserConfirmedRecitationWord,
} from "../../services/recitationCalibrationService";
import {
  verifyVerseRecitation,
  type ExpectedReciteWord,
  type RecitationCheckResult,
} from "../../services/recitationVerifier";
import {
  getDeviceAsrCapability,
  startLiveArabicRecognition,
  type LiveRecognitionHandle,
} from "../../services/offlineAsrService";
import {
  getSherpaModelStatus,
  sherpaAsr,
  startSherpaMicrophoneSession,
  type SherpaMicSessionHandle,
} from "../../services/sherpaAsr";
import { usePreferencesStore } from "../../store/usePreferencesStore";

export interface ReciteVerseOption {
  n: number;
  words: ExpectedReciteWord[];
}

interface Props {
  verses?: ReciteVerseOption[];
  onWordsRecitedCorrectly?: (wordIds: string[]) => void;
  /** گزارش نتیجه نهایی بررسی تلاوت در پایان شنیدن (برای شاخص دقت لفظی L4) */
  onFinalPrecision?: (entry: { at: number; verse: number; accuracy: number }) => void;
}

interface ReciteWordUiState extends WordAlignment {
  wordId: string;
  evaluated: boolean;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${toFarsi(String(m).padStart(2, "0"))}:${toFarsi(String(s).padStart(2, "0"))}`;
}

function createInitialWordStates(words: readonly ExpectedReciteWord[]): ReciteWordUiState[] {
  return words.map((w) => ({
    wordId: w.id,
    ref: w.ar,
    state: "uncertain",
    userConfirmed: false,
    evaluated: false,
  }));
}

export default function SelfReciteRecorder({ verses, onWordsRecitedCorrectly, onFinalPrecision }: Props = {}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // حالت همراهی (شاهد) تلاوت تکه‌به‌تکه (بخش ۳)
  const [showVerifier, setShowVerifier] = useState(false);
  const [targetVerseNum, setTargetVerseNum] = useState<number>(verses?.[0]?.n ?? 1);
  const [listeningAsr, setListeningAsr] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [liveStates, setLiveStates] = useState<Record<number, "matched">>({});
  const [wordStates, setWordStates] = useState<ReciteWordUiState[]>([]);
  const [activeSegIdx, setActiveSegIdx] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [extraWordsBySeg, setExtraWordsBySeg] = useState<Record<number, number>>({});
  const [checkResult, setCheckResult] = useState<RecitationCheckResult | null>(null);
  const [asrError, setAsrError] = useState<string | null>(null);

  const capability = getDeviceAsrCapability();
  const offlineAsrEnabled = usePreferencesStore((s) => s.offlineAsrEnabled);
  const [sherpaReady, setSherpaReady] = useState(false);
  const recognitionRef = useRef<LiveRecognitionHandle | SherpaMicSessionHandle | null>(null);
  const wordStatesRef = useRef<ReciteWordUiState[]>([]);
  const calibrationMapRef = useRef<Map<string, number>>(new Map());
  const reportedSessionRef = useRef<boolean>(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const selectedVerse = useMemo(
    () => verses?.find((v) => v.n === targetVerseNum) ?? verses?.[0],
    [verses, targetVerseNum],
  );

  const segments = useMemo(
    () => (selectedVerse ? segmentVerse(selectedVerse.words.map((w) => ({ text: w.ar }))) : []),
    [selectedVerse],
  );

  const currentSegment = segments[activeSegIdx] ?? segments[0] ?? { start: 0, end: 0 };

  const cleanupRecording = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  const cleanupPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => {
    let active = true;
    void loadRecitationCalibration().then(({ map }) => {
      if (active) calibrationMapRef.current = map;
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (verses && verses.length > 0 && !verses.some((v) => v.n === targetVerseNum)) {
      setTargetVerseNum(verses[0].n);
    }
  }, [verses, targetVerseNum]);

  // بازنشانی وضعیت تکه‌ها هنگام تغییر آیه هدف
  useEffect(() => {
    if (!selectedVerse) return;
    const init = createInitialWordStates(selectedVerse.words);
    wordStatesRef.current = init;
    setWordStates(init);
    setActiveSegIdx(0);
    setSessionCompleted(false);
    setExtraWordsBySeg({});
    setSpokenText("");
    setCheckResult(null);
    reportedSessionRef.current = false;
  }, [selectedVerse]);

  useEffect(() => {
    let active = true;
    void Promise.all([sherpaAsr.isAvailable(), getSherpaModelStatus()]).then(([avail, status]) => {
      if (active) setSherpaReady(avail && status.installed && offlineAsrEnabled);
    });
    return () => {
      active = false;
    };
  }, [offlineAsrEnabled]);

  useEffect(() => {
    return () => {
      cleanupRecording();
      cleanupPlayback();
      void recognitionRef.current?.stop();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncWithDownstreamVerifier = (nextStates: ReciteWordUiState[]) => {
    if (!selectedVerse) return;
    const synthTranscript = buildVerifierTranscriptFromAlignment(nextStates);
    const verified = verifyVerseRecitation(selectedVerse.words, synthTranscript);
    // جایگزینی درصد دقت با فرمول بدون جریمه برای uncertain: (matched + userConfirmed) / nonUncertainTotal
    const effectiveAccuracy = computePrecisionAccuracy(nextStates);
    const mergedResult: RecitationCheckResult = {
      ...verified,
      accuracyPercent: effectiveAccuracy,
    };
    setCheckResult(mergedResult);

    const matchedIds = nextStates
      .filter((w) => w.state === "matched" || w.userConfirmed)
      .map((w) => w.wordId);
    if (matchedIds.length > 0) {
      onWordsRecitedCorrectly?.(matchedIds);
    }
  };

  const reportFinalPrecisionNow = (verseN: number, states: ReciteWordUiState[]) => {
    const anyEvaluated = states.some((w) => w.evaluated || w.userConfirmed);
    if (!anyEvaluated) return;
    reportedSessionRef.current = true;
    const accuracy = computePrecisionAccuracy(states);
    onFinalPrecision?.({
      at: Date.now(),
      verse: verseN,
      accuracy,
    });
  };

  const stopActiveListening = async () => {
    if (recognitionRef.current) {
      await recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListeningAsr(false);
  };

  const applySegmentTranscript = (
    segIdx: number,
    transcript: string,
    tokenConfidences?: number[],
  ) => {
    if (!selectedVerse) return;
    const seg = segments[segIdx];
    if (!seg) return;

    setSpokenText(transcript);
    const segSlice = selectedVerse.words.slice(seg.start, seg.end + 1);
    const refTexts = segSlice.map((w) => w.ar);
    const transTokens = transcript.split(/\s+/).filter(Boolean);

    const aligned = alignTranscriptToVerse(refTexts, transTokens, {
      tokenConfidences,
      calibration: calibrationMapRef.current,
    });

    const nextStates = wordStatesRef.current.map((prev, idx) => {
      if (idx < seg.start || idx > seg.end) return prev;
      const local = aligned.words[idx - seg.start];
      if (!local) return prev;
      // اگر کاربر قبلاً در همین تکه کلمه‌ای را با لمس تأیید کرده، تأییدش حفظ می‌شود
      if (prev.userConfirmed) {
        return {
          ...prev,
          state: "matched" as WordAlignState,
          userConfirmed: true,
          evaluated: true,
        };
      }
      return {
        wordId: prev.wordId,
        ref: prev.ref,
        state: local.state,
        heard: local.heard,
        userConfirmed: false,
        evaluated: true,
      };
    });

    wordStatesRef.current = nextStates;
    setWordStates(nextStates);
    setExtraWordsBySeg((prev) => ({ ...prev, [segIdx]: aligned.extraWords }));
    syncWithDownstreamVerifier(nextStates);
  };

  const startListeningForSegment = async (segIdx: number) => {
    if (!selectedVerse) return;
    await stopActiveListening();
    setAsrError(null);
    setSpokenText("");
    setLiveStates({});

    const verseNumAtStart = selectedVerse.n;
    const hotwords = [...new Set(selectedVerse.words.map((w) => w.ar))];

    const onTranscript = (transcript: string, isFinal?: boolean, tokenConfidences?: number[]) => {
      if (!isFinal) {
        // رنگی‌شدن زنده: فقط تطابق‌های موقتِ همین تکه، بدون اثر روی ارزیابی نهایی
        if (!selectedVerse) return;
        const seg = segments[segIdx];
        if (!seg) return;
        const segSlice = selectedVerse.words.slice(seg.start, seg.end + 1);
        const aligned = alignTranscriptToVerse(
          segSlice.map((w) => w.ar),
          transcript.split(/\s+/).filter(Boolean),
          { calibration: calibrationMapRef.current },
        );
        const live: Record<number, "matched"> = {};
        aligned.words.forEach((w, localIdx) => {
          if (w.state === "matched") live[seg.start + localIdx] = "matched";
        });
        setLiveStates(live);
        return;
      }
      setLiveStates({});
      applySegmentTranscript(segIdx, transcript, tokenConfidences);
    };

    if (sherpaReady) {
      const handle = await startSherpaMicrophoneSession({
        hotwords,
        onTranscript: (text, isFinal) => onTranscript(text, isFinal),
        onError: (msg) => {
          setAsrError(msg);
          setListeningAsr(false);
        },
        onEnd: () => {
          setListeningAsr(false);
          if (segIdx === segments.length - 1) {
            setSessionCompleted(true);
            reportFinalPrecisionNow(verseNumAtStart, wordStatesRef.current);
          }
        },
      });
      if (handle) {
        recognitionRef.current = handle;
        setListeningAsr(true);
      }
      return;
    }

    const handle = startLiveArabicRecognition({
      onTranscript,
      onError: (msg) => {
        setAsrError(msg);
        setListeningAsr(false);
      },
      onEnd: () => {
        setListeningAsr(false);
        if (segIdx === segments.length - 1) {
          setSessionCompleted(true);
          reportFinalPrecisionNow(verseNumAtStart, wordStatesRef.current);
        }
      },
    });

    if (handle) {
      recognitionRef.current = handle;
      setListeningAsr(true);
    }
  };

  const handleToggleAsr = async () => {
    if (listeningAsr) {
      await stopActiveListening();
      setLiveStates({});
      if (selectedVerse && activeSegIdx === segments.length - 1) {
        setSessionCompleted(true);
        reportFinalPrecisionNow(selectedVerse.n, wordStatesRef.current);
      }
      return;
    }
    if (sessionCompleted) {
      // شروع دوباره از تکهٔ اول
      if (selectedVerse) {
        const init = createInitialWordStates(selectedVerse.words);
        wordStatesRef.current = init;
        setWordStates(init);
        setExtraWordsBySeg({});
        setSessionCompleted(false);
        setActiveSegIdx(0);
        reportedSessionRef.current = false;
        await startListeningForSegment(0);
      }
      return;
    }
    await startListeningForSegment(activeSegIdx);
  };

  /** تکرار همین تکه بدون هیچ جریمه‌ای */
  const handleRepeatCurrentSegment = async () => {
    if (!selectedVerse) return;
    await stopActiveListening();
    const seg = segments[activeSegIdx];
    if (!seg) return;

    const resetStates = wordStatesRef.current.map((w, idx) =>
      idx >= seg.start && idx <= seg.end
        ? {
            wordId: w.wordId,
            ref: w.ref,
            state: "uncertain" as WordAlignState,
            heard: undefined,
            userConfirmed: false,
            evaluated: false,
          }
        : w,
    );
    wordStatesRef.current = resetStates;
    setWordStates(resetStates);
    setExtraWordsBySeg((prev) => ({ ...prev, [activeSegIdx]: 0 }));
    setSpokenText("");
    syncWithDownstreamVerifier(resetStates);
  };

  /** رد کردن یا رفتن به تکهٔ بعد بدون جریمه */
  const handleSkipOrNextSegment = async () => {
    if (!selectedVerse) return;
    await stopActiveListening();
    setSpokenText("");

    if (activeSegIdx + 1 < segments.length) {
      setActiveSegIdx(activeSegIdx + 1);
    } else {
      setSessionCompleted(true);
      reportFinalPrecisionNow(selectedVerse.n, wordStatesRef.current);
    }
  };

  /** اصلاح با لمس («درست خواندم»): تبدیل وضعیت به matched + userConfirmed: true و +۱ در کالیبراسیون */
  const handleUserConfirmWord = async (wordIndex: number) => {
    const target = wordStatesRef.current[wordIndex];
    if (!target || target.state === "matched" || target.userConfirmed) return;

    const nextStates = wordStatesRef.current.map((w, idx) =>
      idx === wordIndex
        ? {
            ...w,
            state: "matched" as WordAlignState,
            userConfirmed: true,
            evaluated: true,
          }
        : w,
    );
    wordStatesRef.current = nextStates;
    setWordStates(nextStates);
    syncWithDownstreamVerifier(nextStates);

    try {
      const { map } = await recordUserConfirmedRecitationWord(target.ref);
      calibrationMapRef.current = map;
    } catch {
      // خطای احتمالی ذخیره‌سازی مانع به‌روزرسانی UI نمی‌شود
    }

    if (selectedVerse && (sessionCompleted || reportedSessionRef.current)) {
      reportFinalPrecisionNow(selectedVerse.n, nextStates);
    }
  };

  const startRecording = async () => {
    setError(null);
    cleanupPlayback();

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("مرورگر یا دستگاه شما از ضبط صدای آفلاین پشتیبانی نمی‌کند.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        cleanupRecording();
      };

      recorder.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed((s) => s + 1);
      }, 1000);
    } catch {
      cleanupRecording();
      setError("دسترسی به میکروفون داده نشد. برای ضبط آفلاین، اجازه میکروفون را فعال کنید.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const togglePlay = async () => {
    if (!audioUrl) return;
    if (playing) {
      cleanupPlayback();
      return;
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setError("پخش صدای ضبط‌شده ناموفق بود.");
      setPlaying(false);
    }
  };

  const clearRecording = () => {
    cleanupPlayback();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setElapsed(0);
    setError(null);
  };

  // محاسبهٔ آمار سهگانهٔ جلسه (شنیده‌شده، خطای قطعی، نامشخص)
  const totalWordsCount = wordStates.length;
  const matchedOrConfirmedCount = wordStates.filter((w) => w.state === "matched" || w.userConfirmed).length;
  const confirmedErrorCount = wordStates.filter((w) => w.state === "substituted" && !w.userConfirmed).length;
  const uncertainCount = wordStates.filter((w) => w.state === "uncertain" && !w.userConfirmed).length;
  const heardCoveragePercent = totalWordsCount > 0 ? Math.round((matchedOrConfirmedCount / totalWordsCount) * 100) : 0;
  const effectiveAccuracyPercent = computePrecisionAccuracy(wordStates);
  const totalExtraWords = Object.values(extraWordsBySeg).reduce((a, b) => a + b, 0);
  const anyWordEvaluated = wordStates.some((w) => w.evaluated || w.userConfirmed) || sessionCompleted;

  return (
    <div dir="rtl" className="rounded-2xl border border-emerald-200/80 dark:border-slate-700 bg-emerald-50/60 dark:bg-slate-800/70 px-3.5 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!recording ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{audioUrl ? "ضبط مجدد تلاوت خود" : "ضبط صدای خود (آفلاین)"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>توقف ضبط ({formatSeconds(elapsed)})</span>
            </button>
          )}

          {verses && verses.length > 0 && (
            <button
              type="button"
              onClick={() => setShowVerifier((s) => !s)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors ${
                showVerifier
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-white dark:bg-slate-900 border-amber-300 dark:border-slate-600 text-amber-800 dark:text-amber-300 hover:bg-amber-50"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>همراهی و تصحیح تلاوت (تکه‌به‌تکه)</span>
            </button>
          )}
        </div>

        {audioUrl && !recording && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void togglePlay()}
              className="py-1.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-slate-600 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-100/60 transition-colors"
            >
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{playing ? "توقف" : `شنیدن تلاوت خود (${formatSeconds(elapsed)})`}</span>
            </button>
            <button
              type="button"
              onClick={clearRecording}
              title="حذف صدای ضبط‌شده"
              className="p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showVerifier && selectedVerse && (
        <div className="pt-2.5 mt-1 border-t border-emerald-200/70 dark:border-slate-700 space-y-2.5 text-xs">
          {/* نوار انتخاب آیه و کنترل تکهٔ جاری */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                آیه هدف:
              </label>
              <select
                value={selectedVerse.n}
                onChange={(e) => {
                  void stopActiveListening();
                  setTargetVerseNum(Number(e.target.value));
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-bold"
              >
                {verses?.map((v) => (
                  <option key={v.n} value={v.n}>
                    آیه {toFarsi(v.n)} ({toFarsi(v.words.length)} کلمه)
                  </option>
                ))}
              </select>

              {segments.length > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-teal-100/80 dark:bg-teal-950/60 text-teal-900 dark:text-teal-300 font-bold text-[11px]">
                  تکه {toFarsi(Math.min(activeSegIdx + 1, segments.length))} از {toFarsi(segments.length)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleToggleAsr()}
                disabled={!sherpaReady && !capability.hasWebSpeech && !listeningAsr}
                className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                  listeningAsr
                    ? "bg-rose-600 text-white animate-pulse"
                    : "bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white"
                }`}
              >
                {listeningAsr ? <Square className="w-3.5 h-3.5 fill-white" /> : <Mic className="w-3.5 h-3.5" />}
                <span>
                  {listeningAsr
                    ? "توقف تکه"
                    : sessionCompleted
                    ? "شروع مجدد از تکه اول"
                    : "خواندن این تکه"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleRepeatCurrentSegment()}
                className="py-1.5 px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 font-bold text-[11px] flex items-center gap-1"
                title="پاک‌کردن نتیجه همین تکه و تلاش دوباره بدون هیچ جریمه‌ای"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تکرار همین تکه</span>
              </button>

              {!sessionCompleted && (
                <button
                  type="button"
                  onClick={() => void handleSkipOrNextSegment()}
                  className="py-1.5 px-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold text-[11px] flex items-center gap-1"
                  title="عبور از این تکه بدون جریمه"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>{activeSegIdx + 1 < segments.length ? "رد کردن تکه" : "پایان و نتیجه"}</span>
                </button>
              )}
            </div>
          </div>

          {/* نمایش تکه‌به‌تکه کلمات آیه با ۳ رنگ و امکان اصلاح با لمس */}
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>سبز = شنیده شد</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span>قرمز ملایم = خطای محتمل</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span>خاکستری = نامشخص</span>
                </span>
              </div>
              <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">
                برای «درست خواندم» روی هر کلمهٔ قرمز یا خاکستری بزنید
              </span>
            </div>

            <div
              className="flex flex-wrap gap-1.5 leading-loose pt-1"
              style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif", fontSize: "1.2rem" }}
            >
              {wordStates.map((w, idx) => {
                const inCurrentSeg = !sessionCompleted && idx >= currentSegment.start && idx <= currentSegment.end;
                const inFutureSeg = !sessionCompleted && idx > currentSegment.end;
                const isMatched = w.state === "matched" || Boolean(w.userConfirmed);
                const isSubstituted = w.state === "substituted" && !w.userConfirmed;
                const isLive = listeningAsr && liveStates[idx] === "matched" && !isMatched;
                const canConfirm = !isMatched && !inFutureSeg;

                const colorClass = inFutureSeg
                  ? "bg-slate-100/60 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-dashed border-slate-200 dark:border-slate-700 opacity-40 blur-[0.6px]"
                  : isLive
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 animate-pulse"
                  : isMatched
                  ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                  : isSubstituted
                  ? "bg-rose-100/90 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700";

                const ringClass = inCurrentSeg ? "ring-2 ring-teal-500/40 dark:ring-teal-400/40" : "";

                return (
                  <button
                    key={w.wordId}
                    type="button"
                    disabled={!canConfirm}
                    onClick={() => void handleUserConfirmWord(idx)}
                    title={
                      inFutureSeg
                        ? "تکهٔ بعدی"
                        : isMatched
                        ? w.userConfirmed
                          ? "تأییدشده توسط شما (درست خواندم)"
                          : "شنیده شد"
                        : isSubstituted
                        ? `خطای محتمل (شنیده‌شده: ${w.heard ?? "—"}) — اگر درست خواندید بزنید: درست خواندم`
                        : "نامشخص — اگر درست خواندید بزنید: درست خواندم"
                    }
                    className={`px-2 py-0.5 rounded-xl border transition-all inline-flex items-center gap-1 ${colorClass} ${ringClass} ${
                      canConfirm ? "cursor-pointer hover:brightness-95 active:scale-95" : "cursor-default"
                    }`}
                  >
                    <span>{w.ref}</span>
                    {w.userConfirmed && (
                      <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-300 shrink-0" />
                    )}
                    {canConfirm && (w.evaluated || sessionCompleted) && (
                      <span
                        style={{ fontFamily: "Vazirmatn, sans-serif" }}
                        className="text-[9px] font-bold px-1 py-0.2 rounded bg-white/80 dark:bg-slate-900/80 text-teal-800 dark:text-teal-300"
                      >
                        درست خواندم
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {spokenText && (
            <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-500">متن شنیده‌شده تکهٔ جاری: </span>
              <span dir="rtl">{spokenText}</span>
            </div>
          )}

          {/* کارت نتیجهٔ جلسه (۳ عدد جدا + متن صادقانهٔ ثابت) */}
          {(anyWordEvaluated || checkResult) && (
            <div className="space-y-2.5 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[11px] font-black text-emerald-800 dark:text-emerald-300">
                    شنیده‌شده: {toFarsi(heardCoveragePercent)}٪
                  </div>
                  <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                    {toFarsi(matchedOrConfirmedCount)} از {toFarsi(totalWordsCount)} کلمه
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                  <div className="text-[11px] font-black text-rose-800 dark:text-rose-300">
                    خطای قطعی: {toFarsi(confirmedErrorCount)} کلمه
                  </div>
                  <div className="text-[10px] text-rose-700/80 dark:text-rose-400/80">
                    جایگزینی تأییدنشده
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                    نامشخص: {toFarsi(uncertainCount)} کلمه
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    خنثی (بدون جریمه)
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold pt-1">
                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>شاخص دقت مؤثر (بدون کسر نامشخص‌ها): {toFarsi(effectiveAccuracyPercent)}٪</span>
                </span>
                {totalExtraWords > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    تکرار/اضافه‌خوانی بدون جریمه: {toFarsi(totalExtraWords)} کلمه
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 leading-relaxed">
                موارد خاکستری یعنی برنامه صدای شما را در آن قسمت خوب تشخیص نداده است، نه اینکه اشتباه خوانده باشید.
              </p>
            </div>
          )}

          {asrError && (
            <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{asrError}</span>
            </div>
          )}

          {/* Transparent ASR Engine Notice */}
          <div className="flex items-start gap-1.5 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/70 text-[11px] text-slate-600 dark:text-slate-400">
            <Info className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
            <span>
              {sherpaReady
                ? "موتور آفلاین sherpa-onnx فعال است (آزمایشی — در حال ارزیابی روی دستگاه). خروجی از لایهٔ هم‌ترازی و کالیبراسیون شخصی عبور می‌کند."
                : capability.hasWebSpeech
                ? "تشخیص گفتار زنده با موتور مرورگر (Web Speech API — آزمایشی) انجام می‌شود و معمولاً نیازمند اتصال اینترنت است. ضبط صدای بالا کاملاً آفلاین است."
                : "موتور تشخیص گفتار زنده در این محیط در دسترس نیست (در اندروید می‌توانید مدل آفلاین آزمایشی sherpa-onnx را از تنظیمات دریافت کنید). ضبط صدای بالا کاملاً آفلاین است."}
            </span>
          </div>

          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            توجه: این ابزار به عنوان شاهد و همراه تلاوت طراحی شده است؛ موارد نامشخص هیچ نمره یا پیشرفتی کم نمی‌کنند و جایگزین ارزیابی استاد تجوید نیستند.
          </p>
        </div>
      )}
    </div>
  );
}
