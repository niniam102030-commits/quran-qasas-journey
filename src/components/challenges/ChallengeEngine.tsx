// src/components/challenges/ChallengeEngine.tsx
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../db/database";
import { useAppStore } from "../../store/useAppStore";
import type {
    VerseData,
    WordMorphology,
    FSRSRating,
} from "../../types/schema";
import { SmartAqeeqGem } from "../mascot/SmartAqeeqGem";
import { Button3D } from "../common/Button3D";
import { DeGluingPuzzle } from "./DeGluingPuzzle";
import { VerseBuilder } from "./VerseBuilder";
import { FalseFriendHunter } from "./FalseFriendHunter";
import { AudioCloze } from "./AudioCloze";
import { WordMatching } from "./WordMatching";
import { SequenceOrQuiz } from "./SequenceOrQuiz";
import { AnswerFeedbackSheet } from "./AnswerFeedbackSheet";

interface ChallengeEngineProps {
    onLessonCompleted: () => void;
}

const LAYER_BADGE_LABELS: Record<1 | 2 | 3 | 4, string> = {
    1: "لایه ۱ • واژگان آشنا و هم‌ریشه",
    2: "لایه ۲ • کلمات پرتکرار قرآنی",
    3: "لایه ۳ • شکار کلمات فریبنده",
    4: "لایه ۴ • ایستگاه فهم و ترکیب آیه",
};

const CHALLENGE_TYPE_LABELS: Record<string, string> = {
    WORD_MATCHING: "تطبیق واژگان و ترجمه انصاریان",
    VERSE_BUILDER: "آیه‌چین و ساخت آیه",
    FALSE_FRIEND_HUNTER: "کلمات سخت و تله‌های معنایی",
    AYAH_SEQUENCE: "تسلط بر ترتیب و زنجیره آیات",
    AYAH_NUMBER_QUIZ: "آزمون شماره آیه",
    VERSE_COMPLETION: "تکمیل بخش جاافتاده آیه",
    MORPHOLOGY_DEGLUING: "کالبدشکافی واژه",
    AUDIO_CLOZE: "جای‌خالی آیه",
};

export const ChallengeEngine: React.FC<ChallengeEngineProps> = ({
    onLessonCompleted,
}) => {
    const {
        session,
        markSelectionChanged,
        setAqeeqMood,
        toggleDeepTip,
        submitChallengeAnswer,
        nextChallengeOrFinish,
    } = useAppStore();

    const currentChallenge =
        session.challengesQueue[session.currentChallengeIndex] || null;

    const [targetWord, setTargetWord] = useState<WordMorphology | null>(null);
    const [targetVerse, setTargetVerse] = useState<VerseData | null>(null);
    const [userDraftAnswer, setUserDraftAnswer] = useState<string | string[]>("");
    const [hasInitialSelection, setHasInitialSelection] = useState(false);
    const [lastResultMeta, setLastResultMeta] = useState<{
        assignedFsrsRating: FSRSRating | null;
        triggeredFalseFriendTrap: boolean;
    }>({
        assignedFsrsRating: null,
        triggeredFalseFriendTrap: false,
    });

    // واکشی اطلاعات کلمه هدف و آیه مرتبط از دیتابیس آفلاین Dexie
    useEffect(() => {
        let isMounted = true;
        setUserDraftAnswer("");
        setHasInitialSelection(false);
        setLastResultMeta({
            assignedFsrsRating: null,
            triggeredFalseFriendTrap: false,
        });

        async function loadChallengeEntities() {
            if (!currentChallenge) return;

            const [wordRecord, verseRecord] = await Promise.all([
                currentChallenge.targetWordId
                    ? db.words.get(currentChallenge.targetWordId)
                    : Promise.resolve(undefined),
                db.verses.get(currentChallenge.targetVerseId),
            ]);

            if (!isMounted) return;
            setTargetWord(wordRecord || null);
            setTargetVerse(verseRecord || null);
        }

        loadChallengeEntities();
        return () => {
            isMounted = false;
        };
    }, [currentChallenge]);

    if (!currentChallenge) {
        return null;
    }

    const isAnswerReady = Array.isArray(userDraftAnswer)
        ? userDraftAnswer.length > 0
        : userDraftAnswer.trim().length > 0;

    const handleDraftAnswerChange = (nextAnswer: string | string[]) => {
        if (hasInitialSelection) {
            markSelectionChanged();
            setAqeeqMood("thinking");
        } else {
            setHasInitialSelection(true);
        }
        setUserDraftAnswer(nextAnswer);
    };

    const handleCheckAnswer = async () => {
        if (!isAnswerReady || session.isAnswerChecked) return;

        const result = await submitChallengeAnswer(userDraftAnswer);
        setLastResultMeta({
            assignedFsrsRating: result.assignedFsrsRating,
            triggeredFalseFriendTrap: result.triggeredFalseFriendTrap,
        });

        if (result.isCorrect) {
            setAqeeqMood("happy");
        } else {
            setAqeeqMood("warning");
        }
    };

    const handleContinueNext = async () => {
        const status = await nextChallengeOrFinish();
        if (status === "LESSON_COMPLETED") {
            onLessonCompleted();
        }
    };

    const handleToggleDeepTipWithMood = () => {
        toggleDeepTip();
        if (!session.showDeepTip) {
            setAqeeqMood("deep_tip");
        }
    };

    return (
        <div className="relative flex flex-col justify-between flex-1 w-full max-w-2xl mx-auto pb-28">
            {/* هدر صورت سوال به همراه نگین عقیق هوشمند */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
                        {CHALLENGE_TYPE_LABELS[currentChallenge.type] ||
                            LAYER_BADGE_LABELS[currentChallenge.layer]}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                        سوال {session.currentChallengeIndex + 1} از{" "}
                        {session.challengesQueue.length}
                    </span>
                </div>

                <div className="flex items-center gap-3.5 bg-white/70 dark:bg-lapis-card/60 border border-termeh-border dark:border-lapis-border rounded-3xl p-3.5">
                    <SmartAqeeqGem mood={session.aqeeqMood} size="md" />
                    <h1 className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-100 leading-snug">
                        {currentChallenge.promptFa}
                    </h1>
                </div>
            </div>

            {/* بدنه اصلی تمرین با ترنزیشن نرم بین سوالات */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentChallenge.id}
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ type: "spring", stiffness: 340, damping: 30 }}
                    className="flex-1 flex flex-col justify-center"
                >
                    {currentChallenge.type === "MORPHOLOGY_DEGLUING" && (
                        <DeGluingPuzzle
                            challenge={currentChallenge}
                            targetWord={targetWord}
                            disabled={session.isAnswerChecked}
                            onSelectionChange={handleDraftAnswerChange}
                        />
                    )}

                    {/* ۱. چالش‌های ساخت و چیدمان آیه و ترجمه */}
                    {(currentChallenge.type === "VERSE_BUILDER" ||
                        (currentChallenge as any).shape === "order") && (
                        <VerseBuilder
                            challenge={currentChallenge}
                            verse={targetVerse}
                            disabled={session.isAnswerChecked}
                            onSelectionChange={handleDraftAnswerChange}
                        />
                    )}

                    {/* ۲. چالش‌های شکار کلمات فریبنده */}
                    {currentChallenge.type === "FALSE_FRIEND_HUNTER" && (
                        <FalseFriendHunter
                            challenge={currentChallenge}
                            targetWord={targetWord}
                            verse={targetVerse}
                            disabled={session.isAnswerChecked}
                            isAnswerChecked={session.isAnswerChecked}
                            onSelectionChange={handleDraftAnswerChange}
                        />
                    )}

                    {/* ۳. بازی تطبیق دو ستونه واژگان و عبارات */}
                    {(currentChallenge.type === "WORD_MATCHING" ||
                        (currentChallenge as any).shape === "match") && (
                        <WordMatching
                            challenge={currentChallenge}
                            verse={targetVerse}
                            disabled={session.isAnswerChecked}
                            onSelectionChange={handleDraftAnswerChange}
                        />
                    )}

                    {/* ۴. سوالات چندگزینه‌ای، ترتیب آیات، شماره آیات و تسلط */}
                    {(currentChallenge.type === "AYAH_SEQUENCE" ||
                        currentChallenge.type === "AYAH_NUMBER_QUIZ" ||
                        currentChallenge.type === "VERSE_COMPLETION" ||
                        (currentChallenge as any).shape === "choice" ||
                        (currentChallenge as any).shape === "cloze") && (
                        <SequenceOrQuiz
                            challenge={currentChallenge}
                            verse={targetVerse}
                            disabled={session.isAnswerChecked}
                            isAnswerChecked={session.isAnswerChecked}
                            onSelectionChange={handleDraftAnswerChange}
                        />
                    )}

                    {currentChallenge.type === "AUDIO_CLOZE" && (
                        <AudioCloze
                            challenge={currentChallenge}
                            verse={targetVerse}
                            targetWord={targetWord}
                            disabled={session.isAnswerChecked}
                            onSelectionChange={handleDraftAnswerChange}
                        />
                    )}
                </motion.div>
            </AnimatePresence>

            {/* دکمه پایین صفحه برای ثبت نهایی پاسخ (پیش از باز شدن شیت بازخورد) */}
            {!session.isAnswerChecked && (
                <div className="fixed inset-x-0 bottom-0 z-30 bg-termeh-bg/95 dark:bg-lapis-bg/95 backdrop-blur border-t border-termeh-border dark:border-lapis-border px-4 py-4">
                    <div className="mx-auto max-w-2xl">
                        <Button3D
                            variant="primary"
                            fullWidth
                            size="lg"
                            disabled={!isAnswerReady}
                            onClick={handleCheckAnswer}
                        >
                            بررسی پاسخ
                        </Button3D>
                    </div>
                </div>
            )}

            {/* شیت کشویی بازخورد پاسخ */}
            <AnswerFeedbackSheet
                isOpen={session.isAnswerChecked}
                isCorrect={session.isCurrentAnswerCorrect}
                triggeredFalseFriendTrap={lastResultMeta.triggeredFalseFriendTrap}
                assignedFsrsRating={lastResultMeta.assignedFsrsRating}
                challenge={currentChallenge}
                showDeepTip={session.showDeepTip}
                onToggleDeepTip={handleToggleDeepTipWithMood}
                onContinue={handleContinueNext}
            />
        </div>
    );
};