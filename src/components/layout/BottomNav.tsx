// src/components/layout/BottomNav.tsx
import React from "react";
import { BookOpen, Award, Flame, Settings } from "lucide-react";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

export type NavTab = "units" | "mastery" | "profile" | "settings";

export interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const { playSfx } = useHapticsAndSfx();

  const handleTabClick = (tab: NavTab) => {
    playSfx("snap-click");
    onSelectTab(tab);
  };

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "units",
      label: "واحدهای قرآن",
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      id: "mastery",
      label: "تسلط ۸۸ آیه",
      icon: <Award className="w-5 h-5" />,
    },
    {
      id: "profile",
      label: "چله و انس",
      icon: <Flame className="w-5 h-5" />,
    },
    {
      id: "settings",
      label: "تنظیمات",
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      aria-label="منوی ناوبری اصلی"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-lapis-card/90 backdrop-blur-lg border-t-2 border-termeh-border dark:border-lapis-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)] py-2 px-4 transition-colors"
    >
      <div className="max-w-md mx-auto flex items-center justify-around gap-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`flex-1 py-1.5 px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 ${
                isActive
                  ? "bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary dark:text-brand-primary font-bold shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/40"
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-transform ${
                  isActive ? "scale-110" : ""
                }`}
              >
                {item.icon}
              </div>
              <span className="text-[11px] leading-none tracking-tight">
                {item.label}
              </span>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-0.5 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
