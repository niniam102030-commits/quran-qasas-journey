// src/components/mushaf/TasmiModal.tsx
// تسمیع نیم‌صفحه: متن پنهان ← تلاوت از حفظ با ضبط‌کننده موجود ← نمایش متن و علامت‌زدن آیه‌های لغزیده
import { useEffect, useState } from "react";
import { X, Eye, EyeOff, Mic, CheckCircle2, AlertTriangle, Info, Play } from "lucide-react";
import { ldb, verseKey } from "../../db/learningDb";
import { formatSurahCardKey, getActiveSurahNumber } from "../../config/surahConfig";
import { planTasmiCards } from "../../learning/tasmi";
import { getMeta, setMeta } from "../../services/metaStore";
import { getLocalDateIso } from "../../services/profileService";
import { usePreferencesStore } from "../../store/usePreferencesStore";
import SelfReciteRecorder from "../audio/SelfReciteRecorder";

interface Props {
  unitId: string;
  page?: number;
  half?: string;
  verseFrom?: number;
  verseTo?: number;
  onClose: () => void;
  onStartReview: () => void;
}

interface VerseEntry {
  n: number;
  textAr: string;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export default function TasmiModal({
  unitId,
  page,
  half,
  verseFrom,
  verseTo,
  onClose,
  onStartReview,
}: Props) {
  const arabicFontSize = usePreferencesStore((s) => s.arabicFontSize);
  const [verses, setVerses] = useState<VerseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"recite" | "evaluate" | "done">("recite");
  const [slipped, setSlipped] = useState<Set<number>>(new Set());
  const [savedCounts, setSavedCounts] = useState<{ clean: number; slipped: number } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const chunks = await ldb.chunks.where("unitId").equals(unitId).toArray();
      let nums = [...new Set(chunks.map((c) => c.verse))].sort((a, b) => a - b);
      if (nums.length === 0 && verseFrom && verseTo) {
        nums = Array.from({ length: verseTo - verseFrom + 1 }, (_, i) => verseFrom + i);
      }
      const surah = getActiveSurahNumber();
      const rows = await Promise.all(nums.map((n) => ldb.baseVerses.get(verseKey(surah, n))));
      const loaded: VerseEntry[] = rows
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => {
          const words = (r.words as { ar: string }[] | undefined) ?? [];
          const textAr =
            String(r.ar ?? r.textAr ?? "").trim() || words.map((w) => w.ar).join(" ").trim();
          return { n: r.n, textAr };
        })
        .filter((v) => v.textAr.length > 0);
      if (active) {
        setVerses(loaded);
        setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [unitId, verseFrom, verseTo]);

  const toggleSlipped = (verseNum: number) => {
    setSlipped((prev) => {
      const next = new Set(prev);
      if (next.has(verseNum)) next.delete(verseNum);
      else next.add(verseNum);
      return next;
    });
  };

  const handleSave = async () => {
    const surah = getActiveSurahNumber();
    const verseNums = verses.map((v) => v.n);
    const allKeys = [
      ...verseNums.flatMap((v) => [
        formatSurahCardKey("vr", v, surah),
        formatSurahCardKey("sq", v, surah),
        formatSurahCardKey("vt", v, surah),
        formatSurahCardKey("vn", v, surah),
      ]),
      formatSurahCardKey("pg", unitId, surah),
    ];
    const existingRows = await ldb.cards.bulkGet(allKeys);
    const existingCards = new Map(
      existingRows.filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.key, c]),
    );
    const now = new Date();
    const toSave = planTasmiCards({
      verses: verseNums,
      slippedVerses: slipped,
      existingCards,
      unitId,
      surahNumber: surah,
      now,
    });
    if (toSave.length > 0) {
      await ldb.cards.bulkPut(toSave);
    }
    // ثبت در tasmiiLog برای برنامه امروز (U1)، مأموریت روزانه (G3) و شاخص دقت لفظی (L4)
    const prevLog = await getMeta<
      { at: number; dateIso: string; unitId: string; total: number; slipped: number }[]
    >("tasmiiLog", []);
    const nextLog = [
      ...prevLog,
      {
        at: now.getTime(),
        dateIso: getLocalDateIso(now),
        unitId,
        total: verseNums.length,
        slipped: slipped.size,
      },
    ].slice(-200);
    await setMeta("tasmiiLog", nextLog);

    setSavedCounts({ clean: verseNums.length - slipped.size, slipped: slipped.size });
    setStep("done");
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-[#FAF7F2] dark:bg-[#0B132B] overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 sm:p-5 space-y-4 pb-16">
        {/* Header */}
        <header className="flex items-center justify-between gap-2 pb-2 border-b border-[#d4af37]/40 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-base text-slate-900 dark:text-white">
                تسمیع نیم‌صفحه {page ? `— صفحه ${toFarsi(page)} (${half === "a" ? "نیمه اول" : "نیمه دوم"})` : ""}
              </h2>
              {verses.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  آیات {toFarsi(verses[0].n)} تا {toFarsi(verses[verses.length - 1].n)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-white dark:bg-[#1C2541] border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Explicit disclaimer */}
        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 leading-relaxed">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            تسمیع و آزمون میانبر «عبور از مراحل» را ثبت می‌کنند، نه تسلط حرف‌به‌حرف بر تلاوت را.
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm font-bold text-slate-500">در حال بارگذاری آیات...</div>
        ) : step === "recite" ? (
          <div className="space-y-4">
            <div className="p-6 rounded-3xl bg-white dark:bg-[#1C2541] border-2 border-dashed border-[#d4af37]/70 dark:border-teal-700 text-center space-y-2.5">
              <EyeOff className="w-8 h-8 mx-auto text-amber-600 dark:text-amber-400" />
              <h3 className="font-black text-sm sm:text-base text-slate-800 dark:text-slate-100">
                متن نیم‌صفحه پنهان است
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                این نیم‌صفحه را از حفظ تلاوت کن (در صورت تمایل با ضبط‌کننده زیر صدایت را ضبط و گوش کن)؛ سپس متن را آشکار کن و آیه‌هایی را که لغزش داشتی علامت بزن.
              </p>
            </div>

            <SelfReciteRecorder />

            <button
              type="button"
              onClick={() => setStep("evaluate")}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#00A896] hover:bg-[#028090] border-b-4 border-[#016470] active:border-b-0 active:translate-y-0.5 text-white font-black text-sm flex items-center justify-center gap-2 transition-all"
            >
              <Eye className="w-4 h-4" />
              <span>نمایش متن برای خودارزیابی</span>
            </button>
          </div>
        ) : step === "evaluate" ? (
          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
              روی هر آیه‌ای که در تلاوت لغزش یا توقف داشتی ضربه بزن تا برای مرور امروز علامت بخورد:
            </p>

            <div className="space-y-2.5">
              {verses.map((v) => {
                const isSlipped = slipped.has(v.n);
                return (
                  <button
                    key={v.n}
                    type="button"
                    onClick={() => toggleSlipped(v.n)}
                    className={`w-full p-4 rounded-2xl border-2 text-right transition-all space-y-2 ${
                      isSlipped
                        ? "bg-rose-50 dark:bg-rose-950/40 border-rose-400 dark:border-rose-700"
                        : "bg-white dark:bg-[#1C2541] border-emerald-300/80 dark:border-emerald-800/70 hover:border-amber-400"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-extrabold">
                      <span className="text-slate-500 dark:text-slate-400">آیه {toFarsi(v.n)}</span>
                      {isSlipped ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          لغزش داشتم (مرور امروز)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          سالم خواندم
                        </span>
                      )}
                    </div>
                    <p
                      className="text-slate-900 dark:text-slate-100 leading-loose"
                      style={{
                        fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
                        fontSize: `${arabicFontSize}px`,
                      }}
                    >
                      {v.textAr}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                className="flex-1 py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-0.5 text-white font-black text-sm transition-all"
              >
                ثبت نتیجه تسمیع ({toFarsi(slipped.size)} آیه لغزیده)
              </button>
              <button
                type="button"
                onClick={() => setStep("recite")}
                className="py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                بازگشت
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-3xl bg-white dark:bg-[#1C2541] border-2 border-emerald-300 dark:border-emerald-800 text-center space-y-4 shadow-lg">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-black text-lg text-slate-900 dark:text-white">نتیجهٔ تسمیع ثبت شد</h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {toFarsi(savedCounts?.clean ?? 0)} آیهٔ سالم کارت مرور هوشمند (۱۷ روزه برای حفظ و توالی، ۷ روزه برای ترجمه و شماره) گرفتند
                {savedCounts && savedCounts.slipped > 0
                  ? ` و ${toFarsi(savedCounts.slipped)} آیهٔ لغزیده برای مرور امروز در صف قرار گرفتند.`
                  : " و همهٔ آیات بدون لغزش ثبت شدند."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              {savedCounts && savedCounts.slipped > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartReview();
                  }}
                  className="flex-1 py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 border-b-4 border-amber-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>مرور آیه‌های لغزیده</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-2xl bg-[#b37e3d] hover:bg-[#9d6b2f] text-white font-black text-xs transition-all"
              >
                بازگشت به نقشه
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
