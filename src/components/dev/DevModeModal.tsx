// src/components/dev/DevModeModal.tsx
// پنل حالت توسعه‌دهنده و تست سریع تمام بخش‌ها و مراحل برنامه
import { useState } from "react";
import {
  Wrench,
  X,
  Sparkles,
  Award,
  RotateCcw,
  BookOpen,
  ShieldCheck,
  GitCompare,
  Headphones,
  Palette,
  Users,
  Settings,
  Target,
  Flame,
  Eye,
  Play,
  Loader2,
} from "lucide-react";
import { usePreferencesStore } from "../../store/usePreferencesStore";
import {
  markAllStagesPassed,
  resetOnboardingForDev,
  seedDevTestData,
} from "../../services/devModeService";
import type { AppView } from "../../App";

interface Props {
  onClose: () => void;
  onRefresh: () => void;
  onReopenOnboarding: () => void;
  onNavigateView: (view: AppView) => void;
  onStartDailyReview: () => void;
  onStartRemedial: () => void;
  onStartBlindSpots: () => void;
  onStartDrill: () => void;
  onStartExam: () => void;
  onOpenMutashabihat: () => void;
  onOpenMushafUnit1: () => void;
}

export default function DevModeModal({
  onClose,
  onRefresh,
  onReopenOnboarding,
  onNavigateView,
  onStartDailyReview,
  onStartRemedial,
  onStartBlindSpots,
  onStartDrill,
  onStartExam,
  onOpenMutashabihat,
  onOpenMushafUnit1,
}: Props) {
  const devMode = usePreferencesStore((s) => s.devMode);
  const setDevMode = usePreferencesStore((s) => s.setDevMode);
  const toggleDevMode = usePreferencesStore((s) => s.toggleDevMode);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const handleSeedAll = async () => {
    setBusy(true);
    setStatusText(null);
    try {
      setDevMode(true);
      const res = await seedDevTestData();
      onRefresh();
      setStatusText(
        `حالت توسعه‌دهنده روشن شد: ${res.unlockedUnits} واحد باز و ${res.seededCards} کارت + ۱۰۰۰ عقیق + نقاط کور + سبق/سبقی/منزل ساخته شد.`,
      );
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePassAllStages = async () => {
    setBusy(true);
    setStatusText(null);
    try {
      setDevMode(true);
      const res = await markAllStagesPassed();
      onRefresh();
      setStatusText(
        `همهٔ ${res.updatedUnits} واحد (مراحل ۱ تا ۸) و تمام مدال‌های فصل‌ها به‌صورت کامل پاس شدند.`,
      );
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleReopenOnboarding = async () => {
    setBusy(true);
    try {
      await resetOnboardingForDev();
      onClose();
      onReopenOnboarding();
    } finally {
      setBusy(false);
    }
  };

  const quickLaunch = (fn: () => void) => {
    setDevMode(true);
    onClose();
    fn();
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="w-full max-w-xl bg-[#FAF7F2] dark:bg-[#0F172A] rounded-3xl border-2 border-violet-400/70 dark:border-violet-700 shadow-2xl overflow-hidden my-auto">
        <header className="px-4 py-3.5 bg-gradient-to-l from-violet-700 to-indigo-700 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-sm sm:text-base font-black">حالت توسعه‌دهنده و تست سریع</h2>
              <p className="text-[11px] text-violet-100">
                دسترسی آزاد به همهٔ مراحل، بازی‌های فصل، ابزارها و داده‌های تست
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنل توسعه‌دهنده"
            className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          {/* سوئیچ اصلی devMode */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="font-black text-slate-800 dark:text-slate-100">
                حالت آزاد توسعه‌دهنده ({devMode ? "روشن" : "خاموش"})
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                با روشن‌بودن این گزینه، بازی ترتیب وقایع، پیش‌غربال، آزمون میانبر و چرخهٔ مراجعه بدون محدودیت باز می‌شوند.
              </div>
            </div>
            <button
              type="button"
              onClick={toggleDevMode}
              className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                devMode ? "bg-violet-600 justify-start" : "bg-slate-300 dark:bg-slate-600 justify-end"
              }`}
              aria-label="تغییر وضعیت حالت توسعه‌دهنده"
            >
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </button>
          </div>

          {/* توصیه برای جداسازی پروفایل تست */}
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
            <strong>نکته:</strong> اگر می‌خواهید پیشرفت شخصی فعلی‌تان دست‌نخورده بماند، ابتدا از بخش «پروفایل‌ها» یک پروفایل تازه (مثلاً «تست») بسازید و دکمه‌های تزریق داده را روی آن بزنید.
          </div>

          {/* دکمه‌های عملیات ساخت داده */}
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSeedAll()}
              className="w-full py-3 px-4 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>فعال‌سازی + ساخت دادهٔ تست کامل (۱۰۰۰ عقیق، نقاط کور، سبق/سبقی/منزل)</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePassAllStages()}
                className="py-2.5 px-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Award className="w-4 h-4" />
                <span>پاس کردن کامل همه مراحل و مدال‌ها</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleReopenOnboarding()}
                className="py-2.5 px-3.5 rounded-2xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-extrabold flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>اجرای مجدد صفحهٔ آنبوردینگ</span>
              </button>
            </div>
          </div>

          {statusText && (
            <div
              role="status"
              className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-[11px]"
            >
              {statusText}
            </div>
          )}

          {/* دسترسی مستقیم به همهٔ صفحات و نشست‌ها */}
          <div className="space-y-2 pt-1">
            <h3 className="font-black text-slate-700 dark:text-slate-200">
              پرش سریع به تمام بخش‌ها و نشست‌های تست:
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => quickLaunch(onOpenMushafUnit1)}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Eye className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="truncate">مصحف واحد ۱ (تجوید/صوت)</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(onStartExam)}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate">آزمون تخصصی (A2)</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(onStartDrill)}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <GitCompare className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="truncate">دریل اتصال (A3)</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(() => onNavigateView("audioQuiz"))}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Headphones className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="truncate">آزمون صوتی حفظ</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(onOpenMutashabihat)}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <GitCompare className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">مقایسه متشابهات</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(() => onNavigateView("tajweed"))}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Palette className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="truncate">مینی‌درس تجوید (B2)</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(() => onNavigateView("profiles"))}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="truncate">پروفایل‌ها (C2)</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(() => onNavigateView("surahs"))}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="truncate">پک‌های سوره (D)</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(() => onNavigateView("mastery"))}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Award className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="truncate">تسلط، باغ و FSRS</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(() => onNavigateView("profile"))}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Flame className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="truncate">چله، فروشگاه و کش صوت</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(onStartDailyReview)}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Play className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">مرور هوشمند روزانه</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(onStartBlindSpots)}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Target className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="truncate">بستهٔ نقاط کور</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(onStartRemedial)}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Wrench className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="truncate">تمرین ترمیمی</span>
              </button>
              <button
                type="button"
                onClick={() => quickLaunch(() => onNavigateView("settings"))}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-700 hover:border-violet-400 font-bold flex items-center gap-1.5"
              >
                <Settings className="w-4 h-4 text-slate-600 shrink-0" />
                <span className="truncate">تنظیمات و ASR آفلاین</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
