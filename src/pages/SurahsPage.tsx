// src/pages/SurahsPage.tsx
// مدیریت پک‌های چندسوره‌ای (بخش D): نمایش سوره‌های نصب‌شده، کاتالوگ آنلاین، دانلود با SHA-256، واردکردن فایل محلی و جابه‌جایی سوره
import { useEffect, useState } from "react";
import {
  ChevronRight,
  BookOpen,
  Download,
  CheckCircle2,
  Trash2,
  Upload,
  ShieldCheck,
  WifiOff,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  downloadSurahPackWithProgress,
  fetchPacksCatalog,
  listInstalledSurahs,
  uninstallSurahPack,
  validateAndInstallSurahPack,
  type InstalledSurahInfo,
  type PacksCatalogEntry,
  type SurahPackFile,
} from "../services/surahPackService";
import { getActiveProfile } from "../services/profileManager";
import { usePreferencesStore } from "../store/usePreferencesStore";

interface Props {
  onBack: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function SurahsPage({ onBack }: Props) {
  const activeSurah = usePreferencesStore((s) => s.activeSurah);
  const setActiveSurah = usePreferencesStore((s) => s.setActiveSurah);

  const [installed, setInstalled] = useState<InstalledSurahInfo[]>([]);
  const [catalog, setCatalog] = useState<PacksCatalogEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingInstalled, setLoadingInstalled] = useState(true);
  const [downloadState, setDownloadState] = useState<{
    surah: number;
    loadedBytes: number;
    totalBytes: number;
    stage: "downloading" | "verifying";
  } | null>(null);
  const [confirmDeleteSurah, setConfirmDeleteSurah] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refreshInstalled = async () => {
    setLoadingInstalled(true);
    try {
      const list = await listInstalledSurahs();
      setInstalled(list);
    } finally {
      setLoadingInstalled(false);
    }
  };

  useEffect(() => {
    void refreshInstalled();
    let active = true;
    setLoadingCatalog(true);
    fetchPacksCatalog()
      .then((list) => {
        if (!active) return;
        setCatalog(list);
      })
      .finally(() => {
        if (active) setLoadingCatalog(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleActivateSurah = (surahNumber: number) => {
    setActiveSurah(surahNumber);
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleDownloadAndInstall = async (entry: PacksCatalogEntry) => {
    if (downloadState) return;
    setNotice(null);
    setDownloadState({
      surah: entry.surah,
      loadedBytes: 0,
      totalBytes: entry.sizeKb * 1024,
      stage: "downloading",
    });
    try {
      const pack = await downloadSurahPackWithProgress(entry.url, (loadedBytes, totalBytes) => {
        setDownloadState({
          surah: entry.surah,
          loadedBytes,
          totalBytes: totalBytes || entry.sizeKb * 1024,
          stage: "downloading",
        });
      });
      setDownloadState({
        surah: entry.surah,
        loadedBytes: entry.sizeKb * 1024,
        totalBytes: entry.sizeKb * 1024,
        stage: "verifying",
      });
      const meta = await validateAndInstallSurahPack(pack);
      await refreshInstalled();
      setNotice({
        kind: "ok",
        text: `پک «${meta.nameFa}» پس از تأیید امضای SHA-256 با موفقیت نصب شد.`,
      });
    } catch (e) {
      setNotice({
        kind: "err",
        text: e instanceof Error ? e.message : "خطا در دریافت یا نصب پک سوره.",
      });
    } finally {
      setDownloadState(null);
    }
  };

  const handleImportLocalPack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SurahPackFile;
      const meta = await validateAndInstallSurahPack(parsed);
      await refreshInstalled();
      setNotice({
        kind: "ok",
        text: `فایل پک «${meta.nameFa}» با امضای SHA-256 معتبر نصب شد.`,
      });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "فایل پک سوره معتبر نیست.",
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleUninstall = async (surahNumber: number) => {
    setNotice(null);
    try {
      const wasActive = activeSurah === surahNumber;
      await uninstallSurahPack(surahNumber);
      setConfirmDeleteSurah(null);
      await refreshInstalled();
      if (wasActive && typeof window !== "undefined") {
        window.location.reload();
        return;
      }
      setNotice({ kind: "ok", text: "پک سوره حذف شد. داده‌های سایر سوره‌ها و پروفایل‌ها دست‌نخورده ماندند." });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const installedSet = new Set(installed.map((s) => s.surahNumber));
  const downloadableCatalog = catalog.filter((c) => !installedSet.has(c.surah) && c.surah !== 28);
  const activeProfile = getActiveProfile();

  return (
    <div dir="rtl" className="min-h-screen islamic-bg bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-3 bg-[#FAF7F2]/95 dark:bg-[#0B132B]/95 backdrop-blur border-b-2 border-[#d4af37]/50 dark:border-teal-800/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            title="بازگشت"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-extrabold text-[#8a5b29] dark:text-amber-400">
              پک‌های سوره و انتخاب سورهٔ فعال
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              پروفایل فعال: {activeProfile.name} • نصب و جابه‌جایی ایمن با راستی‌آزمایی SHA-256
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        {notice && (
          <div
            role="status"
            className={`p-3.5 rounded-2xl border text-xs font-bold ${
              notice.kind === "ok"
                ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* سوره‌های نصب‌شده روی این پروفایل */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#028090]" />
              <span>سوره‌های نصب‌شده</span>
            </h2>
            <label className="py-1.5 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>بارگذاری فایل .pack.json</span>
              <input type="file" accept=".json,.pack.json" onChange={handleImportLocalPack} className="hidden" />
            </label>
          </div>

          {loadingInstalled ? (
            <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>در حال بارگذاری سوره‌های نصب‌شده...</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {installed.map((s) => {
                const isActive = activeSurah === s.surahNumber;
                const confirming = confirmDeleteSurah === s.surahNumber;
                return (
                  <div
                    key={s.surahNumber}
                    className={`p-4 rounded-3xl bg-white dark:bg-[#1a2332] border-2 space-y-2.5 shadow-sm ${
                      isActive
                        ? "border-[#00A896] dark:border-teal-500"
                        : "border-[#e6dbc5] dark:border-slate-800"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-800 dark:text-white">
                            {s.nameFa} {s.nameAr ? `(${s.nameAr})` : ""}
                          </span>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full bg-teal-600 text-white text-[10px] font-black flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>سورهٔ فعال</span>
                            </span>
                          )}
                          {s.builtIn && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                              سورهٔ پایه
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          سوره شماره {toFarsi(s.surahNumber)} • {toFarsi(s.verses)} آیه • {toFarsi(s.unitCount)} واحد نیم‌صفحه‌ای
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleActivateSurah(s.surahNumber)}
                            className="py-1.5 px-3.5 rounded-xl bg-[#00A896] hover:bg-[#028090] text-white text-xs font-black transition-colors"
                          >
                            فعال‌کردن این سوره
                          </button>
                        )}
                        {!s.builtIn && !confirming && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSurah(s.surahNumber)}
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                            title="حذف این پک"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded-lg font-bold ${
                          s.hasMergedContent
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                            : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                        }`}
                      >
                        {s.hasMergedContent
                          ? "دارای مراحل ۸گانه و بانک تمرین کامل"
                          : "مصحف + صوت + تسمیع + دریل A3 + آزمون تخصصی A1/A3 (بدون مراحل ۱ تا ۸)"}
                      </span>
                      {s.contentHash && (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                          <ShieldCheck className="w-3 h-3 text-teal-600" />
                          SHA-256: {s.contentHash.slice(0, 12)}…
                        </span>
                      )}
                    </div>

                    {confirming && (
                      <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-rose-800 dark:text-rose-200">
                          آیا پک «{s.nameFa}» حذف شود؟ (پیشرفت سوره قصص و سایر سوره‌ها محفوظ می‌ماند)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleUninstall(s.surahNumber)}
                            className="py-1.5 px-3 rounded-xl bg-rose-600 text-white font-bold"
                          >
                            بله، حذف شود
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSurah(null)}
                            className="py-1.5 px-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold"
                          >
                            انصراف
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* کاتالوگ پک‌های سوره برای دانلود آنلاین */}
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200">
              دریافت پک‌های سورهٔ تازه (کاتالوگ آنلاین)
            </h2>
          </div>

          {loadingCatalog ? (
            <div className="p-5 rounded-3xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-800 text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>در حال بررسی کاتالوگ آنلاین...</span>
            </div>
          ) : catalog.length === 0 ? (
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                فهرست آنلاین پک‌های سوره در حال حاضر در دسترس نیست (حالت آفلاین یا نبود انتشار فعال). می‌توانید فقط از سوره‌های نصب‌شده استفاده کنید یا فایل `.pack.json` را از بخش بالا به‌صورت محلی بارگذاری نمایید.
              </div>
            </div>
          ) : downloadableCatalog.length === 0 ? (
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-800 text-xs text-emerald-700 dark:text-emerald-300 font-bold">
              تمام پک‌های موجود در کاتالوگ آنلاین هم‌اکنون نصب شده‌اند.
            </div>
          ) : (
            <div className="space-y-2.5">
              {downloadableCatalog.map((entry) => {
                const isBusy = downloadState?.surah === entry.surah;
                const pct =
                  isBusy && downloadState.totalBytes > 0
                    ? Math.min(100, Math.round((downloadState.loadedBytes / downloadState.totalBytes) * 100))
                    : 0;
                return (
                  <div
                    key={entry.surah}
                    className="p-4 rounded-3xl bg-white dark:bg-[#1a2332] border border-[#e6dbc5] dark:border-slate-800 space-y-2 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-slate-800 dark:text-white">
                          {entry.nameFa} {entry.nameAr ? `(${entry.nameAr})` : ""}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          سوره {toFarsi(entry.surah)} • {toFarsi(entry.verses)} آیه • حجم حدود {toFarsi(entry.sizeKb)} کیلوبایت
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={downloadState !== null}
                        onClick={() => void handleDownloadAndInstall(entry)}
                        className="py-2 px-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        <span>{isBusy ? (downloadState.stage === "verifying" ? "بررسی امضا..." : `${toFarsi(pct)}%`) : "دانلود و نصب"}</span>
                      </button>
                    </div>
                    {isBusy && (
                      <div className="h-2 w-full rounded-full bg-amber-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-600 transition-all duration-150"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
