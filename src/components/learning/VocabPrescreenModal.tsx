// src/components/learning/VocabPrescreenModal.tsx
// فلش‌کارت پیش‌غربال واژگان با تأیید دومرحله‌ای (بلدم ← نمایش معنی ← درست گفتم / اشتباه گفتم)
import { useEffect, useState } from "react";
import { X, CheckCircle2, XCircle, Sparkles, BookOpen } from "lucide-react";
import { ldb } from "../../db/learningDb";
import {
  selectPrescreenWords,
  applyPrescreenOutcomes,
  type PrescreenWord,
  type PrescreenOutcome,
} from "../../learning/vocabPrescreen";

interface Props {
  unitId: string;
  onClose: () => void;
  onStartStage1: (unitId: string) => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function VocabPrescreenModal({ unitId, onClose, onStartStage1 }: Props) {
  const [words, setWords] = useState<PrescreenWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<"prompt" | "confirm">("prompt");
  const [outcomes, setOutcomes] = useState<PrescreenOutcome[]>([]);
  const [savedSummary, setSavedSummary] = useState<{ known: number; keep: number } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [lexRows, allCards] = await Promise.all([
        ldb.lexicon.where("unitId").equals(unitId).toArray(),
        ldb.cards.toArray(),
      ]);

      // استخراج متن عربی هر wordId از جدول baseVerses
      const parsedMeta = lexRows.map((l) => {
        const match = /^w\d+_(\d+)_(\d+)$/.exec(l.wordId);
        return {
          row: l,
          verse: match ? Number(match[1]) : 1,
          wordIdx: match ? Number(match[2]) : 1,
        };
      });
      const verseNums = [...new Set(parsedMeta.map((p) => p.verse))];
      const verses = await Promise.all(verseNums.map((n) => ldb.baseVerses.get(n)));
      const wordsByVerse = new Map<number, { i: number; ar: string }[]>();
      for (const v of verses) {
        if (v) {
          wordsByVerse.set(v.n, (v.words as { i: number; ar: string }[] | undefined) ?? []);
        }
      }

      const prescreenCandidates: PrescreenWord[] = parsedMeta
        .map(({ row, verse, wordIdx }) => {
          const ar =
            wordsByVerse.get(verse)?.find((w) => w.i === wordIdx)?.ar ||
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
      const selected = selectPrescreenWords(prescreenCandidates, cardsMap);
      if (active) {
        setWords(selected);
        setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [unitId]);

  const finishAndSave = async (finalOutcomes: PrescreenOutcome[]) => {
    const keys = finalOutcomes.map((o) => `w:${o.wordId}`);
    const existingRows = await ldb.cards.bulkGet(keys);
    const existingMap = new Map(
      existingRows.filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.key, c]),
    );
    const toSave = applyPrescreenOutcomes(finalOutcomes, existingMap, new Date());
    if (toSave.length > 0) {
      await ldb.cards.bulkPut(toSave);
    }
    const known = finalOutcomes.filter((o) => o.confirmedKnown).length;
    setSavedSummary({ known, keep: finalOutcomes.length - known });
  };

  const recordOutcome = (confirmedKnown: boolean) => {
    const current = words[index];
    if (!current) return;
    const nextOutcomes = [...outcomes, { wordId: current.wordId, confirmedKnown }];
    setOutcomes(nextOutcomes);
    setStep("prompt");
    if (index + 1 >= words.length) {
      void finishAndSave(nextOutcomes);
    } else {
      setIndex(index + 1);
    }
  };

  const current = words[index];

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1a2332] w-full max-w-md rounded-3xl border-2 border-[#d4af37]/60 dark:border-teal-800 shadow-2xl p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#00A896]" />
            <h3 className="font-black text-base text-slate-900 dark:text-white">پیش‌غربال واژگان</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs font-bold text-slate-500">در حال آماده‌سازی واژگان...</div>
        ) : savedSummary ? (
          <div className="space-y-4 text-center py-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="font-black text-base text-slate-900 dark:text-white">پیش‌غربال کامل شد</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {toFarsi(savedSummary.known)} واژهٔ بلدشده با کارت مرور ۱۰ روزه ثبت و از درس مرحلهٔ ۱ حذف شدند؛{" "}
                {toFarsi(savedSummary.keep)} واژه برای تمرین در مرحلهٔ ۱ باقی ماندند.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartStage1(unitId);
                }}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-[#00A896] hover:bg-[#028090] border-b-4 border-[#016470] text-white font-black text-xs transition-all"
              >
                شروع مرحلهٔ ۱ (واژگان)
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                بستن
              </button>
            </div>
          </div>
        ) : !current ? (
          <div className="space-y-4 text-center py-4">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              همهٔ واژگان اصلی این نیم‌صفحه قبلاً ثبت شده‌اند!
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs"
            >
              بازگشت
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
              <span>
                واژه {toFarsi(index + 1)} از {toFarsi(words.length)}
              </span>
              <span>آیه {toFarsi(current.verse)}</span>
            </div>

            {/* Word card */}
            <div className="p-6 rounded-3xl bg-gradient-to-b from-[#fffdf7] to-[#f8f2e4] dark:from-[#162032] dark:to-[#1a2639] border-2 border-[#d4af37]/65 dark:border-teal-700/70 text-center space-y-3">
              <div
                className="text-3xl sm:text-4xl text-slate-900 dark:text-white leading-relaxed"
                style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif" }}
              >
                {current.ar}
              </div>
              {step === "confirm" && (
                <div className="pt-3 border-t border-amber-200/80 dark:border-slate-700 space-y-1">
                  <div className="text-sm font-black text-emerald-700 dark:text-emerald-400">{current.gloss}</div>
                  {current.meaningFa !== current.gloss && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{current.meaningFa}</p>
                  )}
                </div>
              )}
            </div>

            {step === "prompt" ? (
              <div className="space-y-2">
                <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                  معنی این واژه را در ذهن مرور کن؛ سپس انتخاب کن:
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep("confirm")}
                    className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-0.5 text-white font-black text-xs transition-all"
                  >
                    بلدم (نمایش معنی)
                  </button>
                  <button
                    type="button"
                    onClick={() => recordOutcome(false)}
                    className="py-3 px-4 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 border-2 border-b-4 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-black text-xs transition-all"
                  >
                    بلد نیستم
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-center font-bold text-slate-700 dark:text-slate-200">
                  آیا معنی درست را در ذهن گفته بودی؟
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => recordOutcome(true)}
                    className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-0.5 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>درست گفتم</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => recordOutcome(false)}
                    className="py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 border-b-4 border-rose-800 active:border-b-0 active:translate-y-0.5 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>اشتباه گفتم</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
