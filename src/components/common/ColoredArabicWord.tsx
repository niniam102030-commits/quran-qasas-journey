// src/components/common/ColoredArabicWord.tsx
import React from "react";
import { motion } from "framer-motion";
import type { MorphologySegment, SegmentType } from "../../types/schema";
import { formatSegmentsWithZwj } from "../../utils/arabicZwjHelper";

interface ColoredArabicWordProps {
    segments: MorphologySegment[];
    isDeGlued?: boolean;
    showBadges?: boolean;
    size?: "md" | "lg" | "xl";
    activeSegmentIndex?: number | null;
    onSegmentClick?: (segment: MorphologySegment, index: number) => void;
}

const SEGMENT_STYLES: Record<
    SegmentType,
    {
        textClass: string;
        pillClass: string;
        labelFa: string;
    }
> = {
    prefix: {
        textClass: "text-morph-prefix",
        pillClass:
            "bg-morph-prefixBg text-morph-prefix border border-morph-prefix/30 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-700",
        labelFa: "پیشوند",
    },
    root: {
        textClass: "text-morph-root",
        pillClass:
            "bg-morph-rootBg text-morph-root border border-morph-root/30 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700",
        labelFa: "ریشه",
    },
    pronoun: {
        textClass: "text-morph-pronoun",
        pillClass:
            "bg-morph-pronounBg text-morph-pronoun border border-morph-pronoun/30 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-700",
        labelFa: "ضمیر/پسوند",
    },
};

const SIZE_CLASSES = {
    md: "text-2xl",
    lg: "text-3xl sm:text-4xl",
    xl: "text-4xl sm:text-5xl",
};

export const ColoredArabicWord: React.FC<ColoredArabicWordProps> = ({
    segments,
    isDeGlued = false,
    showBadges = false,
    size = "xl",
    activeSegmentIndex = null,
    onSegmentClick,
}) => {
    const formattedSegments = React.useMemo(
        () => formatSegmentsWithZwj(segments),
        [segments]
    );

    // در حالت متصل (بدون چسب‌زدایی)، تمام قطعات کنار هم با ZWJ رندر می‌شوند
    if (!isDeGlued) {
        return (
            <div
                dir="rtl"
                className={`quran-text inline-flex items-baseline justify-center select-none tracking-normal ${SIZE_CLASSES[size]}`}
            >
                {formattedSegments.map((seg, idx) => {
                    const style = SEGMENT_STYLES[seg.type];
                    const isHighlighted = activeSegmentIndex === idx;
                    return (
                        <motion.span
                            key={`${seg.text}-${idx}`}
                            layoutId={`morph-seg-${idx}`}
                            onClick={() => onSegmentClick?.(seg, idx)}
                            whileTap={onSegmentClick ? { scale: 0.94 } : undefined}
                            className={`${style.textClass} transition-transform duration-150 ${onSegmentClick ? "cursor-pointer" : ""
                                } ${isHighlighted
                                    ? "underline decoration-brand-amber decoration-2 underline-offset-8 scale-105"
                                    : ""
                                }`}
                        >
                            {seg.renderedText}
                        </motion.span>
                    );
                })}
            </div>
        );
    }

    // در حالت چسب‌زدایی‌شده (De-Glued)، هر قطعه در کارت مستقل خود همراه با برچسب نقش و معنا قرار می‌گیرد
    return (
        <div
            dir="rtl"
            className="flex flex-wrap items-stretch justify-center gap-2.5 sm:gap-3"
        >
            {segments.map((seg, idx) => {
                const style = SEGMENT_STYLES[seg.type];
                const isHighlighted = activeSegmentIndex === idx;

                return (
                    <motion.button
                        type="button"
                        key={`${seg.text}-${idx}`}
                        layoutId={`morph-seg-${idx}`}
                        initial={{ opacity: 0, scale: 0.85, y: 8 }}
                        animate={{
                            opacity: 1,
                            scale: isHighlighted ? 1.06 : 1,
                            y: 0,
                        }}
                        transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 25,
                            delay: idx * 0.04,
                        }}
                        onClick={() => onSegmentClick?.(seg, idx)}
                        className={`flex flex-col items-center justify-between rounded-2xl px-3.5 py-2.5 shadow-sm transition-all ${style.pillClass
                            } ${isHighlighted
                                ? "ring-2 ring-brand-amber shadow-md"
                                : "hover:brightness-95"
                            }`}
                    >
                        {showBadges && (
                            <span className="text-[11px] font-bold opacity-80 mb-1">
                                {style.labelFa}
                            </span>
                        )}
                        <span className={`quran-text ${SIZE_CLASSES[size]} leading-normal`}>
                            {seg.text}
                        </span>
                        {showBadges && (
                            <span className="mt-1.5 text-xs font-semibold bg-white/80 dark:bg-slate-900/70 px-2 py-0.5 rounded-lg">
                                {seg.meaningFa}
                            </span>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
};