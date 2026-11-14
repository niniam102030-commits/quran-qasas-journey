// src/components/challenges/WordMatching.tsx
import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { Challenge, VerseData } from "../../types/schema";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

interface WordMatchingProps {
    challenge: Challenge;
    verse: VerseData | null;
    disabled: boolean;
    onSelectionChange: (answer: string) => void;
}

interface PairItem {
    id: string;
    arabic: string;
    persian: string;
}

export const WordMatching: React.FC<WordMatchingProps> = ({
    challenge,
    verse,
    disabled,
    onSelectionChange,
}) => {
    const { playSfx } = useHapticsAndSfx();

    // استخراج جفت‌های کلمه و ترجمه
    const rawPairs = useMemo<PairItem[]>(() => {
        const cAny = challenge as any;
        if (Array.isArray(cAny.pairs) && Array.isArray(cAny.left) && Array.isArray(cAny.right)) {
            return cAny.pairs.map(([leftId, rightId]: [string, string], index: number) => {
                const lObj = cAny.left.find((l: any) => l.id === leftId);
                const rObj = cAny.right.find((r: any) => r.id === rightId);
                const ar = lObj?.ar || lObj?.fa || leftId;
                const fa = rObj?.fa || rObj?.ar || rightId;
                return {
                    id: `pair_${index}`,
                    arabic: ar,
                    persian: fa,
                };
            });
        }

        if (!Array.isArray(challenge.options)) return [];

        return challenge.options.map((opt, index) => {
            let arabic = "";
            let persian = "";
            if (typeof opt === "string") {
                if (opt.includes(":::")) {
                    const parts = opt.split(":::");
                    arabic = parts[0].trim();
                    persian = parts[1].trim();
                } else if (opt.includes(":")) {
                    const parts = opt.split(":");
                    arabic = parts[0].trim();
                    persian = parts[1].trim();
                } else {
                    arabic = opt;
                    persian = opt;
                }
            } else if (typeof opt === "object" && opt !== null) {
                arabic = (opt as any).ar || (opt as any).text || "";
                persian = (opt as any).fa || (opt as any).meaningFa || "";
            }
            return {
                id: `pair_${index}`,
                arabic,
                persian,
            };
        });
    }, [challenge]);

    // به‌هم‌ریختن مستقل ستون عربی و فارسی
    const shuffledArabic = useMemo(() => {
        return [...rawPairs].sort(() => Math.random() - 0.5);
    }, [rawPairs]);

    const shuffledPersian = useMemo(() => {
        return [...rawPairs].sort(() => Math.random() - 0.5);
    }, [rawPairs]);

    const [selectedArabicId, setSelectedArabicId] = useState<string | null>(null);
    const [selectedPersianId, setSelectedPersianId] = useState<string | null>(null);
    const [solvedIds, setSolvedIds] = useState<string[]>([]);
    const [wrongPair, setWrongPair] = useState<{ arabicId: string; persianId: string } | null>(null);

    // ریست وضعیت با تغییر سوال
    useEffect(() => {
        setSelectedArabicId(null);
        setSelectedPersianId(null);
        setSolvedIds([]);
        setWrongPair(null);
    }, [challenge.id]);

    // بررسی انطباق هنگام انتخاب هر دو ستون
    useEffect(() => {
        if (!selectedArabicId || !selectedPersianId) return;

        if (selectedArabicId === selectedPersianId) {
            // انطباق صحیح
            playSfx("correct-chime");
            const newSolved = [...solvedIds, selectedArabicId];
            setSolvedIds(newSolved);
            setSelectedArabicId(null);
            setSelectedPersianId(null);

            if (newSolved.length === rawPairs.length) {
                // تمام جفت‌ها تکمیل شدند
                onSelectionChange("COMPLETED");
            }
        } else {
            // انتخاب اشتباه
            playSfx("error-thud");
            setWrongPair({ arabicId: selectedArabicId, persianId: selectedPersianId });
            const timer = setTimeout(() => {
                setWrongPair(null);
                setSelectedArabicId(null);
                setSelectedPersianId(null);
            }, 700);
            return () => clearTimeout(timer);
        }
    }, [selectedArabicId, selectedPersianId, solvedIds, rawPairs.length, playSfx, onSelectionChange]);

    const handleSelectArabic = (id: string) => {
        if (disabled || solvedIds.includes(id) || wrongPair) return;
        playSfx("snap-click");
        setSelectedArabicId(id);
    };

    const handleSelectPersian = (id: string) => {
        if (disabled || solvedIds.includes(id) || wrongPair) return;
        playSfx("snap-click");
        setSelectedPersianId(id);
    };

    return (
        <div className="flex flex-col gap-5 w-full">
            {/* راهنمای بالای بازی */}
            <div className="rounded-2xl bg-white/70 dark:bg-lapis-card/70 border border-termeh-border dark:border-lapis-border p-3.5 flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                    🎯 کلمات قرآنی را به ترجمه فارسی دقیق انصاریان وصل کنید:
                </span>
                <span className="text-xs font-black text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full">
                    {solvedIds.length} از {rawPairs.length}
                </span>
            </div>

            {/* دو ستون تطبیقی کلمات و ترجمه‌ها */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {/* ستون کلمات عربی قرآن */}
                <div className="flex flex-col gap-2.5">
                    <span className="text-xs font-black text-slate-500 text-center mb-1">
                        واژه قرآنی (عربی)
                    </span>
                    {shuffledArabic.map((item) => {
                        const isSolved = solvedIds.includes(item.id);
                        const isSelected = selectedArabicId === item.id;
                        const isWrong = wrongPair?.arabicId === item.id;

                        return (
                            <motion.button
                                key={`ar_${item.id}`}
                                layout
                                disabled={disabled || isSolved}
                                onClick={() => handleSelectArabic(item.id)}
                                animate={isWrong ? { x: [-8, 8, -6, 6, 0] } : {}}
                                transition={{ duration: 0.4 }}
                                className={`h-16 px-3 rounded-2xl border-2 font-bold transition-all flex items-center justify-center text-center ${
                                    isSolved
                                        ? "bg-emerald-100/70 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 opacity-60"
                                        : isWrong
                                        ? "bg-rose-100 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200 ring-2 ring-rose-400"
                                        : isSelected
                                        ? "bg-sky-50 dark:bg-sky-950/60 border-brand-primary text-brand-primary ring-2 ring-brand-primary scale-[1.02]"
                                        : "bg-white dark:bg-lapis-card border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-brand-primary/50"
                                }`}
                            >
                                <span className="quran-text text-xl sm:text-2xl leading-relaxed">
                                    {item.arabic}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>

                {/* ستون معانی و ترجمه فارسی انصاریان */}
                <div className="flex flex-col gap-2.5">
                    <span className="text-xs font-black text-slate-500 text-center mb-1">
                        ترجمه انصاریان (فارسی)
                    </span>
                    {shuffledPersian.map((item) => {
                        const isSolved = solvedIds.includes(item.id);
                        const isSelected = selectedPersianId === item.id;
                        const isWrong = wrongPair?.persianId === item.id;

                        return (
                            <motion.button
                                key={`fa_${item.id}`}
                                layout
                                disabled={disabled || isSolved}
                                onClick={() => handleSelectPersian(item.id)}
                                animate={isWrong ? { x: [-8, 8, -6, 6, 0] } : {}}
                                transition={{ duration: 0.4 }}
                                className={`h-16 px-3 rounded-2xl border-2 font-bold transition-all flex items-center justify-center text-center text-xs sm:text-sm ${
                                    isSolved
                                        ? "bg-emerald-100/70 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 opacity-60"
                                        : isWrong
                                        ? "bg-rose-100 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200 ring-2 ring-rose-400"
                                        : isSelected
                                        ? "bg-sky-50 dark:bg-sky-950/60 border-brand-primary text-brand-primary ring-2 ring-brand-primary scale-[1.02]"
                                        : "bg-white dark:bg-lapis-card border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-brand-primary/50"
                                }`}
                            >
                                <span className="line-clamp-2 leading-snug">
                                    {item.persian}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* آیه کامل برای ایجاد پیوند ذهنی با متن آیه */}
            {verse && (
                <div className="mt-2 text-center p-3 rounded-2xl bg-amber-500/5 border border-brand-amber/20">
                    <p className="quran-text text-base sm:text-lg text-slate-600 dark:text-slate-300">
                        «{verse.arabicFullText}»
                    </p>
                    <span className="text-xs text-brand-amberDark font-bold mt-1 inline-block">
                        سوره {verse.surahNameFa} • آیه {verse.ayahNumber}
                    </span>
                </div>
            )}
        </div>
    );
};
