// src/pages/SettingsPage.tsx
import { useState } from "react";
import { Moon, Sun, Volume2, VolumeX, Vibrate, RotateCcw, Download, Upload, ChevronRight, Check, AlertCircle } from "lucide-react";
import { ldb, DEFAULT_USER_PROFILE } from "../db/learningDb";
import { createBackupPayload, parseAndValidateBackup, restoreValidatedBackup } from "../services/backupService";
import { usePreferencesStore } from "../store/usePreferencesStore";

interface Props {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: Props) {
  const fontSize = usePreferencesStore((s) => s.arabicFontSize);
  const isDark = usePreferencesStore((s) => s.darkMode);
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);
  const handleFontSizeChange = usePreferencesStore((s) => s.setArabicFontSize);
  const handleToggleTheme = usePreferencesStore((s) => s.toggleDarkMode);
  const handleToggleSound = usePreferencesStore((s) => s.toggleSoundEnabled);
  const handleToggleHaptics = usePreferencesStore((s) => s.toggleHapticsEnabled);

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
      try {
        const res = await fetch(`${import.meta.env.BASE_URL || "/"}content/manifest.json`);
        if (res.ok) {
          const manifest = (await res.json()) as { units: { id: string; order: number }[] };
          firstUnitId = manifest.units.slice().sort((a, b) => a.order - b.order)[0]?.id ?? null;
        }
      } catch {
        // fallback below
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
    <div className="min-h-screen bg-[#fcfaf5] dark:bg-[#121824] text-slate-900 dark:text-slate-100 pb-20 select-none">
      {/* Header */}
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
              تنظیمات برنامه
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              سفارشی‌سازی ظاهر و پشتیبان‌گیری
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Arabic Font Size Setting */}
        <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-3">
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
        <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-3">
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
          </div>
        </section>

        {/* Backup and Restore */}
        <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-[#e6dbc5] dark:border-slate-800 shadow-sm space-y-3">
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
        <section className="bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-3xl border border-rose-200 dark:border-rose-950/60 shadow-sm space-y-3">
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
