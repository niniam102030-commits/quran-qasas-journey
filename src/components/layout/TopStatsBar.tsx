// src/components/layout/TopStatsBar.tsx
import React from "react";
import { useAppStore } from "../../store/useAppStore";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

export interface TopStatsBarProps {
    onOpenLampRefillModal: () => void;
}

export const TopStatsBar: React.FC<TopStatsBarProps> = ({
    onOpenLampRefillModal,
}) => {
    const userStats = useAppStore((s) => s.userStats);
    const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
    const { playSfx } = useHapticsAndSfx();

    if (!userStats) return null;

    const todayIso = new Date().toISOString().slice(0, 10);
    const isChillehActiveToday = userStats.lastActiveDateIso === todayIso;

    const handleLampClick = () => {
        playSfx("snap-click");
        onOpenLampRefillModal();
    };

    const handleThemeToggle = () => {
        playSfx("snap-click");
        toggleDarkMode();
    };

    return (
        <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-termeh-bg/90 dark:bg-lapis-bg/90 border-b-2 border-termeh-border dark:border-lapis-border transition-colors">
            <div className="max-w-xl mx-auto px-3 py-2.5 flex items-center justify-between gap-1.5">
                {/* ۱. فانوس چله انس (۷، ۱۴، ۴۰ روز) */}
                <div
                    title={`پله هدف فعلی چله انس: ${userStats.chillehStage} روز`}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all ${isChillehActiveToday
                            ? "bg-brand-amber/15 border-brand-amber/40 text-brand-amberDark dark:text-brand-amber"
                            : "bg-white/70 dark:bg-lapis-card border-termeh-border dark:border-lapis-border text-slate-600 dark:text-slate-300"
                        }`}
                >
                    {/* آیکون فانوس و شعله چله */}
                    <svg
                        className={`w-5 h-5 ${isChillehActiveToday
                                ? "text-brand-amber drop-shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse"
                                : "text-slate-400"
                            }`}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M9 2h6v2H9V2zm3 3c3.86 0 7 3.14 7 7 0 2.97-1.85 5.51-4.46 6.53L14 21H10l-.54-2.47C6.85 17.51 5 14.97 5 12c0-3.86 3.14-7 7-7zm0 3.5c-1.93 0-3.5 1.57-3.5 3.5 0 1.48.92 2.75 2.22 3.26.41.16.84-.2.75-.63-.15-.74.12-1.53.73-2.03.65-.53.8-1.45.3-2.1-.35-.45-.88-.73-1.5-.73z" />
                    </svg>
                    <div className="flex flex-col leading-none">
                        <span className="text-xs font-extrabold">
                            {userStats.chillehCurrentDays}
                            <span className="text-[10px] opacity-70 font-normal">
                                /{userStats.chillehStage}
                            </span>
                        </span>
                        <span className="text-[9px] opacity-75">چله انس</span>
                    </div>
                </div>

                {/* ۲. امتیاز نور (Noor XP) */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-lapis-card border border-termeh-border dark:border-lapis-border">
                    <svg
                        className="w-5 h-5 text-brand-amber"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M12 1.5l3.09 6.26L22 8.77l-5 4.87 1.18 6.88L12 17.27l-6.18 3.25L7 13.64 2 8.77l6.91-1.01L12 1.5z" />
                    </svg>
                    <div className="flex flex-col leading-none">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                            {userStats.noorXp}
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400">
                            نور
                        </span>
                    </div>
                </div>

                {/* ۳. گوهر عقیق (Aqeeq Gems) */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-lapis-card border border-termeh-border dark:border-lapis-border">
                    <svg
                        className="w-5 h-5 text-brand-primary"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <polygon points="7,2 17,2 22,9 12,22 2,9" />
                    </svg>
                    <div className="flex flex-col leading-none">
                        <span className="text-xs font-extrabold text-brand-primaryDark dark:text-brand-primary">
                            {userStats.aqeeqGems}
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400">
                            عقیق
                        </span>
                    </div>
                </div>

                {/* ۴. سیستم ۵ چراغ بخشنده (کلیک جهت شارژ) */}
                <button
                    type="button"
                    onClick={handleLampClick}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${userStats.lampsCount <= 1
                            ? "bg-brand-ruby/15 border-brand-ruby text-brand-ruby animate-pulse"
                            : "bg-white/80 dark:bg-lapis-card border-termeh-border dark:border-lapis-border text-brand-amber"
                        }`}
                    title="برای شارژ ۵ چراغ با مرور ۳ دقیقه‌ای کلیک کنید"
                >
                    <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((lampIndex) => {
                            const isLit = lampIndex <= userStats.lampsCount;
                            return (
                                <svg
                                    key={lampIndex}
                                    className={`w-3.5 h-3.5 transition-all ${isLit
                                            ? "text-brand-amber drop-shadow-[0_0_4px_rgba(245,158,11,0.7)] scale-105"
                                            : "text-slate-300 dark:text-slate-600 scale-90"
                                        }`}
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                                </svg>
                            );
                        })}
                    </div>
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                        {userStats.lampsCount}
                    </span>
                </button>

                {/* ۵. دکمه تغییر حالت روز / شب (ترمه / لاجوردی) */}
                <button
                    type="button"
                    onClick={handleThemeToggle}
                    aria-label="تغییر تم روز و شب"
                    className="p-2 rounded-xl bg-white/80 dark:bg-lapis-card border border-termeh-border dark:border-lapis-border text-slate-600 dark:text-brand-amber hover:brightness-105 active:scale-95 transition-all"
                >
                    {userStats.darkMode ? (
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                        </svg>
                    )}
                </button>
            </div>
        </header>
    );
};