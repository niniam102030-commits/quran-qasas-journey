// src/App.tsx
import { useState, useEffect } from "react";
import { usePreferencesStore } from "./store/usePreferencesStore";
import { BottomNav, type NavTab } from "./components/layout/BottomNav";
import { syncContent } from "./services/contentLoader";
import UnitsPage from "./pages/UnitsPage";
import LearningSessionPage from "./pages/LearningSessionPage";
import AudioQuizPage from "./pages/AudioQuizPage";
import MasteryPage from "./pages/MasteryPage";
import SettingsPage from "./pages/SettingsPage";
import { ChillehProfilePage } from "./pages/ChillehProfilePage";
import MutashabihatModal from "./components/mushaf/MutashabihatModal";

export type AppView = "units" | "mastery" | "profile" | "settings" | "session" | "audioQuiz";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("units");
  const [session, setSession] = useState<{ unitId: string; stage: number; remedialTag?: string | null } | null>(null);
  const [mutashabihatVerse, setMutashabihatVerse] = useState<number | null | false>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncVersion, setSyncVersion] = useState<number>(0);
  const [syncing, setSyncing] = useState(true);

  const runContentSync = () => {
    setSyncing(true);
    setSyncError(null);
    setSyncProgress(null);
    return syncContent((done, total) => setSyncProgress({ done, total }))
      .then(() => {
        setSyncVersion((v) => v + 1);
        setSyncError(null);
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

  const handleStartRemedial = (tag: string | null = null) => {
    setSession({ unitId: "", stage: -1, remedialTag: tag });
    setCurrentView("session");
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
        onStartNext={handleStartStage}
        onExit={handleExitSession}
      />
    );
  }

  if (currentView === "audioQuiz") {
    return <AudioQuizPage onExit={() => setCurrentView("units")} />;
  }

  return (
    <div className="min-h-screen bg-[#fcfaf5] dark:bg-[#121824] text-slate-900 dark:text-slate-100 transition-colors">
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

      {!syncing && !syncError && currentView === "units" && (
        <UnitsPage
          key={syncVersion}
          syncVersion={syncVersion}
          onNavigateTab={(tab) => setCurrentView(tab)}
          onStartAudioQuiz={() => setCurrentView("audioQuiz")}
          onOpenMutashabihat={() => setMutashabihatVerse(null)}
          onStartStage={handleStartStage}
          onStartTestOut={handleStartTestOut}
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
        <SettingsPage onBack={() => setCurrentView("units")} />
      )}

      {/* منوی دسترسی سریع پایین */}
      {!syncing && !syncError && <BottomNav
        activeTab={currentView === "session" ? "units" : currentView}
        onSelectTab={handleSelectNavTab}
      />}
    </div>
  );
}
