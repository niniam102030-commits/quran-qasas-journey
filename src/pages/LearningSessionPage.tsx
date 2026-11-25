// src/pages/LearningSessionPage.tsx
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, Award, Sparkles, BookOpen, Volume2, VolumeX } from "lucide-react";
import { isNoAudioToday, setNoAudioToday } from "../services/noAudioService";
import QuestionRenderer, { type RenderableQuestion } from "../components/learning/QuestionRenderer";
import { ReciteBlockRunner } from "../components/learning/ReciteItemView";
import VerseAudioPlayer from "../components/audio/VerseAudioPlayer";
import { prefetchVersesAudio } from "../services/menshawiAudio";
import AqeeqIcon from "../components/common/AqeeqIcon";
import { useLearningStore, type CycleKind } from "../store/useLearningStore";
import { useHapticsAndSfx } from "../hooks/useHapticsAndSfx";
import { syncDailyReminder } from "../services/reminderService";
import { ldb, verseKey } from "../db/learningDb";
import { getActiveSurahNumber } from "../config/surahConfig";

interface Props {
  unitId: string;
  stage: number;
  remedialTag?: string | null;
  cycleKind?: CycleKind | null;
  /** فقط برای stage=-۶: نوع دریل تلاوت مستقل */
  reciteKind?: "hunt" | "exam" | "witness" | null;
  onStartNext?: (unitId: string, stage: number) => void;
  onExit: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

// تشخیص «عبارت قرآنی» برای فونت مصحف: صرفِ داشتن یک اعراب (مثل شدّه در «شرّ»)
// کافی نیست؛ عبارت فارسیِ داخل «...» اگر با فونت قرآنی رندر شود، حروف فارسیِ
// گ/چ/پ/ژ در آن فونت نیست و به‌صورت دایره (●) می‌افتد. عبارت قرآنیِ واقعی هم
// حرف فارسی ندارد و هم تقریباً همه‌ی حروفش اعراب دارند.
const hasQuranicMarks = (s: string) => {
  if (/[گچپژ]/.test(s)) return false;
  const letters = (s.match(/[\u0621-\u064A\u066E-\u06D3]/g) ?? []).length;
  if (letters === 0) return false;
  const marks = (s.match(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g) ?? []).length;
  return marks / letters >= 0.15;
};
function renderRichFa(text: string | undefined) {
  if (!text) return null;
  return text.split(/(«[^»]+»)/g).map((part, idx) =>
    part.startsWith("«") && part.endsWith("»") && hasQuranicMarks(part) ? (
      <span key={idx} className="quran-text font-normal text-[1.15em] mx-0.5">
        {part}
      </span>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

// نوع‌هایی که شنیدنِ تلاوتِ آیه‌ی ساقه پیش از پاسخ‌گویی، جواب را لو می‌دهد:
// کاربر باید آیه را از روی ترجمه یا شماره‌اش تشخیص دهد، پایان یا آغازش را
// بگوید، متنش را بسازد یا جاهای خالی‌اش را پر کند. در VERSE_TO_NUMBER حتی
// برچسبِ پخش‌کننده (شماره‌ی آیه) خودِ جواب است. در این نوع‌ها پخش‌کننده
// فقط بعد از ثبت پاسخ نمایش داده می‌شود.
const AUDIO_REVEALS_ANSWER = new Set([
  "TRANSLATION_TO_VERSE",
  "NUMBER_TO_VERSE_START",
  "ENDING_CHOICE",
  "MUTASHABIH_SPOT",
  "BUILD_FROM_NUMBER",
  "BUILD_FROM_TRANSLATION",
  "VERSE_TO_NUMBER",
  "CLOZE_AR",
  "CLOZE_COMPLETE_REST",
]);

export default function LearningSessionPage({ unitId, stage, remedialTag = null, cycleKind = null, reciteKind = null, onStartNext, onExit }: Props) {
  const s = useLearningStore();
  const startReview = useLearningStore((state) => state.startReview);
  const startStage = useLearningStore((state) => state.startStage);
  const startRemedial = useLearningStore((state) => state.startRemedial);
  const startTestOut = useLearningStore((state) => state.startTestOut);
  const startBlindSpots = useLearningStore((state) => state.startBlindSpots);
  const startCycleReview = useLearningStore((state) => state.startCycleReview);
  const startDrill = useLearningStore((state) => state.startDrill);
  const startReciteDrill = useLearningStore((state) => state.startReciteDrill);
  const { playSfx } = useHapticsAndSfx();
  const q = s.current() as RenderableQuestion | null;
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [correctAnswerText, setCorrectAnswerText] = useState("");
  const [noAudio, setNoAudio] = useState<boolean>(() => isNoAudioToday());

  useEffect(() => {
    const state = useLearningStore.getState();
    if (stage === -6 && reciteKind) {
      if (state.status === "idle" || state.reciteSession?.purpose !== reciteKind || state.status === "finished") {
        void startReciteDrill(reciteKind);
      }
    } else if (stage === -5) {
      if (state.status === "idle" || state.sessionType !== "DRILL" || state.unitId !== (unitId || null) || state.status === "finished") {
        void startDrill(unitId || null);
      }
    } else if (stage === -4 && cycleKind) {
      if (state.status === "idle" || state.sessionType !== "REVIEW" || state.cycleKind !== cycleKind || state.status === "finished") {
        void startCycleReview(cycleKind);
      }
    } else if (stage === -3) {
      if (state.status === "idle" || state.sessionType !== "REMEDIAL" || state.remedialTag !== "blindspots" || state.status === "finished") {
        void startBlindSpots();
      }
    } else if (stage === -2) {
      if (state.status === "idle" || state.sessionType !== "TESTOUT" || state.unitId !== unitId || state.status === "finished") {
        void startTestOut(unitId);
      }
    } else if (stage === -1) {
      if (state.status === "idle" || state.sessionType !== "REMEDIAL" || state.remedialTag !== remedialTag || state.status === "finished") {
        void startRemedial(remedialTag);
      }
    } else if (stage === 0) {
      if (state.status === "idle" || state.sessionType !== "REVIEW" || state.cycleKind !== null || state.status === "finished") void startReview();
    } else if (state.status === "idle" || state.unitId !== unitId || state.stage !== stage || state.status === "finished") {
      void startStage(unitId, stage);
    }
  }, [unitId, stage, remedialTag, cycleKind, reciteKind, startReview, startStage, startRemedial, startTestOut, startBlindSpots, startCycleReview, startDrill, startReciteDrill]);

  // پیش‌دانلود پس‌زمینه‌ی صوت همه‌ی آیات این جلسه تا نخستین پخشِ هر آیه
  // معطل دانلود نماند (دانلود کامل و کش‌شده در menshawiAudio انجام می‌شود).
  const queueVersesKey = [
    ...new Set(
      s.queue
        .map((item) => (item as RenderableQuestion).stem?.verse)
        .filter((v): v is number => typeof v === "number"),
    ),
  ].join(",");
  useEffect(() => {
    if (!queueVersesKey) return;
    const controller = new AbortController();
    const verses = queueVersesKey.split(",").map(Number);
    void prefetchVersesAudio(verses, undefined, controller.signal).catch(() => {
      // خطای پیش‌دانلود نباید جلسه را متوقف کند؛ پخش تکی سر جای خودش تلاش می‌کند.
    });
    return () => controller.abort();
  }, [queueVersesKey]);

  // جشن پایان مرحله موفق با افکت صوتی و Confetti + زمان‌بندی مجدد یادآور روزانه (بدون درخواست مجوز)
  useEffect(() => {
    if (s.status === "finished") {
      void syncDailyReminder({ requestPermission: false });
    }
    if (s.status === "finished" && s.summary && s.summary.total > 0 && s.summary.passed) {
      playSfx("stage-fanfare");
      try {
        confetti({
          particleCount: stage === 8 || s.summary.unlockedNext ? 90 : 45,
          spread: 70,
          origin: { y: 0.65 },
        });
      } catch {
        // در محیط تست بدون canvas نادیده گرفته می‌شود
      }
    }
  }, [s.status, s.summary, stage, playSfx]);

  // با عوض‌شدن سؤال، صفحه از بالا شروع شود تا صورت سؤال دیده شود؛ وگرنه اگر
  // کاربر برای دیدن گزینه‌های پایین اسکرول کرده باشد، سؤال بعدی هم از وسط
  // صفحه باز می‌شود و باید دستی به بالا برگردد. (اسکرول این صفحه روی
  // window است، نه روی یک ظرف داخلی.)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [s.index, q?.id]);

  // Enter key advances only when feedback drawer is visible (locked) and ignores key repeat.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      const state = useLearningStore.getState();
      if (state.status === "running" && state.lastResult !== null) {
        e.preventDefault();
        void state.next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    const resolveItem = async (
      item: { ar?: string; fa?: string; num?: number; n?: number; words?: string[]; wordsAr?: string[]; wordRange?: { verse: number; from: number; to: number } } | undefined,
    ): Promise<string> => {
      if (!item) return "";
      if (item.ar?.trim()) return item.ar.trim();
      if (item.fa?.trim()) return item.fa.trim();
      const numVal = item.num ?? item.n;
      if (numVal !== undefined) return toFarsiNum(numVal);
      if (item.wordsAr?.length) return item.wordsAr.join(" ");
      if (item.wordRange) {
        const surah = getActiveSurahNumber();
        const verse = await ldb.baseVerses.get(verseKey(surah, item.wordRange.verse));
        const words = (verse?.words as { i: number; ar: string }[] | undefined) ?? [];
        return words
          .filter((word) => word.i >= item.wordRange!.from && word.i <= item.wordRange!.to)
          .map((word) => word.ar)
          .join(" ");
      }
      if (item.words?.length && item.words.every((id) => /^w\d+_\d+_\d+$/.test(id))) {
        const surah = getActiveSurahNumber();
        const parsed = item.words.map((id) => {
          const match = /^w\d+_(\d+)_(\d+)$/.exec(id)!;
          return { verse: Number(match[1]), index: Number(match[2]) };
        });
        const verses = await Promise.all([...new Set(parsed.map((p) => p.verse))].map((n) => ldb.baseVerses.get(verseKey(surah, n))));
        const byVerse = new Map(
          verses
            .filter((verse): verse is NonNullable<typeof verse> => !!verse)
            .map((verse) => [verse.n, (verse.words as { i: number; ar: string }[] | undefined) ?? []]),
        );
        return parsed
          .map((p) => byVerse.get(p.verse)?.find((word) => word.i === p.index)?.ar ?? "")
          .filter(Boolean)
          .join(" ");
      }
      return item.words?.join(" ") || "";
    };

    const resolve = async () => {
      if (!q || !s.lastResult || s.lastResult.correct) return "";
      if (q.shape === "choice") {
        const opt = q.options?.find((item) => item.id === q.answer);
        return resolveItem(opt);
      }
      if (q.shape === "order" && Array.isArray(q.answer)) {
        const byId = new Map((q.bank ?? []).map((b) => [b.id, b]));
        const parts = await Promise.all((q.answer as string[]).map((id) => resolveItem(byId.get(id))));
        return parts.filter(Boolean).join(" ◄ ");
      }
      if (q.shape === "cloze" && typeof q.answer === "object" && q.answer !== null) {
        const byId = new Map((q.bank ?? []).map((b) => [b.id, b]));
        const wrongKeys = new Set((s.lastResult.wrongOptionIds ?? []).map((w) => w.split(":")[0]));
        const entries = Object.entries(q.answer as Record<string, string>).filter(
          ([k]) => wrongKeys.size === 0 || wrongKeys.has(k),
        );
        const parts = await Promise.all(
          entries.map(async ([k, id]) => `[${toFarsiNum(k)}: ${await resolveItem(byId.get(id))}]`),
        );
        return parts.join(" ");
      }
      if (q.shape === "match" && Array.isArray(q.pairs)) {
        const leftById = new Map((q.left ?? []).map((l) => [l.id, l]));
        const rightById = new Map((q.right ?? []).map((r) => [r.id, r]));
        const wrongLeftIds = new Set((s.lastResult.wrongOptionIds ?? []).map((w) => w.split(">")[0]));
        const pairsToShow = wrongLeftIds.size > 0 ? q.pairs.filter(([lId]) => wrongLeftIds.has(lId)) : q.pairs;
        const parts = await Promise.all(
          pairsToShow.map(async ([lId, rId]) => `${await resolveItem(leftById.get(lId))} ← ${await resolveItem(rightById.get(rId))}`),
        );
        return parts.filter(Boolean).join("  |  ");
      }
      return "";
    };
    void resolve().then((text) => { if (active) setCorrectAnswerText(text); });
    return () => { active = false; };
  }, [q, s.lastResult]);

  if (s.status === "loading" || s.status === "idle") {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fcf9f2] dark:bg-[#121824] text-slate-700 dark:text-slate-200">
        <BookOpen className="w-10 h-10 animate-bounce text-amber-600 mb-3" />
        <p className="font-bold text-sm">در حال چیدن صف هوشمند جلسه...</p>
      </div>
    );
  }

  // Finished Session Screen
  if (s.status === "finished") {
    const m = s.summary;
    const isEmpty = m?.total === 0;
    const isPassed = !!m?.passed;
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fcf9f2] dark:bg-[#121824] text-slate-800 dark:text-slate-100 select-none">
        <div className="w-full max-w-md bg-termeh-card dark:bg-lapis-card p-6 sm:p-8 rounded-3xl border border-termeh-border dark:border-lapis-border shadow-xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-3xl flex items-center justify-center shadow-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white">
            {isPassed ? <Award className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {isEmpty
                ? stage === -6
                  ? "فعلاً آیتم تلاوتی آماده نیست — یا مدل آفلاین نصب نشده یا هنوز دادهٔ کافی نداریم"
                : stage === -5
                  ? "سؤال کافی برای دریل اتصال و شروع از وسط موجود نیست"
                  : stage === -2
                  ? "سؤال کافی برای آزمون میانبر این واحد موجود نیست"
                  : stage === -1
                  ? "خطایی برای تمرین ترمیمی ثبت نشده است"
                  : stage === 0
                  ? "فعلاً کارتی برای مرور سررسید نشده است"
                  : "برای این مرحله هنوز سؤالی بارگذاری نشده است"
                : stage === -6
                ? reciteKind === "hunt"
                  ? "شکار خطای تلاوت به پایان رسید"
                  : reciteKind === "exam"
                    ? "آزمون تلاوت به پایان رسید"
                    : "همراهی آزاد به پایان رسید"
                : stage === -5
                ? "دریل اتصال و شروع از وسط به پایان رسید"
                : stage === -2
                ? isPassed
                  ? "آزمون میانبر با موفقیت گذرانده شد 🎉"
                  : "آزمون میانبر به نصاب قبولی نرسید"
                : s.practiceOnly
                ? "دور مرور اشتباه‌ها به پایان رسید"
                : stage === -1
                ? "تمرین ترمیمی هوشمند به پایان رسید"
                : stage === 0
                ? "جلسه مرور روزانه به پایان رسید"
                : isPassed
                ? m?.stageCompleted
                  ? `مرحله ${toFarsiNum(stage)} با موفقیت کامل شد 🎉`
                  : m?.lessonNumber && m?.lessonsRequired
                  ? `درس ${toFarsiNum(m.lessonNumber)} از ${toFarsiNum(m.lessonsRequired)} مرحله ${toFarsiNum(stage)} انجام شد 🎉`
                  : `مرحله ${toFarsiNum(stage)} با موفقیت گذرانده شد 🎉`
                : `نیاز به تمرین بیشتر در مرحله ${toFarsiNum(stage)}`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isEmpty
                ? "می‌توانید بعداً دوباره بررسی کنید یا به نقشه برگردید."
                : stage === -2
                ? isPassed
                  ? "همهٔ ۸ مرحلهٔ این نیم‌صفحه ثبت شدند و کارت‌های مرور هوشمند با سررسید پخش‌شده آماده شدند. (توجّه: آزمون میانبر عبور از مراحل را ثبت می‌کند، نه تسلط حرف‌به‌حرف تلاوت را.)"
                  : "هیچ مرحله‌ای ثبت نشد، ولی پاسخ‌های شما برای مرور هوشمند ذخیره شدند."
                : isPassed
                ? m?.stageCompleted
                  ? "تسلط بر این مرحله تکمیل شد و مرحله بعدی برای شما باز شد."
                  : "عالی بود! یک درس کوتاه دیگر باقی مانده تا این مرحله کامل شود."
                : m?.passMinAttempts && m.total < m.passMinAttempts
                ? `این درس فقط ${toFarsiNum(m.total)} سؤال داشت؛ برای قبولی دست‌کم ${toFarsiNum(m.passMinAttempts)} پاسخِ تلاش اول لازم است و سؤال‌های این مرحله فعلاً کمتر از این‌اند.`
                : m?.requiredRatio
                ? `برای قبولی در این درس حداقل ${toFarsiNum(Math.round(m.requiredRatio * 100))}٪ پاسخ درست در تلاش اول لازم است${stage === 8 ? " (بدون راهنما)" : ""}.`
                : "برای تثبیت کامل حافظه، تکرار دوباره این درس توصیه می‌شود."}
            </p>
          </div>

          {/* Stats Box */}
          {m && !isEmpty && (
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs">
              <div className="space-y-0.5">
                <span className="text-slate-400">پاسخ‌های درست:</span>
                <div className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                  {toFarsiNum(m.correct)} از {toFarsiNum(m.total)} ({toFarsiNum(Math.round(m.ratio * 100))}٪)
                </div>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400">بدهی مرور باقی‌مانده:</span>
                <div className="font-extrabold text-sm text-amber-600 dark:text-amber-400">
                  {toFarsiNum(m.debt)} کارت
                </div>
              </div>
              {Boolean(m.xpEarned || m.gemsEarned) && (
                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-4 text-xs font-bold">
                  {!!m.xpEarned && <span className="text-amber-600 dark:text-amber-400">+{toFarsiNum(m.xpEarned)} نور ✨</span>}
                  {!!m.gemsEarned && (
                    <span className="text-rose-700 dark:text-rose-400 inline-flex items-center gap-1">
                      +{toFarsiNum(m.gemsEarned)} عقیق <AqeeqIcon className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              )}
              {(m.maxCombo ?? 0) >= 5 && (
                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  بهترین زنجیرهٔ پاسخ درست: {toFarsiNum(m.maxCombo!)}
                </div>
              )}
              {(m.reciteTotal ?? 0) > 0 && (
                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-extrabold text-rose-700 dark:text-rose-300">
                  بخش تلاوت: {toFarsiNum(m.recitePassedCount ?? 0)} از {toFarsiNum(m.reciteTotal!)} آیتم قبول شد
                </div>
              )}
            </div>
          )}

          {s.sessionType === "STAGE" && s.wrongQids.length > 0 && (
            <button
              type="button"
              onClick={() => void s.startMistakeReview()}
              className="w-full py-3.5 px-5 rounded-2xl bg-amber-500 hover:bg-amber-600 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 text-white font-black text-sm transition-all"
            >
              مرور اشتباه‌های همین جلسه ({toFarsiNum(s.wrongQids.length)} سؤال) — بدون جریمه
            </button>
          )}

          {stage === -2 && m?.testOut && !isPassed && m.testOut.weakestStage !== null && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold space-y-1">
              <div>
                ضعیف‌ترین بخش شما: مرحلهٔ {toFarsiNum(m.testOut.weakestStage)} (
                {toFarsiNum(Math.round((m.testOut.perStage[m.testOut.weakestStage]?.ratio ?? 0) * 100))}٪)
              </div>
              <div className="font-normal text-[11px] opacity-90">
                برای قبولی در آزمون میانبر: حداقل ۹۰٪ کل، ۷۰٪ هر مرحله و ۸۵٪ بخش‌های حفظی (۴ و ۷) لازم است.
              </div>
            </div>
          )}

          {m?.reciteGateFailed && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs font-bold">
              گیت تلاوت نابینا قبول نشد، پس این مرحله پاس نشد. برای قبولی: تلاوت کاملِ از حفظ، بدون خطای قطعی و با دقت دست‌کم ۹۰٪. درس را دوباره تکرار کنید.
            </div>
          )}

          {m?.waivedLesson && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>عملکرد بی‌نقص — درس دوم این مرحله حذف شد 🎉</span>
            </div>
          )}

          {m?.unlockedNext && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>واحد یادگیری بعدی برای شما باز شد!</span>
            </div>
          )}

          {m && !isEmpty && !m.passed && m.debt >= 40 && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              بدهی مرور کارت‌های شما به {toFarsiNum(m.debt)} رسیده است. واحد بعدی تا کاهش این بدهی بسته می‌ماند.
            </div>
          )}

          <div className="space-y-2.5">
            {isPassed && !isEmpty && stage > 0 && !m?.stageCompleted && (
              <button
                onClick={() => void startStage(unitId, stage)}
                className="w-full py-3.5 px-6 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/15 active:scale-[0.98] transition-all"
              >
                {m?.lessonNumber && m?.lessonsRequired
                  ? `شروع درس ${toFarsiNum(m.lessonNumber + 1)} از ${toFarsiNum(m.lessonsRequired)}`
                  : "شروع درس بعدی این مرحله"}
              </button>
            )}
            {isPassed && !isEmpty && m?.stageCompleted && stage > 0 && stage < 8 && onStartNext && (
              <button
                onClick={() => onStartNext(unitId, stage + 1)}
                className="w-full py-3.5 px-6 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/15 active:scale-[0.98] transition-all"
              >
                شروع مرحله {toFarsiNum(stage + 1)}
              </button>
            )}
            {!isPassed && !isEmpty && stage > 0 && (
              <button
                onClick={() => void startStage(unitId, stage)}
                className="w-full py-3.5 px-6 rounded-2xl font-bold text-amber-900 dark:text-amber-200 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>تلاش مجدد این درس</span>
              </button>
            )}
            <button
              onClick={onExit}
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-white bg-[#b37e3d] hover:bg-[#9d6b2f] shadow-lg shadow-amber-900/10 active:scale-[0.98] transition-all"
            >
              ادامه و بازگشت به نقشه
            </button>
          </div>
        </div>
      </div>
    );
  }

  // بلوک تلاوت فعال: پیوست مرحله (در پایان صف)، مرور صوتی (در آغاز مرور)
  // یا دریل تلاوت مستقل — به‌جای نمای سؤال نشان داده می‌شود.
  if (s.status === "running" && s.reciteSession?.active) {
    return (
      <div dir="rtl" className="min-h-screen islamic-bg bg-termeh-bg dark:bg-lapis-bg text-slate-800 dark:text-slate-100 p-4 select-none">
        <div className="max-w-md mx-auto space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">
              {stage === -6
                ? reciteKind === "hunt"
                  ? "شکار خطای تلاوت"
                  : reciteKind === "exam"
                    ? "آزمون تلاوت"
                    : "همراهی آزاد"
                : s.sessionType === "REVIEW"
                  ? "مرور صوتی امروز"
                  : "بخش تلاوت این درس"}
            </h2>
            <button
              onClick={onExit}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-black/5 dark:hover:bg-white/5"
            >
              خروج
            </button>
          </div>
          <ReciteBlockRunner />
        </div>
      </div>
    );
  }

  if (!q) return null;

  const locked = s.lastResult !== null;
  const progressPercent = Math.min(100, Math.round(((s.index + 1) / s.queue.length) * 100));

  // Determine correct answer text for feedback drawer
  const getFormattedCorrectAnswer = (): string => {
    if (correctAnswerText) return correctAnswerText;
    if (q.shape === "choice") {
      const opt = q.options?.find((o) => o.id === q.answer);
      const numVal = opt?.num ?? opt?.n;
      return opt?.ar?.trim() || opt?.fa?.trim() || (numVal !== undefined ? toFarsiNum(numVal) : "") || opt?.wordsAr?.join(" ") || opt?.words?.join(" ") || (opt?.wordRange ? `آیه ${toFarsiNum(opt.wordRange.verse)}، واژه‌های ${toFarsiNum(opt.wordRange.from)} تا ${toFarsiNum(opt.wordRange.to)}` : "");
    }
    if (q.shape === "order" && Array.isArray(q.answer)) {
      const byId = new Map((q.bank || []).map((b) => [b.id, b]));
      return (q.answer as string[])
        .map((id) => byId.get(id)?.ar || byId.get(id)?.fa || "")
        .filter(Boolean)
        .join(" ◄ ");
    }
    if (q.shape === "cloze" && typeof q.answer === "object" && q.answer !== null) {
      const byId = new Map((q.bank || []).map((b) => [b.id, b]));
      return Object.entries(q.answer as Record<string, string>)
        .map(([k, id]) => `[${toFarsiNum(k)}: ${byId.get(id)?.ar || byId.get(id)?.fa || ""}]`)
        .join(" ");
    }
    return "";
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col islamic-bg bg-termeh-bg dark:bg-lapis-bg text-slate-800 dark:text-slate-100 select-none pb-32">
      {/* Top Navigation & Progress Bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-termeh-bg/95 dark:bg-lapis-bg/95 backdrop-blur border-b-2 border-brand-amber/40 dark:border-lapis-border">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform text-slate-500"
          title="خروج از جلسه"
        >
          <ArrowRight className="w-5 h-5" />
        </button>

        {/* Linear Progress Bar (Duolingo glossy chunky style) */}
        <div className="flex-1 h-4 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-l from-[#10B981] to-[#00A896] rounded-full transition-all duration-300 ease-out relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute inset-x-2 top-0.5 h-1 rounded-full bg-white/35" />
          </div>
        </div>

        {s.combo >= 3 && (
          <div className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs font-black shrink-0">
            🔥 ×{toFarsiNum(s.combo)}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            const nextVal = !noAudio;
            setNoAudioToday(nextVal);
            setNoAudio(nextVal);
          }}
          title={noAudio ? "حالت بدون صوت روشن است" : "الان نمی‌توانم گوش بدهم"}
          className={`py-1.5 px-2.5 rounded-xl border-2 font-extrabold text-[11px] flex items-center gap-1 transition-all shrink-0 ${
            noAudio
              ? "bg-amber-500 border-amber-700 text-white"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300"
          }`}
        >
          {noAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>{noAudio ? "بدون صوت" : "با صوت"}</span>
        </button>

        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
          {toFarsiNum(s.index + 1)} / {toFarsiNum(s.queue.length)}
        </div>
      </header>

      {/* Main Question Body */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col justify-center space-y-3">
        {q.stem?.verse && !noAudio && (locked || !AUDIO_REVEALS_ANSWER.has(q.type)) && (
          <div className="w-full max-w-xl mx-auto px-3">
            <VerseAudioPlayer verses={[q.stem.verse]} compact />
          </div>
        )}
        <QuestionRenderer
          key={q.id + ":" + s.index}
          q={q}
          locked={locked}
          feedback={
            s.lastResult && !s.lastResult.correct
              ? {
                  wrongIds: s.lastResult.wrongOptionIds,
                  correctId: typeof q.answer === "string" ? q.answer : undefined,
                }
              : null
          }
          disableHint={s.sessionType === "TESTOUT"}
          onSubmit={(r, m) => {
            void s.submit(r, m).then((res) => {
              if (!res) return;
              playSfx(res.correct ? "correct-chime" : "error-thud");
            });
          }}
        />
      </main>

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-termeh-card dark:bg-lapis-card p-5 sm:p-6 rounded-3xl max-w-xs w-full shadow-2xl text-center space-y-4">
            <h3 className="font-bold text-sm sm:text-base">خروج از جلسه یادگیری؟</h3>
            <p className="text-xs text-slate-500">
              پیشرفت این جلسه تا این نقطه ذخیره شده و بعداً می‌توانید ادامه دهید.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onExit}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 text-white font-bold text-xs"
              >
                خروج
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                ادامه جلسه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Feedback Drawer (Duolingo Style) */}
      {s.lastResult && (
        <div
          className={`fixed bottom-0 inset-x-0 z-30 p-4 sm:p-5 border-t-2 shadow-2xl transition-all animate-in slide-in-from-bottom duration-200 ${
            s.lastResult.correct
              ? "bg-[#edf8f1] dark:bg-[#10271d] border-emerald-400 text-emerald-950 dark:text-emerald-100"
              : "bg-[#fdf2f2] dark:bg-[#2b1418] border-rose-400 text-rose-950 dark:text-rose-100"
          }`}
        >
          <div className="max-w-xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                {s.lastResult.correct ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span className="font-extrabold text-base sm:text-lg">
                  {s.lastResult.correct ? "آفرین! کاملاً درست است" : "پاسخ صحیح نبود"}
                </span>
              </div>

              {!s.lastResult.correct && getFormattedCorrectAnswer() && (
                <div className="text-xs sm:text-sm font-bold text-rose-900 dark:text-rose-200 bg-rose-100/70 dark:bg-rose-900/40 p-2.5 rounded-xl">
                  <span>پاسخ درست: </span>
                  <span className="font-normal">{getFormattedCorrectAnswer()}</span>
                </div>
              )}

              {q.explanationFa && (
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pt-0.5">
                  {renderRichFa(q.explanationFa)}
                </p>
              )}
            </div>

            <button
              disabled={s.status !== "running" || s.lastResult === null}
              onClick={() => void s.next()}
              className={`w-full sm:w-auto min-w-[8rem] py-3.5 px-6 rounded-2xl font-black text-white border-b-4 active:border-b-0 active:translate-y-1 transition-all text-sm shrink-0 ${
                s.lastResult.correct
                  ? "bg-[#10B981] hover:brightness-105 border-[#047857]"
                  : "bg-[#EF4444] hover:brightness-105 border-[#B91C1C]"
              }`}
            >
              ادامه
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
