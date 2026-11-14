// src/App.tsx
import { useState, useEffect } from "react";
import { useAppStore } from "./store/useAppStore";
import { BottomNav, type NavTab } from "./components/layout/BottomNav";
import { syncContent } from "./services/contentLoader";
import UnitsPage from "./pages/UnitsPage";
import LearningSessionPage from "./pages/LearningSessionPage";
import MasteryPage from "./pages/MasteryPage";
import SettingsPage from "./pages/SettingsPage";
import { ChillehProfilePage } from "./pages/ChillehProfilePage";

export type AppView = "units" | "mastery" | "profile" | "settings" | "session";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("units");
  const [session, setSession] = useState<{ unitId: string; stage: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncVersion, setSyncVersion] = useState<number>(0);

  // همگام‌سازی محتوای واقعی (manifest) با IndexedDB جدید
  useEffect(() => {
    syncContent((done, total) => {
      setSyncProgress({ done, total });
    })
      .then(() => {
        setSyncProgress(null);
        setSyncVersion((v) => v + 1);
      })
      .catch((e) => {
        setSyncProgress(null);
        setSyncError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const initApp = useAppStore((s) => s.initApp);

  useEffect(() => {
    initApp();
  }, [initApp]);

  const handleStartStage = (unitId: string, stage: number) => {
    setSession({ unitId, stage });
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
        onExit={handleExitSession}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfaf5] dark:bg-[#121824] text-slate-900 dark:text-slate-100 transition-colors">
      {syncError && (
        <div className="bg-rose-500 text-white text-xs p-2 text-center font-bold">
          خطا در بارگذاری اولیه محتوا: {syncError}
        </div>
      )}

      {syncProgress && syncProgress.total > 0 && (
        <div dir="rtl" className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-4 py-2.5 text-xs font-bold shadow-md flex items-center justify-between gap-3 sticky top-0 z-50 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping" />
            <span>در حال آماده‌سازی و بارگذاری آفلاین ۶۶ فایل دانشنامه‌ای سوره قصص... ({syncProgress.done} از {syncProgress.total})</span>
          </div>
          <span className="font-mono text-amber-200">
            {Math.round((syncProgress.done / syncProgress.total) * 100)}%
          </span>
        </div>
      )}

      {currentView === "units" && (
        <UnitsPage
          key={syncVersion}
          syncVersion={syncVersion}
          onBack={() => {}}
          onStartStage={handleStartStage}
        />
      )}

      {currentView === "mastery" && (
        <MasteryPage
          onBack={() => setCurrentView("units")}
          onSelectUnit={(uid) => handleStartStage(uid, 1)}
        />
      )}

      {currentView === "profile" && (
        <div className="pb-16">
          <ChillehProfilePage />
        </div>
      )}

      {currentView === "settings" && (
        <SettingsPage onBack={() => setCurrentView("units")} />
      )}

      {/* منوی دسترسی سریع پایین */}
      <BottomNav
        activeTab={currentView === "session" ? "units" : currentView}
        onSelectTab={handleSelectNavTab}
      />
    </div>
  );
}
