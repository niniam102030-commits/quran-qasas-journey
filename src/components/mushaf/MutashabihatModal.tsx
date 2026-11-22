// src/components/mushaf/MutashabihatModal.tsx
// مقایسه‌گر تخصصی متشابهات سوره قصص با رنگ‌آمیزی تفاوت‌ها و پخش صوتی منشاوی
import { useEffect, useMemo, useState } from "react";
import { X, GitCompare, Sparkles, Search } from "lucide-react";
import { ldb } from "../../db/learningDb";
import { diffVersePair, findMutashabihatPairs, type SimpleVerse } from "../../learning/mutashabihat";
import { usePreferencesStore } from "../../store/usePreferencesStore";
import VerseAudioPlayer from "../audio/VerseAudioPlayer";

interface Props {
  onClose: () => void;
  initialVerse?: number | null;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function MutashabihatModal({ onClose, initialVerse = null }: Props) {
  const [verses, setVerses] = useState<SimpleVerse[]>([]);
  const [filterVerse, setFilterVerse] = useState<string>(initialVerse ? String(initialVerse) : "");
  const [loading, setLoading] = useState(true);
  const arabicFontSize = usePreferencesStore((s) => s.arabicFontSize);

  useEffect(() => {
    let active = true;
    ldb.baseVerses.orderBy("n").toArray().then((rows) => {
      if (!active) return;
      setVerses(rows as unknown as SimpleVerse[]);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const byNum = useMemo(() => new Map(verses.map((v) => [v.n, v])), [verses]);
  const allPairs = useMemo(() => findMutashabihatPairs(verses, 0.22, 35), [verses]);

  const filteredPairs = useMemo(() => {
    const q = Number(filterVerse.trim());
    if (!q || !Number.isFinite(q)) return allPairs;
    return allPairs.filter((p) => p.verseA === q || p.verseB === q);
  }, [allPairs, filterVerse]);

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-[#fcfaf5] dark:bg-[#121824] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#f7f2e4]/95 dark:bg-[#1a2332]/95 backdrop-blur border-b border-[#e6dbc5] dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
            <GitCompare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-[#8a5b29] dark:text-amber-400">
              مقایسه‌گر متشابهات سوره قصص
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              کلمات مشترک (طلایی) در برابر تفاوت‌های کلیدی (قرمز/آبی)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300"
          title="بستن"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Filter Bar */}
      <div className="px-4 py-3 bg-white dark:bg-[#1a2332] border-b border-[#e6dbc5] dark:border-slate-800">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="number"
              min={1}
              max={88}
              value={filterVerse}
              onChange={(e) => setFilterVerse(e.target.value)}
              placeholder="فیلتر بر اساس شماره آیه (۱ تا ۸۸)..."
              className="w-full pr-9 pl-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            />
          </div>
          <div className="text-xs font-bold text-slate-500">
            {toFarsi(filteredPairs.length)} جفت متشابه یافت شد
          </div>
        </div>
      </div>

      {/* Pairs List */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4 pb-12">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
              <Sparkles className="w-6 h-6 animate-pulse text-amber-500" />
              <span>در حال تحلیل متشابهات ۸۸ آیه سوره قصص...</span>
            </div>
          ) : filteredPairs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              برای این شماره آیه متشابه برجسته‌ای یافت نشد. فیلتر را پاک کنید تا همه جفت‌ها نمایش داده شوند.
            </div>
          ) : (
            filteredPairs.map((pair) => {
              const vA = byNum.get(pair.verseA);
              const vB = byNum.get(pair.verseB);
              if (!vA || !vB) return null;
              const diff = diffVersePair(vA, vB);

              return (
                <div
                  key={`${pair.verseA}-${pair.verseB}`}
                  className="bg-white dark:bg-[#1a2332] rounded-3xl border border-[#e6dbc5] dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-amber-800 dark:text-amber-300">
                      مقایسه آیه {toFarsi(pair.verseA)} و آیه {toFarsi(pair.verseB)}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold">
                      شباهت: {toFarsi(Math.round(pair.score * 100))}٪
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Verse A */}
                    <div className="p-3.5 rounded-2xl bg-[#fcf9f2] dark:bg-slate-900 border border-[#e8dfcd] dark:border-slate-800 space-y-2.5">
                      <div className="text-xs font-bold text-rose-700 dark:text-rose-400">
                        آیه {toFarsi(pair.verseA)}
                      </div>
                      <p
                        style={{
                          fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
                          fontSize: `${Math.min(30, arabicFontSize)}px`,
                          lineHeight: 2.3,
                        }}
                        className="text-right"
                      >
                        {diff.wordsA.map((w, idx) => (
                          <span
                            key={idx}
                            className={`inline-block mx-0.5 px-1 rounded-lg ${
                              w.shared
                                ? "bg-amber-200/50 dark:bg-amber-900/40 text-slate-900 dark:text-slate-100"
                                : "bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 font-bold"
                            }`}
                          >
                            {w.ar}
                          </span>
                        ))}
                      </p>
                      {vA.fa && <p className="text-[11px] text-slate-500 leading-relaxed">{vA.fa}</p>}
                      <VerseAudioPlayer verses={[pair.verseA]} compact />
                    </div>

                    {/* Verse B */}
                    <div className="p-3.5 rounded-2xl bg-[#fcf9f2] dark:bg-slate-900 border border-[#e8dfcd] dark:border-slate-800 space-y-2.5">
                      <div className="text-xs font-bold text-sky-700 dark:text-sky-400">
                        آیه {toFarsi(pair.verseB)}
                      </div>
                      <p
                        style={{
                          fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
                          fontSize: `${Math.min(30, arabicFontSize)}px`,
                          lineHeight: 2.3,
                        }}
                        className="text-right"
                      >
                        {diff.wordsB.map((w, idx) => (
                          <span
                            key={idx}
                            className={`inline-block mx-0.5 px-1 rounded-lg ${
                              w.shared
                                ? "bg-amber-200/50 dark:bg-amber-900/40 text-slate-900 dark:text-slate-100"
                                : "bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 font-bold"
                            }`}
                          >
                            {w.ar}
                          </span>
                        ))}
                      </p>
                      {vB.fa && <p className="text-[11px] text-slate-500 leading-relaxed">{vB.fa}</p>}
                      <VerseAudioPlayer verses={[pair.verseB]} compact />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
