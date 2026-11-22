// src/components/mushaf/MushafHalfPage.tsx
import { useState, useEffect } from "react";
import { Eye, BookOpen, Sparkles, ChevronRight } from "lucide-react";
import { ldb } from "../../db/learningDb";

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
  const [mode, setMode] = useState<"reading" | "partial" | "hidden">("reading");
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [fontSize] = useState<number>(() => {
    if (typeof window === "undefined") return 28;
    const raw = Number(localStorage.getItem("quran_font_size") || 28);
    return Number.isFinite(raw) ? Math.min(40, Math.max(22, raw)) : 28;
  });

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

  const isWordHidden = (word: Word): boolean => {
    if (mode === "reading") return false;
    if (revealedWords.has(word.id)) return false;
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
    <div className="flex flex-col h-full bg-[#fcf9f2] dark:bg-[#151c28] text-slate-900 dark:text-slate-100 select-none overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#f7f2e4]/95 dark:bg-[#1a2332]/95 backdrop-blur border-b border-[#e6dbc5] dark:border-slate-800">
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
            <h1 className="text-base font-bold text-[#8a5b29] dark:text-amber-400">
              نیم‌صفحه مصحف — {unitId}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              سوره قصص (آیات {verses[0] ? toFarsiNum(verses[0].n) : "..."} تا {verses.length ? toFarsiNum(verses[verses.length - 1].n) : "..."})
            </p>
          </div>
        </div>

        {/* Practice Mode Selector */}
        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-black/5 dark:border-white/5">
          <button
            onClick={() => setMode("reading")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-xl transition-all ${
              mode === "reading"
                ? "bg-white dark:bg-slate-700 text-[#8a5b29] dark:text-amber-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            روخوانی
          </button>
          <button
            onClick={() => setMode("partial")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-xl transition-all ${
              mode === "partial"
                ? "bg-white dark:bg-slate-700 text-[#8a5b29] dark:text-amber-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            شروع آیه
          </button>
          <button
            onClick={() => setMode("hidden")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-xl transition-all ${
              mode === "hidden"
                ? "bg-white dark:bg-slate-700 text-[#8a5b29] dark:text-amber-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            حفظ
          </button>
        </div>
      </header>

      {/* Main Quran Mushaf Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 pb-24">
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
                <span key={v.n} className="inline">
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
