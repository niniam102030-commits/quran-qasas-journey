// src/components/dev/RecitationJudgePanel.tsx
// پنل آزمایش داور تلاوت (نسخهٔ ۱٫۵): تنظیم دستی سخت‌گیری + تشخیص هر تلاش + خروجی جلسهٔ تست
// ابزار تست است؛ سطح سخت‌گیری برای کاربر نهایی هم انتخابی می‌ماند و کالیبراسیون با لاگ‌های میدانی انجام می‌شود.
import { useEffect, useState } from "react";
import { ClipboardCopy, Download, Gauge, Share2, Trash2 } from "lucide-react";
import {
  JUDGE_PROFILES,
  type JudgeProfileName,
} from "../../learning/recitationAlign";
import {
  clearAttemptLog,
  clearEventLog,
  defaultJudgeSettings,
  exportAttemptLogJson,
  loadAttemptLog,
  loadJudgeSettings,
  saveJudgeSettings,
  shareAttemptLogJson,
  type RecitationAttemptLog,
  type RecitationJudgeSettings,
} from "../../services/recitationJudgeService";

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

const PROFILE_LABELS: Record<JudgeProfileName, string> = {
  lenient: "ملایم",
  balanced: "متعادل",
  strict: "سخت‌گیر",
  very_strict: "بسیار سخت‌گیر",
};

const OUTCOME_LABELS: Record<RecitationAttemptLog["outcome"], string> = {
  no_speech: "چیزی شنیده نشد",
  not_this_text: "تلاوتِ این تکه نبود",
  judged: "داوری شد",
};

const STATE_STYLES: Record<string, string> = {
  matched: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-300",
  substituted: "bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-300",
  missed: "bg-rose-200 dark:bg-rose-900/70 text-rose-900 dark:text-rose-100 border-rose-500 font-bold",
  uncertain: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300",
};

export default function RecitationJudgePanel() {
  const [settings, setSettings] = useState<RecitationJudgeSettings>(() => defaultJudgeSettings());
  const [attempts, setAttempts] = useState<RecitationAttemptLog[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const reload = async () => {
    const [s, log] = await Promise.all([loadJudgeSettings(), loadAttemptLog()]);
    setSettings(s);
    setAttempts(log);
  };

  useEffect(() => {
    void reload();
  }, []);

  const update = async (next: RecitationJudgeSettings) => {
    setSettings(next);
    await saveJudgeSettings(next);
    setStatus("تنظیمات داور ذخیره شد؛ از تلاش بعدی اعمال می‌شود.");
  };

  const last = attempts.length > 0 ? attempts[attempts.length - 1] : null;

  const handleExportCopy = async () => {
    try {
      const json = await exportAttemptLogJson();
      await navigator.clipboard.writeText(json);
      setStatus(`خروجی ${toFarsi(attempts.length)} تلاش در حافظه کپی شد؛ برای تحلیل کالیبراسیون آن را برای من بفرستید.`);
    } catch {
      setStatus("کپی در حافظه ناموفق بود؛ از دکمهٔ دانلود فایل استفاده کنید.");
    }
  };

  const handleExportDownload = async () => {
    const json = await exportAttemptLogJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recitation-judge-test-session.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus("فایل خروجی جلسهٔ تست دانلود شد.");
  };

  const handleExportShare = async () => {
    try {
      const result = await shareAttemptLogJson();
      setStatus(
        result === "shared"
          ? "پنجرهٔ ارسال باز شد؛ فایل لاگ را برای توسعه‌دهنده بفرستید."
          : "ارسال مستقیم در این دستگاه پشتیبانی نمی‌شود؛ از دکمهٔ دانلود استفاده کنید.",
      );
    } catch {
      // لغو پنجرهٔ اشتراک‌گذاری توسط کاربر خطا نیست
    }
  };

  const handleClear = async () => {
    await clearAttemptLog();
    await clearEventLog();
    setAttempts([]);
    setStatus("دفتر تلاش‌های تلاوت پاک شد.");
  };

  const numRow = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ) => (
    <label className="flex items-center justify-between gap-2">
      <span className="font-bold text-slate-600 dark:text-slate-300">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!settings.useCustom}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 accent-violet-600 disabled:opacity-40"
        />
        <span className="w-10 text-center font-black">{toFarsi(value)}</span>
      </span>
    </label>
  );

  return (
    <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a2332] border-2 border-dashed border-rose-300 dark:border-rose-800 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-rose-600 shrink-0" />
        <div>
          <div className="font-black text-slate-800 dark:text-slate-100">پنل آزمایش داور تلاوت (جدید در ۱٫۵)</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            سخت‌گیری داور را دستی تنظیم کنید، تست بگیرید و خروجی جلسه را برای تحلیل بفرستید. این پنل ابزار تست است؛ در نسخهٔ نهایی سطح برنده قفل می‌شود.
          </div>
        </div>
      </div>

      {/* پروفایل‌های آماده */}
      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(JUDGE_PROFILES) as JudgeProfileName[]).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => void update({ ...settings, profile: name, useCustom: false })}
            className={`py-1.5 px-1 rounded-xl border font-black text-[11px] transition-colors ${
              !settings.useCustom && settings.profile === name
                ? "bg-rose-600 text-white border-rose-600"
                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
            }`}
          >
            {PROFILE_LABELS[name]}
          </button>
        ))}
      </div>

      {/* تنظیم دستی */}
      <div className="space-y-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
        <label className="flex items-center justify-between gap-2">
          <span className="font-bold text-slate-600 dark:text-slate-300">تنظیم دستی پارامترها (به‌جای پروفایل)</span>
          <input
            type="checkbox"
            checked={settings.useCustom}
            onChange={(e) => void update({ ...settings, useCustom: e.target.checked })}
            className="w-4 h-4 accent-violet-600"
          />
        </label>
        {numRow("آستانهٔ شباهت کلمه", settings.custom.matchSim, 0.5, 0.99, 0.01, (v) =>
          void update({ ...settings, custom: { ...settings.custom, matchSim: v } }),
        )}
        {numRow("دروازهٔ پوشش سراسری", settings.custom.coverageGate, 0, 1, 0.05, (v) =>
          void update({ ...settings, custom: { ...settings.custom, coverageGate: v } }),
        )}
        {numRow("سقف جزیرهٔ نامشخص", settings.custom.islandCap, 1, 5, 1, (v) =>
          void update({ ...settings, custom: { ...settings.custom, islandCap: Math.round(v) } }),
        )}
        <label className="flex items-center justify-between gap-2">
          <span className="font-bold text-slate-600 dark:text-slate-300">دروازهٔ پوشش فعال باشد</span>
          <input
            type="checkbox"
            checked={settings.custom.gateEnabled}
            disabled={!settings.useCustom}
            onChange={(e) => void update({ ...settings, custom: { ...settings.custom, gateEnabled: e.target.checked } })}
            className="w-4 h-4 accent-violet-600 disabled:opacity-40"
          />
        </label>
      </div>

      <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
        <span className="font-bold text-amber-900 dark:text-amber-200">
          نادیده‌گرفتن کالیبراسیون شخصی در تست (مصونیت «درست خواندم» نتیجه را آلوده نکند)
        </span>
        <input
          type="checkbox"
          checked={settings.bypassCalibration}
          onChange={(e) => void update({ ...settings, bypassCalibration: e.target.checked })}
          className="w-4 h-4 accent-amber-600 shrink-0"
        />
      </label>

      {/* تشخیص آخرین تلاش */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-black text-slate-700 dark:text-slate-200">
            دفتر تلاش‌ها: {toFarsi(attempts.length)} تلاش
          </span>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-[11px] font-bold text-violet-700 dark:text-violet-300 underline"
          >
            تازه‌سازی
          </button>
        </div>
        {last ? (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              آخرین تلاش — آیهٔ {toFarsi(last.verse)}، تکهٔ {toFarsi(last.segmentIndex + 1)}:{" "}
              <span className="text-rose-700 dark:text-rose-300">{OUTCOME_LABELS[last.outcome]}</span>
              {" | "}پوشش: {toFarsi(Math.round(last.coverage * 100))}٪{" | "}شنیده‌شده:{" "}
              {toFarsi(last.matched)}، خطای جایگزینی: {toFarsi(last.substituted)}، ناحیهٔ خطا:{" "}
              {toFarsi(last.missed)}، نامشخص: {toFarsi(last.uncertain)}
            </div>
            {last.transcript && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                متن خام شنیده‌شده: <span className="font-bold">{last.transcript}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {last.words.map((w, i) => (
                <span
                  key={i}
                  className={`px-1.5 py-0.5 rounded-lg border text-[10px] ${STATE_STYLES[w.state] ?? STATE_STYLES.uncertain}`}
                  title={`${w.reason ?? ""}${w.sim !== undefined ? ` — شباهت: ${Math.round(w.sim * 100)}٪` : ""}${w.heard ? ` — شنیده‌شده: ${w.heard}` : ""}`}
                >
                  {w.ref}
                  {w.sim !== undefined ? ` ${toFarsi(Math.round(w.sim * 100))}٪` : ""}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            هنوز تلاشی ثبت نشده است؛ از صفحهٔ مصحف، «همراهی و تصحیح تلاوت» را باز کنید و چند تکه بخوانید.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => void handleExportCopy()}
          className="py-2 px-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-[11px] flex items-center justify-center gap-1"
        >
          <ClipboardCopy className="w-3.5 h-3.5" />
          <span>کپی خروجی تست</span>
        </button>
        <button
          type="button"
          onClick={() => void handleExportDownload()}
          className="py-2 px-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-black text-[11px] flex items-center justify-center gap-1"
        >
          <Download className="w-3.5 h-3.5" />
          <span>دانلود فایل تست</span>
        </button>
        <button
          type="button"
          onClick={() => void handleExportShare()}
          className="py-2 px-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-[11px] flex items-center justify-center gap-1"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>ارسال فایل تست</span>
        </button>
        <button
          type="button"
          onClick={() => void handleClear()}
          className="py-2 px-2 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-black text-[11px] flex items-center justify-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>پاک‌کردن دفتر</span>
        </button>
      </div>

      {status && (
        <div role="status" className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-[11px]">
          {status}
        </div>
      )}
    </div>
  );
}
