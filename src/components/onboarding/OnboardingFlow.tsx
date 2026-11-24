// src/components/onboarding/OnboardingFlow.tsx
// جریان آنبوردینگ تعیین سطح (U2) — فقط اجرای اول (وقتی meta.onboardingDone وجود ندارد)
import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Sparkles, XCircle, Zap, Gauge } from "lucide-react";
import { ldb, verseKey } from "../../db/learningDb";
import { getActiveSurahNumber } from "../../config/surahConfig";
import {
  applyPrescreenOutcomes,
  selectPrescreenWords,
  type PrescreenOutcome,
  type PrescreenWord,
} from "../../learning/vocabPrescreen";
import { PACE_MODE_LIST } from "../../learning/pace";
import { setMeta } from "../../services/metaStore";
import { usePreferencesStore } from "../../store/usePreferencesStore";
import LearningSessionPage from "../../pages/LearningSessionPage";

export async function completeOnboarding(): Promise<void> {
  await setMeta("onboardingDone", true);
}

interface Props {
  onFinished: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function OnboardingFlow({ onFinished }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [firstUnitId, setFirstUnitId] = useState<string>("u_p385b");
  const [runningTestOut, setRunningTestOut] = useState(false);

  // وضعیت گام ۲ (غربال واژگان واحد اول)
  const [words, setWords] = useState<PrescreenWord[]>([]);
  const [loadingWords, setLoadingWords] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [cardPhase, setCardPhase] = useState<"prompt" | "confirm">("prompt");
  const [outcomes, setOutcomes] = useState<PrescreenOutcome[]>([]);

  const paceMode = usePreferencesStore((s) => s.paceMode);
  const setPaceMode = usePreferencesStore((s) => s.setPaceMode);

  useEffect(() => {
    let active = true;
    const resolveFirstUnit = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL || "/"}content/manifest.json`);
        if (res.ok) {
          const manifest = (await res.json()) as { units: { id: string; order: number }[] };
          const first = manifest.units.slice().sort((a, b) => a.order - b.order)[0]?.id;
          if (active && first) setFirstUnitId(first);
        }
      } catch {
        // fallback u_p385b
      }
    };
    void resolveFirstUnit();
    return () => {
      active = false;
    };
  }, []);

  const loadUnit1Words = async (uid: string) => {
    setLoadingWords(true);
    try {
      const [lexRows, allCards] = await Promise.all([
        ldb.lexicon.where("unitId").equals(uid).toArray(),
        ldb.cards.toArray(),
      ]);
      const parsedMeta = lexRows.map((l) => {
        const m = /^w\d+_(\d+)_(\d+)$/.exec(l.wordId);
        return {
          row: l,
          verse: m ? Number(m[1]) : 1,
          wIdx: m ? Number(m[2]) : 1,
        };
      });
      const verseNums = [...new Set(parsedMeta.map((p) => p.verse))];
      const surah = getActiveSurahNumber();
      const verses = await Promise.all(verseNums.map((n) => ldb.baseVerses.get(verseKey(surah, n))));
      const wordsByVerse = new Map<number, { i: number; ar: string }[]>();
      for (const v of verses) {
        if (v) wordsByVerse.set(v.n, (v.words as { i: number; ar: string }[] | undefined) ?? []);
      }

      const cands: PrescreenWord[] = parsedMeta
        .map(({ row, verse, wIdx }) => {
          const ar =
            wordsByVerse.get(verse)?.find((w) => w.i === wIdx)?.ar ||
            String(row.ar ?? row.gloss ?? "");
          const gloss = String(row.gloss ?? "");
          const meaningFa = String(row.meaningFa ?? gloss);
          return {
            wordId: row.wordId,
            ar,
            gloss,
            meaningFa,
            hard: Boolean(row.hard),
            verse,
          };
        })
        .filter((w) => w.ar.trim().length > 0 && w.meaningFa.trim().length > 0);

      const cardsMap = new Map(allCards.map((c) => [c.key, c]));
      const selected = selectPrescreenWords(cands, cardsMap);
      setWords(selected);
      setWordIdx(0);
      setOutcomes([]);
      setCardPhase("prompt");
    } finally {
      setLoadingWords(false);
    }
  };

  // «رد کردن» در هر گام مستقیم به گام ۵ می‌رود بدون ثبت هیچ داده یادگیری
  const handleSkipToEnd = () => {
    setRunningTestOut(false);
    setStep(5);
  };

  const handleRecordPrescreen = async (confirmedKnown: boolean) => {
    const cur = words[wordIdx];
    if (!cur) {
      setStep(3);
      return;
    }
    const nextOutcomes = [...outcomes, { wordId: cur.wordId, confirmedKnown }];
    setOutcomes(nextOutcomes);
    setCardPhase("prompt");

    if (wordIdx + 1 >= words.length) {
      const keys = nextOutcomes.map((o) => `w:${o.wordId}`);
      const existingRows = await ldb.cards.bulkGet(keys);
      const existingMap = new Map(
        existingRows.filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.key, c]),
      );
      const toSave = applyPrescreenOutcomes(nextOutcomes, existingMap, new Date());
      if (toSave.length > 0) {
        await ldb.cards.bulkPut(toSave);
      }
      setStep(3);
    } else {
      setWordIdx(wordIdx + 1);
    }
  };

  if (runningTestOut) {
    return (
      <LearningSessionPage
        unitId={firstUnitId}
        stage={-2}
        onExit={() => {
          setRunningTestOut(false);
          setStep(4);
        }}
      />
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-white dark:bg-[#1a2332] rounded-3xl border-2 border-[#d4af37]/60 dark:border-teal-800 shadow-xl p-6 space-y-5">
        {/* نوار گام‌ها + دکمه رد کردن */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-bold">گام {toFarsi(step)} از ۵</span>
          {step < 5 && (
            <button
              type="button"
              onClick={handleSkipToEnd}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline underline-offset-4"
            >
              رد کردن
            </button>
          )}
        </div>

        {/* گام ۱: خوش‌آمد */}
        {step === 1 && (
          <div className="space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <BookOpen className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">
              به سفر حفظ و تدبر سوره مبارکه قصص خوش آمدید
            </h1>
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed text-right bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800">
              <p>• یادگیری گام‌به‌گام ۲۲ نیم‌صفحه مصحف از واژگان و ترجمه تا تسلط کامل حفظ.</p>
              <p>• مرور هوشمند با الگوریتم علمی FSRS متناسب با حافظه شخصی شما.</p>
              <p>• امکان تعیین سطح سریع در کمتر از دو دقیقه تا مطالب بلدشده تکرار نشوند.</p>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  void loadUnit1Words(firstUnitId);
                  setStep(2);
                }}
                className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-all"
              >
                شروع تعیین سطح
              </button>
              <button
                type="button"
                onClick={handleSkipToEnd}
                className="w-full py-3 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all"
              >
                رد کردن — از صفر شروع می‌کنم
              </button>
            </div>
          </div>
        )}

        {/* گام ۲: غربال واژگان واحد ۱ */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-slate-900 dark:text-white text-center">
              غربال سریع واژگان نیم‌صفحهٔ اول
            </h2>
            {loadingWords ? (
              <div className="py-10 text-center text-xs font-bold text-slate-500">
                در حال آماده‌سازی واژگان...
              </div>
            ) : !words[wordIdx] ? (
              <div className="space-y-3 text-center">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  واژگان این بخش آماده است. به گام بعد بروید.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs"
                >
                  ادامه
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                  <span>
                    واژه {toFarsi(wordIdx + 1)} از {toFarsi(words.length)}
                  </span>
                  <span>آیه {toFarsi(words[wordIdx].verse)}</span>
                </div>

                <div className="p-6 rounded-2xl bg-[#fffdf7] dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-center space-y-3">
                  <div
                    className="text-3xl text-slate-900 dark:text-white leading-relaxed"
                    style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif" }}
                  >
                    {words[wordIdx].ar}
                  </div>
                  {cardPhase === "confirm" && (
                    <div className="pt-3 border-t border-amber-200/80 dark:border-slate-700 space-y-1">
                      <div className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                        {words[wordIdx].gloss}
                      </div>
                      {words[wordIdx].meaningFa !== words[wordIdx].gloss && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {words[wordIdx].meaningFa}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {cardPhase === "prompt" ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCardPhase("confirm")}
                      className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs"
                    >
                      بلدم (نمایش معنی)
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRecordPrescreen(false)}
                      className="py-3 px-4 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-black text-xs"
                    >
                      بلد نیستم
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleRecordPrescreen(true)}
                      className="py-3 px-4 rounded-2xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>درست گفتم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRecordPrescreen(false)}
                      className="py-3 px-4 rounded-2xl bg-rose-600 text-white font-black text-xs flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>اشتباه گفتم</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* گام ۳: پیشنهاد آزمون میانبر واحد ۱ */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              پیشنهاد آزمون میانبر نیم‌صفحهٔ اول
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              اگر این نیم‌صفحه را از قبل حفظی، آزمون بده
            </p>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => setRunningTestOut(true)}
                className="w-full py-3 px-5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs"
              >
                آزمون می‌دهم
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="w-full py-3 px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs"
              >
                لازم نیست
              </button>
            </div>
          </div>
        )}

        {/* گام ۴: انتخاب سرعت */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Gauge className="w-5 h-5" />
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                انتخاب آهنگ پیشروی روزانه
              </h2>
            </div>

            <div className="space-y-2">
              {PACE_MODE_LIST.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaceMode(m.id)}
                  className={`w-full p-3.5 rounded-2xl border-2 text-right transition-all ${
                    paceMode === m.id
                      ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500"
                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="font-black text-xs text-slate-900 dark:text-white">
                    {m.labelFa}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {m.descriptionFa}
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep(5)}
              className="w-full py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs"
            >
              ادامه
            </button>
          </div>
        )}

        {/* گام ۵: پایان */}
        {step === 5 && (
          <div className="space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              همه‌چیز برای آغاز آماده است
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              برنامهٔ روزانهٔ شما بر اساس تنظیمات انتخابی چیده شد. هر زمان می‌توانید از بخش تنظیمات آهنگ پیشروی را تغییر دهید.
            </p>
            <button
              type="button"
              onClick={async () => {
                await completeOnboarding();
                onFinished();
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-all"
            >
              شروع سفر
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
