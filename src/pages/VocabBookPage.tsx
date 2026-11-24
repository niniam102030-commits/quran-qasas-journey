// src/pages/VocabBookPage.tsx
// دفترچهٔ واژگان شخصی (مورد ۱۳): جستجو، فیلتر سطح قدرت و مرور فلش‌کارت بدون تغییر FSRS
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpenText, ChevronDown, ChevronLeft, ChevronRight, Layers, Search, Sparkles } from "lucide-react";
import { ldb, verseKey } from "../db/learningDb";
import { getActiveSurahNumber } from "../config/surahConfig";
import { skillLevel } from "../learning/mastery";
import type { StoredCard } from "../learning/cardScheduler";

interface Props {
  onBack: () => void;
}

interface VocabEntry {
  wordId: string;
  unitId: string;
  ar: string;
  meaningFa: string;
  rootAr: string;
  trapFa: string;
  tipFa: string;
  hard: boolean;
  level: 0 | 1 | 2 | 3;
  hasCard: boolean;
}

type FilterKind = "all" | "weak" | "hard" | "mastered";

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

const LEVEL_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: "هنوز شروع نشده",
  1: "تازه",
  2: "آشنا",
  3: "مسلط",
};

function formatUnitTitle(unitId: string): string {
  const m = /^u_p(\d+)([ab])$/.exec(unitId);
  if (m) return `صفحه ${toFarsi(m[1])} (${m[2] === "a" ? "نیمه اول" : "نیمه دوم"})`;
  return unitId;
}

export default function VocabBookPage({ onBack }: Props) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashMode, setFlashMode] = useState(false);
  const [flashIdx, setFlashIdx] = useState(0);
  const [flashRevealed, setFlashRevealed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const surah = getActiveSurahNumber();
        const [lexRows, cards, baseVerses] = await Promise.all([
          ldb.lexicon.toArray(),
          ldb.cards.toArray(),
          ldb.baseVerses.where("surah").equals(surah).toArray(),
        ]);
        if (!active) return;

        const cardByKey = new Map<string, StoredCard>(cards.map((c) => [c.key, c]));
        const wordsByVerse = new Map<number, Map<number, string>>();
        for (const bv of baseVerses) {
          const map = new Map<number, string>();
          const ws = (bv.words as { i: number; ar: string }[] | undefined) ?? [];
          for (const w of ws) map.set(w.i, w.ar);
          wordsByVerse.set(bv.n, map);
        }

        const list: VocabEntry[] = lexRows.map((l) => {
          let ar = "";
          const m = /^w(\d+)_(\d+)_(\d+)$/.exec(l.wordId);
          if (m && Number(m[1]) === surah) {
            ar = wordsByVerse.get(Number(m[2]))?.get(Number(m[3])) ?? "";
          }
          if (!ar) ar = String(l.ar ?? l.gloss ?? "");
          const card = cardByKey.get(`w:${l.wordId}`);
          const lvl = skillLevel(card);
          return {
            wordId: l.wordId,
            unitId: l.unitId,
            ar,
            meaningFa: String(l.meaningFa ?? l.gloss ?? ""),
            rootAr: typeof l.rootAr === "string" ? l.rootAr : "",
            trapFa: typeof l.trapFa === "string" ? l.trapFa : "",
            tipFa: typeof l.tipFa === "string" ? l.tipFa : "",
            hard: Boolean(l.hard),
            level: lvl,
            hasCard: Boolean(card && card.state !== 0),
          };
        });

        // fallback lookup for any wordId from other surahs if needed
        const missing = list.filter((e) => !e.ar);
        if (missing.length > 0) {
          for (const item of missing) {
            const m = /^w(\d+)_(\d+)_(\d+)$/.exec(item.wordId);
            if (!m) continue;
            const bv = await ldb.baseVerses.get(verseKey(Number(m[1]), Number(m[2])));
            const ws = (bv?.words as { i: number; ar: string }[] | undefined) ?? [];
            const found = ws.find((w) => w.i === Number(m[3]));
            if (found) item.ar = found.ar;
          }
        }

        if (active) {
          setEntries(list);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "weak" && !(e.hasCard && e.level <= 1)) return false;
      if (filter === "hard" && !e.hard) return false;
      if (filter === "mastered" && e.level !== 3) return false;
      if (!q) return true;
      return (
        e.ar.toLowerCase().includes(q) ||
        e.meaningFa.toLowerCase().includes(q) ||
        e.rootAr.toLowerCase().includes(q)
      );
    });
  }, [entries, query, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, VocabEntry[]>();
    for (const e of filtered) {
      const arr = map.get(e.unitId) ?? [];
      arr.push(e);
      map.set(e.unitId, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-termeh-bg dark:bg-lapis-bg text-slate-500 dark:text-slate-400">
        <BookOpenText className="w-10 h-10 animate-pulse text-brand-primary mb-3" />
        <p className="text-sm font-bold">در حال بارگذاری دفترچه...</p>
      </div>
    );
  }

  if (flashMode && filtered.length > 0) {
    const safeIdx = Math.min(flashIdx, filtered.length - 1);
    const card = filtered[safeIdx];
    return (
      <div dir="rtl" className="min-h-screen flex flex-col bg-termeh-bg dark:bg-lapis-bg text-slate-900 dark:text-slate-100 pb-24">
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-termeh-bg/95 dark:bg-lapis-bg/95 backdrop-blur border-b-2 border-brand-amber/40 dark:border-lapis-border">
          <button
            type="button"
            onClick={() => setFlashMode(false)}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
            title="خروج از مرور فلش‌کارت"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <span className="text-sm font-black">مرور فلش‌کارت واژگان</span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {toFarsi(safeIdx + 1)} / {toFarsi(filtered.length)}
          </span>
        </header>

        <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center gap-5">
          <button
            type="button"
            onClick={() => setFlashRevealed((r) => !r)}
            className="w-full min-h-[16rem] p-6 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border shadow-md flex flex-col items-center justify-center text-center gap-4 transition-all active:scale-[0.99]"
          >
            <span className="quran-text text-3xl sm:text-4xl text-slate-900 dark:text-white">
              {card.ar}
            </span>
            {card.rootAr && card.rootAr !== "-" && (
              <span className="px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-[11px] font-bold text-teal-800 dark:text-teal-300">
                ریشه: {card.rootAr}
              </span>
            )}
            {flashRevealed ? (
              <div className="space-y-2 pt-2 border-t border-termeh-border dark:border-lapis-border w-full">
                <div className="text-base font-black text-brand-primary">{card.meaningFa}</div>
                {card.tipFa && <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{card.tipFa}</p>}
                {card.trapFa && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">تلهٔ معنایی: {card.trapFa}</p>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-400">برای دیدن معنی و نکات لمس کنید</span>
            )}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={safeIdx === 0}
              onClick={() => {
                setFlashIdx((i) => Math.max(0, i - 1));
                setFlashRevealed(false);
              }}
              className="flex-1 py-3 rounded-2xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
              <span>قبلی</span>
            </button>
            <button
              type="button"
              disabled={safeIdx >= filtered.length - 1}
              onClick={() => {
                setFlashIdx((i) => Math.min(filtered.length - 1, i + 1));
                setFlashRevealed(false);
              }}
              className="flex-1 py-3 rounded-2xl bg-brand-primary text-white font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
            >
              <span>بعدی</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen islamic-bg bg-termeh-bg dark:bg-lapis-bg text-slate-900 dark:text-slate-100 pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-3 bg-termeh-bg/95 dark:bg-lapis-bg/95 backdrop-blur border-b-2 border-brand-amber/40 dark:border-lapis-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
            title="بازگشت"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm sm:text-base font-black">دفترچهٔ واژگان من</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {toFarsi(filtered.length)} واژه از {toFarsi(entries.length)}
            </p>
          </div>
        </div>
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setFlashIdx(0);
              setFlashRevealed(false);
              setFlashMode(true);
            }}
            className="py-1.5 px-3 rounded-xl bg-brand-primary text-white font-bold text-xs flex items-center gap-1 shadow-sm"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>مرور این فهرست</span>
          </button>
        )}
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی واژهٔ عربی، معنی فارسی یا ریشه..."
            className="w-full pr-10 pl-3 py-2.5 rounded-2xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border text-xs font-semibold outline-none focus:border-brand-primary"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: "همه" },
              { id: "weak", label: "ضعیف‌ها" },
              { id: "hard", label: "سخت‌ها" },
              { id: "mastered", label: "مسلط‌ها" },
            ] as { id: FilterKind; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                filter === f.id
                  ? "bg-brand-primary border-brand-primaryDark text-white shadow-sm"
                  : "bg-termeh-card dark:bg-lapis-card border-termeh-border dark:border-lapis-border text-slate-600 dark:text-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="p-8 rounded-3xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border text-center text-sm text-slate-500">
            هنوز واژه‌ای ثبت نشده است
          </div>
        ) : grouped.length === 0 ? (
          <div className="p-8 rounded-3xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border text-center text-sm text-slate-500">
            واژه‌ای با این فیلتر پیدا نشد.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([unitId, list]) => (
              <section
                key={unitId}
                className="rounded-3xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border p-4 shadow-sm space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs font-black text-slate-600 dark:text-slate-300 pb-1 border-b border-termeh-border/60 dark:border-lapis-border">
                  <span>{formatUnitTitle(unitId)}</span>
                  <span>{toFarsi(list.length)} واژه</span>
                </div>
                <div className="space-y-2">
                  {list.map((e) => {
                    const isOpen = expandedId === e.wordId;
                    const barColor =
                      e.level === 3
                        ? "bg-emerald-500"
                        : e.level === 2
                        ? "bg-teal-500"
                        : e.level === 1
                        ? "bg-amber-500"
                        : "bg-slate-300 dark:bg-slate-700";
                    return (
                      <div
                        key={e.wordId}
                        className="rounded-2xl border border-termeh-border/70 dark:border-lapis-border bg-termeh-bg/40 dark:bg-lapis-bg/40 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : e.wordId)}
                          className="w-full p-3 flex items-center justify-between gap-2 text-right"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="quran-text text-lg text-slate-900 dark:text-white leading-tight">
                                {e.ar}
                              </span>
                              {e.rootAr && e.rootAr !== "-" && (
                                <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-[10px] font-bold text-teal-800 dark:text-teal-300">
                                  {e.rootAr}
                                </span>
                              )}
                              {e.hard && (
                                <span className="px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                  سخت
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                              {e.meaningFa}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-0.5" title={LEVEL_LABELS[e.level]}>
                                {[1, 2, 3].map((step) => (
                                  <span
                                    key={step}
                                    className={`w-2.5 h-1.5 rounded-full ${
                                      e.level >= step ? barColor : "bg-slate-200 dark:bg-slate-700"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {LEVEL_LABELS[e.level]}
                              </span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </div>
                        </button>

                        {isOpen && (e.tipFa || e.trapFa) && (
                          <div className="px-3 pb-3 pt-2 border-t border-termeh-border/50 dark:border-lapis-border space-y-1.5 text-xs">
                            {e.tipFa && (
                              <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-200">
                                <Sparkles className="w-3.5 h-3.5 text-brand-primary shrink-0 mt-0.5" />
                                <span>{e.tipFa}</span>
                              </div>
                            )}
                            {e.trapFa && (
                              <div className="text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/40 rounded-xl p-2">
                                <span className="font-bold">تلهٔ معنایی: </span>
                                {e.trapFa}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
