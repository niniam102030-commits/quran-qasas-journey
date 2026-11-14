// src/pages/LearningSessionPage.tsx
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ArrowLeft, RotateCcw, Award, Sparkles, BookOpen } from "lucide-react";
import QuestionRenderer, { type RenderableQuestion } from "../components/learning/QuestionRenderer";
import { useLearningStore } from "../store/useLearningStore";

interface Props {
  unitId: string;
  stage: number;
  onExit: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

export default function LearningSessionPage({ unitId, stage, onExit }: Props) {
  const s = useLearningStore();
  const q = s.current() as RenderableQuestion | null;
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    if (stage === 0) void s.startReview();
    else void s.startStage(unitId, stage);
  }, [unitId, stage]);

  // Handle Enter key for advancing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && s.lastResult !== null) {
        void s.next();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [s.lastResult, s]);

  if (s.status === "loading" || s.status === "idle") {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fcf9f2] dark:bg-[#121824] text-slate-700 dark:text-slate-200">
        <BookOpen className="w-10 h-10 animate-bounce text-amber-600 mb-3" />
        <p className="font-bold text-sm">در حال چیدن صف هوشمند جلسه...</p>
      </div>
    );
  }

  // Finished Session Screen
  if (s.status === "finished") {
    const m = s.summary;
    const isPassed = !!m?.passed;
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fcf9f2] dark:bg-[#121824] text-slate-800 dark:text-slate-100 select-none">
        <div className="w-full max-w-md bg-white dark:bg-[#1a2332] p-6 sm:p-8 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-3xl flex items-center justify-center shadow-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white">
            {isPassed ? <Award className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {stage === 0
                ? "جلسه مرور روزانه به پایان رسید"
                : isPassed
                ? `مرحله ${toFarsiNum(stage)} با موفقیت گذرانده شد 🎉`
                : `نیاز به تمرین بیشتر در مرحله ${toFarsiNum(stage)}`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isPassed
                ? "تسلط بر این مقطع ارتقا یافت و کارت‌های حافظه به‌روزرسانی شدند."
                : "برای تثبیت کامل حافظه، تکرار دوباره این مرحله توصیه می‌شود."}
            </p>
          </div>

          {/* Stats Box */}
          {m && (
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs">
              <div className="space-y-0.5">
                <span className="text-slate-400">پاسخ‌های درست:</span>
                <div className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                  {toFarsiNum(m.correct)} از {toFarsiNum(m.total)} ({toFarsiNum(Math.round(m.ratio * 100))}٪)
                </div>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400">بدهی مرور باقی‌مانده:</span>
                <div className="font-extrabold text-sm text-amber-600 dark:text-amber-400">
                  {toFarsiNum(m.debt)} کارت
                </div>
              </div>
            </div>
          )}

          {m?.unlockedNext && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>واحد یادگیری بعدی برای شما باز شد!</span>
            </div>
          )}

          {m && !m.passed && m.debt >= 40 && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              بدهی مرور کارت‌های شما به {toFarsiNum(m.debt)} رسیده است. واحد بعدی تا کاهش این بدهی بسته می‌ماند.
            </div>
          )}

          <button
            onClick={onExit}
            className="w-full py-3.5 px-6 rounded-2xl font-bold text-white bg-[#b37e3d] hover:bg-[#9d6b2f] shadow-lg shadow-amber-900/10 active:scale-[0.98] transition-all"
          >
            ادامه و بازگشت به نقشه
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;

  const locked = s.lastResult !== null;
  const progressPercent = Math.min(100, Math.round(((s.index + 1) / s.queue.length) * 100));

  // Determine correct answer text for feedback drawer
  const getFormattedCorrectAnswer = (): string => {
    if (q.shape === "choice") {
      const opt = q.options?.find((o) => o.id === q.answer);
      return opt?.ar || opt?.fa || (opt?.num !== undefined ? String(opt.num) : "");
    }
    if (q.shape === "order" && Array.isArray(q.answer)) {
      const byId = new Map((q.bank || []).map((b) => [b.id, b]));
      return (q.answer as string[])
        .map((id) => byId.get(id)?.ar || byId.get(id)?.fa || "")
        .filter(Boolean)
        .join(" ◄ ");
    }
    if (q.shape === "cloze" && typeof q.answer === "object" && q.answer !== null) {
      const byId = new Map((q.bank || []).map((b) => [b.id, b]));
      return Object.entries(q.answer as Record<string, string>)
        .map(([k, id]) => `[${toFarsiNum(k)}: ${byId.get(id)?.ar || byId.get(id)?.fa || ""}]`)
        .join(" ");
    }
    return "";
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[#fcf9f2] dark:bg-[#121824] text-slate-800 dark:text-slate-100 select-none pb-32">
      {/* Top Navigation & Progress Bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-[#f7f2e4]/95 dark:bg-[#1a2332]/95 backdrop-blur border-b border-[#e6dbc5] dark:border-slate-800">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform text-slate-500"
          title="خروج از جلسه"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Linear Progress Bar */}
        <div className="flex-1 h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
          {toFarsiNum(s.index + 1)} / {toFarsiNum(s.queue.length)}
        </div>
      </header>

      {/* Main Question Body */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col justify-center">
        <QuestionRenderer
          key={q.id + ":" + s.index}
          q={q}
          locked={locked}
          onSubmit={(r, m) => void s.submit(r, m)}
        />
      </main>

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a2332] p-5 sm:p-6 rounded-3xl max-w-xs w-full shadow-2xl text-center space-y-4">
            <h3 className="font-bold text-sm sm:text-base">خروج از جلسه یادگیری؟</h3>
            <p className="text-xs text-slate-500">
              پیشرفت این جلسه تا این نقطه ذخیره شده و بعداً می‌توانید ادامه دهید.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onExit}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 text-white font-bold text-xs"
              >
                خروج
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                ادامه جلسه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Feedback Drawer (Duolingo Style) */}
      {s.lastResult && (
        <div
          className={`fixed bottom-0 inset-x-0 z-30 p-4 sm:p-5 border-t-2 shadow-2xl transition-all animate-in slide-in-from-bottom duration-200 ${
            s.lastResult.correct
              ? "bg-[#edf8f1] dark:bg-[#10271d] border-emerald-400 text-emerald-950 dark:text-emerald-100"
              : "bg-[#fdf2f2] dark:bg-[#2b1418] border-rose-400 text-rose-950 dark:text-rose-100"
          }`}
        >
          <div className="max-w-xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                {s.lastResult.correct ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span className="font-extrabold text-base sm:text-lg">
                  {s.lastResult.correct ? "آفرین! کاملاً درست است" : "پاسخ صحیح نبود"}
                </span>
              </div>

              {!s.lastResult.correct && getFormattedCorrectAnswer() && (
                <div className="text-xs sm:text-sm font-bold text-rose-900 dark:text-rose-200 bg-rose-100/70 dark:bg-rose-900/40 p-2.5 rounded-xl">
                  <span>پاسخ درست: </span>
                  <span className="font-normal">{getFormattedCorrectAnswer()}</span>
                </div>
              )}

              {q.explanationFa && (
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pt-0.5">
                  {q.explanationFa}
                </p>
              )}
            </div>

            <button
              onClick={() => void s.next()}
              className={`w-full sm:w-auto min-w-[7rem] py-3.5 px-6 rounded-2xl font-bold text-white shadow-md active:scale-95 transition-all text-sm shrink-0 ${
                s.lastResult.correct
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20"
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-900/20"
              }`}
            >
              ادامه (Enter)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
