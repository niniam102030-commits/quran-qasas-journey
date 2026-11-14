// src/components/map/LessonNodeButton.tsx
import React from "react";
import type { Lesson } from "../../types/schema";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

export type LessonNodeStatus = "completed" | "current" | "locked";

export interface LessonNodeButtonProps {
    lesson: Lesson;
    status: LessonNodeStatus;
    offsetX: number; // انحراف افقی سینوسی برای ایجاد مسیر پرپیچ‌وخم دولینگویی
    onSelectLesson: (lessonId: string) => void;
}

export const LessonNodeButton: React.FC<LessonNodeButtonProps> = ({
    lesson,
    status,
    offsetX,
    onSelectLesson,
}) => {
    const { playSfx } = useHapticsAndSfx();

    const handleClick = () => {
        if (status === "locked") {
            playSfx("error-thud");
            return;
        }
        playSfx("snap-click");
        onSelectLesson(lesson.id);
    };

    const buttonColorClasses =
        status === "completed"
            ? "bg-brand-success border-brand-successDark text-white shadow-[0_6px_0_#047857]"
            : status === "current"
                ? "bg-brand-amber border-brand-amberDark text-white shadow-[0_7px_0_#B45309]"
                : "bg-slate-200 dark:bg-lapis-card border-slate-300 dark:border-lapis-border text-slate-400 shadow-[0_6px_0_#94a3b8] dark:shadow-[0_6px_0_#1e293b]";

    return (
        <div
            style={{ transform: `translateX(${offsetX}px)` }}
            className="relative flex flex-col items-center my-3 select-none z-10"
        >
            {/* بنر شناور بالای گره فعال (درس جاری) */}
            {status === "current" && (
                <div className="mb-2 px-3.5 py-1 rounded-2xl bg-white dark:bg-lapis-card border-2 border-brand-amber text-brand-amberDark dark:text-brand-amber text-xs font-extrabold shadow-lg animate-bounce">
                    شروع مرحله ✦
                </div>
            )}

            {/* حلقه نورانی دور گره جاری */}
            <div className="relative flex items-center justify-center">
                {status === "current" && (
                    <span className="absolute -inset-2.5 rounded-full border-4 border-brand-amber/50 animate-ping pointer-events-none" />
                )}

                {/* دکمه دایره‌ای سه‌بعدی مرحله */}
                <button
                    type="button"
                    onClick={handleClick}
                    aria-label={lesson.titleFa}
                    className={`
            relative w-20 h-20 rounded-full border-b-4
            flex flex-col items-center justify-center
            transition-all duration-100 cursor-pointer
            active:translate-y-1.5 active:shadow-none
            ${buttonColorClasses}
          `}
                >
                    {/* حلقه تذهیب داخلی */}
                    <span className="w-16 h-16 rounded-full border border-white/30 flex items-center justify-center">
                        {status === "completed" ? (
                            <svg className="w-8 h-8" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        ) : status === "current" ? (
                            <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L14.8 8.2L21.5 9.2L16.6 14L17.8 20.7L12 17.6L6.2 20.7L7.4 14L2.5 9.2L9.2 8.2L12 2Z" />
                            </svg>
                        ) : (
                            <svg className="w-7 h-7" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                    fillRule="evenodd"
                                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        )}
                    </span>
                </button>
            </div>

            {/* عنوان درس و پاداش نور */}
            <div className="mt-2.5 text-center max-w-[190px]">
                <p className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
                    {lesson.titleFa}
                </p>
                <div className="mt-0.5 inline-flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>+{lesson.rewardNoorXp} نور</span>
                    <span>•</span>
                    <span>+{lesson.rewardAqeeqGem} عقیق</span>
                </div>
            </div>
        </div>
    );
};