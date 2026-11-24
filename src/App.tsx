// src/App.tsx
import { useState, useEffect } from "react";
import { usePreferencesStore } from "./store/usePreferencesStore";
import { BottomNav, type NavTab } from "./components/layout/BottomNav";
import { syncContent } from "./services/contentLoader";
import { getMeta } from "./services/metaStore";
import { syncDailyReminder } from "./services/reminderService";
import { loadFsrsTuningFromMeta, runDailyFsrsTuningIfNeeded } from "./services/fsrsTuningService";
import { initProfileRegistry } from "./services/profileManager";
import type { CycleKind } from "./store/useLearningStore";
import type { ExamScope } from "./learning/examEngine";
import UnitsPage from "./pages/UnitsPage";
import LearningSessionPage from "./pages/LearningSessionPage";
import AudioQuizPage from "./pages/AudioQuizPage";
import ExamPage from "./pages/ExamPage";
import TajweedLessonsPage from "./pages/TajweedLessonsPage";
import ProfilesPage from "./pages/ProfilesPage";
import SurahsPage from "./pages/SurahsPage";
import MasteryPage from "./pages/MasteryPage";
import SettingsPage from "./pages/SettingsPage";
import { ChillehProfilePage } from "./pages/ChillehProfilePage";
import MutashabihatModal from "./components/mushaf/MutashabihatModal";
import OnboardingFlow from "./components/onboarding/OnboardingFlow";
import DevModeModal from "./components/dev/DevModeModal";

export type AppView =
  | "units"
  | "mastery"
  | "profile"
  | "settings"
  | "session"
  | "audioQuiz"
  | "exam"
  | "tajweed"
  | "profiles"
  | "surahs";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("units");
  const [examInitialScope, setExamInitialScope] = useState<ExamScope | null>(null);
  const [session, setSession] = useState<{
    unitId: string;
    stage: number;
    remedialTag?: string | null;
    cycleKind?: CycleKind | null;
  } | null>(null);
  const [mutashabihatVerse, setMutashabihatVerse] = useState<number | null | false>(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [requestedMushafUnitId, setRequestedMushafUnitId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncVersion, setSyncVersion] = useState<number>(0);
  const [syncing, setSyncing] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  const runContentSync = () => {
    initProfileRegistry();
    setSyncing(true);
    setSyncError(null);
    setSyncProgress(null);
    return syncContent((done, total) => setSyncProgress({ done, total }))
      .then(async () => {
        await loadFsrsTuningFromMeta();
        void runDailyFsrsTuningIfNeeded();
        const done = await getMeta<boolean>("onboardingDone", false);
        setNeedsOnboarding(!done);
        setSyncVersion((v) => v + 1);
        setSyncError(null);
        void syncDailyReminder({ requestPermission: false });
      })
      .catch((e) => setSyncError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setSyncing(false);
        setSyncProgress(null);
      });
  };

  useEffect(() => {
    void runContentSync();
  }, []);

  const initPreferences = usePreferencesStore((s) => s.initPreferences);

  useEffect(() => {
    initPreferences();
  }, [initPreferences]);

  const handleStartStage = (unitId: string, stage: number) => {
    setSession({ unitId, stage, remedialTag: null });
    setCurrentView("session");
  };

  const handleStartTestOut = (unitId: string) => {
    setSession({ unitId, stage: -2, remedialTag: null });
    setCurrentView("session");
  };

  const handleStartDailyReview = () => {
    setSession({ unitId: "", stage: 0, remedialTag: null, cycleKind: null });
    setCurrentView("session");
  };

  const handleStartRemedial = (tag: string | null = null) => {
    setSession({ unitId: "", stage: -1, remedialTag: tag, cycleKind: null });
    setCurrentView("session");
  };

  const handleStartBlindSpots = () => {
    setSession({ unitId: "", stage: -3, remedialTag: "blindspots", cycleKind: null });
    setCurrentView("session");
  };

  const handleStartCycleReview = (kind: CycleKind) => {
    setSession({ unitId: "", stage: -4, remedialTag: null, cycleKind: kind });
    setCurrentView("session");
  };

  const handleStartDrill = (unitId: string | null = null) => {
    setSession({ unitId: unitId ?? "", stage: -5, remedialTag: null, cycleKind: null });
    setCurrentView("session");
  };

  const handleStartExam = (scope: ExamScope | null = null) => {
    setExamInitialScope(scope);
    setCurrentView("exam");
  };

  const handleExitSession = () => {
    setSession(null);
    setCurrentView("units");
  };

  const handleSelectNavTab = (tab: NavTab) => {
    setCurrentView(tab);
  };

  // جلسه‌ی یادگیری فعال (تمام‌صفحه برای تمرکز حداکثری کاربر)
  if (currentView === "session" && session) {
    return (
      <LearningSessionPage
        unitId={session.unitId}
        stage={session.stage}
        remedialTag={session.remedialTag ?? null}
        cycleKind={session.cycleKind ?? null}
        onStartNext={handleStartStage}
        onExit={handleExitSession}
      />
    );
  }

  if (currentView === "audioQuiz") {
    return <AudioQuizPage onExit={() => setCurrentView("units")} />;
  }

  if (currentView === "tajweed") {
    return <TajweedLessonsPage onBack={() => setCurrentView("units")} />;
  }

  if (currentView === "profiles") {
    return <ProfilesPage onBack={() => setCurrentView("units")} />;
  }

  if (currentView === "surahs") {
    return <SurahsPage onBack={() => setCurrentView("units")} />;
  }

  if (currentView === "exam") {
    return (
      <ExamPage
        initialScope={examInitialScope}
        onExit={() => {
          setExamInitialScope(null);
          setCurrentView("units");
        }}
        onStartRemedial={(tag) => {
          setExamInitialScope(null);
          handleStartRemedial(tag);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-termeh-bg dark:bg-lapis-bg text-slate-900 dark:text-slate-100 transition-colors">
      {syncError && (
        <div role="alert" dir="rtl" className="bg-rose-50 text-rose-900 border-b border-rose-200 p-3 text-center text-sm">
          <p className="font-bold">بارگذاری محتوای آموزشی انجام نشد: {syncError}</p>
          <button type="button" onClick={() => void runContentSync()} disabled={syncing} className="mt-2 rounded-md bg-rose-700 px-4 py-2 font-bold text-white disabled:opacity-60">
            تلاش دوباره
          </button>
        </div>
      )}
      {syncing && !syncError && (
        <div role="status" aria-live="polite" dir="rtl" className="min-h-[55vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
          <p className="font-bold">در حال آماده‌سازی محتوای آموزشی…</p>
          {syncProgress && syncProgress.total > 0 && (
            <div className="w-full max-w-xs space-y-1.5">
              <div className="h-2 w-full rounded-full bg-amber-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-600 transition-all duration-150"
                  style={{ width: `${Math.round((syncProgress.done / syncProgress.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {syncProgress.done} از {syncProgress.total} فایل ({Math.round((syncProgress.done / syncProgress.total) * 100)}٪)
              </p>
            </div>
          )}
        </div>
      )}

      {!syncing && !syncError && needsOnboarding && (
        <OnboardingFlow
          onFinished={() => {
            setNeedsOnboarding(false);
            setCurrentView("units");
            setSyncVersion((v) => v + 1);
          }}
        />
      )}

      {!syncing && !syncError && !needsOnboarding && currentView === "units" && (
        <UnitsPage
          key={syncVersion}
          syncVersion={syncVersion}
          onNavigateTab={(tab) => setCurrentView(tab)}
          onStartAudioQuiz={() => setCurrentView("audioQuiz")}
          onOpenMutashabihat={() => setMutashabihatVerse(null)}
          onStartStage={handleStartStage}
          onStartTestOut={handleStartTestOut}
          onStartBlindSpots={handleStartBlindSpots}
          onStartCycleReview={handleStartCycleReview}
          onStartDrill={handleStartDrill}
          onStartExam={handleStartExam}
          onOpenTajweedLessons={() => setCurrentView("tajweed")}
          onOpenProfiles={() => setCurrentView("profiles")}
          onOpenSurahs={() => setCurrentView("surahs")}
          onOpenDevTools={() => setShowDevModal(true)}
          requestedMushafUnitId={requestedMushafUnitId}
          onConsumeRequestedMushaf={() => setRequestedMushafUnitId(null)}
        />
      )}

      {!syncing && !syncError && currentView === "mastery" && (
        <MasteryPage
          onBack={() => setCurrentView("units")}
          onSelectUnit={(uid) => handleStartStage(uid, 1)}
          onStartRemedial={handleStartRemedial}
          onOpenMutashabihat={(v) => setMutashabihatVerse(v ?? null)}
        />
      )}

      {mutashabihatVerse !== false && (
        <MutashabihatModal
          initialVerse={mutashabihatVerse}
          onClose={() => setMutashabihatVerse(false)}
        />
      )}

      {!syncing && !syncError && currentView === "profile" && (
        <div className="pb-16">
          <ChillehProfilePage />
        </div>
      )}

      {!syncing && !syncError && currentView === "settings" && (
        <SettingsPage
          onBack={() => setCurrentView("units")}
          onOpenProfiles={() => setCurrentView("profiles")}
          onOpenSurahs={() => setCurrentView("surahs")}
          onOpenDevTools={() => setShowDevModal(true)}
        />
      )}

      {showDevModal && (
        <DevModeModal
          onClose={() => setShowDevModal(false)}
          onRefresh={() => setSyncVersion((v) => v + 1)}
          onReopenOnboarding={() => {
            setNeedsOnboarding(true);
            setCurrentView("units");
          }}
          onNavigateView={(view) => setCurrentView(view)}
          onStartDailyReview={handleStartDailyReview}
          onStartRemedial={() => handleStartRemedial(null)}
          onStartBlindSpots={handleStartBlindSpots}
          onStartDrill={() => handleStartDrill(null)}
          onStartExam={() => handleStartExam(null)}
          onOpenMutashabihat={() => setMutashabihatVerse(null)}
          onOpenMushafUnit1={() => {
            setCurrentView("units");
            setRequestedMushafUnitId("__FIRST__");
          }}
        />
      )}

      {/* منوی دسترسی سریع پایین */}
      {!syncing && !syncError && !needsOnboarding && <BottomNav
        activeTab={currentView === "session" ? "units" : currentView}
        onSelectTab={handleSelectNavTab}
      />}
    </div>
  );
}
