// src/components/audio/SelfReciteRecorder.tsx
// ضبط صدای خود به‌صورت ۱۰۰٪ آفلاین (MediaRecorder) + تصحیح کلمه‌به‌کلمه تلاوت و آشکارسازی خودکار در مصحف
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Trash2, AlertCircle, Sparkles, CheckCircle2, Info } from "lucide-react";
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

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${toFarsi(String(m).padStart(2, "0"))}:${toFarsi(String(s).padStart(2, "0"))}`;
}

export default function SelfReciteRecorder({ verses, onWordsRecitedCorrectly, onFinalPrecision }: Props = {}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // تصحیح کلمه‌به‌کلمه تلاوت (اختیاری)
  const [showVerifier, setShowVerifier] = useState(false);
  const [targetVerseNum, setTargetVerseNum] = useState<number>(verses?.[0]?.n ?? 1);
  const [listeningAsr, setListeningAsr] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [checkResult, setCheckResult] = useState<RecitationCheckResult | null>(null);
  const [asrError, setAsrError] = useState<string | null>(null);

  const capability = getDeviceAsrCapability();
  const recognitionRef = useRef<LiveRecognitionHandle | null>(null);
  const latestCheckRef = useRef<RecitationCheckResult | null>(null);
  const reportedSessionRef = useRef<boolean>(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

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
    if (verses && verses.length > 0 && !verses.some((v) => v.n === targetVerseNum)) {
      setTargetVerseNum(verses[0].n);
    }
  }, [verses, targetVerseNum]);

  useEffect(() => {
    return () => {
      cleanupRecording();
      cleanupPlayback();
      recognitionRef.current?.stop();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedVerse = verses?.find((v) => v.n === targetVerseNum) ?? verses?.[0];

  const flushFinalPrecision = (verseN: number) => {
    if (reportedSessionRef.current || !latestCheckRef.current) return;
    reportedSessionRef.current = true;
    onFinalPrecision?.({
      at: Date.now(),
      verse: verseN,
      accuracy: latestCheckRef.current.accuracyPercent,
    });
  };

  const handleToggleAsr = () => {
    if (listeningAsr) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListeningAsr(false);
      if (selectedVerse) flushFinalPrecision(selectedVerse.n);
      return;
    }
    if (!selectedVerse) return;
    setAsrError(null);
    setSpokenText("");
    setCheckResult(null);
    latestCheckRef.current = null;
    reportedSessionRef.current = false;

    const verseNumAtStart = selectedVerse.n;
    const handle = startLiveArabicRecognition({
      onTranscript: (transcript) => {
        setSpokenText(transcript);
        const res = verifyVerseRecitation(selectedVerse.words, transcript);
        latestCheckRef.current = res;
        setCheckResult(res);
        if (res.matchedWordIds.length > 0) {
          onWordsRecitedCorrectly?.(res.matchedWordIds);
        }
      },
      onError: (msg) => {
        setAsrError(msg);
        setListeningAsr(false);
      },
      onEnd: () => {
        setListeningAsr(false);
        flushFinalPrecision(verseNumAtStart);
      },
    });

    if (handle) {
      recognitionRef.current = handle;
      setListeningAsr(true);
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
              <span>تصحیح کلمه‌به‌کلمه تلاوت</span>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                آیه هدف:
              </label>
              <select
                value={selectedVerse.n}
                onChange={(e) => {
                  setTargetVerseNum(Number(e.target.value));
                  setCheckResult(null);
                  setSpokenText("");
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-bold"
              >
                {verses?.map((v) => (
                  <option key={v.n} value={v.n}>
                    آیه {toFarsi(v.n)} ({toFarsi(v.words.length)} کلمه)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleToggleAsr}
              disabled={!capability.hasWebSpeech && !listeningAsr}
              className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                listeningAsr
                  ? "bg-rose-600 text-white animate-pulse"
                  : "bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white"
              }`}
            >
              {listeningAsr ? <Square className="w-3.5 h-3.5 fill-white" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{listeningAsr ? "توقف ارزیابی" : "شروع تلاوت و بررسی زنده"}</span>
            </button>
          </div>

          {spokenText && (
            <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-500">متن شنیده‌شده: </span>
              <span dir="rtl">{spokenText}</span>
            </div>
          )}

          {checkResult && (
            <div className="space-y-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  دقت کلمه‌ای: {toFarsi(checkResult.accuracyPercent)}٪ ({toFarsi(checkResult.correctCount)} از {toFarsi(checkResult.totalCount)} کلمه)
                </span>
                {checkResult.extraWords.length > 0 && (
                  <span className="text-amber-600">
                    کلمات اضافه: {toFarsi(checkResult.extraWords.length)}
                  </span>
                )}
              </div>
              <div
                className="flex flex-wrap gap-1.5 leading-loose"
                style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif", fontSize: "1.15rem" }}
              >
                {checkResult.wordResults.map((w) => (
                  <span
                    key={w.wordId}
                    title={
                      w.status === "correct"
                        ? "درست خوانده شد"
                        : w.status === "missing"
                        ? "جا افتاده"
                        : `جایگزین‌شده با: ${w.spoken ?? ""}`
                    }
                    className={`px-1.5 py-0.5 rounded-lg border ${
                      w.status === "correct"
                        ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                        : w.status === "missing"
                        ? "bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700 line-through"
                        : "bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                    }`}
                  >
                    {w.expectedAr}
                  </span>
                ))}
              </div>
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
              {capability.hasWebSpeech
                ? "تشخیص گفتار زنده با موتور مرورگر (Web Speech API) انجام می‌شود و معمولاً نیازمند اتصال اینترنت است. ضبط صدای بالا کاملاً آفلاین است."
                : "موتور تشخیص گفتار مرورگر (Web Speech API) در این محیط (مانند WebView اندروید) در دسترس نیست؛ برای تمرین و تسمیع آفلاین از دکمه «ضبط صدای خود (آفلاین)» استفاده کنید."}
            </span>
          </div>

          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            توجه: این ابزار برای کمک به تثبیت حفظ و کشف حذف/اضافه/جابه‌جایی کلمات است و جایگزین ارزیابی دقیق احکام تجوید و مخارج حروف توسط استاد نیست.
          </p>
        </div>
      )}
    </div>
  );
}
