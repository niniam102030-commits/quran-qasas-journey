// src/components/challenges/VerseBuilder.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, LayoutGroup } from "framer-motion";
import type { Challenge, VerseData } from "../../types/schema";
import { AudioWaveHalo } from "../common/AudioWaveHalo";

interface VerseBuilderProps {
    challenge: Challenge;
    verse: VerseData | null;
    disabled: boolean;
    onSelectionChange: (selectedWords: string[]) => void;
}

interface WordChip {
    id: string;
    text: string;
}

export const VerseBuilder: React.FC<VerseBuilderProps> = ({
    challenge,
    verse,
    disabled,
    onSelectionChange,
}) => {
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [activeTimestampWordId, setActiveTimestampWordId] = useState<string | null>(
        null
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const rafRef = useRef<number | null>(null);

    // ساخت آرایه کلمات بانک به‌صورت به‌هم‌ریخته (Scrambled) با شناسه یکتا
    const bankChips: WordChip[] = useMemo(() => {
        const cAny = challenge as any;
        let baseItems: Array<{ id: string; text: string }> = [];

        if (Array.isArray(cAny.bank) && cAny.bank.length > 0) {
            baseItems = cAny.bank.map((item: any, idx: number) => ({
                id: item.id || `chip_${idx}`,
                text: item.ar || item.fa || item.text || String(item),
            }));
        } else if (Array.isArray(challenge.options) && challenge.options.length > 0) {
            baseItems = challenge.options.map((opt: any, idx: number) => ({
                id: typeof opt === 'object' && opt !== null ? opt.id || `opt_${idx}` : `opt_${idx}`,
                text: typeof opt === 'object' && opt !== null ? (opt.ar || opt.fa || opt.text || opt.id) : String(opt),
            }));
        }

        const base = [...baseItems];
        if (base.length > 1) {
            // شافل تصادفی کلمات با الگوریتم فیشر-یتس تا ترتیب صحیح لو نرود
            for (let i = base.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [base[i], base[j]] = [base[j], base[i]];
            }
        }

        return base.map((item, idx) => ({
            id: `verse-chip-${challenge.id}-${idx}-${item.id}`,
            text: item.text,
        }));
    }, [challenge]);

    const [selectedChipIds, setSelectedChipIds] = useState<string[]>([]);

    useEffect(() => {
        setSelectedChipIds([]);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [challenge.id]);

    // حلقه همگام‌سازی کارائوکه کلمه‌به‌کلمه با زمان صوت استاد منشاوی
    const updateKaraokeHighlight = () => {
        const audio = audioRef.current;
        if (!audio || !verse?.wordTimestamps?.length) return;

        const currentMs = audio.currentTime * 1000;
        const activeItem = verse.wordTimestamps.find(
            (item) => currentMs >= item.startMs && currentMs <= item.endMs
        );
        setActiveTimestampWordId(activeItem ? activeItem.wordId : null);

        if (!audio.paused && !audio.ended) {
            rafRef.current = requestAnimationFrame(updateKaraokeHighlight);
        }
    };

    const togglePlayVerseAudio = () => {
        if (!verse?.menshawiAudioUrl) return;

        if (audioRef.current && isPlayingAudio) {
            audioRef.current.pause();
            setIsPlayingAudio(false);
            setActiveTimestampWordId(null);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            return;
        }

        const audio = new Audio(verse.menshawiAudioUrl);
        audioRef.current = audio;
        setIsPlayingAudio(true);

        audio.onplay = () => {
            rafRef.current = requestAnimationFrame(updateKaraokeHighlight);
        };
        audio.onended = () => {
            setIsPlayingAudio(false);
            setActiveTimestampWordId(null);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
        audio.onerror = () => {
            setIsPlayingAudio(false);
            setActiveTimestampWordId(null);
        };

        audio.play().catch(() => {
            setIsPlayingAudio(false);
        });
    };

    const handleChipClick = (chipId: string) => {
        if (disabled) return;

        setSelectedChipIds((prev) => {
            const isAlreadySelected = prev.includes(chipId);
            const next = isAlreadySelected
                ? prev.filter((id) => id !== chipId)
                : [...prev, chipId];

            const answerWords = next
                .map((id) => bankChips.find((c) => c.id === id)?.text || "")
                .filter(Boolean);

            onSelectionChange(answerWords);
            return next;
        });
    };

    const selectedChips = selectedChipIds
        .map((id) => bankChips.find((c) => c.id === id))
        .filter((c): c is WordChip => Boolean(c));

    return (
        <LayoutGroup id={`verse-builder-${challenge.id}`}>
            <div className="flex flex-col gap-5 w-full">
                {/* کادر آیه قرآنی با پخش صوت منشاوی و هایلایت هم‌زمان کلمه */}
                <div className="rounded-3xl bg-white dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                            <AudioWaveHalo isPlaying={isPlayingAudio} size="sm">
                                <button
                                    type="button"
                                    onClick={togglePlayVerseAudio}
                                    className="w-10 h-10 rounded-full bg-brand-primary text-white flex items-center justify-center shadow hover:brightness-105"
                                    aria-label="پخش تلاوت استاد منشاوی"
                                >
                                    {isPlayingAudio ? "⏸" : "🔊"}
                                </button>
                            </AudioWaveHalo>
                            <div className="text-right">
                                <div className="text-xs font-bold text-brand-primary">
                                    سوره {verse?.surahNameFa || "قرآن"} • آیه {verse?.ayahNumber || ""}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                    موضوع: {verse?.thematicTopicFa || "حفظ موضوعی"}
                                </div>
                            </div>
                        </div>

                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            ایستگاه فهم و ترکیب آیه
                        </span>
                    </div>

                    {/* پیش از ثبت پاسخ: متن آیه پنهان است تا کاربر با شنیدن تلاوت و فهم ترجمه کلمات را بچیند */}
                    {!disabled ? (
                        <div className="flex items-center justify-center py-4 px-4 rounded-2xl bg-termeh-bg/70 dark:bg-lapis-bg/50 border border-dashed border-termeh-border dark:border-lapis-border text-center">
                            <div className="flex flex-col items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    🎧 با توجه به ترجمه و شنیدن تلاوت، کلمات عربی آیه را در کادر زیر به ترتیب بچینید:
                                </span>
                                {isPlayingAudio && (
                                    <span className="text-xs font-bold text-brand-primary dark:text-brand-amber animate-pulse">
                                        در حال پخش تلاوت ترتیل استاد منشاوی...
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* پس از ثبت پاسخ: آشکارسازی آیه کامل به خط عثمان طه برای تثبیت در ذهن (همراه با هایلایت صوتی در صورت پخش مجدد) */
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            dir="rtl"
                            className="quran-text text-2xl sm:text-3xl text-center leading-loose py-2 text-brand-primary dark:text-brand-amber flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2"
                        >
                            {verse?.wordTimestamps && verse.wordTimestamps.length > 0 ? (
                                verse.wordTimestamps.map((wt) => {
                                    const isReadingNow = activeTimestampWordId === wt.wordId;
                                    return (
                                        <span
                                            key={wt.wordId}
                                            className={`transition-colors ${
                                                isReadingNow
                                                    ? "underline decoration-brand-amber decoration-2 underline-offset-8 font-bold text-brand-amber"
                                                    : ""
                                            }`}
                                        >
                                            {wt.textUthmani}
                                        </span>
                                    );
                                })
                            ) : (
                                <span>{verse?.arabicFullText}</span>
                            )}
                        </motion.div>
                    )}
                </div>

                {/* خطوط چیدن کلمات آیه برای نشستن کلمات پروازکننده */}
                <div className="rounded-3xl bg-termeh-bg dark:bg-lapis-bg/80 border-2 border-termeh-border dark:border-lapis-border p-4 min-h-[120px] flex flex-col justify-between">
                    <div
                        dir="rtl"
                        className="flex flex-wrap items-center justify-center gap-2.5 min-h-[56px] border-b border-dashed border-termeh-border dark:border-lapis-border pb-3"
                    >
                        {selectedChips.length === 0 ? (
                            <span className="text-sm text-slate-400 dark:text-slate-500 select-none">
                                کلمات عربی آیه را از پایین به ترتیب صحیح انتخاب کن تا آیه شکل بگیرد...
                            </span>
                        ) : (
                            selectedChips.map((chip) => (
                                <motion.button
                                    key={chip.id}
                                    type="button"
                                    layoutId={chip.id}
                                    onClick={() => handleChipClick(chip.id)}
                                    disabled={disabled}
                                    transition={{
                                        type: "spring",
                                        stiffness: 480,
                                        damping: 32,
                                    }}
                                    className="btn-3d-neutral px-4 py-2.5 rounded-xl font-bold flex items-center justify-center"
                                >
                                    <span className="quran-text text-xl sm:text-2xl text-slate-800 dark:text-white leading-none">
                                        {chip.text}
                                    </span>
                                </motion.button>
                            ))
                        )}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 text-center">
                        روی هر کلمه ضربه بزن تا به بانک کلمات بازگردد
                    </div>
                </div>

                {/* بانک کلمات به‌هم‌ریخته آیه (با جایگاه سایه ثابت برای جلوگیری از پرش صفحه) */}
                <div
                    dir="rtl"
                    className="flex flex-wrap items-center justify-center gap-2.5 pt-1"
                >
                    {bankChips.map((chip) => {
                        const isUsed = selectedChipIds.includes(chip.id);
                        return (
                            <div
                                key={chip.id}
                                className="relative rounded-xl bg-termeh-border/45 dark:bg-lapis-border/35 min-w-[70px] min-h-[50px] flex items-center justify-center"
                            >
                                {/* متن نامرئی برای حفظ دقیق ابعاد جایگاه در بانک کلمات */}
                                <span className="invisible inline-block px-4 py-2.5 quran-text text-xl sm:text-2xl select-none">
                                    {chip.text}
                                </span>

                                {!isUsed && (
                                    <motion.button
                                        type="button"
                                        layoutId={chip.id}
                                        onClick={() => handleChipClick(chip.id)}
                                        disabled={disabled}
                                        transition={{
                                            type: "spring",
                                            stiffness: 480,
                                            damping: 32,
                                        }}
                                        className="btn-3d-neutral absolute inset-0 w-full h-full px-4 py-2.5 rounded-xl font-bold flex items-center justify-center"
                                    >
                                        <span className="quran-text text-xl sm:text-2xl text-slate-800 dark:text-white leading-none">
                                            {chip.text}
                                        </span>
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