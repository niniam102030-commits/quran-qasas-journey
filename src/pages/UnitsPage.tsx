// src/pages/UnitsPage.tsx
// فهرست ۲۲ واحد (نیم‌صفحه) در قالب ۱۰ فصل داستانی سوره قصص با داشبورد برنامه امروز، مأموریت‌ها، چرخه مراجعه و نقاط کور.
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { Award, Settings, Bell, Lock, Check, ChevronRight, Play, Eye, Headphones, GitCompare, Flame, Sparkles, Crown, Star, Zap, Layers, Mic, Gauge, CheckCircle2, RefreshCw, Target, BookOpen, Gift, X } from "lucide-react";
import { ldb, DEFAULT_USER_PROFILE, type UnitProgressRow, type UserProfileRow } from "../db/learningDb";
import { reviewDebt, type StoredCard } from "../learning/cardScheduler";
import { skillLevel, LESSONS_PER_STAGE } from "../learning/mastery";
import { TESTOUT_MIN_QUESTIONS } from "../learning/testOut";
import { buildReviewForecast, type ForecastDay } from "../learning/forecast";
import { PACE_MODE_LIST, dailyReviewCapFor, summarizeForecastLoad } from "../learning/pace";
import { buildTodayPlan, type TodayTask } from "../learning/todayPlan";
import { missionsForDate, missionProgress, type DailyMission, type MissionFacts } from "../learning/missions";
import { planMuraja, type MurajaPlan } from "../learning/muraja";
import { buildBlindSpotPack, getLocalSaturdayWeekIso, MIN_BLINDSPOT_QUESTIONS, type BlindSpotPack } from "../learning/blindSpots";
import { STORY_CHAPTERS, chapterOfUnit, chapterProgress, type StoryChapter } from "../learning/chapters";
import { getMeta, setMeta } from "../services/metaStore";
import { getLocalDateIso, recordLearningReward } from "../services/profileService";
import type { CycleKind } from "../store/useLearningStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import MushafHalfPage from "../components/mushaf/MushafHalfPage";
import TasmiModal from "../components/mushaf/TasmiModal";
import VocabPrescreenModal from "../components/learning/VocabPrescreenModal";
import StoryOrderGame from "../components/learning/StoryOrderGame";
import AqeeqIcon from "../components/common/AqeeqIcon";

interface UnitInfo extends UnitProgressRow {
  verseFrom?: number;
  verseTo?: number;
  page?: number;
  half?: string;
}

const CHAPTER_GRADIENTS = [
  "from-[#0F766E] to-[#115E59]",
  "from-[#0D9488] to-[#0F766E]",
  "from-[#B45309] to-[#78350F]",
  "from-[#059669] to-[#065F46]",
  "from-[#6D28D9] to-[#4C1D95]",
  "from-[#0369A1] to-[#0C4A6E]",
  "from-[#047857] to-[#064E3B]",
  "from-[#4338CA] to-[#312E81]",
  "from-[#92400E] to-[#451A03]",
  "from-[#1E293B] to-[#0F172A]",
];

const STAGE_SHORT_LABELS: Record<number, string> = {
  1: "واژگان",
  2: "ترجمه",
  3: "ساخت آیه",
  4: "جای‌خالی",
  5: "قبل و بعد",
  6: "شماره",
  7: "یادآوری",
  8: "آزمون",
};

const NODE_OFFSETS = [0, 26, 42, 26, 0, -26, -42, -26];

interface Props {
  onStartStage: (unitId: string, stage: number) => void;
  onStartTestOut?: (unitId: string) => void;
  onStartBlindSpots?: () => void;
  onStartCycleReview?: (kind: CycleKind) => void;
  onNavigateTab?: (tab: "mastery" | "settings") => void;
  onStartAudioQuiz?: () => void;
  onOpenMutashabihat?: () => void;
  onBack?: () => void;
  syncVersion?: number;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

function formatTargetLabel(target: string): string {
  const parts = target.split(":");
  const kind = parts[0];
  const verse = parts[1];
  if (!verse) return target;
  if (kind === "vr" || kind === "vt" || kind === "vn" || kind === "sq") {
    return `آیهٔ ${toFarsiNum(verse)}`;
  }
  if (kind === "w") return `واژهٔ آیهٔ ${toFarsiNum(verse)}`;
  if (kind === "c") return `عبارت آیهٔ ${toFarsiNum(verse)}`;
  return target;
}

export default function UnitsPage({
  onStartStage,
  onStartTestOut,
  onStartBlindSpots,
  onStartCycleReview,
  onNavigateTab,
  onStartAudioQuiz,
  onOpenMutashabihat,
  onBack,
  syncVersion,
}: Props) {
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [unitQuestionCounts, setUnitQuestionCounts] = useState<Record<string, number>>({});
  const [testOutModalUnitId, setTestOutModalUnitId] = useState<string | null>(null);
  const [prescreenUnitId, setPrescreenUnitId] = useState<string | null>(null);
  const [tasmiUnit, setTasmiUnit] = useState<UnitInfo | null>(null);
  const [storyGameChapter, setStoryGameChapter] = useState<StoryChapter | null>(null);
  const [celebratedChapter, setCelebratedChapter] = useState<StoryChapter | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [debt, setDebt] = useState(0);
  const [forecastDays, setForecastDays] = useState<ForecastDay[]>([]);
  const [murajaPlan, setMurajaPlan] = useState<MurajaPlan>({
    sabq: [],
    sabqi: [],
    manzil: [],
    manzilBucket: 0,
    bucketCount: 0,
  });
  const [blindSpotPack, setBlindSpotPack] = useState<BlindSpotPack | null>(null);
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [dailyMissions, setDailyMissions] = useState<{ mission: DailyMission; done: number; complete: boolean }[]>([]);
  const [claimedMissions, setClaimedMissions] = useState<string[]>([]);
  const [todayFacts, setTodayFacts] = useState<MissionFacts>({
    reviewAnswers: 0,
    lessonsCompleted: 0,
    tasmiCount: 0,
    precisionCorrect: 0,
    testOutAttempts: 0,
    cycleSessions: 0,
  });
  const paceMode = usePreferencesStore((s) => s.paceMode);
  const setPaceMode = usePreferencesStore((s) => s.setPaceMode);
  const [masteryCount, setMasteryCount] = useState({ total: 0, level3: 0 });
  const [profile, setProfile] = useState<UserProfileRow>(DEFAULT_USER_PROFILE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Sub-view: Mushaf
  const [mushafUnitId, setMushafUnitId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const todayIso = getLocalDateIso(now);
      const weekIso = getLocalSaturdayWeekIso(now);

      const [
        prog,
        cards,
        prof,
        allQs,
        allAttempts,
        allConfusions,
        tasmiLog,
        savedClaimed,
        savedPack,
        savedCelebrated,
      ] = await Promise.all([
        ldb.unitProgress.toArray(),
        ldb.cards.toArray(),
        ldb.profile.get("main"),
        ldb.questions.toArray(),
        ldb.attempts.toArray(),
        ldb.confusions.toArray(),
        getMeta<{ dateIso: string; at: number; unitId: string }[]>("tasmiiLog", []),
        getMeta<string[]>(`missionClaimed:${todayIso}`, []),
        getMeta<BlindSpotPack | null>("blindSpotPack", null),
        getMeta<string[]>("chapterCelebrated", []),
      ]);

      const qCounts: Record<string, number> = {};
      for (const q of allQs) {
        qCounts[q.unitId] = (qCounts[q.unitId] ?? 0) + 1;
      }
      setUnitQuestionCounts(qCounts);
      if (prof) setProfile(prof);
      const manifestRes = await fetch(`${import.meta.env.BASE_URL || "/"}content/manifest.json`);
      if (!manifestRes.ok) throw new Error(`فهرست محتوا: ${manifestRes.status}`);
      const manifest = await manifestRes.json();
      const info = new Map<string, { verseFrom: number; verseTo: number; page: number; half: string }>(
        manifest.units.map((u: { id: string; verseFrom: number; verseTo: number; page: number; half: string }) => [u.id, u])
      );
      const orderById = new Map<string, number>(manifest.units.map((u: { id: string; order: number }) => [u.id, u.order] as [string, number]));
      const sorted = prog
        .slice()
        .sort((a, b) => (orderById.get(a.unitId) ?? Number.MAX_SAFE_INTEGER) - (orderById.get(b.unitId) ?? Number.MAX_SAFE_INTEGER))
        .map((p) => ({ ...p, unlocked: true, ...info.get(p.unitId) }));
      setUnits(sorted);
      setSelectedUnitId((prev) => {
        if (prev && sorted.some((u) => u.unitId === prev)) return prev;
        const firstIncomplete = sorted.find((u) => Object.values(u.stagePassed || {}).filter(Boolean).length < 8);
        return firstIncomplete?.unitId ?? sorted[0]?.unitId ?? null;
      });

      const currentDebt = reviewDebt(cards, now);
      setDebt(currentDebt);
      setForecastDays(buildReviewForecast(cards));
      setMasteryCount({
        total: cards.length,
        level3: cards.filter((c: StoredCard) => skillLevel(c) >= 3).length,
      });

      // L2: چرخه مراجعه
      const muraja = planMuraja(
        sorted.map((u, idx) => ({
          unitId: u.unitId,
          order: idx + 1,
          stage8PassedAt: u.stagePassed[8] ? u.updatedAt : null,
        })),
        now,
      );
      setMurajaPlan(muraja);

      // L3: بسته هفتگی نقاط کور
      let pack = savedPack;
      if (!pack || pack.weekIso !== weekIso) {
        pack = buildBlindSpotPack({ confusions: allConfusions, attempts: allAttempts, now });
        await setMeta("blindSpotPack", pack);
      }
      setBlindSpotPack(pack);

      // G3: آمار مأموریت‌های روزانه
      const todayAttempts = allAttempts.filter((a) => getLocalDateIso(new Date(a.at)) === todayIso);
      const facts: MissionFacts = {
        reviewAnswers: todayAttempts.filter(
          (a) => a.sessionType === "REVIEW" || a.sessionType.startsWith("CYCLE:"),
        ).length,
        lessonsCompleted: Math.floor(
          todayAttempts.filter((a) => a.sessionType === "STAGE").length / 10,
        ),
        tasmiCount: tasmiLog.filter((t) => t.dateIso === todayIso).length,
        precisionCorrect: todayAttempts.filter(
          (a) => a.correct && a.stage >= 4 && a.stage <= 8,
        ).length,
        testOutAttempts: todayAttempts.some((a) => a.sessionType === "TESTOUT") ? 1 : 0,
        cycleSessions: todayAttempts.some(
          (a) => a.sessionType === "CYCLE:MANZIL" || a.sessionType === "CYCLE:SABQI",
        )
          ? 1
          : 0,
      };
      setTodayFacts(facts);

      const passedUnits = sorted.filter((u) => !!u.stagePassed[8]);
      const firstIncomplete = sorted.find(
        (u) => Object.values(u.stagePassed || {}).filter(Boolean).length < 8,
      );
      const nextStage = firstIncomplete
        ? [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !firstIncomplete.stagePassed[s]) ?? 1
        : 1;

      const missions = missionsForDate(todayIso, passedUnits.length > 0);
      setDailyMissions(missionProgress(missions, facts));
      setClaimedMissions(savedClaimed);

      // U1: برنامه امروز
      const tasks = buildTodayPlan({
        dueCount: currentDebt,
        reviewCap: dailyReviewCapFor(usePreferencesStore.getState().paceMode),
        currentUnitId: firstIncomplete?.unitId ?? null,
        currentStage: nextStage,
        allUnitsPassed: sorted.length > 0 && !firstIncomplete,
        tasmiDoneToday: facts.tasmiCount > 0,
        manzilUnitIds: muraja.manzil,
        blindSpotAvailable: pack.questionIds.length >= MIN_BLINDSPOT_QUESTIONS,
        lastPassedUnitId: passedUnits[passedUnits.length - 1]?.unitId ?? null,
        hasPassedUnit: passedUnits.length > 0,
      });
      setTodayTasks(tasks);

      // G1: جشن یک‌بارهٔ تکمیل فصل
      const chapterInputs = sorted.map((u) => ({
        verseFrom: u.verseFrom ?? 1,
        stage8Passed: !!u.stagePassed[8],
      }));
      const newlyCompleted = STORY_CHAPTERS.find(
        (ch) => chapterProgress(ch, chapterInputs).complete && !savedCelebrated.includes(ch.id),
      );
      if (newlyCompleted) {
        setCelebratedChapter(newlyCompleted);
        await setMeta("chapterCelebrated", [...savedCelebrated, newlyCompleted.id]);
        try {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.65 } });
        } catch {
          // محیط تست بدون canvas
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [syncVersion, paceMode]);

  const handleClaimMission = async (mission: DailyMission) => {
    const todayIso = getLocalDateIso(new Date());
    if (claimedMissions.includes(mission.kind)) return;
    await recordLearningReward({ gemsDelta: mission.rewardGems, markDailyActivity: true });
    const nextClaimed = [...claimedMissions, mission.kind];
    await setMeta(`missionClaimed:${todayIso}`, nextClaimed);
    setClaimedMissions(nextClaimed);
    setProfile((prev) => ({ ...prev, aqeeqGems: prev.aqeeqGems + mission.rewardGems }));
  };

  const isTaskDone = (task: TodayTask): boolean => {
    switch (task.kind) {
      case "REVIEW":
        return debt === 0;
      case "LESSON":
        return todayFacts.lessonsCompleted > 0;
      case "MANZIL":
        return todayFacts.cycleSessions > 0;
      case "BLINDSPOTS":
        return false;
      case "TASMI":
        return todayFacts.tasmiCount > 0;
      default:
        return false;
    }
  };

  const launchTodayTask = (task: TodayTask) => {
    switch (task.kind) {
      case "REVIEW":
        onStartStage("", 0);
        break;
      case "LESSON":
        if (task.unitId) onStartStage(task.unitId, task.stage ?? 1);
        break;
      case "MANZIL":
        onStartCycleReview?.("MANZIL");
        break;
      case "BLINDSPOTS":
        onStartBlindSpots?.();
        break;
      case "TASMI": {
        const target =
          units.find((u) => u.unitId === task.unitId) ??
          units.filter((u) => !!u.stagePassed[8]).slice(-1)[0];
        if (target) setTasmiUnit(target);
        break;
      }
      case "TESTOUT_SUGGEST":
        if (task.unitId) setTestOutModalUnitId(task.unitId);
        break;
    }
  };

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

  let lastChapterId = "";
  const chapterProgressInput = units.map((u) => ({
    verseFrom: u.verseFrom ?? 1,
    stage8Passed: !!u.stagePassed[8],
  }));

  return (
    <div dir="rtl" className="min-h-screen islamic-bg bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 pb-24 select-none">
      {/* Top Iranian-Islamic Stats & Navigation Bar */}
      <header className="sticky top-0 z-20 bg-[#FAF7F2]/95 dark:bg-[#0B132B]/95 backdrop-blur-md border-b-2 border-[#d4af37]/50 dark:border-teal-800/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform"
                title="بازگشت"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
            {/* چله انس */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-200 dark:border-amber-800/70">
              <Flame className="w-4 h-4 text-amber-500 fill-amber-400" />
              <span className="text-xs font-black text-amber-800 dark:text-amber-300">
                {toFarsiNum(profile.chillehCurrentDays)}
              </span>
            </div>
            {/* امتیاز نور */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-200 dark:border-emerald-800/70">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                {toFarsiNum(profile.noorXp)}
              </span>
            </div>
            {/* عقیق قرمز یمن */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-200 dark:border-rose-800/70">
              <AqeeqIcon className="w-4 h-4" />
              <span className="text-xs font-black text-rose-800 dark:text-rose-300">
                {toFarsiNum(profile.aqeeqGems)}
              </span>
            </div>
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-1.5">
            {onNavigateTab && (
              <>
                <button
                  onClick={() => onNavigateTab("mastery")}
                  className="py-1.5 px-2.5 rounded-2xl bg-white dark:bg-[#1C2541] border-2 border-b-4 border-[#E5DEC9] dark:border-[#3A506B] active:border-b-2 active:translate-y-[2px] text-amber-800 dark:text-amber-300 font-extrabold text-xs flex items-center gap-1 transition-all"
                  title="جدول تسلط بر ۸۸ آیه"
                >
                  <Award className="w-4 h-4 text-amber-500" />
                  <span className="hidden sm:inline">تسلط ({toFarsiNum(masteryCount.level3)})</span>
                  <span className="sm:hidden text-[11px]">{toFarsiNum(masteryCount.level3)}</span>
                </button>

                <button
                  onClick={() => onNavigateTab("settings")}
                  className="p-2 rounded-2xl bg-white dark:bg-[#1C2541] border-2 border-b-4 border-[#E5DEC9] dark:border-[#3A506B] active:border-b-2 active:translate-y-[2px] text-slate-600 dark:text-slate-200 transition-all"
                  title="تنظیمات"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-5 space-y-5">
        {error && (
          <div role="alert" className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-200 text-rose-800 dark:text-rose-200 text-sm">
            <p className="font-bold">خطا در بارگذاری داده‌ها: {error}</p>
            <button type="button" onClick={() => void loadData()} className="mt-2 rounded-xl bg-rose-600 border-b-4 border-rose-800 px-4 py-2 text-white font-bold">تلاش دوباره</button>
          </div>
        )}

        {/* Quick Hifz Tools: 3D Duolingo Cards */}
        {(onStartAudioQuiz || onOpenMutashabihat) && (
          <section className="grid grid-cols-2 gap-3">
            {onStartAudioQuiz && (
              <button
                type="button"
                onClick={onStartAudioQuiz}
                className="p-3.5 rounded-3xl bg-white dark:bg-[#1C2541] border-2 border-b-4 border-[#E5DEC9] dark:border-[#3A506B] hover:border-amber-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-2.5 text-right transition-all"
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Headphones className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">آزمون صوتی حفظ</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">آیه بعدی و شماره آیه</div>
                </div>
              </button>
            )}
            {onOpenMutashabihat && (
              <button
                type="button"
                onClick={onOpenMutashabihat}
                className="p-3.5 rounded-3xl bg-white dark:bg-[#1C2541] border-2 border-b-4 border-[#E5DEC9] dark:border-[#3A506B] hover:border-teal-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-2.5 text-right transition-all"
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <GitCompare className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">مقایسه متشابهات</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">تفاوت آیات مشابه قصص</div>
                </div>
              </button>
            )}
          </section>
        )}

        {/* Non-blocking Lamps: Daily Review & Debt Warning */}
        <section className="space-y-2.5">
          {debt > 0 && (
            <div className="p-4 rounded-3xl bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-amber-900/30 border-2 border-amber-300 dark:border-amber-800/80 shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 border-b-4 border-amber-700 text-white flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200">
                    {toFarsiNum(debt)} کارت آماده مرور روزانه
                  </h3>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                    مرور به موقع مانع فراموشی می‌شود.
                  </p>
                </div>
              </div>

              <button
                onClick={() => onStartStage("", 0)}
                className="py-2.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 text-white font-black text-xs shrink-0 transition-all flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>مرور روزانه</span>
              </button>
            </div>
          )}

          {debt >= 40 && (
            <div className="p-3.5 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border-2 border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">هشدار سقف بدهی مرور: </span>
                <span>
                  بدهی مرور شما {toFarsiNum(debt)} کارت است (سقف مجاز: ۴۰). واحدهای بعد تا انجام مرورها بسته می‌مانند، اما می‌توانید مرور روزانه و مراحل قبلی را آزادانه تمرین کنید.
                </span>
              </div>
            </div>
          )}

          {/* Pace Mode & 7-Day Review Forecast (F5) */}
          {(() => {
            const load = summarizeForecastLoad(forecastDays, paceMode);
            const maxBar = Math.max(load.cap, load.peakDay?.dueCount ?? 0, 1);
            return (
              <div className="p-4 rounded-3xl bg-white dark:bg-[#1C2541] border-2 border-[#E5DEC9] dark:border-[#3A506B] shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-[#00A896]" />
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                      پیش‌بینی مرور ۷ روز آینده
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      ({toFarsiNum(load.total7Days)} کارت)
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {PACE_MODE_LIST.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaceMode(m.id)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all ${
                          paceMode === m.id
                            ? "bg-[#00A896] text-white shadow-sm"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {m.labelFa} ({toFarsiNum(m.dailyReviewCap)})
                      </button>
                    ))}
                  </div>
                </div>

                {forecastDays.length > 0 && (
                  <div className="grid grid-cols-7 gap-1.5 items-end pt-1">
                    {forecastDays.map((d) => {
                      const over = d.dueCount > load.cap;
                      const heightPct = Math.max(10, Math.round((d.dueCount / maxBar) * 100));
                      return (
                        <div key={d.dayOffset} className="flex flex-col items-center gap-1">
                          <span
                            className={`text-[10px] font-black ${
                              over
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {toFarsiNum(d.dueCount)}
                          </span>
                          <div className="w-full h-12 rounded-lg bg-slate-100 dark:bg-slate-800/80 flex items-end overflow-hidden p-0.5">
                            <div
                              className={`w-full rounded-md transition-all ${
                                over ? "bg-rose-500" : d.dueCount > 0 ? "bg-[#00A896]" : "bg-slate-300 dark:bg-slate-700"
                              }`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate max-w-full">
                            {d.dayOffset === 0 ? "امروز" : d.dayOffset === 1 ? "فردا" : `+${toFarsiNum(d.dayOffset)}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {load.overCapDays > 0 && (
                  <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                    در {toFarsiNum(load.overCapDays)} روز آینده بار مرور از سقف روزانهٔ {toFarsiNum(load.cap)} سؤال بیشتر است؛ پیشنهاد می‌شود پیشروی جدید را کمی آهسته‌تر کنید.
                  </p>
                )}
              </div>
            );
          })()}

          {/* G1: بنر جشن یک‌بارهٔ تکمیل فصل */}
          {celebratedChapter && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-400 dark:border-emerald-700 flex items-center justify-between gap-3 shadow-sm">
              <div className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                فصل «{celebratedChapter.titleFa}» کامل شد 📖
              </div>
              <button
                type="button"
                onClick={() => setCelebratedChapter(null)}
                className="p-1 rounded-xl text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                aria-label="بستن اعلان"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* U1: کارت برنامهٔ امروز + G3: مأموریت‌های روزانه */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1C2541] border-2 border-emerald-200 dark:border-teal-800/70 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                  برنامهٔ امروز
                </h3>
              </div>
              {todayTasks.length > 0 && (() => {
                const nextTask = todayTasks.find((t) => !isTaskDone(t)) ?? todayTasks[0];
                return (
                  <button
                    type="button"
                    onClick={() => launchTodayTask(nextTask)}
                    className="py-1.5 px-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>شروع</span>
                  </button>
                );
              })()}
            </div>

            {todayTasks.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-2xl">
                همهٔ وظایف امروز انجام شده است. آفرین به استمرار شما!
              </p>
            ) : (
              <div className="space-y-1.5">
                {todayTasks.map((task, idx) => {
                  const done = isTaskDone(task);
                  return (
                    <button
                      key={`${task.kind}-${idx}`}
                      type="button"
                      onClick={() => launchTodayTask(task)}
                      className={`w-full text-right p-2.5 rounded-2xl border flex items-center justify-between gap-2 transition-colors ${
                        done
                          ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                          : "bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-emerald-400"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            done
                              ? "bg-emerald-600 text-white"
                              : "border-2 border-slate-300 dark:border-slate-600"
                          }`}
                        >
                          {done && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                        <div className="min-w-0">
                          <div className={`text-xs font-extrabold truncate ${done ? "line-through opacity-75" : ""}`}>
                            {task.titleFa}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {task.detailFa}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 rotate-180 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* G3: مأموریت‌های روزانه */}
            {dailyMissions.length > 0 && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/70 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-200">
                  <Gift className="w-4 h-4 text-rose-500" />
                  <span>مأموریت‌های امروز</span>
                </div>
                <div className="space-y-1.5">
                  {dailyMissions.map(({ mission, done, complete }) => {
                    const claimed = claimedMissions.includes(mission.kind);
                    return (
                      <div
                        key={mission.kind}
                        className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                            {mission.titleFa}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            پیشرفت: {toFarsiNum(done)} از {toFarsiNum(mission.target)} • پاداش {toFarsiNum(mission.rewardGems)} عقیق
                          </div>
                        </div>
                        {claimed ? (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] shrink-0">
                            دریافت شد
                          </span>
                        ) : complete ? (
                          <button
                            type="button"
                            onClick={() => void handleClaimMission(mission)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] shrink-0 transition-colors"
                          >
                            دریافت (+{toFarsiNum(mission.rewardGems)})
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-200/70 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-bold text-[11px] shrink-0">
                            {toFarsiNum(done)}/{toFarsiNum(mission.target)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* L2: چرخهٔ مراجعهٔ امروز (سبق / سبقی / منزل) */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1C2541] border-2 border-[#E5DEC9] dark:border-[#3A506B] shadow-sm space-y-2.5">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                چرخهٔ مراجعهٔ امروز
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { kind: "SABQ" as const, label: "سبق (۷ روز اخیر)", items: murajaPlan.sabq },
                  { kind: "SABQI" as const, label: "سبقی (۸ تا ۳۰ روز)", items: murajaPlan.sabqi },
                  {
                    kind: "MANZIL" as const,
                    label:
                      murajaPlan.bucketCount > 0
                        ? `منزل (بخش ${toFarsiNum(murajaPlan.manzilBucket + 1)} از ${toFarsiNum(murajaPlan.bucketCount)})`
                        : "منزل (چرخشی)",
                    items: murajaPlan.manzil,
                  },
                ]
              ).map((row) => {
                const empty = row.items.length === 0;
                return (
                  <div
                    key={row.kind}
                    className={`p-3 rounded-2xl border flex items-center justify-between sm:flex-col sm:items-stretch gap-2 ${
                      empty
                        ? "bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800 text-slate-400"
                        : "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-black ${empty ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>
                        {row.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {empty ? "فعلاً موردی نیست" : `${toFarsiNum(row.items.length)} نیم‌صفحه`}
                      </div>
                    </div>
                    {!empty && onStartCycleReview && (
                      <button
                        type="button"
                        onClick={() => onStartCycleReview(row.kind)}
                        className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                      >
                        مرور
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* L3: بستهٔ هفتگی نقاط کور من */}
          {blindSpotPack && blindSpotPack.questionIds.length >= MIN_BLINDSPOT_QUESTIONS && onStartBlindSpots && (
            <div className="p-4 rounded-2xl bg-white dark:bg-[#1C2541] border-2 border-amber-200 dark:border-amber-800/70 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                  <Target className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>نقاط کور این هفته ({toFarsiNum(blindSpotPack.questionIds.length)} سؤال)</span>
                </div>
                {blindSpotPack.topTargets.length > 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    پرتکرارترین لغزش‌ها: {blindSpotPack.topTargets.map(formatTargetLabel).join("، ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onStartBlindSpots}
                className="py-2 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shrink-0 transition-colors"
              >
                شروع تمرین
              </button>
            </div>
          )}
        </section>

        {/* 22 Learning Units grouped by 10 Story Chapters (G1) */}
        <section className="space-y-5">
          {units.length === 0 && !error && loading && (
            <div className="p-8 text-center bg-white dark:bg-[#1C2541] rounded-3xl border-2 border-[#E5DEC9] dark:border-[#3A506B] space-y-3 shadow-sm">
              <div className="w-8 h-8 mx-auto border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">در حال آماده‌سازی نقشه سفر سوره قصص...</p>
            </div>
          )}
          {!loading && !error && units.length === 0 && (
            <div role="status" className="p-6 text-center text-sm text-slate-600">هیچ واحدی در محتوای محلی پیدا نشد. همگام‌سازی محتوا را دوباره اجرا کنید.</div>
          )}
          {units.map((u, idx) => {
            const passedCount = Object.values(u.stagePassed || {}).filter(Boolean).length;
            const isComplete = passedCount === 8;
            const chapter = chapterOfUnit(u.verseFrom ?? 1);
            const showChapterBanner = chapter.id !== lastChapterId;
            if (showChapterBanner) lastChapterId = chapter.id;
            const chProg = showChapterBanner ? chapterProgress(chapter, chapterProgressInput) : null;
            const chGradient = CHAPTER_GRADIENTS[(chapter.order - 1) % CHAPTER_GRADIENTS.length];
            const isExpanded = selectedUnitId === u.unitId;

            // مرحله پیشنهادی بعدی در این نیم‌صفحه (همه نیم‌صفحه‌ها و مراحل برای انتخاب آزادند)
            const activeStage = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !u.stagePassed[s]) ?? 1;

            return (
              <div key={u.unitId} className="space-y-4">
                {showChapterBanner && chProg && (
                  <div className={`p-4 sm:p-5 rounded-3xl bg-gradient-to-l ${chGradient} text-white shadow-lg border-2 border-[#d4af37]/55 border-b-4 border-b-black/30 relative overflow-hidden`}>
                    <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/15 px-2.5 py-0.5 rounded-full border border-white/20">
                          <span>فصل {toFarsiNum(chapter.order)}</span>
                          <span>•</span>
                          <span>آیات {toFarsiNum(chapter.verseFrom)} تا {toFarsiNum(chapter.verseTo)}</span>
                          <span>•</span>
                          <span>{toFarsiNum(chProg.done)} از {toFarsiNum(chProg.total)} نیم‌صفحه</span>
                        </div>
                        <h2 className="text-base sm:text-lg font-black tracking-tight">{chapter.titleFa}</h2>
                        <p className="text-xs text-white/90">{chapter.teaserFa}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {chProg.complete && (
                          <button
                            type="button"
                            onClick={() => setStoryGameChapter(chapter)}
                            className="py-2 px-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs flex items-center gap-1.5 shadow transition-colors"
                          >
                            <BookOpen className="w-4 h-4" />
                            <span>بازی ترتیب وقایع</span>
                          </button>
                        )}
                        <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-[#d4af37]/60 shadow-inner">
                          <Crown className="w-5 h-5 text-amber-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className={`p-4 sm:p-5 rounded-3xl border-2 transition-all space-y-4 ${
                    isExpanded
                      ? "bg-white dark:bg-[#1C2541] border-[#00A896] dark:border-teal-500 tazhib-frame"
                      : "bg-white/95 dark:bg-[#1C2541]/90 border-[#d4af37]/45 dark:border-[#3A506B] hover:border-[#00A896]/70 shadow-sm"
                  }`}
                >
                  {/* Unit Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedUnitId(u.unitId)}
                      className="flex items-center gap-3 text-right"
                    >
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm border-b-4 ${
                          isComplete
                            ? "bg-amber-400 border-amber-600 text-amber-950"
                            : isExpanded
                            ? "bg-[#00A896] border-[#028090] text-white"
                            : "bg-gradient-to-br from-amber-500 to-[#b37e3d] border-amber-800 text-white"
                        }`}
                      >
                        {isComplete ? <Crown className="w-5 h-5" /> : toFarsiNum(idx + 1)}
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span>
                            صفحه {toFarsiNum(u.page || "")} ({u.half === "a" ? "نیمه اول" : "نیمه دوم"})
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          آیات {toFarsiNum(u.verseFrom || 1)} تا {toFarsiNum(u.verseTo || 1)} • {toFarsiNum(passedCount)} از ۸ مرحله
                        </p>
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {!u.stagePassed[1] && (
                        <button
                          type="button"
                          onClick={() => setPrescreenUnitId(u.unitId)}
                          title="پیش‌غربال سریع واژگان بلدشده قبل از شروع مرحله ۱"
                          className="py-2 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 border-2 border-b-4 border-emerald-200 dark:border-emerald-800 active:border-b-2 active:translate-y-[2px] text-emerald-800 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1 transition-all"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>پیش‌غربال واژگان</span>
                        </button>
                      )}
                      {!isComplete && onStartTestOut && (
                        <button
                          type="button"
                          disabled={(unitQuestionCounts[u.unitId] ?? 0) < TESTOUT_MIN_QUESTIONS}
                          onClick={() => setTestOutModalUnitId(u.unitId)}
                          title={
                            (unitQuestionCounts[u.unitId] ?? 0) < TESTOUT_MIN_QUESTIONS
                              ? "تعداد سؤال‌های این واحد برای آزمون میانبر کافی نیست"
                              : "آزمون میانبر ۲۸ سؤالی برای عبور یکجا از این نیم‌صفحه"
                          }
                          className="py-2 px-3 rounded-2xl bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/50 dark:hover:bg-violet-900/50 border-2 border-b-4 border-violet-200 dark:border-violet-800 active:border-b-2 active:translate-y-[2px] text-violet-800 dark:text-violet-300 text-xs font-extrabold flex items-center gap-1 transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>آزمون میانبر</span>
                        </button>
                      )}
                      {!isExpanded && (
                        <button
                          type="button"
                          onClick={() => setSelectedUnitId(u.unitId)}
                          className="py-2 px-3 rounded-2xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/50 border-2 border-b-4 border-teal-200 dark:border-teal-800 active:border-b-2 active:translate-y-[2px] text-[#028090] dark:text-teal-300 text-xs font-extrabold transition-all"
                        >
                          مسیر کامل
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setTasmiUnit(u)}
                        title="تسمیع از حفظ و خودارزیابی آیات این نیم‌صفحه"
                        className="py-2 px-3 rounded-2xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/50 border-2 border-b-4 border-sky-200 dark:border-sky-800 active:border-b-2 active:translate-y-[2px] text-sky-800 dark:text-sky-300 text-xs font-extrabold flex items-center gap-1 transition-all"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>تسمیع</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMushafUnitId(u.unitId)}
                        className="py-2 px-3 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 border-2 border-b-4 border-amber-200 dark:border-amber-800 active:border-b-2 active:translate-y-[2px] text-amber-900 dark:text-amber-300 text-xs font-extrabold flex items-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>مصحف</span>
                      </button>
                    </div>
                  </div>

                  {/* Duolingo Winding Path for the selected half-page, OR direct 1-tap clickable 3D stage pills for all other half-pages */}
                  {isExpanded ? (
                    <div className="relative py-3 flex flex-col items-center gap-4">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s, sIdx) => {
                        const passed = !!u.stagePassed[s];
                        const lessonsDone = passed ? LESSONS_PER_STAGE : (u.stageLessons?.[s] ?? 0);
                        const inProgress = !passed && lessonsDone > 0;
                        const isActive = activeStage === s;
                        const offsetX = NODE_OFFSETS[sIdx] ?? 0;

                        return (
                          <div
                            key={s}
                            className="relative flex flex-col items-center"
                            style={{ transform: `translateX(${offsetX}px)` }}
                          >
                            {isActive && (
                              <div className="mb-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-800 border-2 border-[#00A896] text-[#028090] dark:text-teal-300 text-[11px] font-black shadow-md animate-bounce">
                                {inProgress ? `ادامه (${toFarsiNum(lessonsDone)}/${toFarsiNum(LESSONS_PER_STAGE)})` : "شروع!"}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => onStartStage(u.unitId, s)}
                              className={`relative w-16 h-16 rounded-full font-black transition-all flex flex-col items-center justify-center ${
                                passed
                                  ? "bg-[#10B981] border-b-[6px] border-[#047857] text-white shadow-md hover:brightness-105 active:border-b-0 active:translate-y-1.5"
                                  : isActive
                                  ? "bg-[#00A896] border-b-[6px] border-[#028090] text-white shadow-lg ring-4 ring-teal-400/35 hover:brightness-105 active:border-b-0 active:translate-y-1.5"
                                  : "bg-gradient-to-b from-amber-400 to-amber-500 border-b-[6px] border-amber-700 text-white shadow-md hover:brightness-105 active:border-b-0 active:translate-y-1.5"
                              }`}
                            >
                              {passed ? (
                                <Check className="w-7 h-7 stroke-[3]" />
                              ) : s === 8 ? (
                                <Crown className="w-6 h-6" />
                              ) : (
                                <Star className="w-6 h-6 fill-white/90" />
                              )}
                              {inProgress && (
                                <span className="absolute -bottom-1.5 px-1.5 py-0.5 rounded-full bg-amber-300 text-amber-950 text-[10px] font-black border border-white dark:border-slate-900 shadow">
                                  {toFarsiNum(lessonsDone)}/{toFarsiNum(LESSONS_PER_STAGE)}
                                </span>
                              )}
                            </button>
                            <span
                              className={`mt-1.5 text-[11px] font-extrabold ${
                                passed
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : isActive
                                  ? "text-[#028090] dark:text-teal-300"
                                  : "text-slate-700 dark:text-slate-200"
                              }`}
                            >
                              {toFarsiNum(s)}. {STAGE_SHORT_LABELS[s]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
                        const passed = !!u.stagePassed[s];
                        const lessonsDone = passed ? LESSONS_PER_STAGE : (u.stageLessons?.[s] ?? 0);
                        const inProgress = !passed && lessonsDone > 0;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => onStartStage(u.unitId, s)}
                            title={`شروع مرحله ${s}: ${STAGE_SHORT_LABELS[s]}`}
                            className={`py-1.5 px-2.5 rounded-2xl text-xs font-extrabold border-2 border-b-4 active:border-b-2 active:translate-y-[2px] transition-all flex items-center gap-1 ${
                              passed
                                ? "bg-emerald-500 border-emerald-700 text-white"
                                : inProgress
                                ? "bg-teal-50 dark:bg-teal-950/60 border-[#00A896] text-[#028090] dark:text-teal-300"
                                : "bg-[#FAF7F2] dark:bg-slate-800 border-[#d4af37]/55 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#00A896]"
                            }`}
                          >
                            {passed ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <span>{toFarsiNum(s)}.</span>}
                            <span>{STAGE_SHORT_LABELS[s]}</span>
                            {inProgress && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                ({toFarsiNum(lessonsDone)}/{toFarsiNum(LESSONS_PER_STAGE)})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </main>

      {/* Half-Page Tasmi Modal (F2) */}
      {tasmiUnit && (
        <TasmiModal
          unitId={tasmiUnit.unitId}
          page={tasmiUnit.page}
          half={tasmiUnit.half}
          verseFrom={tasmiUnit.verseFrom}
          verseTo={tasmiUnit.verseTo}
          onClose={() => {
            setTasmiUnit(null);
            void loadData();
          }}
          onStartReview={() => onStartStage("", 0)}
        />
      )}

      {/* Vocab Pre-Screen Modal (F4) */}
      {prescreenUnitId && (
        <VocabPrescreenModal
          unitId={prescreenUnitId}
          onClose={() => {
            setPrescreenUnitId(null);
            void loadData();
          }}
          onStartStage1={(uid) => onStartStage(uid, 1)}
        />
      )}

      {/* Story Order Game Modal (L5) */}
      {storyGameChapter && (
        <StoryOrderGame
          chapter={storyGameChapter}
          onClose={() => {
            setStoryGameChapter(null);
            void loadData();
          }}
        />
      )}

      {/* Test-Out Confirmation Modal */}
      {testOutModalUnitId && onStartTestOut && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a2332] p-5 sm:p-6 rounded-3xl max-w-sm w-full shadow-2xl border-2 border-violet-200 dark:border-violet-900 space-y-4 text-right">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">آزمون میانبر واحد</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              اگر این نیم‌صفحه را از قبل بلدی، با یک آزمون ۲۸ سؤالی می‌توانی همهٔ مراحلش را یکجا پاس کنی. قبولی: حداقل ۹۰٪ و بدون راهنما. اگر قبول نشوی، هیچ مرحله‌ای ثبت نمی‌شود ولی پاسخ‌هایت برای مرور هوشمند ذخیره می‌شوند.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const uid = testOutModalUnitId;
                  setTestOutModalUnitId(null);
                  onStartTestOut(uid);
                }}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-violet-600 hover:bg-violet-700 border-b-4 border-violet-800 active:border-b-0 active:translate-y-0.5 text-white font-black text-xs transition-all"
              >
                شروع آزمون میانبر
              </button>
              <button
                type="button"
                onClick={() => setTestOutModalUnitId(null)}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
