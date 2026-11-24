// src/components/learning/StoryOrderGame.tsx
// بازی «ترتیب وقایع» داستان برای فصل‌های تکمیل‌شده (L5)
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, RotateCcw, Sparkles, X } from "lucide-react";
import type { StoryChapter } from "../../learning/chapters";
import { shuffleEvents, scoreOrder } from "../../learning/storyOrder";
import { getMeta, setMeta } from "../../services/metaStore";
import { recordLearningReward } from "../../services/profileService";

interface StoryEventsFile {
  schema: string;
  chapters: Record<string, string[]>;
}

interface Props {
  chapter: StoryChapter;
  onClose: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

export default function StoryOrderGame({ chapter, onClose }: Props) {
  const [correctEvents, setCorrectEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Date.now() & 0xffff);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<{
    exact: number;
    fullyCorrect: boolean;
    gemsAwarded: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}content/base/qasas.story-events.json`);
        if (!res.ok) throw new Error("فایل وقایع داستان بارگذاری نشد.");
        const data = (await res.json()) as StoryEventsFile;
        const list = data.chapters?.[chapter.id] ?? [];
        if (active) {
          setCorrectEvents(list);
          setSelected([]);
          setResult(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [chapter.id]);

  const shuffled = useMemo(
    () => shuffleEvents(correctEvents, seed),
    [correctEvents, seed],
  );

  const toggleItem = (text: string) => {
    if (result) return;
    setSelected((prev) =>
      prev.includes(text) ? prev.filter((x) => x !== text) : [...prev, text],
    );
  };

  const handleCheck = async () => {
    const scored = scoreOrder(correctEvents, selected);
    let gemsAwarded = 0;
    if (scored.fullyCorrect) {
      const rewarded = await getMeta<string[]>("storyRewarded", []);
      if (!rewarded.includes(chapter.id)) {
        await recordLearningReward({ gemsDelta: 8, markDailyActivity: true });
        await setMeta("storyRewarded", [...rewarded, chapter.id]);
        gemsAwarded = 8;
      }
    }
    setResult({ ...scored, gemsAwarded });
  };

  const handleRetry = () => {
    setSeed((s) => (s + 37) & 0xffff);
    setSelected([]);
    setResult(null);
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#FAF7F2] dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 bg-emerald-700 text-white">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-200" />
            <div>
              <h2 className="font-bold text-sm">بازی ترتیب وقایع — فصل {toFarsiNum(chapter.order)}</h2>
              <p className="text-[11px] text-emerald-100">{chapter.titleFa}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/15"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-4 overflow-y-auto space-y-3">
          {loading && (
            <p className="text-center text-sm text-slate-500 py-6">در حال بارگذاری وقایع فصل...</p>
          )}
          {error && (
            <p className="text-center text-sm text-rose-600 py-4">{error}</p>
          )}
          {!loading && !error && (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                کارت‌های زیر را به ترتیب وقوع در این فصل از سورهٔ قصص لمس کنید تا شماره‌گذاری شوند (برای لغو انتخاب، دوباره روی کارت بزنید):
              </p>

              <div className="space-y-2.5">
                {shuffled.map((ev) => {
                  const orderIdx = selected.indexOf(ev);
                  const isPicked = orderIdx !== -1;
                  const isRightPos =
                    result !== null && isPicked && correctEvents[orderIdx] === ev;
                  const isWrongPos =
                    result !== null && isPicked && correctEvents[orderIdx] !== ev;

                  return (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => toggleItem(ev)}
                      disabled={result !== null}
                      className={`w-full text-right p-3.5 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                        isRightPos
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                          : isWrongPos
                          ? "border-rose-400 bg-rose-50 dark:bg-rose-950/40"
                          : isPicked
                          ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-300"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${
                          isPicked
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                        }`}
                      >
                        {isPicked ? toFarsiNum(orderIdx + 1) : "؟"}
                      </span>
                      <span className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                        {ev}
                      </span>
                    </button>
                  );
                })}
              </div>

              {result && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                    result.fullyCorrect
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200"
                      : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    {result.fullyCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>آفرین! ترتیب تمام وقایع این فصل کاملاً درست بود.</span>
                      </>
                    ) : (
                      <span>
                        {toFarsiNum(result.exact)} از {toFarsiNum(correctEvents.length)} واقعه در جای درست قرار داشت.
                      </span>
                    )}
                  </div>
                  {result.gemsAwarded > 0 && (
                    <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold">
                      <Sparkles className="w-4 h-4" />
                      <span>+{toFarsiNum(result.gemsAwarded)} عقیق پاداش این فصل به حساب شما اضافه شد.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                {!result ? (
                  <button
                    type="button"
                    disabled={selected.length !== correctEvents.length || correctEvents.length === 0}
                    onClick={() => void handleCheck()}
                    className="px-5 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40 hover:bg-emerald-700 transition-colors"
                  >
                    بررسی
                  </button>
                ) : result.fullyCorrect ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors"
                  >
                    بستن
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="px-4 py-2.5 rounded-2xl bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>تلاش دوباره</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
