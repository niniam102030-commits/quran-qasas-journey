// src/components/challenges/FalseFriendHunter.tsx
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { Challenge, VerseData, WordMorphology } from "../../types/schema";
import { ColoredArabicWord } from "../common/ColoredArabicWord";

interface FalseFriendHunterProps {
    challenge: Challenge;
    targetWord: WordMorphology | null;
    verse: VerseData | null;
    disabled: boolean;
    isAnswerChecked: boolean;
    onSelectionChange: (selectedOption: string) => void;
}

export const FalseFriendHunter: React.FC<FalseFriendHunterProps> = ({
    challenge,
    targetWord,
    verse,
    disabled,
    isAnswerChecked,
    onSelectionChange,
}) => {
    const [selectedOption, setSelectedOption] = useState<string | null>(null);

    useEffect(() => {
        setSelectedOption(null);
    }, [challenge.id]);

    const handleSelectOption = (option: string) => {
        if (disabled) return;
        setSelectedOption(option);
        onSelectionChange(option);
    };

    const correctAnswerStr = Array.isArray(challenge.correctAnswer)
        ? challenge.correctAnswer[0]
        : challenge.correctAnswer;

    return (
        <div className="flex flex-col gap-5 w-full">
            {/* بنر هشدار ویژه کلمه فریبنده (مشترک لفظی فارسی و عربی) */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-white to-amber-100/60 dark:from-lapis-card dark:via-lapis-card dark:to-amber-950/30 border-2 border-brand-amber/70 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-amber text-white px-3 py-1 text-xs font-extrabold shadow-sm">
                        ⚠️ هشدار کلمه فریبنده (مشترک لفظی)
                    </span>
                    {verse && (
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            سوره {verse.surahNameFa} ({verse.ayahNumber})
                        </span>
                    )}
                </div>

                {/* نمایش کلمه هدف */}
                <div className="my-2 flex flex-col items-center justify-center">
                    {targetWord && targetWord.segments.length > 0 ? (
                        <ColoredArabicWord segments={targetWord.segments} size="xl" />
                    ) : (
                        <div className="quran-text text-4xl sm:text-5xl text-slate-800 dark:text-white">
                            {targetWord?.arabicUthmani}
                        </div>
                    )}

                    {verse?.arabicFullText && (
                        <p className="quran-text text-xl sm:text-2xl text-slate-600 dark:text-slate-300 mt-3 text-center leading-relaxed">
                            «{verse.arabicFullText}»
                        </p>
                    )}
                </div>

                <p className="mt-2 text-xs text-center text-amber-800 dark:text-amber-300 font-medium">
                    مراقب باش! ظاهر این کلمه در فارسی امروز آشناست، اما در قرآن معنای متفاوتی دارد.
                </p>
            </div>

            {/* گزینه‌های چهارگزینه‌ای با تشخیص بصری گزینه تله پس از بررسی پاسخ */}
            <div className="grid grid-cols-1 gap-3">
                {challenge.options.map((optionItem, idx) => {
                    const optionId = typeof optionItem === 'object' && optionItem !== null
                        ? (optionItem as any).id
                        : optionItem;
                    const optionText = typeof optionItem === 'object' && optionItem !== null
                        ? ((optionItem as any).ar || (optionItem as any).fa || (optionItem as any).text || (optionItem as any).id)
                        : optionItem;

                    const isSelected = selectedOption === optionId || selectedOption === optionText;
                    const isTrapOption = challenge.trapOption === optionId || challenge.trapOption === optionText;
                    const isCorrectOption = correctAnswerStr === optionId || correctAnswerStr === optionText;

                    let cardStyle = "btn-3d-neutral justify-between text-right";
                    let badgeEl: React.ReactNode = null;

                    if (!isAnswerChecked && isSelected) {
                        cardStyle =
                            "btn-3d bg-sky-50 dark:bg-sky-950/60 border-brand-primary text-brand-primary dark:text-sky-300 justify-between text-right ring-2 ring-brand-primary";
                    } else if (isAnswerChecked) {
                        if (isCorrectOption) {
                            cardStyle = "btn-3d-success justify-between text-right";
                            badgeEl = (
                                <span className="text-xs font-extrabold bg-white/25 px-2.5 py-1 rounded-lg">
                                    ✓ معنای اصیل قرآنی
                                </span>
                            );
                        } else if (isSelected && isTrapOption) {
                            cardStyle = "btn-3d-amber justify-between text-right";
                            badgeEl = (
                                <span className="text-xs font-extrabold bg-black/20 px-2.5 py-1 rounded-lg">
                                    🪤 تله فارسی امروز!
                                </span>
                            );
                        } else if (isSelected && !isCorrectOption) {
                            cardStyle = "btn-3d-ruby justify-between text-right";
                        }
                    }

                    return (
                        <motion.button
                            key={`${optionId || optionText}-${idx}`}
                            type="button"
                            onClick={() => handleSelectOption(optionId || optionText)}
                            disabled={disabled}
                            animate={
                                isAnswerChecked && isSelected && isTrapOption
                                    ? { x: [0, -12, 12, -8, 8, -4, 4, 0] }
                                    : { x: 0 }
                            }
                            transition={{ duration: 0.45 }}
                            className={`w-full py-4 px-5 ${cardStyle}`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="w-7 h-7 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs font-black">
                                    {idx + 1}
                                </span>
                                <span className="text-base font-bold">{optionText}</span>
                            </div>
                            {badgeEl}
                        </motion.button>
                    );
                })}
            </div>

            {/* کارت مقایسه معنایی پس از بررسی پاسخ */}
            {isAnswerChecked && targetWord?.falseFriendTrapFa && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl bg-amber-500/10 border border-brand-amber/40 p-3.5 text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-around gap-2 text-center"
                >
                    <div className="text-rubyDark dark:text-red-300 font-semibold">
                        ❌ در فارسی امروز: <strong>{targetWord.falseFriendTrapFa}</strong>
                    </div>
                    <div className="hidden sm:block text-slate-400">|</div>
                    <div className="text-emerald-700 dark:text-emerald-300 font-semibold">
                        ✅ در قرآن کریم: <strong>{targetWord.meaningFa}</strong>
                    </div>
                </motion.div>
            )}
        </div>
    );
};