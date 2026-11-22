// src/pages/LearningSessionPage.tsx
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, Award, Sparkles, BookOpen } from "lucide-react";
import QuestionRenderer, { type RenderableQuestion } from "../components/learning/QuestionRenderer";
import VerseAudioPlayer from "../components/audio/VerseAudioPlayer";
import { useLearningStore } from "../store/useLearningStore";
import { useHapticsAndSfx } from "../hooks/useHapticsAndSfx";
import { ldb } from "../db/learningDb";

interface Props {
  unitId: string;
  stage: number;
  remedialTag?: string | null;
  onExit: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

export default function LearningSessionPage({ unitId, stage, remedialTag = null, onExit }: Props) {
  const s = useLearningStore();
  const startReview = useLearningStore((state) => state.startReview);
  const startStage = useLearningStore((state) => state.startStage);
  const startRemedial = useLearningStore((state) => state.startRemedial);
  const { playSfx } = useHapticsAndSfx();
  const q = s.current() as RenderableQuestion | null;
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [correctAnswerText, setCorrectAnswerText] = useState("");

  useEffect(() => {
    const state = useLearningStore.getState();
    if (stage === -1) {
      if (state.status === "idle" || state.sessionType !== "REMEDIAL" || state.remedialTag !== remedialTag || state.status === "finished") {
        void startRemedial(remedialTag);
      }
    } else if (stage === 0) {
      if (state.status === "idle" || state.sessionType !== "REVIEW" || state.status === "finished") void startReview();
    } else if (state.status === "idle" || state.unitId !== unitId || state.stage !== stage || state.status === "finished") {
      void startStage(unitId, stage);
    }
  }, [unitId, stage, remedialTag, startReview, startStage, startRemedial]);

  // جشن پایان مرحله موفق با افکت صوتی و Confetti
  useEffect(() => {
    if (s.status === "finished" && s.summary && s.summary.total > 0 && s.summary.passed) {
      playSfx("stage-fanfare");
      try {
        confetti({
          particleCount: stage === 8 || s.summary.unlockedNext ? 90 : 45,
          spread: 70,
          origin: { y: 0.65 },
        });
      } catch {
        // در محیط تست بدون canvas نادیده گرفته می‌شود
      }
    }
  }, [s.status, s.summary, stage, playSfx]);

  // Enter key advances only when feedback drawer is visible (locked) and ignores key repeat.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      const state = useLearningStore.getState();
      if (state.status === "running" && state.lastResult !== null) {
        e.preventDefault();
        void state.next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    const resolveItem = async (
      item: { ar?: string; fa?: string; num?: number; n?: number; words?: string[]; wordsAr?: string[]; wordRange?: { verse: number; from: number; to: number } } | undefined,
    ): Promise<string> => {
      if (!item) return "";
      if (item.ar?.trim()) return item.ar.trim();
      if (item.fa?.trim()) return item.fa.trim();
      const numVal = item.num ?? item.n;
      if (numVal !== undefined) return toFarsiNum(numVal);
      if (item.wordsAr?.length) return item.wordsAr.join(" ");
      if (item.wordRange) {
        const verse = await ldb.baseVerses.get(item.wordRange.verse);
        const words = (verse?.words as { i: number; ar: string }[] | undefined) ?? [];
        return words
          .filter((word) => word.i >= item.wordRange!.from && word.i <= item.wordRange!.to)
          .map((word) => word.ar)
          .join(" ");
      }
      if (item.words?.length && item.words.every((id) => /^w\d+_\d+_\d+$/.test(id))) {
        const parsed = item.words.map((id) => {
          const match = /^w\d+_(\d+)_(\d+)$/.exec(id)!;
          return { verse: Number(match[1]), index: Number(match[2]) };
        });
        const verses = await Promise.all([...new Set(parsed.map((p) => p.verse))].map((n) => ldb.baseVerses.get(n)));
        const byVerse = new Map(
          verses
            .filter((verse): verse is NonNullable<typeof verse> => !!verse)
            .map((verse) => [verse.n, (verse.words as { i: number; ar: string }[] | undefined) ?? []]),
        );
        return parsed
          .map((p) => byVerse.get(p.verse)?.find((word) => word.i === p.index)?.ar ?? "")
          .filter(Boolean)
          .join(" ");
      }
      return item.words?.join(" ") || "";
    };

    const resolve = async () => {
      if (!q || !s.lastResult || s.lastResult.correct) return "";
      if (q.shape === "choice") {
        const opt = q.options?.find((item) => item.id === q.answer);
        return resolveItem(opt);
      }
      if (q.shape === "order" && Array.isArray(q.answer)) {
        const byId = new Map((q.bank ?? []).map((b) => [b.id, b]));
        const parts = await Promise.all((q.answer as string[]).map((id) => resolveItem(byId.get(id))));
        return parts.filter(Boolean).join(" ◄ ");
      }
      if (q.shape === "cloze" && typeof q.answer === "object" && q.answer !== null) {
        const byId = new Map((q.bank ?? []).map((b) => [b.id, b]));
        const entries = Object.entries(q.answer as Record<string, string>);
        const parts = await Promise.all(
          entries.map(async ([k, id]) => `[${toFarsiNum(k)}: ${await resolveItem(byId.get(id))}]`),
        );
        return parts.join(" ");
      }
      if (q.shape === "match" && Array.isArray(q.pairs)) {
        const leftById = new Map((q.left ?? []).map((l) => [l.id, l]));
        const rightById = new Map((q.right ?? []).map((r) => [r.id, r]));
        const parts = await Promise.all(
          q.pairs.map(async ([lId, rId]) => `${await resolveItem(leftById.get(lId))} ← ${await resolveItem(rightById.get(rId))}`),
        );
        return parts.filter(Boolean).join("  |  ");
      }
      return "";
    };
    void resolve().then((text) => { if (active) setCorrectAnswerText(text); });
    return () => { active = false; };
  }, [q, s.lastResult]);

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
    const isEmpty = m?.total === 0;
    const isPassed = !!m?.passed;
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fcf9f2] dark:bg-[#121824] text-slate-800 dark:text-slate-100 select-none">
        <div className="w-full max-w-md bg-white dark:bg-[#1a2332] p-6 sm:p-8 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-3xl flex items-center justify-center shadow-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white">
            {isPassed ? <Award className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {isEmpty
                ? stage === -1
                  ? "خطایی برای تمرین ترمیمی ثبت نشده است"
                  : stage === 0
                  ? "فعلاً کارتی برای مرور سررسید نشده است"
                  : "برای این مرحله هنوز سؤالی بارگذاری نشده است"
                : stage === -1
                ? "تمرین ترمیمی هوشمند به پایان رسید"
                : stage === 0
                ? "جلسه مرور روزانه به پایان رسید"
                : isPassed
                ? `مرحله ${toFarsiNum(stage)} با موفقیت گذرانده شد 🎉`
                : `نیاز به تمرین بیشتر در مرحله ${toFarsiNum(stage)}`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isEmpty
                ? "می‌توانید بعداً دوباره بررسی کنید یا به نقشه برگردید."
                : isPassed
                ? "تسلط بر این مقطع ارتقا یافت و کارت‌های حافظه به‌روزرسانی شدند."
                : "برای تثبیت کامل حافظه، تکرار دوباره این مرحله توصیه می‌شود."}
            </p>
          </div>

          {/* Stats Box */}
          {m && !isEmpty && (
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
              {Boolean(m.xpEarned || m.gemsEarned) && (
                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-4 text-xs font-bold">
                  {!!m.xpEarned && <span className="text-amber-600 dark:text-amber-400">+{toFarsiNum(m.xpEarned)} نور ✨</span>}
                  {!!m.gemsEarned && <span className="text-sky-600 dark:text-sky-400">+{toFarsiNum(m.gemsEarned)} عقیق 💎</span>}
                </div>
              )}
            </div>
          )}

          {m?.unlockedNext && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>واحد یادگیری بعدی برای شما باز شد!</span>
            </div>
          )}

          {m && !isEmpty && !m.passed && m.debt >= 40 && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              بدهی مرور کارت‌های شما به {toFarsiNum(m.debt)} رسیده است. واحد بعدی تا کاهش این بدهی بسته می‌ماند.
            </div>
          )}

          <div className="space-y-2.5">
            {!isPassed && !isEmpty && stage > 0 && (
              <button
                onClick={() => void startStage(unitId, stage)}
                className="w-full py-3.5 px-6 rounded-2xl font-bold text-amber-900 dark:text-amber-200 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>تلاش مجدد این مرحله</span>
              </button>
            )}
            <button
              onClick={onExit}
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-white bg-[#b37e3d] hover:bg-[#9d6b2f] shadow-lg shadow-amber-900/10 active:scale-[0.98] transition-all"
            >
              ادامه و بازگشت به نقشه
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return null;

  const locked = s.lastResult !== null;
  const progressPercent = Math.min(100, Math.round(((s.index + 1) / s.queue.length) * 100));

  // Determine correct answer text for feedback drawer
  const getFormattedCorrectAnswer = (): string => {
    if (correctAnswerText) return correctAnswerText;
    if (q.shape === "choice") {
      const opt = q.options?.find((o) => o.id === q.answer);
      const numVal = opt?.num ?? opt?.n;
      return opt?.ar?.trim() || opt?.fa?.trim() || (numVal !== undefined ? toFarsiNum(numVal) : "") || opt?.wordsAr?.join(" ") || opt?.words?.join(" ") || (opt?.wordRange ? `آیه ${toFarsiNum(opt.wordRange.verse)}، واژه‌های ${toFarsiNum(opt.wordRange.from)} تا ${toFarsiNum(opt.wordRange.to)}` : "");
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
          <ArrowRight className="w-5 h-5" />
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
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col justify-center space-y-3">
        {q.stem?.verse && (locked || q.shape !== "cloze" || q.type === "CLOZE_FA") && (
          <div className="w-full max-w-xl mx-auto px-3">
            <VerseAudioPlayer verses={[q.stem.verse]} compact />
          </div>
        )}
        <QuestionRenderer
          key={q.id + ":" + s.index}
          q={q}
          locked={locked}
          onSubmit={(r, m) => {
            void s.submit(r, m).then((res) => {
              if (!res) return;
              playSfx(res.correct ? "correct-chime" : "error-thud");
            });
          }}
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
              disabled={s.status !== "running" || s.lastResult === null}
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
