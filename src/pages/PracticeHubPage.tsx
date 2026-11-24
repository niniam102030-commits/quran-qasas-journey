// src/pages/PracticeHubPage.tsx
// هاب یکپارچهٔ «تمرین من» (مورد ۹ و ۱۲): همهٔ تمرین‌های شخصی در یک درِ ورودی
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  Gauge,
  Gift,
  GitCompare,
  Headphones,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { ldb } from "../db/learningDb";
import { buildReviewForecast, type ForecastDay } from "../learning/forecast";
import { PACE_MODE_LIST, summarizeForecastLoad } from "../learning/pace";
import { missionsForDate, missionProgress, type DailyMission, type MissionFacts } from "../learning/missions";
import { planMuraja, type MurajaPlan } from "../learning/muraja";
import { buildBlindSpotPack, getLocalSaturdayWeekIso, MIN_BLINDSPOT_QUESTIONS, type BlindSpotPack } from "../learning/blindSpots";
import type { ExamScope } from "../learning/examEngine";
import type { CycleKind } from "../store/useLearningStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { getMeta, setMeta } from "../services/metaStore";
import { getLocalDateIso, recordLearningReward } from "../services/profileService";
import { getDeferredAudio, clearDeferredAudio, isNoAudioToday, type DeferredAudioEntry } from "../services/noAudioService";
import type { SurahPackMeta } from "../services/surahPackService";

interface Props {
  onBack: () => void;
  onStartBlindSpots?: () => void;
  onStartCycleReview?: (kind: CycleKind) => void;
  onStartDrill?: (unitId?: string | null) => void;
  onStartExam?: (scope?: ExamScope | null) => void;
  onStartAudioQuiz?: () => void;
  onOpenTajweedLessons?: () => void;
  onOpenMutashabihat?: () => void;
  onOpenVocabBook: () => void;
  onOpenAudioLesson: () => void;
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

export default function PracticeHubPage({
  onBack,
  onStartBlindSpots,
  onStartCycleReview,
  onStartDrill,
  onStartExam,
  onStartAudioQuiz,
  onOpenTajweedLessons,
  onOpenMutashabihat,
  onOpenVocabBook,
  onOpenAudioLesson,
}: Props) {
  const paceMode = usePreferencesStore((s) => s.paceMode);
  const setPaceMode = usePreferencesStore((s) => s.setPaceMode);
  const activeSurah = usePreferencesStore((s) => s.activeSurah);
  const devMode = usePreferencesStore((s) => s.devMode);

  const [deferredList, setDeferredList] = useState<DeferredAudioEntry[]>([]);
  const [forecastDays, setForecastDays] = useState<ForecastDay[]>([]);
  const [murajaPlan, setMurajaPlan] = useState<MurajaPlan>({
    sabq: [],
    sabqi: [],
    manzil: [],
    manzilBucket: 0,
    bucketCount: 0,
  });
  const [blindSpotPack, setBlindSpotPack] = useState<BlindSpotPack | null>(null);
  const [dailyMissions, setDailyMissions] = useState<{ mission: DailyMission; done: number; complete: boolean }[]>([]);
  const [claimedMissions, setClaimedMissions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const now = new Date();
        const todayIso = getLocalDateIso(now);
        const weekIso = getLocalSaturdayWeekIso(now);

        const [
          deferred,
          prog,
          cards,
          allAttempts,
          allConfusions,
          tasmiLog,
          savedClaimed,
          savedPack,
        ] = await Promise.all([
          getDeferredAudio(),
          ldb.unitProgress.toArray(),
          ldb.cards.toArray(),
          ldb.attempts.toArray(),
          ldb.confusions.toArray(),
          getMeta<{ dateIso: string; at: number; unitId: string }[]>("tasmiiLog", []),
          getMeta<string[]>(`missionClaimed:${todayIso}`, []),
          getMeta<BlindSpotPack | null>("blindSpotPack", null),
        ]);
        if (!active) return;

        setDeferredList(deferred);
        setForecastDays(buildReviewForecast(cards));

        let orderById = new Map<string, number>();
        if (activeSurah === 28) {
          const manifestRes = await fetch(`${import.meta.env.BASE_URL || "/"}content/manifest.json`);
          if (manifestRes.ok) {
            const manifest = await manifestRes.json();
            orderById = new Map<string, number>(
              manifest.units.map((u: { id: string; order: number }) => [u.id, u.order] as [string, number]),
            );
          }
        } else {
          const packMeta = await getMeta<SurahPackMeta | null>(`surahPackMeta:${activeSurah}`, null);
          const packUnits = packMeta?.units ?? [];
          orderById = new Map(packUnits.map((u, idx) => [u.id, u.order ?? idx + 1]));
        }
        if (!active) return;

        const sorted = prog
          .filter((p) => orderById.has(p.unitId))
          .slice()
          .sort((a, b) => (orderById.get(a.unitId) ?? Number.MAX_SAFE_INTEGER) - (orderById.get(b.unitId) ?? Number.MAX_SAFE_INTEGER));

        const muraja = planMuraja(
          sorted.map((u, idx) => ({
            unitId: u.unitId,
            order: idx + 1,
            stage8PassedAt: u.stagePassed[8] ? u.updatedAt : null,
          })),
          now,
        );
        setMurajaPlan(muraja);

        let pack = savedPack;
        if (!pack || pack.weekIso !== weekIso) {
          pack = buildBlindSpotPack({ confusions: allConfusions, attempts: allAttempts, now });
          await setMeta("blindSpotPack", pack);
        }
        if (!active) return;
        setBlindSpotPack(pack);

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
        const passedUnits = sorted.filter((u) => !!u.stagePassed[8]);
        const missions = missionsForDate(todayIso, passedUnits.length > 0);
        setDailyMissions(missionProgress(missions, facts));
        setClaimedMissions(savedClaimed);
      } catch {
        // ignore
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [activeSurah]);

  const handleClaimMission = async (mission: DailyMission) => {
    const todayIso = getLocalDateIso(new Date());
    if (claimedMissions.includes(mission.kind)) return;
    await recordLearningReward({ gemsDelta: mission.rewardGems, markDailyActivity: true });
    const nextClaimed = [...claimedMissions, mission.kind];
    await setMeta(`missionClaimed:${todayIso}`, nextClaimed);
    setClaimedMissions(nextClaimed);
  };

  const noAudioToday = isNoAudioToday();

  return (
    <div dir="rtl" className="min-h-screen islamic-bg bg-termeh-bg dark:bg-lapis-bg text-slate-900 dark:text-slate-100 pb-24 select-none">
      {/* هدر ساده */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-termeh-bg/95 dark:bg-lapis-bg/95 backdrop-blur border-b-2 border-brand-amber/40 dark:border-lapis-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
            title="بازگشت"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 font-black text-base">
            <Sparkles className="w-4 h-4 text-brand-primary" />
            <span>تمرین من</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-5 space-y-4">
        {/* کارت فعالیت‌های صوتی معوق (مورد ۴) */}
        {deferredList.length > 0 && onStartAudioQuiz && (
          <section className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                <Headphones className="w-4 h-4 text-amber-600" />
                <span>فعالیت‌های صوتی معوق</span>
              </div>
              <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80">
                یک فعالیت صوتی از وقتی که نمی‌توانستید گوش بدهید باقی مانده
              </p>
              {noAudioToday && (
                <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                  حالت بدون صوت امروز فعال است
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={noAudioToday}
              onClick={async () => {
                await clearDeferredAudio("audioQuiz");
                setDeferredList((prev) => prev.filter((e) => e.kind !== "audioQuiz"));
                onStartAudioQuiz();
              }}
              className="py-2 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 disabled:opacity-45 text-white font-black text-xs shrink-0 transition-colors"
            >
              انجام آزمون صوتی
            </button>
          </section>
        )}

        {/* L2: چرخهٔ مراجعهٔ امروز (سبق / سبقی / منزل) */}
        <div className="p-4 rounded-2xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border shadow-sm space-y-2.5">
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
                  {(!empty || devMode) && onStartCycleReview && (
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

        {/* G3: مأموریت‌های روزانه */}
        {dailyMissions.length > 0 && (
          <div className="p-4 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border shadow-sm space-y-2">
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

        {/* Pace Mode & 7-Day Review Forecast (F5) */}
        {(() => {
          const load = summarizeForecastLoad(forecastDays, paceMode);
          const maxBar = Math.max(load.cap, load.peakDay?.dueCount ?? 0, 1);
          return (
            <div className="p-4 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border shadow-sm space-y-3">
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

        {/* شبکهٔ کارت‌های ورودی ابزارهای تمرین */}
        <section className="space-y-2.5">
          <button
            type="button"
            onClick={onOpenVocabBook}
            className="w-full p-3.5 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-b-4 border-termeh-border dark:border-lapis-border hover:border-teal-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-3 text-right transition-all"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <BookOpenText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-800 dark:text-slate-100">دفترچهٔ واژگان من</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">جستجو، فیلتر سطح قدرت و مرور فلش‌کارت</div>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenAudioLesson}
            className="w-full p-3.5 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-b-4 border-termeh-border dark:border-lapis-border hover:border-amber-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-3 text-right transition-all"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Headphones className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-800 dark:text-slate-100">درس شنیداری چشم‌بسته</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">پخش پیوستهٔ منشاوی با مکث تکرار بدون نگاه به صفحه</div>
            </div>
          </button>

          {onStartAudioQuiz && (
            <button
              type="button"
              onClick={onStartAudioQuiz}
              className="w-full p-3.5 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-b-4 border-termeh-border dark:border-lapis-border hover:border-amber-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-3 text-right transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800 dark:text-slate-100">آزمون صوتی حفظ</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">آیه بعدی چیست؟ و شمارهٔ آیه</div>
              </div>
            </button>
          )}

          {onStartDrill && (
            <button
              type="button"
              onClick={() => onStartDrill(null)}
              className="w-full p-3.5 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-b-4 border-termeh-border dark:border-lapis-border hover:border-emerald-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-3 text-right transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Zap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800 dark:text-slate-100">دریل اتصال و شروع از وسط</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">تمرین سریع پیوند آیات برای مرور فوری</div>
              </div>
            </button>
          )}

          {onStartExam && (
            <button
              type="button"
              onClick={() => onStartExam(null)}
              className="w-full p-3.5 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-b-4 border-termeh-border dark:border-lapis-border hover:border-indigo-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-3 text-right transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800 dark:text-slate-100">آزمون تخصصی</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ارزیابی جامع سوره و کارنامهٔ رسمی</div>
              </div>
            </button>
          )}

          {onOpenTajweedLessons && (
            <button
              type="button"
              onClick={onOpenTajweedLessons}
              className="w-full p-3.5 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-b-4 border-termeh-border dark:border-lapis-border hover:border-orange-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-3 text-right transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Palette className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800 dark:text-slate-100">درس‌های تجوید</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">احکام رنگی و تمرین با صوت استاد منشاوی</div>
              </div>
            </button>
          )}

          {onOpenMutashabihat && (
            <button
              type="button"
              onClick={onOpenMutashabihat}
              className="w-full p-3.5 rounded-3xl bg-termeh-card dark:bg-lapis-card border-2 border-b-4 border-termeh-border dark:border-lapis-border hover:border-teal-400 active:border-b-2 active:translate-y-[2px] flex items-center gap-3 text-right transition-all"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <GitCompare className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800 dark:text-slate-100">متشابهات</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">مقایسه و تشخیص تفاوت آیات مشابه</div>
              </div>
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
