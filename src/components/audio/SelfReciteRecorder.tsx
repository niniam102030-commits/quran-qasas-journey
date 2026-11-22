// src/components/audio/SelfReciteRecorder.tsx
// ضبط صدای خود به‌صورت ۱۰۰٪ آفلاین (MediaRecorder) برای تسمیع و مقایسه با تلاوت استاد منشاوی
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Trash2, AlertCircle } from "lucide-react";

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${toFarsi(String(m).padStart(2, "0"))}:${toFarsi(String(s).padStart(2, "0"))}`;
}

export default function SelfReciteRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return () => {
      cleanupRecording();
      cleanupPlayback();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="flex items-center gap-2">
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
    </div>
  );
}
