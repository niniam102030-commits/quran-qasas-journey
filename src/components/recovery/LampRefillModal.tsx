// src/components/recovery/LampRefillModal.tsx
import React, { useState, useEffect } from "react";
import { db } from "../../db/database";
import { useAppStore } from "../../store/useAppStore";
import { useQuranAudio } from "../../hooks/useQuranAudio";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";
import { Button3D } from "../common/Button3D";

export interface LampRefillModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface MiniDrillItem {
    id: string;
    arabicUthmani: string;
    rootLetters: string;
    correctMeaningFa: string;
    options: string[];
    audioWbwUrl: string;
}

const FALLBACK_DRILLS: MiniDrillItem[] = [
    {
        id: "drill_1",
        arabicUthmani: "فَسَيَكْفِيكَهُمُ",
        rootLetters: "ك ف ي",
        correctMeaningFa: "پس به‌زودی تو را از آنان کفایت می‌کند",
        options: [
            "پس به‌زودی تو را از آنان کفایت می‌کند",
            "پس از آنان سؤال خواهد کرد",
            "پس به سوی آنان بازمی‌گردید",
        ],
        audioWbwUrl: "/audio/wbw/002_137_008.mp3",
    },
    {
        id: "drill_2",
        arabicUthmani: "السَّمِيعُ",
        rootLetters: "س م ع",
        correctMeaningFa: "شنوای مطلق",
        options: ["شنوای مطلق", "بینای آشکار", "آمرزنده مهربان"],
        audioWbwUrl: "/audio/wbw/002_137_009.mp3",
    },
    {
        id: "drill_3",
        arabicUthmani: "الْعَلِيمُ",
        rootLetters: "ع ل م",
        correctMeaningFa: "بسیار دانا و آگاه",
        options: ["بسیار دانا و آگاه", "بلندمرتبه و بزرگ", "پادشاه روز جزا"],
        audioWbwUrl: "/audio/wbw/002_137_010.mp3",
    },
];

export const LampRefillModal: React.FC<LampRefillModalProps> = ({
    isOpen,
    onClose,
}) => {
    const userStats = useAppStore((s) => s.userStats);
    const completeLampRecoveryExercise = useAppStore(
        (s) => s.completeLampRecoveryExercise
    );
    const { playWord, isPlaying } = useQuranAudio(
        userStats?.currentCityId ?? "qom_jamkaran"
    );
    const { playSfx } = useHapticsAndSfx();

    const [drills, setDrills] = useState<MiniDrillItem[]>(FALLBACK_DRILLS);
    const [stepIndex, setStepIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [isCompleted, setIsCompleted] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setStepIndex(0);
        setSelectedOption(null);
        setIsCompleted(false);

        // بارگذاری واژگان واقعی از دیتابیس آفلاین برای تمرین بازیابی
        db.words
            .toArray()
            .then((words) => {
                if (words.length >= 3) {
                    const picked = words.slice(0, 3).map((w) => ({
                        id: w.id,
                        arabicUthmani: w.arabicUthmani,
                        rootLetters: w.rootLetters || "—",
                        correctMeaningFa: w.meaningFa,
                        options: [
                            w.meaningFa,
                            w.falseFriendTrapFa || "پندار و گمان",
                            "بازگشت به سوی پروردگار",
                        ],
                        audioWbwUrl: w.audioWbwUrl,
                    }));
                    setDrills(picked);
                } else {
                    setDrills(FALLBACK_DRILLS);
                }
            })
            .catch(() => setDrills(FALLBACK_DRILLS));
    }, [isOpen]);

    if (!isOpen || !userStats) return null;

    const currentDrill = drills[stepIndex] || drills[0];
    const previewLampsCount = isCompleted
        ? 5
        : Math.min(5, userStats.lampsCount + stepIndex + 1);

    const handleSelectOption = async (opt: string) => {
        setSelectedOption(opt);
        if (opt === currentDrill.correctMeaningFa) {
            playSfx("correct-chime");
            if (stepIndex + 1 < drills.length) {
                setTimeout(() => {
                    setStepIndex((prev) => prev + 1);
                    setSelectedOption(null);
                }, 650);
            } else {
                await completeLampRecoveryExercise();
                playSfx("stage-fanfare");
                setIsCompleted(true);
            }
        } else {
            playSfx("error-thud");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-lapis-bg/75 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md rounded-3xl bg-termeh-bg dark:bg-lapis-card border-2 border-brand-amber/60 shadow-2xl overflow-hidden">
                {/* هدر مودال با نمایش ۵ چراغ حرم */}
                <div className="bg-gradient-to-l from-brand-primaryDark to-brand-primary p-5 text-white text-center relative">
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute left-4 top-4 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25"
                    >
                        ✕
                    </button>

                    <h3 className="text-lg font-extrabold mb-1">
                        روشنایی چراغ‌های تدبر
                    </h3>
                    <p className="text-xs text-white/85 mb-4">
                        با ۳ مرور کوتاه صوتی، هر ۵ چراغ مسیر خود را دوباره روشن کنید
                    </p>

                    {/* ردیف ۵ قندیل */}
                    <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-2xl bg-black/20 w-fit mx-auto">
                        {[1, 2, 3, 4, 5].map((idx) => {
                            const lit = idx <= previewLampsCount;
                            return (
                                <div
                                    key={idx}
                                    className={`flex flex-col items-center transition-all duration-300 ${lit ? "scale-110" : "opacity-40 scale-90"
                                        }`}
                                >
                                    <span
                                        className={`w-7 h-7 rounded-full flex items-center justify-center ${lit
                                                ? "bg-brand-amber text-white shadow-[0_0_14px_rgba(245,158,11,0.9)]"
                                                : "bg-slate-700 text-slate-400"
                                            }`}
                                    >
                                        🕯️
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* بدنه تمرین یا پیام تکمیل شارژ */}
                <div className="p-6">
                    {isCompleted ? (
                        <div className="text-center py-4 space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full bg-brand-success/15 border-2 border-brand-success flex items-center justify-center text-3xl">
                                ✨
                            </div>
                            <h4 className="text-xl font-extrabold text-brand-success">
                                هر ۵ چراغ شما روشن شد!
                            </h4>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                نور انس با آیات الهی در دل شما فروزان‌تر گشت. اکنون می‌توانید با
                                خیال آسوده به مسیر سفر خود ادامه دهید.
                            </p>
                            <Button3D variant="success" fullWidth onClick={onClose}>
                                بازگشت به مسیر سفر
                            </Button3D>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                <span>
                                    گام {stepIndex + 1} از {drills.length}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-morph-rootBg text-morph-root font-bold">
                                    ریشه: {currentDrill.rootLetters}
                                </span>
                            </div>

                            {/* کارت کلمه قرآنی و پخش صوت */}
                            <div className="p-4 rounded-2xl bg-white dark:bg-lapis-bg border-2 border-termeh-border dark:border-lapis-border flex items-center justify-between">
                                <div>
                                    <span className="text-xs text-slate-400 block mb-1">
                                        معنای دقیق این واژه قرآنی چیست؟
                                    </span>
                                    <p className="quran-text text-3xl text-slate-800 dark:text-white">
                                        {currentDrill.arabicUthmani}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => playWord(currentDrill.id)}
                                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isPlaying
                                            ? "bg-brand-amber text-white scale-105 shadow-lg"
                                            : "bg-brand-primary/15 text-brand-primary hover:bg-brand-primary/25"
                                        }`}
                                    title="پخش تلفظ واژه"
                                >
                                    🔊
                                </button>
                            </div>

                            {/* گزینه‌ها */}
                            <div className="space-y-2.5">
                                {currentDrill.options.map((opt) => {
                                    const isSelected = selectedOption === opt;
                                    const isCorrect = opt === currentDrill.correctMeaningFa;

                                    let variant: "neutral" | "success" | "ruby" = "neutral";
                                    if (isSelected) {
                                        variant = isCorrect ? "success" : "ruby";
                                    }

                                    return (
                                        <Button3D
                                            key={opt}
                                            variant={variant}
                                            fullWidth
                                            size="md"
                                            onClick={() => handleSelectOption(opt)}
                                            className="justify-start text-right"
                                        >
                                            {opt}
                                        </Button3D>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};