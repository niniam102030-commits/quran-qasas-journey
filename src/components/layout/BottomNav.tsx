// src/components/layout/BottomNav.tsx
import React from "react";
import { BookOpen, Award, Flame, Settings, Dumbbell } from "lucide-react";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

export type NavTab = "units" | "mastery" | "practice" | "profile" | "settings";

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

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; activeClass: string; dotClass: string }[] = [
    {
      id: "units",
      label: "واحدهای قرآن",
      icon: <BookOpen className="w-5 h-5" />,
      activeClass: "bg-brand-primary/15 text-brand-primaryDark dark:text-brand-primary border border-brand-primary/40",
      dotClass: "bg-brand-primary",
    },
    {
      id: "mastery",
      label: "تسلط ۸۸ آیه",
      icon: <Award className="w-5 h-5" />,
      activeClass: "bg-gradient-to-b from-amber-500/15 to-yellow-500/20 text-amber-800 dark:text-amber-300 border border-amber-400/40",
      dotClass: "bg-amber-500",
    },
    {
      id: "practice",
      label: "تمرین من",
      icon: <Dumbbell className="w-5 h-5" />,
      activeClass: "bg-gradient-to-b from-teal-500/15 to-emerald-500/20 text-teal-800 dark:text-teal-300 border border-teal-400/40",
      dotClass: "bg-teal-500",
    },
    {
      id: "profile",
      label: "چله و انس",
      icon: <Flame className="w-5 h-5" />,
      activeClass: "bg-gradient-to-b from-rose-500/15 to-orange-500/20 text-rose-700 dark:text-rose-300 border border-rose-400/40",
      dotClass: "bg-rose-500",
    },
    {
      id: "settings",
      label: "تنظیمات",
      icon: <Settings className="w-5 h-5" />,
      activeClass: "bg-gradient-to-b from-indigo-500/15 to-sky-500/20 text-indigo-700 dark:text-sky-300 border border-indigo-400/40",
      dotClass: "bg-indigo-500",
    },
  ];

  return (
    <nav
      aria-label="منوی ناوبری اصلی"
      className="fixed bottom-0 left-0 right-0 z-40 bg-termeh-bg/95 dark:bg-lapis-bg/95 backdrop-blur-lg border-t-2 border-brand-amber/40 dark:border-lapis-border shadow-[0_-6px_24px_rgba(2,128,144,0.12)] py-2 px-4 transition-colors"
    >
      <div className="max-w-md mx-auto flex items-center justify-around gap-1.5">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`flex-1 min-w-0 py-1.5 px-2 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 ${
                isActive
                  ? `${item.activeClass} font-extrabold shadow-sm`
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
              <span className="text-[11px] leading-none tracking-tight whitespace-nowrap">
                {item.label}
              </span>
              {isActive && (
                <div className={`w-1.5 h-1.5 rounded-full ${item.dotClass} mt-0.5 animate-pulse`} />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
