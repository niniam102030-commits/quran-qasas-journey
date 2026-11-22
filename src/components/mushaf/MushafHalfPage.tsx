// src/components/mushaf/MushafHalfPage.tsx
import { useState, useEffect, useMemo } from "react";
import { Eye, EyeOff, BookOpen, Sparkles, ChevronRight, Maximize2, Minimize2, Footprints } from "lucide-react";
import { ldb } from "../../db/learningDb";
import { usePreferencesStore } from "../../store/usePreferencesStore";
import VerseAudioPlayer from "../audio/VerseAudioPlayer";

interface Word {
  id: string;
  i: number;
  ar: string;
}

interface Verse {
  n: number;
  arText: string;
  fa: string;
  words: Word[];
}

interface Props {
  unitId: string;
  onClose?: () => void;
  onStartPractice?: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

export default function MushafHalfPage({ unitId, onClose, onStartPractice }: Props) {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"reading" | "partial" | "hidden" | "step">("reading");
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
  const [stepCursor, setStepCursor] = useState<number>(0);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [activeAudioVerse, setActiveAudioVerse] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const fontSize = usePreferencesStore((s) => s.arabicFontSize);

  const allWordIds = useMemo(() => verses.flatMap((v) => v.words.map((w) => w.id)), [verses]);
  const verseNumsList = useMemo(() => verses.map((v) => v.n), [verses]);

  useEffect(() => {
    async function loadVerses() {
      setLoading(true);
      try {
        // Find verses belonging to this unit from unit plan
        const base = import.meta.env.BASE_URL || "/";
        const planRes = await fetch(`${base}content/base/units-plan.json`);
        const plan = await planRes.json();
        const unit = plan.find((u: { id: string }) => u.id === unitId);
        if (unit && unit.verses) {
          const verseNums = unit.verses.map((v: string) => Number(v.slice(4)));
          const baseRows = await ldb.baseVerses.where("n").anyOf(verseNums).toArray();
          baseRows.sort((a, b) => a.n - b.n);
          setVerses(baseRows as unknown as Verse[]);
        }
      } catch (e) {
        console.error("Failed to load unit verses for mushaf page:", e);
      } finally {
        setLoading(false);
      }
    }
    loadVerses();
  }, [unitId]);

  const toggleRevealWord = (wordId: string) => {
    setRevealedWords((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  };

  const handleChangeMode = (nextMode: "reading" | "partial" | "hidden" | "step") => {
    setMode(nextMode);
    setRevealedWords(new Set());
    setStepCursor(0);
  };

  const revealAllWords = () => {
    setRevealedWords(new Set(allWordIds));
    setStepCursor(allWordIds.length);
  };

  const hideAllWords = () => {
    setRevealedWords(new Set());
    setStepCursor(0);
  };

  const revealNextStepWord = () => {
    if (stepCursor >= allWordIds.length) return;
    const nextId = allWordIds[stepCursor];
    setRevealedWords((prev) => new Set(prev).add(nextId));
    setStepCursor((c) => c + 1);
  };

  const isWordHidden = (word: Word): boolean => {
    if (mode === "reading") return false;
    if (revealedWords.has(word.id)) return false;
    if (mode === "step") return true;
    if (mode === "hidden") {
      // In hidden mode, hide every 2nd and 3rd word
      return word.i % 2 === 0 || word.i % 3 === 0;
    }
    if (mode === "partial") {
      // In partial mode, show only first 2 words of the verse, hide the rest
      return word.i > 2;
    }
    return false;
  };

  return (
    <div dir="rtl" className={`flex flex-col min-h-screen bg-[#fcf9f2] dark:bg-[#151c28] text-slate-900 dark:text-slate-100 select-none overflow-y-auto ${focusMode ? "fixed inset-0 z-50" : ""}`}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#f7f2e4]/95 dark:bg-[#1a2332]/95 backdrop-blur border-b border-[#e6dbc5] dark:border-slate-800">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform"
              title="بازگشت"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <div>
            <h1 className="text-sm sm:text-base font-bold text-[#8a5b29] dark:text-amber-400">
              نیم‌صفحه مصحف
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              سوره قصص (آیات {verses[0] ? toFarsiNum(verses[0].n) : "..."} تا {verses.length ? toFarsiNum(verses[verses.length - 1].n) : "..."})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Practice Mode Selector */}
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-black/5 dark:border-white/5">
            {(
              [
                { id: "reading", label: "روخوانی" },
                { id: "partial", label: "شروع آیه" },
                { id: "hidden", label: "حفظ" },
                { id: "step", label: "کلمه‌به‌کلمه" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleChangeMode(tab.id)}
                className={`px-2 py-1 text-[11px] sm:text-xs font-semibold rounded-xl transition-all ${
                  mode === tab.id
                    ? "bg-white dark:bg-slate-700 text-[#8a5b29] dark:text-amber-300 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFocusMode((f) => !f)}
            title={focusMode ? "خروج از حالت تمرکز" : "حالت تمرکز تمام‌صفحه"}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-black/10 transition-colors"
          >
            {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Quran Mushaf Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 pb-28 space-y-4">
        {!loading && verseNumsList.length > 0 && (
          <VerseAudioPlayer verses={verseNumsList} onActiveVerseChange={setActiveAudioVerse} />
        )}

        {!loading && mode !== "reading" && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={revealAllWords}
                className="py-1.5 px-3 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 hover:bg-amber-200 transition-colors flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>نمایش همه</span>
              </button>
              <button
                type="button"
                onClick={hideAllWords}
                className="py-1.5 px-3 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>پنهان همه</span>
              </button>
            </div>

            {mode === "step" && (
              <button
                type="button"
                onClick={revealNextStepWord}
                disabled={stepCursor >= allWordIds.length}
                className="py-1.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
              >
                <Footprints className="w-3.5 h-3.5" />
                <span>
                  کلمه بعدی ({toFarsiNum(stepCursor)} / {toFarsiNum(allWordIds.length)})
                </span>
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <BookOpen className="w-8 h-8 animate-pulse text-amber-500" />
            <span className="text-sm">در حال بارگذاری نیم‌صفحه مصحف...</span>
          </div>
        ) : (
          <div className="bg-[#fffdf7] dark:bg-[#1b2230] border-2 border-[#e6dbc5] dark:border-slate-800 rounded-3xl p-5 sm:p-8 shadow-sm">
            {/* Mushaf Decorative Border Top */}
            <div className="text-center pb-4 mb-4 border-b border-[#e9dfcb] dark:border-slate-800 flex items-center justify-center gap-2 text-xs font-medium text-[#9a6e38] dark:text-amber-400">
              <Sparkles className="w-4 h-4" />
              <span>مصحف مدینه منوره — رسم‌الخط عثمان طه</span>
              <Sparkles className="w-4 h-4" />
            </div>

            {/* Verses Flow (Continuous Quranic Layout) */}
            <div
              className="text-right leading-[2.6] sm:leading-[3.0] tracking-wide text-slate-800 dark:text-slate-100"
              style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif", fontSize: `${fontSize}px` }}
            >
              {verses.map((v) => (
                <span
                  key={v.n}
                  className={`inline rounded-xl transition-colors ${
                    activeAudioVerse === v.n ? "bg-amber-200/45 dark:bg-amber-900/35" : ""
                  }`}
                >
                  {v.words.map((w) => {
                    const hidden = isWordHidden(w);
                    return (
                      <span
                        key={w.id}
                        onClick={() => {
                          if (mode !== "reading") toggleRevealWord(w.id);
                          setSelectedWord(selectedWord === w.id ? null : w.id);
                        }}
                        className={`inline-block mx-1 px-1 rounded-lg transition-colors cursor-pointer ${
                          hidden
                            ? "bg-[#e2d5bd] dark:bg-slate-700 text-transparent min-w-[3rem] text-center border-b-2 border-dashed border-[#bfa57a] dark:border-slate-500"
                            : selectedWord === w.id
                            ? "bg-amber-200/70 dark:bg-amber-900/40"
                            : "hover:bg-amber-100/50 dark:hover:bg-white/5"
                        }`}
                      >
                        {w.ar}
                      </span>
                    );
                  })}
                  {/* Ayah End Mark with Verse Number */}
                  <span
                    className="inline-flex items-center justify-center text-amber-700 dark:text-amber-400 mx-1.5 font-bold text-xl sm:text-2xl select-none"
                    title={`آیه ${v.n}`}
                  >
                    ۝{toFarsiNum(v.n)}
                  </span>
                </span>
              ))}
            </div>

            {/* Hint Notice */}
            {mode !== "reading" && (
              <div className="mt-6 pt-4 border-t border-[#e9dfcb] dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>برای نمایش یا پنهان‌سازی هر کلمه، روی آن ضربه بزنید.</span>
              </div>
            )}
          </div>
        )}

        {/* Translation Drawer for Selected Word/Verse */}
        {selectedWord && (
          <div className="mt-4 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-[#e6dbc5] dark:border-slate-700 shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-amber-700 dark:text-amber-400">
              <span>ترجمه استاد انصاریان</span>
              <button
                onClick={() => setSelectedWord(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                بستن
              </button>
            </div>
            {(() => {
              const currentV = verses.find((v) => v.words.some((w) => w.id === selectedWord));
              return currentV ? (
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    آیه {toFarsiNum(currentV.n)}:
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {currentV.fa}
                  </p>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </main>

      {/* Bottom Sticky Action Bar */}
      {onStartPractice && (
        <div className="fixed bottom-0 inset-x-0 p-3 sm:p-4 bg-white/95 dark:bg-[#1a2332]/95 backdrop-blur border-t border-[#e6dbc5] dark:border-slate-800 flex items-center justify-center">
          <button
            onClick={onStartPractice}
            className="w-full max-w-md py-3.5 px-6 rounded-2xl font-bold text-white bg-[#b37e3d] hover:bg-[#9d6b2f] active:scale-[0.98] shadow-lg shadow-amber-800/20 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            <span>شروع آزمون و تمرین این واحد</span>
          </button>
        </div>
      )}
    </div>
  );
}
