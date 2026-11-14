// src/components/challenges/AnswerFeedbackSheet.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Challenge, FSRSRating } from "../../types/schema";
import { Button3D } from "../common/Button3D";

interface AnswerFeedbackSheetProps {
    isOpen: boolean;
    isCorrect: boolean | null;
    triggeredFalseFriendTrap: boolean;
    assignedFsrsRating: FSRSRating | null;
    challenge: Challenge;
    showDeepTip: boolean;
    onToggleDeepTip: () => void;
    onContinue: () => void;
}

export const AnswerFeedbackSheet: React.FC<AnswerFeedbackSheetProps> = ({
    isOpen,
    isCorrect,
    triggeredFalseFriendTrap,
    assignedFsrsRating,
    challenge,
    showDeepTip,
    onToggleDeepTip,
    onContinue,
}) => {
    const formattedCorrectAnswer = Array.isArray(challenge.correctAnswer)
        ? challenge.correctAnswer.join(" ")
        : challenge.correctAnswer;

    const getHeaderTitle = () => {
        if (isCorrect) {
            if (assignedFsrsRating === 4) return "فوق‌العاده و سریع! ذهنِ آماده 🌟";
            return "احسنت! پاسخ کاملاً درست است";
        }
        if (triggeredFalseFriendTrap) {
            return "مراقب تله کلمه فریبنده باش!";
        }
        return "نیاز به دقت بیشتر دارد";
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className={`fixed inset-x-0 bottom-0 z-40 border-t-4 px-4 pt-4 pb-6 shadow-2xl ${isCorrect
                            ? "bg-emerald-50 dark:bg-emerald-950 border-brand-success text-emerald-950 dark:text-emerald-100"
                            : triggeredFalseFriendTrap
                                ? "bg-amber-50 dark:bg-amber-950 border-brand-amber text-amber-950 dark:text-amber-100"
                                : "bg-red-50 dark:bg-red-950 border-brand-ruby text-red-950 dark:text-red-100"
                        }`}
                >
                    <div className="mx-auto max-w-2xl flex flex-col gap-3">
                        {/* ردیف عنوان وضعیت و دکمه نکته عمیق‌تر */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div
                                    className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-sm ${isCorrect
                                            ? "bg-brand-success"
                                            : triggeredFalseFriendTrap
                                                ? "bg-brand-amber"
                                                : "bg-brand-ruby"
                                        }`}
                                >
                                    {isCorrect ? "✓" : triggeredFalseFriendTrap ? "!" : "✕"}
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-extrabold">
                                        {getHeaderTitle()}
                                    </h3>
                                    {!isCorrect && (
                                        <div className="text-xs sm:text-sm font-bold opacity-90 mt-0.5">
                                            پاسخ صحیح:{" "}
                                            <span className="quran-text text-base underline">
                                                {formattedCorrectAnswer}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {challenge.deepTipFa && (
                                <button
                                    type="button"
                                    onClick={onToggleDeepTip}
                                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-amber-500/40 px-3 py-1.5 text-xs font-extrabold text-amber-800 dark:text-amber-300 shadow-sm hover:brightness-95 transition"
                                >
                                    <span>💎</span>
                                    <span>{showDeepTip ? "بستن نکته" : "نکته عمیق‌تر"}</span>
                                </button>
                            )}
                        </div>

                        {/* توضیح کوتاه آموزشی */}
                        <p className="text-xs sm:text-sm leading-relaxed opacity-90">
                            {challenge.explanationFa}
                        </p>

                        {/* کادر بازشوی «نکته عمیق‌تر» (ریشه و وزن کلمه / لطیفه قرآنی) */}
                        <AnimatePresence>
                            {showDeepTip && challenge.deepTipFa && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-1 rounded-2xl bg-white/90 dark:bg-lapis-card/90 border-2 border-brand-amber/50 p-3.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed shadow-inner">
                                        <div className="font-extrabold text-brand-amber mb-1 flex items-center gap-1.5">
                                            <span>✨</span>
                                            <span>نگاه عمیق‌تر (ریشه و ظرافت قرآنی):</span>
                                        </div>
                                        {challenge.deepTipFa}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* دکمه ادامه به سوال بعدی */}
                        <div className="mt-1">
                            <Button3D
                                variant={
                                    isCorrect
                                        ? "success"
                                        : triggeredFalseFriendTrap
                                            ? "amber"
                                            : "ruby"
                                }
                                fullWidth
                                size="lg"
                                onClick={onContinue}
                            >
                                ادامه
                            </Button3D>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};