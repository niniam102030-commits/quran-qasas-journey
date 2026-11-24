// src/pages/ExamPage.tsx
// صفحه شبیه‌ساز آزمون رسمی حفظ + کارنامه و باس فصل (A2)
import { useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Medal,
  Play,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import QuestionRenderer, { type RenderableQuestion } from "../components/learning/QuestionRenderer";
import AqeeqIcon from "../components/common/AqeeqIcon";
import { STORY_CHAPTERS } from "../learning/chapters";
import {
  EXAM_ERROR_LABELS,
  EXAM_QUESTION_COUNTS,
  remedialTagsForExam,
  type ExamErrorType,
  type ExamLogEntry,
  type ExamScope,
  type ExamScopeType,
} from "../learning/examEngine";
import { getMeta } from "../services/metaStore";
import { useLearningStore } from "../store/useLearningStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import type { UnitPlan } from "../types/learning";

interface Props {
  initialScope?: ExamScope | null;
  onExit: () => void;
  onStartRemedial: (tag: string | null) => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) => String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${toFarsi(String(m).padStart(2, "0"))}:${toFarsi(String(s).padStart(2, "0"))}`;
}

function formatDateFa(ms: number): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

export default function ExamPage({ initialScope = null, onExit, onStartRemedial }: Props) {
  const s = useLearningStore();
  const activeSurah = (usePreferencesStore() as unknown as { activeSurah?: number }).activeSurah ?? 28;

  const [scopeType, setScopeType] = useState<ExamScopeType>(initialScope?.type ?? "unit");
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    initialScope?.type === "unit" ? initialScope.id : "",
  );
  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    initialScope?.type === "chapter" ? initialScope.id : STORY_CHAPTERS[0].id,
  );
  const [units, setUnits] = useState<UnitPlan[]>([]);
  const [examLog, setExamLog] = useState<ExamLogEntry[]>([]);
  const [chapterMedals, setChapterMedals] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const loadMeta = async () => {
      const [savedLog, savedMedals] = await Promise.all([
        getMeta<ExamLogEntry[]>("examLog", []),
        getMeta<string[]>("chapterMedals", []),
      ]);
      if (!active) return;
      setExamLog(savedLog);
      setChapterMedals(savedMedals);

      let loadedUnits: UnitPlan[] = [];
      if (activeSurah === 28) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL || "/"}content/base/units-plan.json`);
          if (res.ok) loadedUnits = (await res.json()) as UnitPlan[];
        } catch {
          // ignore
        }
      } else {
        const packMeta = await getMeta<{ units?: UnitPlan[] } | null>(`surahPackMeta:${activeSurah}`, null);
        loadedUnits = packMeta?.units ?? [];
      }
      if (!active) return;
      setUnits(loadedUnits);
      setSelectedUnitId((prev) => prev || loadedUnits[0]?.id || "");
    };
    void loadMeta();
    return () => {
      active = false;
    };
  }, [activeSurah, s.status]);

  // اگر initialScope مستقیماً از باس فصل آمده باشد، آزمون بلافاصله آماده/شروع می‌شود
  useEffect(() => {
    if (initialScope && s.status !== "running" && s.sessionType !== "EXAM") {
      void s.startExam(initialScope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScope?.type, initialScope?.id]);

  // زمان‌سنج کلی آزمون (بدون محدودیت زمانی)
  useEffect(() => {
    if (s.sessionType !== "EXAM" || s.status !== "running" || !s.examState) return;
    const startedAt = s.examState.startedAt;
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [s.sessionType, s.status, s.examState]);

  // جشن باس فصل هنگام قبولی فصل
  useEffect(() => {
    if (
      s.sessionType === "EXAM" &&
      s.status === "finished" &&
      s.examState?.scope.type === "chapter" &&
      (s.examState.result?.score ?? 0) >= 85
    ) {
      try {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 } });
      } catch {
        // ignore in test env
      }
    }
  }, [s.sessionType, s.status, s.examState]);

  const trendScores = useMemo(() => examLog.slice(-10).map((e) => e.score), [examLog]);

  const handleLaunch = async () => {
    let scope: ExamScope;
    if (scopeType === "unit") {
      const u = units.find((x) => x.id === selectedUnitId) ?? units[0];
      if (!u) return;
      scope = {
        type: "unit",
        id: u.id,
        labelFa: `صفحه ${toFarsi(u.page)} (${u.half === "a" ? "نیمه اول" : "نیمه دوم"})`,
      };
    } else if (scopeType === "chapter") {
      const ch = STORY_CHAPTERS.find((c) => c.id === selectedChapterId) ?? STORY_CHAPTERS[0];
      scope = {
        type: "chapter",
        id: ch.id,
        labelFa: `فصل ${toFarsi(ch.order)}: ${ch.titleFa}`,
      };
    } else {
      scope = {
        type: "surah",
        id: `surah_${activeSurah}`,
        labelFa: activeSurah === 28 ? "کل سوره قصص" : `کل سوره ${toFarsi(activeSurah)}`,
      };
    }
    await s.startExam(scope);
  };

  // ۱) صفحه اجرای آزمون فعال (بدون راهنما، بدون requeue، بدون نمایش پاسخ تا پایان)
  if (s.sessionType === "EXAM" && s.status === "loading") {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#FAF7F2] dark:bg-[#0B132B]">
        <BookOpen className="w-10 h-10 animate-bounce text-amber-600 mb-3" />
        <p className="font-bold text-sm">در حال آماده‌سازی سؤالات آزمون رسمی...</p>
      </div>
    );
  }

  if (s.sessionType === "EXAM" && s.status === "running") {
    const q = s.current() as RenderableQuestion | null;
    if (!q) return null;
    const progressPct = Math.min(100, Math.round(((s.index + 1) / Math.max(1, s.queue.length)) * 100));

    return (
      <div dir="rtl" className="min-h-screen flex flex-col islamic-bg bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 select-none pb-16">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 bg-[#FAF7F2]/95 dark:bg-[#0B132B]/95 backdrop-blur border-b-2 border-[#d4af37]/50 dark:border-teal-800/60">
          <button
            type="button"
            onClick={() => {
              useLearningStore.setState({ status: "idle", sessionType: "STAGE", examState: null, queue: [], lastResult: null });
              onExit();
            }}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-slate-500"
            title="انصراف و خروج"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="flex-1 h-3.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-l from-amber-500 to-teal-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-bold shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              {formatElapsed(elapsedSec)}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              {toFarsi(s.index + 1)} / {toFarsi(s.queue.length)}
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col justify-center space-y-3">
          <div className="text-center text-xs font-bold text-slate-500 dark:text-slate-400">
            {s.examState?.scope.labelFa || "آزمون رسمی حفظ"} • پاسخ‌ها تا پایان کارنامه پنهان می‌مانند
          </div>
          <QuestionRenderer
            key={q.id + ":" + s.index}
            q={q}
            locked={submitting}
            disableHint={true}
            noHintNoticeFa="حالت آزمون رسمی (بدون راهنما و بدون نمایش پاسخ تا پایان)"
            onSubmit={(resp, meta) => {
              if (submitting) return;
              setSubmitting(true);
              void s
                .submit(resp, meta)
                .then(() => s.next())
                .finally(() => setSubmitting(false));
            }}
          />
        </main>
      </div>
    );
  }

  // ۲) صفحه کارنامه پایان آزمون فعال
  if (s.sessionType === "EXAM" && s.status === "finished" && s.examState?.result) {
    const res = s.examState.result;
    const entry = s.examState.logEntry;
    const tags = entry ? remedialTagsForExam(entry) : [];
    const levelColor =
      res.level === "ممتاز"
        ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
        : res.level === "قبول"
        ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700"
        : "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-700";

    return (
      <div dir="rtl" className="min-h-screen bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 p-4 sm:p-6 pb-24">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="bg-white dark:bg-[#1C2541] rounded-3xl border-2 border-[#d4af37]/60 p-6 shadow-lg text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shadow-md">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-black">کارنامه آزمون رسمی</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {s.examState.scope.labelFa || s.examState.scope.id} • زمان کل: {formatElapsed(elapsedSec)}
              </p>
            </div>

            <div className="flex items-center justify-center gap-4">
              <div className="text-4xl font-black text-amber-700 dark:text-amber-300">
                {toFarsi(res.score)} <span className="text-base font-bold text-slate-400">/ ۱۰۰</span>
              </div>
              <span className={`px-3.5 py-1.5 rounded-2xl border text-xs font-black ${levelColor}`}>
                {res.level}
              </span>
            </div>

            {res.level === "نیاز به تمرین" && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                با یک بستهٔ ترمیمی هدفمند روی دسته‌های خطادار، سریع‌تر به سطح قبولی می‌رسید.
              </p>
            )}

            <div className="flex items-center justify-center gap-4 text-xs font-bold pt-1">
              <span className="text-emerald-700 dark:text-emerald-300">
                {toFarsi(res.correctCount)} درست از {toFarsi(res.total)}
              </span>
              {res.xpEarned > 0 && (
                <span className="text-amber-600 dark:text-amber-400">+{toFarsi(res.xpEarned)} نور ✨</span>
              )}
              {s.examState.bossAwarded && (
                <span className="text-rose-700 dark:text-rose-400 inline-flex items-center gap-1">
                  +{toFarsi(s.examState.bossGemsAwarded)} عقیق <AqeeqIcon className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            {s.examState.scope.type === "chapter" && res.score >= 85 && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 text-xs font-black flex items-center justify-center gap-2">
                <Medal className="w-4 h-4 text-amber-600" />
                <span>
                  🏅 مدال باس فصل ثبت شد!
                  {s.examState.bossAwarded ? " (+۲۵ عقیق هدیهٔ اولین فتح فصل)" : ""}
                </span>
              </div>
            )}

            {s.examState.shortfallNotes.length > 0 && (
              <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 text-right space-y-1">
                {s.examState.shortfallNotes.map((note, idx) => (
                  <p key={idx}>• {note}</p>
                ))}
              </div>
            )}
          </div>

          {/* تفکیک خطا بر اساس دسته‌بندی */}
          <section className="bg-white dark:bg-[#1C2541] rounded-3xl border border-[#e6dbc5] dark:border-slate-800 p-5 space-y-3">
            <h2 className="font-bold text-sm">تفکیک عملکرد بر اساس نوع خطا</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {(Object.keys(EXAM_ERROR_LABELS) as ExamErrorType[]).map((errType) => {
                const st = res.byType[errType];
                if (!st || st.asked === 0) return null;
                return (
                  <div
                    key={errType}
                    className={`p-3 rounded-2xl border flex items-center justify-between ${
                      st.wrong > 0
                        ? "bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                        : "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                    }`}
                  >
                    <span className="font-bold">{EXAM_ERROR_LABELS[errType]}</span>
                    <span className="font-black">
                      {st.wrong === 0
                        ? `کامل (${toFarsi(st.asked)}/${toFarsi(st.asked)})`
                        : `${toFarsi(st.wrong)} خطا از ${toFarsi(st.asked)}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {tags.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  useLearningStore.setState({ status: "idle", sessionType: "STAGE", examState: null });
                  onStartRemedial(tags.join(","));
                }}
                className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                <span>ساختن بستهٔ ترمیمی از این آزمون</span>
              </button>
            )}
          </section>

          {/* مرور پاسخ‌های اشتباه در پایان آزمون */}
          {s.examState.answers.some((a) => !a.correct) && (
            <section className="bg-white dark:bg-[#1C2541] rounded-3xl border border-[#e6dbc5] dark:border-slate-800 p-5 space-y-3">
              <h2 className="font-bold text-sm text-rose-700 dark:text-rose-300">مرور موارد نیازمند توجه</h2>
              <div className="space-y-2.5">
                {s.examState.answers
                  .filter((a) => !a.correct)
                  .map((a, idx) => (
                    <div key={`${a.qid}-${idx}`} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{a.promptFa}</span>
                        <span className="px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                          {EXAM_ERROR_LABELS[a.errorType]}
                        </span>
                      </div>
                      {a.stemAr && (
                        <p className="quran-text text-base text-slate-800 dark:text-slate-100 leading-loose">
                          {a.stemAr}
                        </p>
                      )}
                      {a.expectedLabel && (
                        <p className="text-emerald-700 dark:text-emerald-300 font-bold">
                          پاسخ صحیح: {a.expectedLabel}
                        </p>
                      )}
                      {a.explanationFa && (
                        <p className="text-slate-500 dark:text-slate-400">{a.explanationFa}</p>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                useLearningStore.setState({ status: "idle", sessionType: "STAGE", examState: null, queue: [] });
              }}
              className="flex-1 py-3 px-4 rounded-2xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 font-black text-xs"
            >
              فهرست کارنامه‌ها
            </button>
            <button
              type="button"
              onClick={() => {
                useLearningStore.setState({ status: "idle", sessionType: "STAGE", examState: null, queue: [] });
                onExit();
              }}
              className="flex-1 py-3 px-4 rounded-2xl bg-[#b37e3d] hover:bg-[#9d6b2f] text-white font-black text-xs"
            >
              بازگشت به نقشه
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ۳) صفحه تنظیم آزمون + فهرست کارنامه‌ها
  return (
    <div dir="rtl" className="min-h-screen bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#FAF7F2]/95 dark:bg-[#0B132B]/95 backdrop-blur border-b-2 border-[#d4af37]/50 dark:border-teal-800/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            title="بازگشت"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-black text-[#8a5b29] dark:text-amber-400">آزمون تخصصی حفظ و کارنامه‌ها</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ارزیابی در سطح آزمون رسمی (عطف، اعراب، وقف، اتصال و متشابهات)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-5 space-y-5">
        {/* انتخاب دامنه و شروع */}
        <section className="bg-white dark:bg-[#1C2541] rounded-3xl border-2 border-[#E5DEC9] dark:border-[#3A506B] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-black">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>پیکربندی آزمون جدید</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            {(
              [
                { id: "unit" as const, label: `یک واحد (${toFarsi(EXAM_QUESTION_COUNTS.unit)} سؤال)` },
                ...(activeSurah === 28
                  ? [{ id: "chapter" as const, label: `باس فصل (${toFarsi(EXAM_QUESTION_COUNTS.chapter)} سؤال)` }]
                  : []),
                { id: "surah" as const, label: `کل سوره (${toFarsi(EXAM_QUESTION_COUNTS.surah)} سؤال)` },
              ]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScopeType(opt.id)}
                className={`p-3 rounded-2xl border-2 font-black transition-all ${
                  scopeType === opt.id
                    ? "bg-teal-50 dark:bg-teal-950/50 border-[#00A896] text-[#028090] dark:text-teal-300"
                    : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {scopeType === "unit" && (
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="w-full p-3 rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  صفحه {toFarsi(u.page)} ({u.half === "a" ? "نیمه اول" : "نیمه دوم"}) — آیات {toFarsi(u.verseFrom)} تا {toFarsi(u.verseTo)}
                </option>
              ))}
            </select>
          )}

          {scopeType === "chapter" && activeSurah === 28 && (
            <select
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="w-full p-3 rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
            >
              {STORY_CHAPTERS.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {chapterMedals.includes(ch.id) ? "🏅 " : ""}
                  فصل {toFarsi(ch.order)}: {ch.titleFa} (آیات {toFarsi(ch.verseFrom)} تا {toFarsi(ch.verseTo)})
                </option>
              ))}
            </select>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            قواعد جلسه: بدون راهنما، بدون دکمه «نمی‌دانم»، بدون بازگشت به سؤال غلط و بدون نمایش پاسخ تا پایان آزمون. این آزمون روی کارت‌های FSRS اثر نمی‌گذارد.
          </p>

          <button
            type="button"
            onClick={() => void handleLaunch()}
            disabled={scopeType === "unit" && units.length === 0}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#00A896] hover:bg-[#028090] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>شروع آزمون تخصصی</span>
          </button>
        </section>

        {/* نمودار روند نمره و کارنامه‌های ثبت‌شده */}
        <section className="bg-white dark:bg-[#1C2541] rounded-3xl border border-[#e6dbc5] dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>کارنامه‌های پیشین ({toFarsi(examLog.length)})</span>
            </h2>
          </div>

          {trendScores.length >= 2 && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[10px] text-slate-500 mb-1">روند نمره آزمون‌های اخیر</div>
              <svg viewBox="0 0 240 60" className="w-full h-14 overflow-visible" aria-label="نمودار روند نمره آزمون">
                <polyline
                  fill="none"
                  stroke="#00A896"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={trendScores
                    .map((val, idx) => {
                      const x = (idx / (trendScores.length - 1)) * 224 + 8;
                      const y = 52 - (val / 100) * 44;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(" ")}
                />
                {trendScores.map((val, idx) => {
                  const x = (idx / (trendScores.length - 1)) * 224 + 8;
                  const y = 52 - (val / 100) * 44;
                  return <circle key={idx} cx={x} cy={y} r="3" fill="#028090" />;
                })}
              </svg>
            </div>
          )}

          {examLog.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              هنوز آزمونی ثبت نشده است. اولین آزمون خود را از بخش بالا شروع کنید.
            </p>
          ) : (
            <div className="space-y-2.5">
              {examLog
                .slice()
                .reverse()
                .map((entry) => {
                  const tags = remedialTagsForExam(entry);
                  return (
                    <div
                      key={entry.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-black text-slate-800 dark:text-slate-100">
                            {entry.scope.label || entry.scope.id}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatDateFa(entry.at)} • {toFarsi(entry.total)} سؤال
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-amber-700 dark:text-amber-300">
                            {toFarsi(entry.score)}/۱۰۰
                          </span>
                          <span className="px-2.5 py-0.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-[11px]">
                            {entry.level === "ممتاز" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3" /> ممتاز
                              </span>
                            ) : entry.level === "قبول" ? (
                              <span className="text-amber-700 dark:text-amber-300">قبول</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                                <XCircle className="w-3 h-3" /> نیاز به تمرین
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {tags.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onStartRemedial(tags.join(","))}
                          className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold text-[11px] inline-flex items-center gap-1.5"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span>ساختن بستهٔ ترمیمی از این آزمون</span>
                        </button>
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
