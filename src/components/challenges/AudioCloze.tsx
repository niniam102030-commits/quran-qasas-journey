// src/components/challenges/AudioCloze.tsx
import React, { useState, useEffect, useRef } from "react";
import { motion, LayoutGroup } from "framer-motion";
import type { Challenge, VerseData, WordMorphology } from "../../types/schema";
import { AudioWaveHalo } from "../common/AudioWaveHalo";

interface AudioClozeProps {
    challenge: Challenge;
    verse: VerseData | null;
    targetWord: WordMorphology | null;
    disabled: boolean;
    onSelectionChange: (selectedWord: string) => void;
}

export const AudioCloze: React.FC<AudioClozeProps> = ({
    challenge,
    verse,
    targetWord,
    disabled,
    onSelectionChange,
}) => {
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [playingMode, setPlayingMode] = useState<"normal" | "tadabbur" | null>(
        null
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        setSelectedOption(null);
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [challenge.id]);

    const playVerseWithSpeed = (rate: 1.0 | 0.75) => {
        const url = verse?.menshawiAudioUrl || targetWord?.audioWbwUrl;
        if (!url) return;

        if (audioRef.current) {
            audioRef.current.pause();
        }

        const audio = new Audio(url);
        audio.playbackRate = rate;
        if ("preservesPitch" in audio) {
            (audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch =
                true;
        }

        audioRef.current = audio;
        setPlayingMode(rate === 1.0 ? "normal" : "tadabbur");

        audio.onended = () => setPlayingMode(null);
        audio.onerror = () => setPlayingMode(null);
        audio.play().catch(() => setPlayingMode(null));
    };

    const handleChooseOption = (option: string) => {
        if (disabled) return;
        setSelectedOption(option);
        onSelectionChange(option);
    };

    // تفکیک متن آیه به قبل و بعد از کلمه هدف برای ایجاد جای خالی در دل آیه
    const targetArabic =
        targetWord?.arabicUthmani ||
        (Array.isArray(challenge.correctAnswer)
            ? challenge.correctAnswer[0]
            : challenge.correctAnswer);

    const fullText = verse?.arabicFullText || "";
    const splitParts =
        targetArabic && fullText.includes(targetArabic)
            ? fullText.split(targetArabic)
            : [fullText, ""];

    return (
        <LayoutGroup id={`audio-cloze-${challenge.id}`}>
            <div className="flex flex-col gap-5 w-full">
                {/* کنترل‌های صوتی دوگانه: سرعت عادی (۱x) و سرعت تدبر (۰.۷۵x) */}
                <div className="rounded-3xl bg-white dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border p-5 shadow-sm flex flex-col items-center">
                    <div className="flex items-center justify-center gap-4 mb-4">
                        <div className="flex flex-col items-center gap-1.5">
                            <AudioWaveHalo
                                isPlaying={playingMode === "normal"}
                                size="md"
                                accentColor="primary"
                            >
                                <button
                                    type="button"
                                    onClick={() => playVerseWithSpeed(1.0)}
                                    className="btn-3d-primary w-14 h-14 !p-0 rounded-2xl flex items-center justify-center text-2xl"
                                    title="پخش با سرعت عادی"
                                >
                                    🔊
                                </button>
                            </AudioWaveHalo>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                سرعت عادی (۱x)
                            </span>
                        </div>

                        <div className="flex flex-col items-center gap-1.5">
                            <AudioWaveHalo
                                isPlaying={playingMode === "tadabbur"}
                                size="md"
                                accentColor="amber"
                            >
                                <button
                                    type="button"
                                    onClick={() => playVerseWithSpeed(0.75)}
                                    className="btn-3d-amber w-14 h-14 !p-0 rounded-2xl flex items-center justify-center text-2xl"
                                    title="پخش شمرده برای تدبر (۰.۷۵x)"
                                >
                                    🐢
                                </button>
                            </AudioWaveHalo>
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                سرعت تدبر (۰.۷۵x)
                            </span>
                        </div>
                    </div>

                    {/* متن آیه با جای خالی تعاملی */}
                    <div
                        dir="rtl"
                        className="quran-text text-2xl sm:text-3xl leading-loose text-center text-slate-800 dark:text-white flex flex-wrap items-center justify-center gap-2 py-2"
                    >
                        <span>{splitParts[0]}</span>

                        <div className="inline-flex items-center justify-center min-w-[120px] min-h-[52px] px-2 py-1 rounded-2xl border-2 border-dashed border-brand-primary bg-brand-primary/5 align-middle">
                            {selectedOption ? (
                                <motion.button
                                    type="button"
                                    layoutId={`cloze-opt-${selectedOption}`}
                                    onClick={() => !disabled && setSelectedOption(null)}
                                    transition={{ type: "spring", stiffness: 460, damping: 30 }}
                                    className="quran-text text-2xl sm:text-3xl px-3 py-0.5 rounded-xl bg-brand-primary text-white font-normal"
                                >
                                    {selectedOption}
                                </motion.button>
                            ) : (
                                <span className="text-xs font-sans font-bold text-brand-primary animate-pulse">
                                    ؟ جای خالی
                                </span>
                            )}
                        </div>

                        <span>{splitParts.slice(1).join(targetArabic)}</span>
                    </div>

                    {verse?.translationFa && (
                        <p className="mt-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center border-t border-termeh-border dark:border-lapis-border pt-3 w-full">
                            ترجمه: «{verse.translationFa}»
                        </p>
                    )}
                </div>

                {/* گزینه‌های صوتی قابل پرواز به درون جای خالی */}
                <div
                    dir="rtl"
                    className="grid grid-cols-2 gap-3"
                >
                    {challenge.options.map((option, idx) => {
                        const isSelected = selectedOption === option;
                        return (
                            <div
                                key={`${option}-${idx}`}
                                className="relative min-h-[64px] rounded-2xl bg-termeh-border/40 dark:bg-lapis-border/30"
                            >
                                {!isSelected && (
                                    <motion.button
                                        type="button"
                                        layoutId={`cloze-opt-${option}`}
                                        onClick={() => handleChooseOption(option)}
                                        disabled={disabled}
                                        transition={{ type: "spring", stiffness: 460, damping: 30 }}
                                        className="btn-3d-neutral w-full h-full quran-text text-2xl sm:text-3xl py-3"
                                    >
                                        {option}
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