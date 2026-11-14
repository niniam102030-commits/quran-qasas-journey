// src/components/challenges/SequenceOrQuiz.tsx
import React, { useState, useEffect } from "react";
import type { Challenge, VerseData } from "../../types/schema";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

interface SequenceOrQuizProps {
    challenge: Challenge;
    verse: VerseData | null;
    disabled: boolean;
    isAnswerChecked: boolean;
    onSelectionChange: (selectedOption: string) => void;
}

export const SequenceOrQuiz: React.FC<SequenceOrQuizProps> = ({
    challenge,
    verse,
    disabled,
    isAnswerChecked,
    onSelectionChange,
}) => {
    const { playSfx } = useHapticsAndSfx();
    const [selectedOption, setSelectedOption] = useState<string | null>(null);

    useEffect(() => {
        setSelectedOption(null);
    }, [challenge.id]);

    const handleSelectOption = (option: string) => {
        if (disabled) return;
        playSfx("snap-click");
        setSelectedOption(option);
        onSelectionChange(option);
    };

    const correctAnswerStr = Array.isArray(challenge.correctAnswer)
        ? challenge.correctAnswer[0]
        : challenge.correctAnswer;

    // تمایز نشان بصری بر اساس نوع چالش
    const getBadgeInfo = () => {
        switch (challenge.type) {
            case "AYAH_SEQUENCE":
                return { label: "🔗 تسلط بر زنجیره و ترتیب آیات", bg: "bg-indigo-500" };
            case "AYAH_NUMBER_QUIZ":
                return { label: "🔢 یادگیری دقیق شماره آیه", bg: "bg-amber-600" };
            case "VERSE_COMPLETION":
                return { label: "🧩 تکمیل بخش جاافتاده آیه", bg: "bg-emerald-600" };
            default:
                return { label: "📖 آزمون تسلط بر آیات", bg: "bg-brand-primary" };
        }
    };

    const badge = getBadgeInfo();

    return (
        <div className="flex flex-col gap-5 w-full">
            {/* کارت نمایش آیه مبنا / زمینه سوال */}
            <div className="relative overflow-hidden rounded-3xl bg-white/80 dark:bg-lapis-card/80 border-2 border-termeh-border dark:border-lapis-border p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full ${badge.bg} text-white px-3 py-1 text-xs font-black shadow-sm`}>
                        {badge.label}
                    </span>
                    {verse && (
                        <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                            سوره {verse.surahNameFa} • آیه {verse.ayahNumber}
                        </span>
                    )}
                </div>

                {verse && (
                    <div className="my-2">
                        <p className="quran-text text-xl sm:text-2xl text-slate-800 dark:text-slate-100 text-center leading-relaxed">
                            «{verse.arabicFullText}»
                        </p>
                        {verse.translationFa && (
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 leading-normal">
                                {verse.translationFa}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* گزینه‌های چهارگزینه‌ای */}
            <div className="grid grid-cols-1 gap-3">
                {challenge.options.map((optionItem, idx) => {
                    const optionId = typeof optionItem === 'object' && optionItem !== null
                        ? (optionItem as any).id
                        : optionItem;
                    const optionText = typeof optionItem === 'object' && optionItem !== null
                        ? ((optionItem as any).ar || (optionItem as any).fa || (optionItem as any).text || (optionItem as any).id)
                        : optionItem;

                    const isSelected = selectedOption === optionId || selectedOption === optionText;
                    const isCorrectOption = correctAnswerStr === optionId || correctAnswerStr === optionText;
                    const isTrap = challenge.trapOption === optionId || challenge.trapOption === optionText;

                    let cardStyle =
                        "btn-3d-neutral justify-between text-right p-4 rounded-2xl border-2 transition-all";
                    let badgeEl: React.ReactNode = null;

                    if (!isAnswerChecked && isSelected) {
                        cardStyle =
                            "btn-3d bg-sky-50 dark:bg-sky-950/60 border-brand-primary text-brand-primary dark:text-sky-300 justify-between text-right p-4 rounded-2xl ring-2 ring-brand-primary scale-[1.01]";
                    } else if (isAnswerChecked) {
                        if (isCorrectOption) {
                            cardStyle =
                                "btn-3d-success justify-between text-right p-4 rounded-2xl border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200";
                            badgeEl = (
                                <span className="text-xs font-black bg-emerald-600 text-white px-2.5 py-1 rounded-lg">
                                    ✓ پاسخ صحیح
                                </span>
                            );
                        } else if (isSelected && isTrap) {
                            cardStyle =
                                "btn-3d-amber justify-between text-right p-4 rounded-2xl border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 ring-2 ring-amber-400";
                            badgeEl = (
                                <span className="text-xs font-black bg-amber-500 text-white px-2.5 py-1 rounded-lg">
                                    ⚠️ تله شماره / ترتیب
                                </span>
                            );
                        } else if (isSelected) {
                            cardStyle =
                                "btn-3d-danger justify-between text-right p-4 rounded-2xl border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200";
                            badgeEl = (
                                <span className="text-xs font-black bg-rose-500 text-white px-2.5 py-1 rounded-lg">
                                    ✗ نادرست
                                </span>
                            );
                        }
                    }

                    return (
                        <button
                            key={idx}
                            type="button"
                            disabled={disabled}
                            onClick={() => handleSelectOption(optionId || optionText)}
                            className={`${cardStyle} flex items-center gap-3 w-full`}
                        >
                            <span className="flex-1 quran-text text-base sm:text-lg leading-relaxed text-right">
                                {optionText}
                            </span>
                            {badgeEl}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
