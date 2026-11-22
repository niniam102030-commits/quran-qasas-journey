// src/pages/UnitsPage.tsx
// فهرست ۲۲ واحد (نیم‌صفحه)، پیشرفت مراحل ۱ تا ۸، چراغ‌های غیرمسدودکننده، دسترسی به مصحف، تسلط و تنظیمات.
import { useEffect, useState } from "react";
import { Award, Settings, Bell, Lock, Check, ChevronRight, Play, Eye } from "lucide-react";
import { ldb, type UnitProgressRow } from "../db/learningDb";
import { reviewDebt, type StoredCard } from "../learning/cardScheduler";
import { skillLevel } from "../learning/mastery";
import MushafHalfPage from "../components/mushaf/MushafHalfPage";
import MasteryPage from "./MasteryPage";
import SettingsPage from "./SettingsPage";

interface UnitInfo extends UnitProgressRow {
  verseFrom?: number;
  verseTo?: number;
  page?: number;
  half?: string;
}

interface Props {
  onStartStage: (unitId: string, stage: number) => void;
  onBack: () => void;
  syncVersion?: number;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

export default function UnitsPage({ onStartStage, onBack, syncVersion }: Props) {
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [debt, setDebt] = useState(0);
  const [masteryCount, setMasteryCount] = useState({ total: 0, level3: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Sub-views
  const [mushafUnitId, setMushafUnitId] = useState<string | null>(null);
  const [showMastery, setShowMastery] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prog, cards] = await Promise.all([ldb.unitProgress.toArray(), ldb.cards.toArray()]);
      const manifestRes = await fetch(`${import.meta.env.BASE_URL || "/"}content/manifest.json`);
      if (!manifestRes.ok) throw new Error(`فهرست محتوا: ${manifestRes.status}`);
      const manifest = await manifestRes.json();
      const info = new Map<string, { verseFrom: number; verseTo: number; page: number; half: string }>(
        manifest.units.map((u: { id: string; verseFrom: number; verseTo: number; page: number; half: string }) => [u.id, u])
      );
      const orderById = new Map<string, number>(manifest.units.map((u: { id: string; order: number }) => [u.id, u.order] as [string, number]));
      setUnits(prog.slice().sort((a, b) => (orderById.get(a.unitId) ?? Number.MAX_SAFE_INTEGER) - (orderById.get(b.unitId) ?? Number.MAX_SAFE_INTEGER)).map((p) => ({ ...p, ...info.get(p.unitId) })));
      setDebt(reviewDebt(cards));
      setMasteryCount({
        total: cards.length,
        level3: cards.filter((c: StoredCard) => skillLevel(c) >= 3).length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [syncVersion]);

  if (mushafUnitId) {
    return (
      <MushafHalfPage
        unitId={mushafUnitId}
        onClose={() => setMushafUnitId(null)}
        onStartPractice={() => {
          const u = units.find((x) => x.unitId === mushafUnitId);
          onStartStage(mushafUnitId, u?.currentStage || 1);
        }}
      />
    );
  }

  if (showMastery) {
    return (
      <MasteryPage
        onBack={() => setShowMastery(false)}
        onSelectUnit={(uid) => {
          setShowMastery(false);
          setMushafUnitId(uid);
        }}
      />
    );
  }

  if (showSettings) {
    return <SettingsPage onBack={() => { setShowSettings(false); loadData(); }} />;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#fcfaf5] dark:bg-[#121824] text-slate-900 dark:text-slate-100 pb-20 select-none">
      {/* Top App Bar */}
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
            <h1 className="text-base font-extrabold text-[#8a5b29] dark:text-amber-400">
              واحدهای سوره قصص
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ۲۲ نیم‌صفحه • مصحف مدینه
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowMastery(true)}
            className="p-2 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-all"
            title="جدول تسلط بر ۸۸ آیه"
          >
            <Award className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">تسلط ({toFarsiNum(masteryCount.level3)})</span>
            <span className="sm:hidden text-[10px]">{toFarsiNum(masteryCount.level3)}</span>
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
            title="تنظیمات"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-5 space-y-4">
        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 text-rose-800 dark:text-rose-200 text-sm">
            <p className="font-bold">خطا در بارگذاری داده‌ها: {error}</p>
            <button type="button" onClick={() => void loadData()} className="mt-2 rounded-md bg-rose-700 px-3 py-2 text-white">تلاش دوباره</button>
          </div>
        )}

        {/* Non-blocking Lamps: Daily Review & Debt Warning */}
        <section className="space-y-2.5">
          {debt > 0 && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/30 border border-amber-300/80 dark:border-amber-800/80 shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-900/20">
                  <Bell className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-200">
                    {toFarsiNum(debt)} کارت آماده مرور روزانه
                  </h3>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                    مرور به موقع مانع فراموشی و افزایش بدهی می‌شود.
                  </p>
                </div>
              </div>

              <button
                onClick={() => onStartStage("", 0)}
                className="py-2.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-amber-900/10 shrink-0 transition-all flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>مرور روزانه</span>
              </button>
            </div>
          )}

          {debt >= 40 && (
            <div className="p-3.5 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">هشدار سقف بدهی مرور: </span>
                <span>
                  بدهی مرور شما {toFarsiNum(debt)} کارت است (سقف مجاز: ۴۰). واحدهای بعد تا انجام مرورها بسته می‌مانند، اما می‌توانید مرور روزانه و مراحل قبلی را آزادانه تمرین کنید.
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 22 Learning Units Cards */}
        <section className="space-y-3">
          {units.length === 0 && !error && loading && (
            <div className="p-8 text-center bg-white dark:bg-[#1a2332] rounded-3xl border border-[#e6dbc5] dark:border-slate-800 space-y-3 shadow-sm">
              <div className="w-8 h-8 mx-auto border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">در حال دریافت و نمایش واحدهای آموزشی سوره قصص...</p>
            </div>
          )}
          {!loading && !error && units.length === 0 && (
            <div role="status" className="p-6 text-center text-sm text-slate-600">هیچ واحدی در محتوای محلی پیدا نشد. همگام‌سازی محتوا را دوباره اجرا کنید.</div>
          )}
          {units.map((u, idx) => {
            const passedCount = Object.values(u.stagePassed || {}).filter(Boolean).length;
            const isComplete = passedCount === 8;

            return (
              <div
                key={u.unitId}
                className={`p-4 sm:p-5 rounded-3xl border-2 transition-all space-y-3.5 ${
                  u.unlocked
                    ? "bg-white dark:bg-[#1a2332] border-[#e6dbc5] dark:border-slate-800 shadow-sm"
                    : "opacity-60 bg-slate-50/50 dark:bg-slate-900/50 border-dashed border-slate-200 dark:border-slate-800"
                }`}
              >
                {/* Unit Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center font-extrabold text-sm ${
                        isComplete
                          ? "bg-amber-400 text-amber-950 shadow-sm"
                          : u.unlocked
                          ? "bg-[#b37e3d] text-white shadow-sm"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                      }`}
                    >
                      {toFarsiNum(idx + 1)}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <span>
                          صفحه {toFarsiNum(u.page || "")} ({u.half === "a" ? "نیمه اول" : "نیمه دوم"})
                        </span>
                        {!u.unlocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        آیات {toFarsiNum(u.verseFrom || 1)} تا {toFarsiNum(u.verseTo || 1)}
                      </p>
                    </div>
                  </div>

                  {u.unlocked && (
                    <button
                      onClick={() => setMushafUnitId(u.unitId)}
                      className="py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>مصحف</span>
                    </button>
                  )}
                </div>

                {/* 8 Learning Stages Pills */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
                    const passed = !!u.stagePassed[s];
                    const open = u.unlocked && (s === 1 || !!u.stagePassed[s - 1] || passed);

                    return (
                      <button
                        key={s}
                        disabled={!open}
                        onClick={() => onStartStage(u.unitId, s)}
                        className={`w-10 h-10 rounded-2xl font-black text-xs transition-all flex items-center justify-center active:scale-95 ${
                          passed
                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-900/10"
                            : open
                            ? "bg-white dark:bg-slate-800 border-2 border-amber-500 text-amber-700 dark:text-amber-400 shadow-sm"
                            : "bg-slate-100 dark:bg-slate-850 text-slate-300 dark:text-slate-600 border border-transparent cursor-not-allowed"
                        }`}
                        title={`مرحله ${s}: ${
                          s === 1
                            ? "واژگان سخت"
                            : s === 2
                            ? "ترجمه"
                            : s === 3
                            ? "ساخت آیه"
                            : s === 4
                            ? "جای‌خالی"
                            : s === 5
                            ? "قبل و بعد"
                            : s === 6
                            ? "شماره آیات"
                            : s === 7
                            ? "یادآوری کل"
                            : "آزمون تسلط"
                        }`}
                      >
                        {passed ? <Check className="w-4 h-4 stroke-[3]" /> : toFarsiNum(s)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
