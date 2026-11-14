// src/components/mascot/SmartAqeeqGem.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AqeeqMood } from "../../types/schema";

interface SmartAqeeqGemProps {
    mood: AqeeqMood;
    size?: "sm" | "md" | "lg";
    hintBubbleText?: string | null;
}

const MOOD_CONFIG: Record<
    AqeeqMood,
    {
        coreStop1: string;
        coreStop2: string;
        glowClass: string;
        statusLabelFa: string;
    }
> = {
    idle: {
        coreStop1: "#00A896",
        coreStop2: "#028090",
        glowClass: "drop-shadow-[0_4px_12px_rgba(0,168,150,0.38)]",
        statusLabelFa: "آماده همراهی",
    },
    thinking: {
        coreStop1: "#0284C7",
        coreStop2: "#0369A1",
        glowClass: "drop-shadow-[0_4px_14px_rgba(2,132,199,0.45)]",
        statusLabelFa: "در حال تدبر...",
    },
    happy: {
        coreStop1: "#10B981",
        coreStop2: "#047857",
        glowClass: "drop-shadow-[0_6px_18px_rgba(16,185,129,0.65)]",
        statusLabelFa: "احسنت!",
    },
    warning: {
        coreStop1: "#F59E0B",
        coreStop2: "#B91C1C",
        glowClass: "drop-shadow-[0_6px_18px_rgba(245,158,11,0.65)]",
        statusLabelFa: "دقت کن!",
    },
    deep_tip: {
        coreStop1: "#F59E0B",
        coreStop2: "#00A896",
        glowClass: "drop-shadow-[0_6px_20px_rgba(245,158,11,0.55)]",
        statusLabelFa: "نکته عمیق‌تر",
    },
};

export const SmartAqeeqGem: React.FC<SmartAqeeqGemProps> = ({
    mood,
    size = "md",
    hintBubbleText,
}) => {
    const config = MOOD_CONFIG[mood];

    const dimensions = {
        sm: "w-12 h-12",
        md: "w-16 h-16",
        lg: "w-24 h-24",
    }[size];

    const getMotionProps = (): { animate: Record<string, number[]>; transition: { duration: number; ease: "easeInOut"; repeat?: number } } => {
        switch (mood) {
            case "happy":
                return {
                    animate: {
                        scale: [1, 1.24, 0.96, 1.08, 1],
                        rotate: [0, 10, -10, 5, 0],
                        y: [0, -8, 0],
                    },
                    transition: { duration: 0.7, ease: "easeInOut" as const },
                };
            case "warning":
                return {
                    animate: {
                        x: [0, -7, 7, -5, 5, -2, 2, 0],
                        scale: [1, 1.08, 1],
                    },
                    transition: { duration: 0.5, ease: "easeInOut" as const },
                };
            case "thinking":
                return {
                    animate: {
                        rotate: [-4, 4, -4],
                        scale: [1, 1.04, 1],
                    },
                    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const },
                };
            case "deep_tip":
                return {
                    animate: {
                        y: [0, -5, 0],
                        scale: [1, 1.08, 1],
                    },
                    transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" as const },
                };
            case "idle":
            default:
                return {
                    animate: {
                        y: [0, -4, 0],
                    },
                    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const },
                };
        }
    };

    return (
        <div className="relative inline-flex items-center gap-2.5 select-none">
            <div className={`relative flex items-center justify-center ${dimensions}`}>
                {/* حلقه شمسه اسلیمی چرخان در حالت نکته عمیق‌تر یا پاسخ صحیح */}
                <AnimatePresence>
                    {(mood === "deep_tip" || mood === "happy") && (
                        <motion.svg
                            key="islamic-star-halo"
                            initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
                            animate={{ opacity: 0.85, scale: 1.22, rotate: 360 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{
                                rotate: { duration: 14, repeat: Infinity, ease: "linear" },
                                opacity: { duration: 0.25 },
                                scale: { type: "spring", stiffness: 260, damping: 20 },
                            }}
                            viewBox="0 0 100 100"
                            className="absolute inset-0 w-full h-full pointer-events-none"
                        >
                            <polygon
                                points="50,3 63,37 97,50 63,63 50,97 37,63 3,50 37,37"
                                fill="none"
                                stroke="#F59E0B"
                                strokeWidth="2.5"
                                strokeDasharray="4 2"
                            />
                        </motion.svg>
                    )}
                </AnimatePresence>

                {/* بدنه اصلی نگین عقیق هشت‌ضلعی با رکاب تذهیب طلایی */}
                <motion.div
                    {...getMotionProps()}
                    className={`relative w-full h-full flex items-center justify-center ${config.glowClass}`}
                >
                    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                        <defs>
                            <linearGradient id={`aqeeqGrad-${mood}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={config.coreStop1} />
                                <stop offset="100%" stopColor={config.coreStop2} />
                            </linearGradient>
                            <linearGradient id="goldFrameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#FDE68A" />
                                <stop offset="50%" stopColor="#F59E0B" />
                                <stop offset="100%" stopColor="#B45309" />
                            </linearGradient>
                        </defs>

                        {/* رکاب بیرونی هشت‌ضلعی طلایی */}
                        <polygon
                            points="30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30"
                            fill="url(#goldFrameGrad)"
                            stroke="#78350F"
                            strokeWidth="2"
                        />

                        {/* تراش داخلی نگین عقیق */}
                        <polygon
                            points="33,14 67,14 86,33 86,67 67,86 33,86 14,67 14,33"
                            fill={`url(#aqeeqGrad-${mood})`}
                            stroke="#FEF3C7"
                            strokeWidth="1.5"
                        />

                        {/* خطوط تراش جواهر و انعکاس نور سه‌بعدی */}
                        <polygon
                            points="38,24 62,24 76,38 76,62 62,76 38,76 24,62 24,38"
                            fill="none"
                            stroke="rgba(255,255,255,0.35)"
                            strokeWidth="1.2"
                        />
                        <ellipse
                            cx="42"
                            cy="32"
                            rx="12"
                            ry="5"
                            transform="rotate(-22 42 32)"
                            fill="rgba(255,255,255,0.45)"
                        />

                        {/* نشان مرکزی متناسب با حالت نگین */}
                        {mood === "happy" && (
                            <path
                                d="M36 52 L46 62 L66 40"
                                fill="none"
                                stroke="#FFFFFF"
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        )}
                        {mood === "warning" && (
                            <g>
                                <line
                                    x1="50"
                                    y1="34"
                                    x2="50"
                                    y2="54"
                                    stroke="#FFFFFF"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                />
                                <circle cx="50" cy="65" r="3.2" fill="#FFFFFF" />
                            </g>
                        )}
                        {mood === "deep_tip" && (
                            <circle
                                cx="50"
                                cy="50"
                                r="8"
                                fill="#FEF3C7"
                                className="animate-ping"
                            />
                        )}
                    </svg>
                </motion.div>
            </div>

            {/* حباب پیام کوتاه همراه در صورت وجود */}
            {hintBubbleText && (
                <motion.div
                    initial={{ opacity: 0, x: 8, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    className="relative rounded-2xl rounded-tr-sm bg-white dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm max-w-[230px]"
                >
                    {hintBubbleText}
                </motion.div>
            )}
        </div>
    );
};