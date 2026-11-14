// src/pages/LessonSessionPage.tsx
import React, { useEffect, useState } from "react";
import { db } from "../db/database";
import { useAppStore } from "../store/useAppStore";
import type { CityNode, Lesson, VoiceClip } from "../types/schema";
import { ProgressBar } from "../components/common/ProgressBar";
import { ChallengeEngine } from "../components/challenges/ChallengeEngine";
import { HostVictoryCard } from "../components/mascot/HostVictoryCard";
import { Button3D } from "../components/common/Button3D";

interface LessonSessionPageProps {
    lessonId: string;
    onExitToMap: () => void;
}

export const LessonSessionPage: React.FC<LessonSessionPageProps> = ({
    lessonId,
    onExitToMap,
}) => {
    const {
        userStats,
        session,
        startLessonSession,
        abortLessonSession,
        completeLampRecoveryExercise,
        recordDailyChillehActivity,
    } = useAppStore();

    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [city, setCity] = useState<CityNode | null>(null);
    const [victoryVoiceClip, setVictoryVoiceClip] = useState<VoiceClip | null>(
        null
    );
    const [isVictoryScreen, setIsVictoryScreen] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function initSession() {
            await startLessonSession(lessonId);
            const lessonRecord = await db.lessons.get(lessonId);
            if (!lessonRecord || !isMounted) return;
            setLesson(lessonRecord);

            const cityRecord = await db.cities.get(lessonRecord.cityId);
            if (cityRecord && isMounted) {
                setCity(cityRecord);
                if (cityRecord.voiceClipIds.length > 0) {
                    const randomClipId =
                        cityRecord.voiceClipIds[
                        Math.floor(Math.random() * cityRecord.voiceClipIds.length)
                        ];
                    const clip = await db.voiceClips.get(randomClipId);
                    if (clip && isMounted) setVictoryVoiceClip(clip);
                }
            }
        }

        initSession();
        return () => {
            isMounted = false;
        };
    }, [lessonId, startLessonSession]);

    const handleLessonCompleted = async () => {
        await recordDailyChillehActivity();
        setIsVictoryScreen(true);
    };

    const handleAbort = () => {
        abortLessonSession();
        onExitToMap();
    };

    const totalQuestions = session.challengesQueue.length;
    const completedCount = isVictoryScreen
        ? totalQuestions
        : session.currentChallengeIndex;

    const accuracyPercent =
        totalQuestions > 0
            ? Math.max(
                0,
                Math.round(
                    ((totalQuestions - session.mistakeCountInSession) /
                        totalQuestions) *
                    100
                )
            )
            : 100;

    return (
        <div className="min-h-screen bg-termeh-bg dark:bg-lapis-bg text-slate-800 dark:text-slate-100 flex flex-col px-4 pt-4">
            {/* نوار بالای صفحه کوییز: دکمه خروج، نوار پیشرفت و ۵ چراغ بخشنده */}
            <header className="mx-auto w-full max-w-2xl flex items-center gap-4 mb-5">
                <button
                    type="button"
                    onClick={handleAbort}
                    className="w-10 h-10 rounded-xl bg-white dark:bg-lapis-card border border-termeh-border dark:border-lapis-border flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold"
                    aria-label="خروج از درس"
                >
                    ✕
                </button>

                <div className="flex-1">
                    <ProgressBar current={completedCount} total={totalQuestions} />
                </div>

                {/* نمایشگر ۵ چراغ روشن */}
                <div
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-white dark:bg-lapis-card border border-termeh-border dark:border-lapis-border px-3 py-1.5 shadow-sm"
                    title="چراغ‌های هدایت"
                >
                    <span className="text-base">🏮</span>
                    <span className="text-sm font-black text-brand-amber">
                        {userStats?.lampsCount ?? 5}
                    </span>
                </div>
            </header>

            <main className="flex-1 flex flex-col justify-center">
                {isVictoryScreen ? (
                    <HostVictoryCard
                        cityId={city?.id || lesson?.cityId || "qasas_station_nile"}
                        city={city}
                        voiceClip={victoryVoiceClip}
                        lessonTitleFa={lesson?.titleFa || "درس فهم آیات قرآنی"}
                        earnedNoorXp={lesson?.rewardNoorXp ?? 25}
                        earnedAqeeqGem={lesson?.rewardAqeeqGem ?? 10}
                        accuracyPercent={accuracyPercent}
                        onContinueToMap={onExitToMap}
                    />
                ) : (
                    <ChallengeEngine onLessonCompleted={handleLessonCompleted} />
                )}
            </main>

            {/* مودال بخشنده شارژ مجدد ۵ چراغ در صورت صفر شدن */}
            {session.isLampRecoveryModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-3xl bg-white dark:bg-lapis-card border-2 border-brand-amber p-6 text-center shadow-2xl">
                        <div className="text-4xl mb-2">🏮</div>
                        <h3 className="text-xl font-extrabold text-slate-800 dark:text-white">
                            چراغ‌هایت نیاز به تجدید نور دارند!
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            در مسیر قرآن هیچ بن‌بستی وجود ندارد. با یک تمرین کوتاه صوتی و مرور
                            واژگان پیشین، هر ۵ چراغت بلافاصله روشن می‌شوند.
                        </p>
                        <div className="mt-6 flex flex-col gap-2.5">
                            <Button3D
                                variant="amber"
                                fullWidth
                                size="lg"
                                onClick={() => completeLampRecoveryExercise()}
                            >
                                ✨ روشن کردن مجدد ۵ چراغ و ادامه درس
                            </Button3D>
                            <Button3D
                                variant="neutral"
                                fullWidth
                                size="md"
                                onClick={handleAbort}
                            >
                                بازگشت به نقشه
                            </Button3D>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};