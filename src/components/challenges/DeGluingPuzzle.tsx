// src/components/challenges/DeGluingPuzzle.tsx
import React, { useState, useEffect, useMemo } from "react";
import { motion, LayoutGroup } from "framer-motion";
import type { Challenge, WordMorphology } from "../../types/schema";
import { ColoredArabicWord } from "../common/ColoredArabicWord";

interface DeGluingPuzzleProps {
    challenge: Challenge;
    targetWord: WordMorphology | null;
    disabled: boolean;
    onSelectionChange: (selectedAnswer: string[]) => void;
}

interface ChipItem {
    id: string;
    text: string;
}

export const DeGluingPuzzle: React.FC<DeGluingPuzzleProps> = ({
    challenge,
    targetWord,
    disabled,
    onSelectionChange,
}) => {
    const [isDeGluedView, setIsDeGluedView] = useState(false);

    // ساخت آرایه قطعات بانک کلمات با شناسه یکتا و به‌هم‌ریخته (Scrambled) برای پرواز با layoutId
    const bankItems: ChipItem[] = useMemo(() => {
        const baseOptions =
            challenge.options.length > 0
                ? [...challenge.options]
                : targetWord?.segments.map((s) => s.text) || [];

        // به‌هم‌ریختن تصادفی قطعات با الگوریتم فیشر-یتس تا ترتیب درست لو نرود
        const shuffled = [...baseOptions];
        if (shuffled.length > 1) {
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            // اطمینان قطعی از اینکه ترتیب گزینه‌ها با ترتیب درست یکی نباشد
            const isSameAsOriginal = shuffled.every(
                (item, idx) => item === baseOptions[idx]
            );
            if (isSameAsOriginal && shuffled.length > 1) {
                shuffled.reverse();
            }
        }

        return shuffled.map((text, index) => ({
            id: `deglue-chip-${challenge.id}-${index}-${text}`,
            text,
        }));
    }, [challenge.id, challenge.options, targetWord]);

    const [selectedChipIds, setSelectedChipIds] = useState<string[]>([]);

    useEffect(() => {
        setSelectedChipIds([]);
        setIsDeGluedView(false);
    }, [challenge.id]);

    // پس از ثبت پاسخ، برای تفهیم آموزشی حالت کالبدشکافی کلمه آشکار می‌شود
    useEffect(() => {
        if (disabled) {
            setIsDeGluedView(true);
        }
    }, [disabled]);

    const handleToggleChip = (chipId: string) => {
        if (disabled) return;

        setSelectedChipIds((prev) => {
            const exists = prev.includes(chipId);
            const next = exists
                ? prev.filter((id) => id !== chipId)
                : [...prev, chipId];

            const nextTexts = next
                .map((id) => bankItems.find((item) => item.id === id)?.text || "")
                .filter(Boolean);

            onSelectionChange(nextTexts);
            return next;
        });
    };

    const playWordAudio = () => {
        if (!targetWord?.audioWbwUrl) return;
        const audio = new Audio(targetWord.audioWbwUrl);
        audio.play().catch(() => { });
    };

    const selectedChips = selectedChipIds
        .map((id) => bankItems.find((b) => b.id === id))
        .filter((item): item is ChipItem => Boolean(item));

    return (
        <LayoutGroup id={`deglue-group-${challenge.id}`}>
            <div className="flex flex-col gap-5 w-full">
                {/* کارت نمایش کلمه قرآنی با قابلیت سوییچ بین حالت متصل و چسب‌زدایی‌شده */}
                <div className="rounded-3xl bg-white dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border p-5 shadow-sm flex flex-col items-center">
                    <div className="w-full flex items-center justify-between mb-3">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary">
                            کالبدشکافی واژه قرآنی
                        </span>
                        <div className="flex items-center gap-2">
                            {targetWord?.audioWbwUrl && (
                                <button
                                    type="button"
                                    onClick={playWordAudio}
                                    className="text-xs font-bold px-3 py-1.5 rounded-xl bg-termeh-bg dark:bg-lapis-bg border border-termeh-border dark:border-lapis-border text-slate-700 dark:text-slate-200 hover:brightness-95"
                                >
                                    🔊 تلفظ کلمه
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsDeGluedView((prev) => !prev)}
                                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition"
                            >
                                {isDeGluedView ? "🔗 نمایش متصل" : "✨ پیش‌نمایش تفکیک"}
                            </button>
                        </div>
                    </div>

                    {/* رندر کلمه ۳ رنگ با تزریق خودکار ZWJ */}
                    <div className="my-3 min-h-[72px] flex items-center justify-center">
                        {targetWord && targetWord.segments.length > 0 ? (
                            <ColoredArabicWord
                                segments={targetWord.segments}
                                isDeGlued={isDeGluedView}
                                showBadges={isDeGluedView}
                                size="xl"
                            />
                        ) : (
                            <span className="quran-text text-4xl text-slate-800 dark:text-white">
                                {targetWord?.arabicUthmani}
                            </span>
                        )}
                    </div>

                    {/* راهنمای رنگ‌بندی ۳گانه و هم‌خانواده فارسی */}
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold">
                        <span className="inline-flex items-center gap-1.5 text-morph-prefix">
                            <span className="w-2.5 h-2.5 rounded-full bg-morph-prefix" />
                            پیشوند
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-morph-root">
                            <span className="w-2.5 h-2.5 rounded-full bg-morph-root" />
                            ریشه اصلی ({targetWord?.rootLetters || "—"})
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-morph-pronoun">
                            <span className="w-2.5 h-2.5 rounded-full bg-morph-pronoun" />
                            ضمیر / پسوند
                        </span>
                    </div>

                    {targetWord?.persianCognateHint && (
                        <div className="mt-3 w-full rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-200 text-center">
                            💡 <strong>ردپای آشنا در فارسی:</strong> {targetWord.persianCognateHint}
                        </div>
                    )}
                </div>

                {/* اسلات‌های چیدن قطعات به ترتیب از راست به چپ */}
                <div className="rounded-2xl bg-termeh-bg dark:bg-lapis-bg/70 border-2 border-dashed border-termeh-border dark:border-lapis-border p-4 min-h-[88px] flex flex-col justify-center">
                    <div className="text-xs font-bold text-slate-400 dark:text-slate-400 mb-2 text-center">
                        قطعات کلمه را به ترتیب از راست به چپ انتخاب کن:
                    </div>

                    <div
                        dir="rtl"
                        className="flex flex-wrap items-center justify-center gap-2 min-h-[48px]"
                    >
                        {selectedChips.length === 0 ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                روی قطعات پایین ضربه بزن تا اینجا چیده شوند...
                            </span>
                        ) : (
                            selectedChips.map((chip, idx) => {
                                const matchedSeg = targetWord?.segments.find(
                                    (s) => s.text === chip.text
                                );
                                return (
                                    <React.Fragment key={chip.id}>
                                        <motion.button
                                            type="button"
                                            layoutId={chip.id}
                                            onClick={() => handleToggleChip(chip.id)}
                                            disabled={disabled}
                                            transition={{
                                                type: "spring",
                                                stiffness: 460,
                                                damping: 30,
                                            }}
                                            className="btn-3d-neutral px-4 py-2 rounded-xl flex flex-col items-center"
                                        >
                                            <span className="quran-text text-2xl leading-none text-slate-800 dark:text-white">
                                                {chip.text}
                                            </span>
                                            {matchedSeg && (
                                                <span className="mt-1 text-[11px] font-medium text-brand-primary">
                                                    {matchedSeg.meaningFa}
                                                </span>
                                            )}
                                        </motion.button>
                                        {idx < selectedChips.length - 1 && (
                                            <span className="text-slate-400 font-bold select-none">
                                                +
                                            </span>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* بانک قطعات کلمه */}
                <div
                    dir="rtl"
                    className="flex flex-wrap items-center justify-center gap-3 pt-1"
                >
                    {bankItems.map((chip) => {
                        const isSelected = selectedChipIds.includes(chip.id);
                        const matchedSeg = targetWord?.segments.find(
                            (s) => s.text === chip.text
                        );

                        return (
                            <div
                                key={chip.id}
                                className="relative min-w-[76px] min-h-[64px] rounded-2xl bg-termeh-border/40 dark:bg-lapis-border/30 flex items-center justify-center"
                            >
                                {!isSelected && (
                                    <motion.button
                                        type="button"
                                        layoutId={chip.id}
                                        onClick={() => handleToggleChip(chip.id)}
                                        disabled={disabled}
                                        transition={{
                                            type: "spring",
                                            stiffness: 460,
                                            damping: 30,
                                        }}
                                        className="btn-3d-neutral w-full h-full px-4 py-2 rounded-2xl flex flex-col items-center justify-center"
                                    >
                                        <span className="quran-text text-2xl leading-none text-slate-800 dark:text-white">
                                            {chip.text}
                                        </span>
                                        {matchedSeg && (
                                            <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                                                {matchedSeg.meaningFa}
                                            </span>
                                        )}
                                    </motion.button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </LayoutGroup>
    );
};