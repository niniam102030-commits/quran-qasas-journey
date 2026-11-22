// src/pages/AudioQuizPage.tsx
// آزمون صوتی حفظ (آفلاین با تلاوت منشاوی): «آیه بعدی چیست؟» و «شماره این آیه چیست؟»
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { ArrowRight, Headphones, CheckCircle2, XCircle, Eye, Award, RotateCcw } from "lucide-react";
import { ldb } from "../db/learningDb";
import { newCard, review } from "../learning/cardScheduler";
import { recordLearningReward } from "../services/profileService";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { useHapticsAndSfx } from "../hooks/useHapticsAndSfx";
import { shuffle, rng } from "../learning/sessionPlanner";
import VerseAudioPlayer from "../components/audio/VerseAudioPlayer";

interface VerseEntry {
  n: number;
  arText: string;
  fa?: string;
}

type QuizMode = "next_ayah" | "verse_number";

interface AudioQuestion {
  verse: VerseEntry;
  answerVerse: VerseEntry;
  options: VerseEntry[];
}

interface Props {
  onExit: () => void;
}

const QUIZ_LENGTH = 10;
const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

function buildQuestions(verses: VerseEntry[], mode: QuizMode): AudioQuestion[] {
  const rand = rng(Date.now() & 0xffff);
  const byNum = new Map(verses.map((v) => [v.n, v]));
  const eligible = mode === "next_ayah" ? verses.filter((v) => byNum.has(v.n + 1)) : verses;
  const picked = shuffle(eligible, rand).slice(0, Math.min(QUIZ_LENGTH, eligible.length));

  return picked.map((v) => {
    const answerVerse = mode === "next_ayah" ? byNum.get(v.n + 1)! : v;
    // گزینه‌های انحرافی نزدیک به آیه برای چالش واقعی
    const nearby = verses
      .filter((cand) => cand.n !== answerVerse.n && cand.n !== v.n && Math.abs(cand.n - answerVerse.n) <= 8);
    const pool = nearby.length >= 3 ? nearby : verses.filter((cand) => cand.n !== answerVerse.n && cand.n !== v.n);
    const distractors = shuffle(pool, rand).slice(0, 3);
    const options = shuffle([answerVerse, ...distractors], rand);
    return { verse: v, answerVerse, options };
  });
}

export default function AudioQuizPage({ onExit }: Props) {
  const [mode, setMode] = useState<QuizMode>("next_ayah");
  const [verses, setVerses] = useState<VerseEntry[]>([]);
  const [questions, setQuestions] = useState<AudioQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showText, setShowText] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  const arabicFontSize = usePreferencesStore((s) => s.arabicFontSize);
  const { playSfx } = useHapticsAndSfx();

  const startNewQuiz = (allVerses: VerseEntry[], targetMode: QuizMode) => {
    setQuestions(buildQuestions(allVerses, targetMode));
    setIndex(0);
    setSelected(null);
    setShowText(false);
    setCorrectCount(0);
    setFinished(false);
  };

  useEffect(() => {
    let active = true;
    ldb.baseVerses.orderBy("n").toArray().then((rows) => {
      if (!active) return;
      const list = rows as unknown as VerseEntry[];
      setVerses(list);
      startNewQuiz(list, "next_ayah");
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const current = questions[index] ?? null;

  const handleSelectOption = async (chosenNum: number) => {
    if (!current || selected !== null) return;
    setSelected(chosenNum);
    const isCorrect = chosenNum === current.answerVerse.n;
    playSfx(isCorrect ? "correct-chime" : "error-thud");
    if (isCorrect) setCorrectCount((c) => c + 1);

    // به‌روزرسانی مستقیم کارت FSRS مهارت تسلسل (sq) یا شماره آیه (vn)
    const cardKey = `${mode === "next_ayah" ? "sq" : "vn"}:${current.verse.n}`;
    try {
      const existing = await ldb.cards.get(cardKey);
      const updated = review(existing ?? newCard(cardKey), isCorrect ? "good" : "again");
      await ldb.cards.put(updated);
    } catch {
      // ignore storage error
    }
  };

  const handleNext = async () => {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setSelected(null);
      setShowText(false);
      return;
    }
    setFinished(true);
    const passed = correctCount / Math.max(1, questions.length) >= 0.7;
    if (passed) {
      playSfx("stage-fanfare");
      try {
        confetti({ particleCount: 60, spread: 65, origin: { y: 0.65 } });
      } catch {
        // ignore
      }
    }
    try {
      await recordLearningReward({
        xpDelta: correctCount * 10 + (passed ? 15 : 0),
        gemsDelta: passed ? 5 : 0,
        markDailyActivity: true,
      });
    } catch {
      // ignore
    }
  };

  const handleModeSwitch = (nextMode: QuizMode) => {
    setMode(nextMode);
    if (verses.length) startNewQuiz(verses, nextMode);
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-[#fcf9f2] dark:bg-[#121824] text-slate-500">
        در حال آماده‌سازی آزمون صوتی...
      </div>
    );
  }

  if (finished) {
    const pct = Math.round((correctCount / Math.max(1, questions.length)) * 100);
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fcf9f2] dark:bg-[#121824] text-slate-800 dark:text-slate-100">
        <div className="w-full max-w-md bg-white dark:bg-[#1a2332] p-6 sm:p-8 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shadow-lg">
            <Award className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black">آزمون صوتی به پایان رسید!</h2>
            <p className="text-sm text-slate-500">
              پاسخ درست: {toFarsi(correctCount)} از {toFarsi(questions.length)} ({toFarsi(pct)}٪)
            </p>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => startNewQuiz(verses, mode)}
              className="w-full py-3 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>آزمون صوتی جدید</span>
            </button>
            <button
              type="button"
              onClick={onExit}
              className="w-full py-3 rounded-2xl bg-[#b37e3d] hover:bg-[#9d6b2f] text-white font-bold text-sm"
            >
              بازگشت به برنامه
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const locked = selected !== null;
  const isCorrect = selected === current.answerVerse.n;

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[#fcf9f2] dark:bg-[#121824] text-slate-800 dark:text-slate-100 pb-28">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-3 bg-[#f7f2e4]/95 dark:bg-[#1a2332]/95 backdrop-blur border-b border-[#e6dbc5] dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300"
            title="بازگشت"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 font-extrabold text-sm text-[#8a5b29] dark:text-amber-400">
            <Headphones className="w-4 h-4" />
            <span>آزمون صوتی حفظ</span>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl text-[11px] font-bold">
          <button
            type="button"
            onClick={() => handleModeSwitch("next_ayah")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              mode === "next_ayah" ? "bg-white dark:bg-slate-700 text-amber-800 dark:text-amber-300 shadow-sm" : "text-slate-500"
            }`}
          >
            آیه بعدی چیست؟
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("verse_number")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              mode === "verse_number" ? "bg-white dark:bg-slate-700 text-amber-800 dark:text-amber-300 shadow-sm" : "text-slate-500"
            }`}
          >
            شماره آیه
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto p-4 space-y-5 flex flex-col justify-center">
        <div className="flex items-center justify-between text-xs font-bold text-slate-500">
          <span>سوال {toFarsi(index + 1)} از {toFarsi(questions.length)}</span>
          <span>امتیاز فعلی: {toFarsi(correctCount)}</span>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100">
            {mode === "next_ayah"
              ? "به تلاوت استاد منشاوی گوش دهید؛ کدام آیه دقیقاً بعد از این آیه می‌آید؟"
              : "به تلاوت استاد منشاوی گوش دهید؛ این تلاوت مربوط به کدام شماره آیه در سوره قصص است؟"}
          </h2>

          <VerseAudioPlayer key={`${current.verse.n}:${index}`} verses={[current.verse.n]} compact />

          {!showText && !locked ? (
            <button
              type="button"
              onClick={() => setShowText(true)}
              className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 hover:underline"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>نمایش متن آیه پخش‌شده (کمکی)</span>
            </button>
          ) : (
            <div
              style={{
                fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
                fontSize: `${Math.min(28, arabicFontSize)}px`,
                lineHeight: 2.3,
              }}
              className="p-3.5 rounded-2xl bg-[#fcf9f2] dark:bg-slate-900 border border-[#e8dfcd] dark:border-slate-800 text-center"
            >
              {current.verse.arText}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {current.options.map((opt) => {
            const isChosen = selected === opt.n;
            const isRight = opt.n === current.answerVerse.n;
            return (
              <button
                key={opt.n}
                type="button"
                disabled={locked}
                onClick={() => void handleSelectOption(opt.n)}
                className={`w-full p-4 rounded-2xl border-2 text-right transition-all ${
                  locked && isRight
                    ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500"
                    : locked && isChosen && !isRight
                    ? "bg-rose-50 dark:bg-rose-950/50 border-rose-500"
                    : "bg-white dark:bg-[#1e2738] border-slate-200 dark:border-slate-700 hover:border-amber-400"
                }`}
              >
                {mode === "next_ayah" ? (
                  <span
                    style={{
                      fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
                      fontSize: `${Math.min(26, arabicFontSize)}px`,
                      lineHeight: 2.2,
                    }}
                  >
                    {opt.arText}
                  </span>
                ) : (
                  <span className="font-extrabold text-sm">آیه {toFarsi(opt.n)} سوره قصص</span>
                )}
              </button>
            );
          })}
        </div>
      </main>

      {locked && (
        <div
          className={`fixed bottom-0 inset-x-0 z-30 p-4 border-t-2 shadow-2xl ${
            isCorrect
              ? "bg-[#edf8f1] dark:bg-[#10271d] border-emerald-400 text-emerald-950 dark:text-emerald-100"
              : "bg-[#fdf2f2] dark:bg-[#2b1418] border-rose-400 text-rose-950 dark:text-rose-100"
          }`}
        >
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base">
              {isCorrect ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
              )}
              <span>
                {isCorrect
                  ? "آفرین! کاملاً درست بود"
                  : `پاسخ صحیح: آیه ${toFarsi(current.answerVerse.n)}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleNext()}
              className={`py-2.5 px-6 rounded-2xl font-bold text-white text-sm ${
                isCorrect ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              ادامه
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
