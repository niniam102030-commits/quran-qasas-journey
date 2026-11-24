// src/pages/SettingsPage.tsx
import { useEffect, useState } from "react";
import { Moon, Sun, Volume2, VolumeX, Vibrate, RotateCcw, Download, Upload, ChevronRight, Check, AlertCircle, Bell, Mic, Trash2, Users, BookOpen, Wrench } from "lucide-react";
import { ldb, DEFAULT_USER_PROFILE } from "../db/learningDb";
import { createBackupPayload, parseAndValidateBackup, restoreValidatedBackup } from "../services/backupService";
import { bestReminderHour, syncDailyReminder } from "../services/reminderService";
import { loadFsrsTuningFromMeta, resetFsrsTuning } from "../services/fsrsTuningService";
import { getActiveProfile, profileAvatarLetter } from "../services/profileManager";
import { getMeta } from "../services/metaStore";
import type { SurahPackMeta } from "../services/surahPackService";
import {
  deleteSherpaModel,
  downloadSherpaModel,
  getSherpaModelStatus,
  MODEL_SIZE_MB,
  sherpaAsr,
  SHERPA_ONNX_VERSION,
} from "../services/sherpaAsr";
import { SURAH_PACK_REGISTRY } from "../config/surahConfig";
import { PACE_MODE_LIST } from "../learning/pace";
import { usePreferencesStore } from "../store/usePreferencesStore";

interface Props {
  onBack: () => void;
  onOpenProfiles?: () => void;
  onOpenSurahs?: () => void;
  onOpenDevTools?: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function SettingsPage({ onBack, onOpenProfiles, onOpenSurahs, onOpenDevTools }: Props) {
  const fontSize = usePreferencesStore((s) => s.arabicFontSize);
  const isDark = usePreferencesStore((s) => s.darkMode);
  const appTheme = usePreferencesStore((s) => s.appTheme);
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);
  const paceMode = usePreferencesStore((s) => s.paceMode);
  const autoFollowMushaf = usePreferencesStore((s) => s.autoFollowMushaf);
  const tajweedColorsEnabled = usePreferencesStore((s) => s.tajweedColorsEnabled);
  const offlineAsrEnabled = usePreferencesStore((s) => s.offlineAsrEnabled);
  const activeSurah = usePreferencesStore((s) => s.activeSurah);
  const devMode = usePreferencesStore((s) => s.devMode);
  const toggleDevMode = usePreferencesStore((s) => s.toggleDevMode);
  const reminderEnabled = usePreferencesStore((s) => s.reminderEnabled);
  const reminderHourOverride = usePreferencesStore((s) => s.reminderHourOverride);
  const handleFontSizeChange = usePreferencesStore((s) => s.setArabicFontSize);
  const handleToggleTheme = usePreferencesStore((s) => s.toggleDarkMode);
  const handleAppThemeChange = usePreferencesStore((s) => s.setAppTheme);
  const handleToggleSound = usePreferencesStore((s) => s.toggleSoundEnabled);
  const handleToggleHaptics = usePreferencesStore((s) => s.toggleHapticsEnabled);
  const handlePaceModeChange = usePreferencesStore((s) => s.setPaceMode);
  const toggleAutoFollowMushaf = usePreferencesStore((s) => s.toggleAutoFollowMushaf);
  const toggleTajweedColorsEnabled = usePreferencesStore((s) => s.toggleTajweedColorsEnabled);
  const toggleOfflineAsrEnabled = usePreferencesStore((s) => s.toggleOfflineAsrEnabled);
  const setReminderEnabled = usePreferencesStore((s) => s.setReminderEnabled);
  const setReminderHourOverride = usePreferencesStore((s) => s.setReminderHourOverride);

  const [autoReminderHour, setAutoReminderHour] = useState<number>(20);
  const [fsrsPersonalized, setFsrsPersonalized] = useState<boolean>(false);
  const [fsrsResetNotice, setFsrsResetNotice] = useState<string | null>(null);
  const [sherpaAvailable, setSherpaAvailable] = useState<boolean>(false);
  const [sherpaInstalled, setSherpaInstalled] = useState<boolean>(false);
  const [sherpaDownloading, setSherpaDownloading] = useState<boolean>(false);
  const [sherpaProgress, setSherpaProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [sherpaNotice, setSherpaNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    ldb.attempts.toArray().then((rows) => {
      if (active) setAutoReminderHour(bestReminderHour(rows));
    });
    loadFsrsTuningFromMeta().then((res) => {
      if (active) setFsrsPersonalized(res.personalized);
    });
    void Promise.all([sherpaAsr.isAvailable(), getSherpaModelStatus()]).then(([avail, st]) => {
      if (!active) return;
      setSherpaAvailable(avail);
      setSherpaInstalled(st.installed);
    });
    return () => {
      active = false;
    };
  }, []);

  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [resetSuccess, setResetSuccess] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Export JSON backup of user progress
  const handleExportBackup = async () => {
    try {
      const backupData = await createBackupPayload();

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qasas_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("خطا در ایجاد فایل پشتیبان: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Import JSON backup with strict schema validation
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const validated = parseAndValidateBackup(text);
      await restoreValidatedBackup(validated);

      setImportStatus("پشتیبان با موفقیت اعتبارسنجی و بازیابی شد!");
      setTimeout(() => setImportStatus(null), 3000);
    } catch (err) {
      alert("خطا در بارگذاری پشتیبان: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      e.target.value = "";
    }
  };

  // Full progress reset with double confirmation
  const handleResetProgress = async () => {
    try {
      let firstUnitId: string | null = null;
      if (activeSurah === 28) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL || "/"}content/manifest.json`);
          if (res.ok) {
            const manifest = (await res.json()) as { units: { id: string; order: number }[] };
            firstUnitId = manifest.units.slice().sort((a, b) => a.order - b.order)[0]?.id ?? null;
          }
        } catch {
          // fallback below
        }
      } else {
        const packMeta = await getMeta<SurahPackMeta | null>(`surahPackMeta:${activeSurah}`, null);
        firstUnitId = packMeta?.units?.[0]?.id ?? null;
      }

      await ldb.transaction("rw", [ldb.cards, ldb.attempts, ldb.confusions, ldb.unitProgress, ldb.profile], async () => {
        await ldb.cards.clear();
        await ldb.attempts.clear();
        await ldb.confusions.clear();
        await ldb.profile.put({ ...DEFAULT_USER_PROFILE, updatedAt: Date.now() });
        // Reset all units, keep all 22 half-pages unlocked for free choice
        const units = (await ldb.unitProgress.toArray()).sort((a, b) => a.unitId.localeCompare(b.unitId));
        void firstUnitId;
        for (const u of units) {
          u.unlocked = true;
          u.currentStage = 1;
          u.stagePassed = {};
          u.stageLessons = {};
          u.mastered = false;
          u.updatedAt = Date.now();
        }
        await ldb.unitProgress.bulkPut(units);
      });

      setShowResetConfirm(false);
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
    } catch (e) {
      alert("خطا در ریست کردن پیشرفت: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="min-h-screen bg-termeh-bg dark:bg-lapis-bg text-slate-900 dark:text-slate-100 pb-20 select-none">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-termeh-bg/95 dark:bg-lapis-card/95 backdrop-blur border-b border-termeh-border dark:border-lapis-border">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform"
            title="بازگشت"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-bold text-brand-amberDark dark:text-brand-amber">
              تنظیمات برنامه
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              سفارشی‌سازی ظاهر و پشتیبان‌گیری
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {/* ظاهر برنامه: پیش‌فرض / رز / وضعیت تیره جداگانه */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <div>
            <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              ظاهر برنامه
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              پالت رنگی دلخواه خود را انتخاب کنید؛ حالت روشن و تاریک به‌صورت مستقل روی هر دو پوسته اعمال می‌شود.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* کارت ۱: پیش‌فرض */}
            <button
              type="button"
              onClick={() => handleAppThemeChange("default")}
              className={`p-3 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-2.5 ${
                appTheme === "default"
                  ? "border-brand-primary bg-brand-primary/10 shadow-sm"
                  : "border-termeh-border dark:border-lapis-border bg-termeh-bg/60 dark:bg-lapis-bg/60 hover:border-brand-primary/60"
              }`}
              aria-pressed={appTheme === "default"}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                  پیش‌فرض (ترمه)
                </span>
                {appTheme === "default" && (
                  <span className="w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#FAF7F2" }} />
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#00A896" }} />
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#F59E0B" }} />
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#0B132B" }} />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                فیروزه‌ای و لاجورد کلاسیک
              </span>
            </button>

            {/* کارت ۲: رز */}
            <button
              type="button"
              onClick={() => handleAppThemeChange("rose")}
              className={`p-3 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-2.5 ${
                appTheme === "rose"
                  ? "border-brand-primary bg-brand-primary/10 shadow-sm"
                  : "border-termeh-border dark:border-lapis-border bg-termeh-bg/60 dark:bg-lapis-bg/60 hover:border-brand-primary/60"
              }`}
              aria-pressed={appTheme === "rose"}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                  رز (دخترانه)
                </span>
                {appTheme === "rose" && (
                  <span className="w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#FBF4F1" }} />
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#C9506B" }} />
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#C99A3C" }} />
                <span className="w-5 h-5 rounded-full border border-black/15" style={{ backgroundColor: "#261620" }} />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                گلاب، گل‌سرخی و طلایی اسلامی
              </span>
            </button>

            {/* کارت ۳: وضعیت تیره جداگانه */}
            <button
              type="button"
              onClick={handleToggleTheme}
              className={`p-3 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-2.5 ${
                isDark
                  ? "border-brand-amber bg-brand-amber/10 shadow-sm"
                  : "border-termeh-border dark:border-lapis-border bg-termeh-bg/60 dark:bg-lapis-bg/60 hover:border-brand-amber/60"
              }`}
              aria-pressed={isDark}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  {isDark ? <Moon className="w-4 h-4 text-brand-amber" /> : <Sun className="w-4 h-4 text-brand-amber" />}
                  <span>حالت تاریک</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                  {isDark ? "روشن" : "خاموش"}
                </span>
              </div>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span
                  className="w-5 h-5 rounded-full border border-black/15"
                  style={{ backgroundColor: appTheme === "rose" ? "#261620" : "#0B132B" }}
                />
                <span
                  className="w-5 h-5 rounded-full border border-black/15"
                  style={{ backgroundColor: appTheme === "rose" ? "#38202F" : "#1C2541" }}
                />
                <span
                  className="w-5 h-5 rounded-full border border-black/15"
                  style={{ backgroundColor: appTheme === "rose" ? "#E58CA0" : "#00A896" }}
                />
                <span
                  className="w-5 h-5 rounded-full border border-black/15"
                  style={{ backgroundColor: appTheme === "rose" ? "#D9AE5F" : "#F59E0B" }}
                />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {appTheme === "rose" ? "آلویی عمیق برای مطالعه شب" : "لاجورد شب برای مطالعه آرام"}
              </span>
            </button>
          </div>
        </section>
        {/* Multi-Profile Manager (C2) */}
        {onOpenProfiles && (
          <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white font-black flex items-center justify-center shrink-0">
                {profileAvatarLetter(getActiveProfile().name)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  پروفایل فعال: {getActiveProfile().name}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  مدیریت چند کاربر با داده‌های کاملاً جداگانه روی این دستگاه
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenProfiles}
              className="py-2 px-3.5 rounded-2xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-[#028090] dark:text-teal-300 font-bold text-xs flex items-center gap-1.5 shrink-0"
            >
              <Users className="w-4 h-4" />
              <span>تغییر پروفایل</span>
            </button>
          </section>
        )}

        {/* Multi-Surah Pack Manager (D) */}
        {onOpenSurahs && (
          <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white font-black flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  سورهٔ فعال: {activeSurah === 28 ? "سوره قصص" : `سوره شماره ${toFarsi(activeSurah)}`}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  نصب پک‌های سورهٔ تازه با بررسی SHA-256 و جابه‌جایی بدون حذف داده‌ها
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSurahs}
              className="py-2 px-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5 shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>مدیریت سوره‌ها</span>
            </button>
          </section>
        )}

        {/* Developer Test Mode */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-violet-200 dark:border-violet-900/60 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-violet-600 text-white font-black flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                حالت توسعه‌دهنده و تست سریع ({devMode ? "روشن" : "خاموش"})
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                باز کردن همهٔ مراحل، بازی‌های فصل، تزریق ۱۰۰۰ عقیق و دسترسی مستقیم به همهٔ ابزارها
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleDevMode}
              className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${
                devMode ? "bg-violet-600 justify-start" : "bg-slate-300 dark:bg-slate-600 justify-end"
              }`}
              aria-label="تغییر حالت توسعه‌دهنده"
            >
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </button>
            {onOpenDevTools && (
              <button
                type="button"
                onClick={onOpenDevTools}
                className="py-2 px-3 rounded-2xl bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-300 font-bold text-xs"
              >
                پنل تست
              </button>
            )}
          </div>
        </section>

        {/* Pace Mode & Daily Review Cap (F5) */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <div>
            <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              حالت سرعت و سقف مرور روزانه
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              سقف تعداد سؤال‌های جلسهٔ مرور روزانه را متناسب با وقت و سرعت پیشروی خود تنظیم کنید.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {PACE_MODE_LIST.map((mode) => {
              const active = paceMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handlePaceModeChange(mode.id)}
                  className={`p-3 rounded-2xl border-2 text-center transition-all space-y-1 ${
                    active
                      ? "bg-teal-50 dark:bg-teal-950/50 border-[#00A896] text-[#028090] dark:text-teal-300 shadow-sm"
                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-teal-400"
                  }`}
                >
                  <div className="font-black text-sm">{mode.labelFa}</div>
                  <div className="text-[11px] font-bold opacity-85">
                    {mode.dailyReviewCap.toLocaleString("fa-IR")} سؤال/روز
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {PACE_MODE_LIST.find((m) => m.id === paceMode)?.descriptionFa}
          </p>
        </section>

        {/* Arabic Font Size Setting */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            اندازه قلم متن عربی آیات ({fontSize} پیکسل)
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">کوچک</span>
            <input
              type="range"
              min={22}
              max={40}
              step={2}
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="flex-1 accent-amber-600 cursor-pointer"
            />
            <span className="text-xs text-slate-400">بزرگ</span>
          </div>
          {/* Live Preview */}
          <div
            className="text-center p-4 rounded-2xl bg-[#fcf9f2] dark:bg-slate-900 border border-amber-200/50 dark:border-slate-800 text-slate-800 dark:text-slate-100"
            style={{
              fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
              fontSize: `${fontSize}px`,
              lineHeight: 2.2,
            }}
          >
            بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ ۝۱
          </div>
        </section>

        {/* Display & Sound Toggles */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            پوسته و بازخورد حسی
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                {isDark ? <Moon className="w-5 h-5 text-amber-400" /> : <Sun className="w-5 h-5 text-amber-600" />}
                <span className="text-xs font-semibold">حالت تاریک</span>
              </div>
              <button
                onClick={handleToggleTheme}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  isDark ? "bg-amber-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                    isDark ? "left-1" : "right-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                {soundEnabled ? <Volume2 className="w-5 h-5 text-emerald-600" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
                <span className="text-xs font-semibold">جلوه‌های صوتی درست/غلط</span>
              </div>
              <button
                onClick={handleToggleSound}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  soundEnabled ? "bg-emerald-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                    soundEnabled ? "left-1" : "right-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <Vibrate className="w-5 h-5 text-blue-600" />
                <span className="text-xs font-semibold">لرزش لمسی</span>
              </div>
              <button
                onClick={handleToggleHaptics}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  hapticsEnabled ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                    hapticsEnabled ? "left-1" : "right-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block">دنبال‌کردن خودکار مصحف هنگام پخش پیوسته</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  در زمان پخش پیوسته، آیه فعال به‌طور خودکار در مرکز صفحه نگه داشته می‌شود.
                </span>
              </div>
              <button
                type="button"
                onClick={toggleAutoFollowMushaf}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  autoFollowMushaf ? "bg-teal-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                    autoFollowMushaf ? "left-1" : "right-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block">رنگ‌های تجوید در مصحف</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  نمایش رنگی کلمات دارای احکام تجوید (غنه، اخفا، ادغام، اقلاب، مد، قلقله)
                </span>
              </div>
              <button
                type="button"
                onClick={toggleTajweedColorsEnabled}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  tajweedColorsEnabled ? "bg-amber-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                    tajweedColorsEnabled ? "left-1" : "right-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* یادآور روزانه (U3) */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>یادآور روزانه</span>
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block">فعال‌سازی اعلان روزانه</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  ساعت فعلی یادآور: {toFarsi(reminderHourOverride ?? autoReminderHour)}:۰۰{" "}
                  {reminderHourOverride === null ? "(خودکار بر اساس عادت تمرین)" : "(دستی)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !reminderEnabled;
                  setReminderEnabled(next);
                  void syncDailyReminder({ requestPermission: next });
                }}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  reminderEnabled ? "bg-emerald-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                    reminderEnabled ? "left-1" : "right-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 text-xs">
              <label className="font-semibold" htmlFor="reminder-hour-select">
                انتخاب ساعت یادآور:
              </label>
              <select
                id="reminder-hour-select"
                value={reminderHourOverride === null ? "auto" : String(reminderHourOverride)}
                onChange={(e) => {
                  const val = e.target.value === "auto" ? null : Number(e.target.value);
                  setReminderHourOverride(val);
                  if (reminderEnabled) {
                    void syncDailyReminder({ requestPermission: false });
                  }
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 font-bold text-xs"
              >
                <option value="auto">خودکار ({toFarsi(autoReminderHour)}:۰۰)</option>
                {Array.from({ length: 19 }, (_, i) => i + 5).map((h) => (
                  <option key={h} value={h}>
                    ساعت {toFarsi(String(h).padStart(2, "0"))}:۰۰
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* FSRS Personal Tuning */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            شخصی‌سازی الگوریتم مرور (FSRS)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            وضعیت فعلی: {fsrsPersonalized ? "زمان‌بندی شخصی‌سازی‌شده فعال است" : "پیش‌فرض استاندارد"}
          </p>
          <button
            type="button"
            onClick={async () => {
              await resetFsrsTuning();
              setFsrsPersonalized(false);
              setFsrsResetNotice("شخصی‌سازی FSRS به مقادیر پیش‌فرض بازنشانی شد.");
              setTimeout(() => setFsrsResetNotice(null), 3000);
            }}
            className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>بازنشانی شخصی‌سازی FSRS</span>
          </button>
          {fsrsResetNotice && (
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{fsrsResetNotice}</span>
            </div>
          )}
        </section>

        {/* Active Surah & Reference Data */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-teal-600" />
              <span>تشخیص گفتار آفلاین تلاوت (sherpa-onnx {SHERPA_ONNX_VERSION})</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-black">
              آزمایشی — در حال ارزیابی روی دستگاه
            </span>
          </div>

          {!sherpaAvailable ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              موتور آفلاین sherpa-onnx فقط در برنامه بومی اندروید فعال است. در مرورگر وب در صورت پشتیبانی، تشخیص گفتار زنده از طریق Web Speech API (آنلاین) انجام می‌شود.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
                <div>
                  <span className="font-semibold block">استفاده از مدل آفلاین sherpa-onnx</span>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">
                    آزمایشی — در حال ارزیابی روی دستگاه
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!sherpaInstalled}
                  onClick={toggleOfflineAsrEnabled}
                  className={`w-12 h-6 rounded-full transition-colors relative shrink-0 disabled:opacity-45 ${
                    offlineAsrEnabled && sherpaInstalled ? "bg-teal-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                      offlineAsrEnabled && sherpaInstalled ? "left-1" : "right-1"
                    }`}
                  />
                </button>
              </div>

              {sherpaProgress && sherpaDownloading && (
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-teal-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 transition-all"
                      style={{
                        width:
                          sherpaProgress.total > 0
                            ? `${Math.min(100, Math.round((sherpaProgress.loaded / sherpaProgress.total) * 100))}%`
                            : "35%",
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    در حال دانلود و راستی‌آزمایی SHA-256 ({toFarsi(Math.round(sherpaProgress.loaded / 1048576))} مگابایت)...
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!sherpaInstalled ? (
                  <button
                    type="button"
                    disabled={sherpaDownloading}
                    onClick={async () => {
                      setSherpaDownloading(true);
                      setSherpaNotice(null);
                      try {
                        await downloadSherpaModel((loaded, total) => setSherpaProgress({ loaded, total }));
                        setSherpaInstalled(true);
                        setSherpaNotice("مدل تصحیح آفلاین با موفقیت دانلود و با SHA-256 راستی‌آزمایی شد.");
                      } catch (err) {
                        setSherpaNotice(err instanceof Error ? err.message : "خطا در دانلود مدل آفلاین.");
                      } finally {
                        setSherpaDownloading(false);
                        setSherpaProgress(null);
                      }
                    }}
                    className="flex-1 py-2.5 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>دانلود مدل تصحیح آفلاین — حدود {toFarsi(MODEL_SIZE_MB)} مگابایت</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteSherpaModel();
                      setSherpaInstalled(false);
                      setSherpaNotice("مدل تصحیح آفلاین از حافظه برنامه حذف شد.");
                    }}
                    className="flex-1 py-2.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف مدل آفلاین</span>
                  </button>
                )}
              </div>

              {sherpaNotice && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] font-bold">
                  {sherpaNotice}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Active Surah & Reference Data */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            سوره فعال و داده‌های مرجع
          </h2>
          <div className="space-y-2">
            {SURAH_PACK_REGISTRY.map((pack) => (
              <div
                key={pack.number}
                className="flex items-center justify-between p-3 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/60 text-xs"
              >
                <div>
                  <div className="font-bold text-teal-900 dark:text-teal-200">
                    سوره مبارکه {pack.nameFa} ({pack.nameAr}) — سوره {pack.number}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {pack.verseCount} آیه • {pack.unitCount} واحد نیم‌صفحه‌ای • همگام با داده مرجع QUL (صرف + تایم‌استمپ صوتی)
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                  فعال
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Backup and Restore */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            پشتیبان‌گیری و انتقال داده‌ها
          </h2>
          <p className="text-xs text-slate-500">
            می‌توانید پیشرفت و کارت‌های خود را در قالب یک فایل پشتیبان خروجی بگیرید یا در دستگاه دیگری بازیابی کنید:
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              onClick={handleExportBackup}
              className="flex-1 py-3 px-4 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>خروجی فایل پشتیبان</span>
            </button>

            <label className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95">
              <Upload className="w-4 h-4" />
              <span>بارگذاری و بازیابی پشتیبان</span>
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>

          {importStatus && (
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{importStatus}</span>
            </div>
          )}
        </section>

        {/* Reset Progress */}
        <section className="bg-termeh-card dark:bg-lapis-card p-4 sm:p-5 rounded-3xl border border-rose-200 dark:border-rose-950/60 shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-rose-700 dark:text-rose-400">
            شروع دوباره
          </h2>
          <p className="text-xs text-slate-500">
            با ریست کردن، تمام کارت‌ها و پاسخ‌های قبلی پاک شده و فقط واحد ۱ باز خواهد ماند:
          </p>

          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>ریست کردن کل پیشرفت یادگیری</span>
            </button>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>آیا مطمئن هستید؟ این عمل غیرقابل بازگشت است.</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleResetProgress}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all"
                >
                  بله، پاک شود
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition-all"
                >
                  انصراف
                </button>
              </div>
            </div>
          )}

          {resetSuccess && (
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>پیشرفت با موفقیت ریست شد.</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
