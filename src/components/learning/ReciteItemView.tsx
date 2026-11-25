// src/components/learning/ReciteItemView.tsx
// نمای یک «آیتم تلاوت» داخل فرایند یادگیری: تلاوت تکه‌به‌تکهٔ یک آیه با داوری زندهٔ sherpa،
// در قالب‌های همراهی/محو/نابینا/اتصال/شکار خطا/مرور صوتی/همراهی بدون قضاوت.
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Eye, RotateCcw, ArrowLeft, CheckCircle2, XCircle, SkipForward } from "lucide-react";
import {
  judgeRecitationAttempt,
  segmentVerse,
  type WordAlignState,
  type WordAlignment,
} from "../../learning/recitationAlign";
import {
  appendAttemptLog,
  appendEventLog,
  effectiveJudgeParams,
  loadJudgeSettings,
  type RecitationJudgeSettings,
} from "../../services/recitationJudgeService";
import {
  loadRecitationCalibration,
  recordUserConfirmedRecitationWord,
} from "../../services/recitationCalibrationService";
import {
  startSherpaMicrophoneSession,
  type SherpaMicSessionHandle,
} from "../../services/sherpaAsr";
import {
  MAX_RECITE_ATTEMPTS,
  evaluateReciteItem,
  fadeDisplayFor,
  type ReciteItemResult,
  type ReciteAttemptSummary,
} from "../../learning/recitationItems";
import type { ReciteSessionItem } from "../../services/recitationSessionService";
import { useLearningStore } from "../../store/useLearningStore";

interface WordUiState extends WordAlignment {
  wordId: string;
  evaluated: boolean;
}

const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => faDigits[Number(d)]);

const MODE_TITLES: Record<ReciteSessionItem["spec"]["mode"], string> = {
  follow: "تلاوت همراه با متن",
  fade: "تلاوت با متنِ در حال محو",
  blind: "تلاوت از حفظ (بدون متن)",
  link: "اتصال آیات — ادامه بده",
  hunt: "شکار خطا — این آیه را تمیز بخوان",
  voice: "مرور صوتی — آیه را از حفظ بخوان",
  witness: "همراهی آزاد — بدون قضاوت",
};

interface Props {
  item: ReciteSessionItem;
  /** حالت قفل (گیت مرحله و آزمون): کالیبراسیون شخصی کنار می‌رود و «درست خواندم» غیرفعال است */
  locked?: boolean;
  onDone: (result: ReciteItemResult) => void;
}

export default function ReciteItemView({ item, locked = false, onDone }: Props) {
  const { spec, words, linkWords } = item;
  const segments = useMemo(() => segmentVerse(words.map((w) => ({ text: w.ar }))), [words]);
  const weakIdxs = useMemo(() => {
    // کلمات بلندتر (یک‌سوم بلندتر آیه) در قالب محو زودتر پنهان می‌شوند
    const order = words.map((w, i) => ({ i, len: w.ar.length })).sort((a, b) => b.len - a.len);
    return new Set(order.slice(0, Math.max(1, Math.floor(words.length / 3))).map((o) => o.i));
  }, [words]);
  const fadeDisplay = useMemo(
    () => (spec.mode === "fade" ? fadeDisplayFor(words.length, spec.fadeLevel ?? 0, weakIdxs) : null),
    [spec.mode, spec.fadeLevel, words.length, weakIdxs],
  );

  const [wordStates, setWordStates] = useState<WordUiState[]>(() =>
    words.map((w) => ({ wordId: w.id, ref: w.ar, state: "uncertain" as WordAlignState, userConfirmed: false, evaluated: false })),
  );
  const [phase, setPhase] = useState<"ready" | "listening" | "attemptDone">("ready");
  const [activeSegIdx, setActiveSegIdx] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [asrError, setAsrError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [peeks, setPeeks] = useState(0);
  const [peekVisible, setPeekVisible] = useState(false);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [lastEval, setLastEval] = useState<{ passed: boolean; summary: ReciteAttemptSummary } | null>(null);

  const wordStatesRef = useRef(wordStates);
  const segIdxRef = useRef(0);
  const segJudgedRef = useRef<boolean[]>(segments.map(() => false));
  const recognitionRef = useRef<SherpaMicSessionHandle | null>(null);
  const judgeSettingsRef = useRef<RecitationJudgeSettings | null>(null);
  const calibrationRef = useRef<Map<string, number>>(new Map());
  const bestRef = useRef<{ passed: boolean; summary: ReciteAttemptSummary } | null>(null);
  const attemptsRef = useRef(0);
  const peeksRef = useRef(0);
  const chunkedCompleteRef = useRef(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadJudgeSettings().then((s) => {
      if (active) judgeSettingsRef.current = s;
    });
    void loadRecitationCalibration().then(({ map }) => {
      if (active) calibrationRef.current = map;
    });
    return () => {
      active = false;
      void recognitionRef.current?.stop();
    };
  }, []);

  const computeSummary = (states: WordUiState[]): ReciteAttemptSummary => {
    const matched = states.filter((w) => w.state === "matched" || w.userConfirmed).length;
    const uncertain = states.filter((w) => w.evaluated && w.state === "uncertain" && !w.userConfirmed).length;
    const confirmedErrors = states.filter(
      (w) => w.evaluated && (w.state === "missed" || w.state === "substituted") && !w.userConfirmed,
    ).length;
    const judgedSegments = segJudgedRef.current.filter(Boolean).length;
    return {
      totalWords: words.length,
      matched,
      uncertain,
      confirmedErrors,
      judgedSegments,
      totalSegments: segments.length,
      coverageComplete: segments.length > 0 && judgedSegments >= segments.length,
    };
  };

  const finishAttempt = () => {
    const summary = computeSummary(wordStatesRef.current);
    const ev = evaluateReciteItem(spec.mode, summary, peeksRef.current);
    attemptsRef.current += 1;
    setAttemptsUsed(attemptsRef.current);
    if (!bestRef.current || (ev.passed && !bestRef.current.passed) || summary.matched > bestRef.current.summary.matched) {
      bestRef.current = { passed: ev.passed, summary };
    }
    setLastEval({ passed: ev.passed, summary });
    setPhase("attemptDone");
  };

  const applySegmentTranscript = (segIdx: number, transcript: string, decodeMs?: number) => {
    const seg = segments[segIdx];
    if (!seg) return;
    const segSlice = words.slice(seg.start, seg.end + 1);
    const refTexts = segSlice.map((w) => w.ar);
    const transTokens = transcript.split(/\s+/).filter(Boolean);
    const settings = judgeSettingsRef.current;
    const judged = judgeRecitationAttempt(refTexts, transTokens, {
      calibration: locked ? new Map() : calibrationRef.current,
      bypassCalibration: locked ? true : settings?.bypassCalibration ?? false,
      judge: settings ? effectiveJudgeParams(settings) : undefined,
    });

    void appendAttemptLog({
      at: Date.now(),
      verse: spec.verse,
      segmentIndex: segIdx,
      outcome: judged.outcome,
      coverage: judged.coverage,
      heardRatio: judged.heardRatio,
      matched: judged.words.filter((w) => w.state === "matched").length,
      substituted: judged.words.filter((w) => w.state === "substituted").length,
      missed: judged.missedCount,
      uncertain: judged.words.filter((w) => w.state === "uncertain").length,
      extraWords: judged.extraWords,
      transcript,
      profile: settings?.useCustom ? "custom" : settings?.profile ?? "balanced",
      bypassCalibration: locked ? true : settings?.bypassCalibration ?? false,
      engine: "sherpa",
      chunked: true,
      ...(decodeMs !== undefined ? { decodeMs } : {}),
      words: judged.words.map((w) => ({
        ref: w.ref,
        state: w.state,
        heard: w.heard,
        sim: w.sim,
        reason: w.reason,
        userConfirmed: w.userConfirmed,
      })),
    }).catch(() => {});

    if (judged.outcome === "no_speech") {
      setNotice("چیزی شنیده نشد؛ همین تکه را دوباره بخوانید.");
      return;
    }
    segJudgedRef.current[segIdx] = judged.outcome === "judged";
    if (judged.outcome === "not_this_text") {
      setNotice("این تلاوت با متن این تکه همخوانی نداشت.");
    } else {
      setNotice(null);
    }
    const nextStates = wordStatesRef.current.map((prev, idx) => {
      if (idx < seg.start || idx > seg.end) return prev;
      const local = judged.words[idx - seg.start];
      if (!local) return prev;
      if (prev.userConfirmed) return { ...prev, state: "matched" as WordAlignState, userConfirmed: true, evaluated: true };
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
  };

  const stopListening = async (complete: boolean) => {
    stoppedRef.current = true;
    if (recognitionRef.current) {
      await recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setAudioLevel(0);
    if (complete) finishAttempt();
  };

  const startAttempt = async () => {
    setAsrError(null);
    setNotice(null);
    setLastEval(null);
    const init = words.map((w) => ({
      wordId: w.id,
      ref: w.ar,
      state: "uncertain" as WordAlignState,
      userConfirmed: false,
      evaluated: false,
    }));
    wordStatesRef.current = init;
    setWordStates(init);
    segJudgedRef.current = segments.map(() => false);
    segIdxRef.current = 0;
    setActiveSegIdx(0);
    chunkedCompleteRef.current = false;
    stoppedRef.current = false;
    setPhase("listening");

    const hotwords = [...new Set(words.map((w) => w.ar))];
    const totalSegs = segments.length;
    const handle = await startSherpaMicrophoneSession({
      hotwords,
      onTranscript: () => {},
      onError: (msg) => {
        void appendEventLog("asr_error", msg);
        setAsrError(msg);
        setPhase("ready");
      },
      onEnd: () => {
        setAudioLevel(0);
        if (chunkedCompleteRef.current && !stoppedRef.current) finishAttempt();
      },
      chunked: {
        silenceMs: 700,
        onChunk: (text, decodeMs) => {
          const segIdx = segIdxRef.current;
          applySegmentTranscript(segIdx, text, decodeMs);
          if (segIdx + 1 < totalSegs) {
            segIdxRef.current = segIdx + 1;
            setActiveSegIdx(segIdx + 1);
          } else {
            chunkedCompleteRef.current = true;
            void stopListening(true);
          }
        },
        onChunkIssue: (kind, decodeMs) => {
          void appendEventLog(
            kind === "empty" ? "asr_empty_decode" : "asr_decode_error",
            `verse ${spec.verse} seg ${segIdxRef.current}${decodeMs !== undefined ? ` decodeMs ${decodeMs}` : ""}`,
          );
        },
        onLevel: (rms) => setAudioLevel(rms),
      },
    });
    if (handle) {
      recognitionRef.current = handle;
    } else {
      setPhase("ready");
    }
  };

  const handleWordTap = (idx: number) => {
    if (locked || spec.mode === "witness" || phase === "listening") return;
    const w = wordStatesRef.current[idx];
    if (!w || !w.evaluated) return;
    const nextConfirmed = !w.userConfirmed;
    if (nextConfirmed) {
      void recordUserConfirmedRecitationWord(w.ref).catch(() => {});
      void appendEventLog("tap_correct", `verse ${spec.verse} word ${w.ref}`);
    }
    const nextStates = wordStatesRef.current.map((prev, i) =>
      i === idx ? { ...prev, userConfirmed: nextConfirmed } : prev,
    );
    wordStatesRef.current = nextStates;
    setWordStates(nextStates);
    if (phase === "attemptDone") {
      const summary = computeSummary(nextStates);
      const ev = evaluateReciteItem(spec.mode, summary, peeksRef.current);
      bestRef.current = { passed: ev.passed, summary };
      setLastEval({ passed: ev.passed, summary });
    }
  };

  const handlePeek = () => {
    peeksRef.current += 1;
    setPeeks(peeksRef.current);
    setPeekVisible(true);
    window.setTimeout(() => setPeekVisible(false), 2500);
  };

  const buildResult = (status: "passed" | "failed" | "skipped"): ReciteItemResult => {
    const best = bestRef.current;
    const summary = best?.summary ?? computeSummary(wordStatesRef.current);
    const ev = evaluateReciteItem(spec.mode, summary, peeksRef.current);
    return {
      itemId: spec.id,
      verse: spec.verse,
      mode: spec.mode,
      status,
      accuracyRatio: summary.totalWords > 0 ? summary.matched / summary.totalWords : 0,
      confirmedErrors: summary.confirmedErrors,
      peeks: peeksRef.current,
      attemptsUsed: attemptsRef.current,
      ...(spec.mode === "voice" ? { grade: ev.grade, cardKey: spec.cardKey } : {}),
      ...(spec.cardKey && spec.mode !== "voice" ? { cardKey: spec.cardKey } : {}),
    };
  };

  const hiddenMode = spec.mode === "blind" || spec.mode === "voice" || spec.mode === "link";
  const canPeek = spec.mode === "fade" && !peekVisible;
  const canRetry = phase === "attemptDone" && lastEval && !lastEval.passed && attemptsUsed < MAX_RECITE_ATTEMPTS;

  const chipClass = (w: WordUiState, idx: number): string => {
    const inActiveSeg =
      phase === "listening" &&
      segments[activeSegIdx] &&
      idx >= segments[activeSegIdx].start &&
      idx <= segments[activeSegIdx].end;
    let cls = "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200";
    if (w.userConfirmed) cls = "border-teal-400 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-100";
    else if (w.evaluated && spec.mode !== "witness") {
      if (w.state === "matched") cls = "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-100";
      else if (w.state === "substituted") cls = "border-rose-400 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-100";
      else if (w.state === "missed") cls = "border-amber-400 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-100";
    } else if (w.evaluated && w.state === "matched") {
      cls = "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-100";
    }
    return `${cls} ${inActiveSeg ? "ring-2 ring-rose-300 dark:ring-rose-700" : ""}`;
  };

  const displayText = (w: WordUiState, idx: number): string => {
    if (peekVisible) return w.ref;
    if (hiddenMode) return w.evaluated ? w.ref : "••••";
    if (fadeDisplay) {
      const d = fadeDisplay[idx];
      if (d === "full") return w.ref;
      if (d === "first") return `${[...w.ref][0] ?? ""}…`;
      return "••••";
    }
    return w.ref;
  };

  return (
    <div className="rounded-3xl border-2 border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">تلاوت</span>
        <div className="text-sm font-black text-rose-900 dark:text-rose-100">{MODE_TITLES[spec.mode]}</div>
        <div className="text-[11px] text-rose-700/70 dark:text-rose-300/70">آیهٔ {toFa(spec.verse)}</div>
        {spec.mode === "fade" && (
          <div className="text-[11px] text-rose-700/70 dark:text-rose-300/70">نگاه: {toFa(peeks)} از {toFa(2)}</div>
        )}
      </div>

      {spec.mode === "link" && linkWords && (
        <div className="mb-3 rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-rose-200 dark:border-rose-900 p-3">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
            آیهٔ {toFa(spec.linkFromVerse ?? 0)} — از انتهای این آیه، آیهٔ بعد را از حفظ ادامه بده:
          </div>
          <div className="quran-text text-lg leading-9 text-slate-800 dark:text-slate-100">
            {linkWords.map((w) => w.ar).join(" ")}
          </div>
        </div>
      )}
      {spec.mode === "voice" && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          این کارت امروز سررسید است؛ آیه را کامل از حفظ بخوان تا مرورش ثبت شود.
        </p>
      )}
      {spec.mode === "blind" && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          متن آیه پنهان است؛ کامل و تمیز از حفظ بخوان. در این بخش «درست خواندم» و کالیبراسیون شخصی فعال نیست.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3" dir="rtl">
        {wordStates.map((w, idx) => (
          <button
            key={w.wordId + idx}
            type="button"
            disabled={locked || spec.mode === "witness" || phase === "listening" || !w.evaluated}
            onClick={() => handleWordTap(idx)}
            className={`px-2 py-1 rounded-xl border-2 text-base quran-text transition-all ${chipClass(w, idx)} ${
              !locked && spec.mode !== "witness" && phase !== "listening" && w.evaluated ? "cursor-pointer" : "cursor-default"
            }`}
          >
            {displayText(w, idx)}
          </button>
        ))}
      </div>

      {phase === "listening" && (
        <div className="mb-3">
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all"
              style={{ width: `${Math.min(100, Math.round(audioLevel * 300))}%` }}
            />
          </div>
          <div className="text-[11px] text-rose-700 dark:text-rose-300 mt-1">
            در حال شنیدن… تکهٔ {toFa(activeSegIdx + 1)} از {toFa(segments.length)} — با مکث وقفی، تکهٔ بعد فعال می‌شود.
          </div>
        </div>
      )}

      {notice && <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2">{notice}</p>}
      {asrError && <p className="text-[11px] text-rose-700 dark:text-rose-300 mb-2">{asrError}</p>}

      {phase === "attemptDone" && lastEval && (
        <div
          className={`mb-3 rounded-2xl border-2 p-3 flex items-start gap-2 ${
            lastEval.passed
              ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
              : "border-amber-300 bg-amber-50 dark:bg-amber-950/40"
          }`}
        >
          {lastEval.passed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-amber-600 shrink-0" />
          )}
          <div className="text-xs text-slate-700 dark:text-slate-200">
            {lastEval.passed
              ? "تلاوت قبول شد."
              : spec.mode === "blind"
                ? "گیت قبول نشد: برای قبولی، خطای قطعی باید صفر و دقت دست‌کم ۹۰٪ باشد."
                : "این تلاش کامل نشد."}{" "}
            شنیده‌شده: {toFa(lastEval.summary.matched)} از {toFa(lastEval.summary.totalWords)} کلمه
            {lastEval.summary.confirmedErrors > 0 &&
              ` — خطای قطعی: ${toFa(lastEval.summary.confirmedErrors)}`}
            {!locked && spec.mode !== "witness" && !lastEval.passed && (
              <span className="block mt-1 text-slate-500 dark:text-slate-400">
                اگر کلمه‌ای را درست خوانده بودی، رویش بزن تا «درست خواندم» ثبت شود.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {phase === "ready" && (
          <button
            type="button"
            onClick={() => void startAttempt()}
            className="px-4 py-2 rounded-2xl bg-rose-600 text-white text-xs font-black flex items-center gap-2 active:translate-y-[1px]"
          >
            <Mic className="w-4 h-4" /> شروع تلاوت
          </button>
        )}
        {phase === "listening" && (
          <button
            type="button"
            onClick={() => void stopListening(true)}
            className="px-4 py-2 rounded-2xl bg-slate-700 text-white text-xs font-black flex items-center gap-2 active:translate-y-[1px]"
          >
            <Square className="w-4 h-4" /> پایان تلاوت
          </button>
        )}
        {canPeek && phase !== "attemptDone" && (
          <button
            type="button"
            onClick={handlePeek}
            className="px-3 py-2 rounded-2xl bg-white dark:bg-slate-800 border-2 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-black flex items-center gap-1.5"
          >
            <Eye className="w-4 h-4" /> نمایش متن ({toFa(peeks)})
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            onClick={() => void startAttempt()}
            className="px-4 py-2 rounded-2xl bg-rose-600 text-white text-xs font-black flex items-center gap-2 active:translate-y-[1px]"
          >
            <RotateCcw className="w-4 h-4" /> تلاش دوباره ({toFa(attemptsUsed)} از {toFa(MAX_RECITE_ATTEMPTS)})
          </button>
        )}
        {phase === "attemptDone" && (
          <button
            type="button"
            onClick={() => onDone(buildResult(lastEval?.passed ? "passed" : "failed"))}
            className="px-4 py-2 rounded-2xl bg-emerald-600 text-white text-xs font-black flex items-center gap-2 active:translate-y-[1px]"
          >
            <ArrowLeft className="w-4 h-4" /> ادامه
          </button>
        )}
        {spec.optional && phase !== "attemptDone" && (
          <button
            type="button"
            onClick={() => onDone(buildResult("skipped"))}
            className="px-3 py-2 rounded-2xl text-slate-500 dark:text-slate-400 text-xs font-bold flex items-center gap-1.5"
          >
            <SkipForward className="w-4 h-4" /> رد کردن
          </button>
        )}
      </div>
    </div>
  );
}

/** اجراکنندهٔ بلوک تلاوت جلسه: آیتم‌ها را یکی‌یکی با نمای تلاوت سرو می‌کند */
export function ReciteBlockRunner() {
  const reciteSession = useLearningStore((s) => s.reciteSession);
  const submitReciteResult = useLearningStore((s) => s.submitReciteResult);
  if (!reciteSession || !reciteSession.active) return null;
  const item = reciteSession.items[reciteSession.idx];
  if (!item) return null;
  const locked = reciteSession.purpose === "gate" || reciteSession.purpose === "exam";
  return (
    <div>
      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">
        بخش تلاوت — آیتم {toFa(reciteSession.idx + 1)} از {toFa(reciteSession.items.length)}
      </div>
      <ReciteItemView
        key={item.spec.id}
        item={item}
        locked={locked}
        onDone={(result) => void submitReciteResult(result)}
      />
    </div>
  );
}
