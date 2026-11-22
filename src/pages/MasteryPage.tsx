// src/pages/MasteryPage.tsx
import { useState, useEffect, useMemo } from "react";
import { Star, ChevronRight, AlertTriangle, Sparkles, CheckCircle2, CalendarDays, Wrench, GitCompare } from "lucide-react";
import { ldb, type StoredCard, type UnitProgressRow } from "../db/learningDb";
import { isGoldenVerse, skillLevel } from "../learning/mastery";
import { buildReviewForecast, findNearGoldenVerses } from "../learning/forecast";

interface Props {
  onBack: () => void;
  onSelectUnit?: (unitId: string) => void;
  onStartRemedial?: (tag?: string | null) => void;
  onOpenMutashabihat?: (verse?: number | null) => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

const CONFUSION_LABELS: Record<string, string> = {
  false_friend: "تله‌های معنایی و کلمات مشابه ظاهری (False Friends)",
  neighbor_verse: "خلط با آیات همسوار و قبل و بعد",
  neighbor_word: "خلط با واژگان مجاور در آیه",
  adjacent_number: "خطا در تشخیص شماره آیات مجاور",
  similar_verse: "متشابهات لفظی و آیات مشابه در سوره",
  same_root: "اشتباه در هم‌ریشه‌ها و ساختار اشتقاق",
  random: "سایر اشتباهات گزینه‌ای",
};

interface UnitDisplayRow extends UnitProgressRow {
  page?: number;
  half?: string;
  verseFrom?: number;
  verseTo?: number;
}

export default function MasteryPage({ onBack, onSelectUnit, onStartRemedial, onOpenMutashabihat }: Props) {
  const [cardsMap, setCardsMap] = useState<Map<string, StoredCard>>(new Map());
  const [allCardsList, setAllCardsList] = useState<StoredCard[]>([]);
  const [unitProgress, setUnitProgress] = useState<UnitDisplayRow[]>([]);
  const [confusions, setConfusions] = useState<{ tag: string; count: number }[]>([]);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [allCards, prog, allConfusions] = await Promise.all([
          ldb.cards.toArray(),
          ldb.unitProgress.toArray(),
          ldb.confusions.toArray(),
        ]);

        const map = new Map<string, StoredCard>();
        allCards.forEach((c) => map.set(c.key, c));
        setCardsMap(map);
        setAllCardsList(allCards);

        let orderById = new Map<string, number>();
        let infoById = new Map<string, { page: number; half: string; verseFrom: number; verseTo: number }>();
        try {
          const manifestRes = await fetch(`${import.meta.env.BASE_URL || "/"}content/manifest.json`);
          if (manifestRes.ok) {
            const manifest = (await manifestRes.json()) as {
              units: { id: string; order: number; page: number; half: string; verseFrom: number; verseTo: number }[];
            };
            orderById = new Map(manifest.units.map((u) => [u.id, u.order]));
            infoById = new Map(manifest.units.map((u) => [u.id, u]));
          }
        } catch {
          // fallback to unitId ordering
        }

        const sortedProg: UnitDisplayRow[] = prog
          .slice()
          .sort(
            (a, b) =>
              (orderById.get(a.unitId) ?? Number.MAX_SAFE_INTEGER) -
                (orderById.get(b.unitId) ?? Number.MAX_SAFE_INTEGER) ||
              a.unitId.localeCompare(b.unitId),
          )
          .map((u) => ({ ...u, ...infoById.get(u.unitId) }));
        setUnitProgress(sortedProg);

        // Aggregate top confusions
        const counts = new Map<string, number>();
        for (const cf of allConfusions) {
          const tag = cf.chosenTag || "random";
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
        const sortedConfusions = [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);
        setConfusions(sortedConfusions);
      } catch (e) {
        console.error("Failed to load mastery data:", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalGoldenVerses = Array.from({ length: 88 }, (_, i) => i + 1).filter((v) =>
    isGoldenVerse(v, cardsMap)
  ).length;
  const forecast = useMemo(() => buildReviewForecast(allCardsList), [allCardsList]);
  const maxForecast = Math.max(1, ...forecast.map((d) => d.dueCount));
  const nearGolden = useMemo(() => findNearGoldenVerses(cardsMap), [cardsMap]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fcfaf5] dark:bg-[#121824] flex flex-col items-center justify-center gap-3 text-amber-600 dark:text-amber-400">
        <Sparkles className="w-8 h-8 animate-pulse" />
        <span className="text-sm font-medium">در حال تحلیل وضعیت تسلط...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfaf5] dark:bg-[#121824] text-slate-900 dark:text-slate-100 pb-20 select-none">
      {/* Top Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#f7f2e4]/95 dark:bg-[#1a2332]/95 backdrop-blur border-b border-[#e6dbc5] dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform"
            title="بازگشت"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-bold text-[#8a5b29] dark:text-amber-400">
              تسلط بر ۸۸ آیه سوره قصص
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              آیات طلایی و تحلیل یادگیری
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/60 px-3 py-1.5 rounded-2xl border border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-300 font-bold text-xs">
          <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
          <span>{toFarsiNum(totalGoldenVerses)} / ۸۸ طلایی</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Golden Verses Info Card */}
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-900/10 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-200" />
              <h2 className="font-extrabold text-base sm:text-lg">شبکه تسلط بر آیات (۸۸ آیه)</h2>
            </div>
            <p className="text-xs sm:text-sm text-amber-100 max-w-md">
              آیه‌ای طلایی است که هر ۴ مهارت (بازیابی متن، ترجمه، شماره آیه و تسلسل بعد) در سطح ۳ پایدار باشند.
            </p>
          </div>
          <div className="text-center bg-white/20 backdrop-blur-md rounded-2xl p-3 min-w-[5rem]">
            <div className="text-2xl font-black">{toFarsiNum(Math.round((totalGoldenVerses / 88) * 100))}%</div>
            <div className="text-[10px] text-amber-100 font-medium">تسلط کل سوره</div>
          </div>
        </div>

        {/* 88 Verses Grid */}
        <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">
              جدول پیشرفت آیات (برای جزئیات روی آیه بزنید)
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> طلایی
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> پایدار
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700"></span> در حال یادگیری
              </span>
            </div>
          </div>

          <div className="grid grid-cols-8 sm:grid-cols-11 gap-2 pt-2">
            {Array.from({ length: 88 }, (_, i) => i + 1).map((vNum) => {
              const golden = isGoldenVerse(vNum, cardsMap);
              const vrLvl = skillLevel(cardsMap.get(`vr:${vNum}`));
              const vtLvl = skillLevel(cardsMap.get(`vt:${vNum}`));
              const avgLvl = (vrLvl + vtLvl) / 2;

              return (
                <button
                  key={vNum}
                  onClick={() => setSelectedVerse(selectedVerse === vNum ? null : vNum)}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-2xl font-bold text-xs transition-all active:scale-95 ${
                    golden
                      ? "bg-amber-400 text-amber-950 shadow-sm ring-2 ring-amber-300"
                      : avgLvl >= 2
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      : avgLvl >= 1
                      ? "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <span>{toFarsiNum(vNum)}</span>
                  {golden && (
                    <Star className="w-2.5 h-2.5 fill-amber-900 text-amber-900 absolute top-1 right-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Verse Detail Modal / Drawer */}
          {selectedVerse && (
            <div className="mt-4 p-4 rounded-2xl bg-amber-50/80 dark:bg-slate-800/80 border border-amber-200 dark:border-slate-700 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-300">
                <span>وضعیت مهارت‌های آیه {toFarsiNum(selectedVerse)}:</span>
                <div className="flex items-center gap-2">
                  {onOpenMutashabihat && (
                    <button
                      type="button"
                      onClick={() => onOpenMutashabihat(selectedVerse)}
                      className="px-2 py-0.5 rounded-lg bg-amber-200/70 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 flex items-center gap-1 hover:bg-amber-200"
                    >
                      <GitCompare className="w-3 h-3" />
                      <span>متشابهات این آیه</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedVerse(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    بستن
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  { key: `vr:${selectedVerse}`, label: "بازیابی متن (vr)" },
                  { key: `vt:${selectedVerse}`, label: "ترجمه (vt)" },
                  { key: `vn:${selectedVerse}`, label: "شماره آیه (vn)" },
                  { key: `sq:${selectedVerse}`, label: "تسلسل بعد (sq)" },
                ].map((item) => {
                  const card = cardsMap.get(item.key);
                  const lvl = skillLevel(card);
                  return (
                    <div
                      key={item.key}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-100 dark:border-slate-800 text-center space-y-1"
                    >
                      <div className="text-[10px] text-slate-500">{item.label}</div>
                      <div
                        className={`font-bold ${
                          lvl === 3
                            ? "text-amber-600 dark:text-amber-400"
                            : lvl >= 1
                            ? "text-emerald-600"
                            : "text-slate-400"
                        }`}
                      >
                        سطح {toFarsiNum(lvl)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Units Progress Breakdown */}
        <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">
            پیشرفت واحدهای یادگیری (۲۲ واحد)
          </h3>
          <div className="space-y-2">
            {unitProgress.map((u, idx) => {
              const passedCount = Object.values(u.stagePassed || {}).filter(Boolean).length;
              return (
                <div
                  key={u.unitId}
                  onClick={() => {
                    if (u.unlocked) onSelectUnit?.(u.unitId);
                  }}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                    u.unlocked
                      ? "bg-slate-50 dark:bg-slate-850 hover:bg-amber-50/50 cursor-pointer border-slate-200 dark:border-slate-700"
                      : "opacity-60 bg-slate-100/50 dark:bg-slate-900/50 border-dashed border-slate-200 dark:border-slate-800 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                        passedCount === 8
                          ? "bg-amber-400 text-amber-950"
                          : u.unlocked
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {toFarsiNum(idx + 1)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {u.page
                          ? `صفحه ${toFarsiNum(u.page)} (${u.half === "a" ? "نیمه اول" : "نیمه دوم"}) — آیات ${toFarsiNum(u.verseFrom ?? 1)} تا ${toFarsiNum(u.verseTo ?? 1)}`
                          : `واحد ${toFarsiNum(idx + 1)} (${u.unitId})`}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {u.unlocked ? `مرحله جاری: ${toFarsiNum(u.currentStage)} از ۸` : "قفل"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      {toFarsiNum(passedCount)} / ۸ مرحله
                    </span>
                    {passedCount === 8 && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 7-Day FSRS Forecast & Near-Golden Verses */}
        <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-700 dark:text-slate-200">
              <CalendarDays className="w-4 h-4 text-amber-600" />
              <span>پیش‌بینی مرورهای ۷ روز آینده (FSRS)</span>
            </div>
            <span className="text-[11px] text-slate-500">
              مجموع: {toFarsiNum(forecast.reduce((a, b) => a + b.dueCount, 0))} کارت
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 items-end h-28 pt-2">
            {forecast.map((day) => {
              const heightPct = day.dueCount === 0 ? 6 : Math.max(18, Math.round((day.dueCount / maxForecast) * 100));
              return (
                <div key={day.dayOffset} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    {toFarsiNum(day.dueCount)}
                  </span>
                  <div className="w-full max-w-[2.2rem] bg-slate-100 dark:bg-slate-800 rounded-t-xl h-16 flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-t-xl transition-all ${
                        day.dayOffset === 0 ? "bg-amber-500" : "bg-amber-400/75 dark:bg-amber-600/75"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-full">{day.label}</span>
                </div>
              );
            })}
          </div>

          {nearGolden.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
                آیات نزدیک به طلایی‌شدن ({toFarsiNum(nearGolden.length)} آیه):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {nearGolden.slice(0, 12).map((ng) => (
                  <button
                    key={ng.verse}
                    type="button"
                    onClick={() => setSelectedVerse(ng.verse)}
                    className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100 transition-colors"
                  >
                    آیه {toFarsiNum(ng.verse)} ({toFarsiNum(ng.level3Count)}/۴)
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Most Frequent Confusions & Traps + Smart Remedial Mode */}
        {confusions.length > 0 && (
          <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>تحلیل تله‌ها و خطاهای پرتکرار شما</span>
              </div>
              {onStartRemedial && (
                <button
                  type="button"
                  onClick={() => onStartRemedial(null)}
                  className="py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>تمرین ترمیمی هوشمند</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              سیستم بر اساس این خطاها، جلسه تمرین ترمیمی هدفمند برای رفع اشکال شما می‌سازد:
            </p>
            <div className="space-y-2 pt-1">
              {confusions.map((c) => (
                <div
                  key={c.tag}
                  className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-xs"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {CONFUSION_LABELS[c.tag] || c.tag}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      {toFarsiNum(c.count)} خطا
                    </span>
                    {onStartRemedial && (
                      <button
                        type="button"
                        onClick={() => onStartRemedial(c.tag)}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-100/60 transition-colors"
                      >
                        تمرین
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
