// src/store/useAppStore.ts
import { create } from "zustand";
import {
    db,
    ensureDefaultUserStats,
    seedInitialDatabase,
} from "../db/database";
import {
    calculateImplicitFsrsRating,
    recordWordReview,
} from "../services/fsrsScheduler";
import type {
    UserStats,
    Challenge,
    AqeeqMood,
    FSRSRating,
} from "../types/schema";

export interface ActiveSessionState {
    lessonId: string | null;
    challengesQueue: Challenge[];
    currentChallengeIndex: number;
    mistakeCountInSession: number;
    questionStartTimeMs: number;
    hasChangedSelection: boolean;
    aqeeqMood: AqeeqMood;
    isAnswerChecked: boolean;
    isCurrentAnswerCorrect: boolean | null;
    showDeepTip: boolean;
    isLampRecoveryModalOpen: boolean;
}

export interface AppStoreState {
    // ۱. وضعیت کلی برنامه و کاربر
    isInitialized: boolean;
    userStats: UserStats | null;
    activeCityId: string;

    // ۲. وضعیت جلسه تمرین فعال (Lesson Session)
    session: ActiveSessionState;

    // ۳. اکشن‌های مقداردهی و ناوبری
    initApp: () => Promise<void>;
    setActiveCity: (cityId: string) => void;
    toggleDarkMode: () => Promise<void>;
    toggleSoundEffects: () => Promise<void>;

    // ۴. اکشن‌های چرخه درس و تمرین‌ها
    startLessonSession: (lessonId: string) => Promise<void>;
    markSelectionChanged: () => void;
    setAqeeqMood: (mood: AqeeqMood) => void;
    toggleDeepTip: () => void;

    submitChallengeAnswer: (userAnswer: string | string[]) => Promise<{
        isCorrect: boolean;
        assignedFsrsRating: FSRSRating;
        triggeredFalseFriendTrap: boolean;
    }>;

    nextChallengeOrFinish: () => Promise<
        "NEXT_QUESTION" | "LESSON_COMPLETED" | "NEEDS_LAMP_RECOVERY"
    >;
    abortLessonSession: () => void;

    // ۵. اکشن‌های سیستم «۵ چراغ بخشنده» و «چله انس»
    completeLampRecoveryExercise: () => Promise<void>;
    recordDailyChillehActivity: () => Promise<void>;
}

const INITIAL_SESSION_STATE: ActiveSessionState = {
    lessonId: null,
    challengesQueue: [],
    currentChallengeIndex: 0,
    mistakeCountInSession: 0,
    questionStartTimeMs: 0,
    hasChangedSelection: false,
    aqeeqMood: "idle",
    isAnswerChecked: false,
    isCurrentAnswerCorrect: null,
    showDeepTip: false,
    isLampRecoveryModalOpen: false,
};

/**
 * نرمال‌سازی رشته‌های عربی و فارسی برای جلوگیری از خطای کاذب ناشی از فاصله یا کاراکترهای ZWJ
 */
function normalizeText(value: string): string {
    return value.replace(/\u200D/g, "").trim();
}

/**
 * بررسی برابری دقیق پاسخ کاربر (رشته تکی یا آرایه‌ای از قطعات/کلمات) با پاسخ صحیح چالش
 */
function evaluateAnswerCorrectness(
    userAnswer: string | string[],
    correctAnswer: string | string[]
): boolean {
    if (Array.isArray(correctAnswer)) {
        if (!Array.isArray(userAnswer)) return false;
        if (userAnswer.length !== correctAnswer.length) return false;
        return correctAnswer.every(
            (expectedItem, index) =>
                normalizeText(userAnswer[index]) === normalizeText(expectedItem)
        );
    }

    if (Array.isArray(userAnswer)) {
        return (
            normalizeText(userAnswer.join(" ")) === normalizeText(correctAnswer)
        );
    }

    return normalizeText(userAnswer) === normalizeText(correctAnswer);
}

/**
 * استخراج تاریخ محلی روز به فرمت YYYY-MM-DD برای محاسبه دقیق روزشمار چله انس
 */
function getTodayLocalDateIso(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * محاسبه اختلاف روز تقویمی بین دو تاریخ YYYY-MM-DD
 */
function getCalendarDayDifference(
    earlierIsoDate: string,
    laterIsoDate: string
): number {
    const [y1, m1, d1] = earlierIsoDate.split("-").map(Number);
    const [y2, m2, d2] = laterIsoDate.split("-").map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((utc2 - utc1) / msPerDay);
}

/**
 * همگام‌سازی کلاس dark روی تگ ریشه HTML
 */
function applyThemeClassToDocument(isDark: boolean): void {
    if (typeof document === "undefined") return;
    const rootEl = document.documentElement;
    if (isDark) {
        rootEl.classList.add("dark");
    } else {
        rootEl.classList.remove("dark");
    }
}

export const useAppStore = create<AppStoreState>((set, get) => ({
    isInitialized: false,
    userStats: null,
    activeCityId: "qasas_station_nile",
    session: { ...INITIAL_SESSION_STATE },

    initApp: async () => {
        if (get().isInitialized) return;

        await seedInitialDatabase();
        const stats = await ensureDefaultUserStats();
        applyThemeClassToDocument(stats.darkMode);

        set({
            isInitialized: true,
            userStats: stats,
            activeCityId: stats.currentCityId,
        });
    },

    setActiveCity: (cityId: string) => {
        const currentStats = get().userStats;
        set({ activeCityId: cityId });

        if (currentStats) {
            const updatedStats: UserStats = {
                ...currentStats,
                currentCityId: cityId,
            };
            set({ userStats: updatedStats });
            void db.userStats.put(updatedStats);
        }
    },

    toggleDarkMode: async () => {
        const currentStats = get().userStats;
        if (!currentStats) return;

        const nextDarkMode = !currentStats.darkMode;
        const updatedStats: UserStats = {
            ...currentStats,
            darkMode: nextDarkMode,
        };

        applyThemeClassToDocument(nextDarkMode);
        set({ userStats: updatedStats });
        await db.userStats.put(updatedStats);
    },

    toggleSoundEffects: async () => {
        const currentStats = get().userStats;
        if (!currentStats) return;

        const updatedStats: UserStats = {
            ...currentStats,
            soundEffectsEnabled: !currentStats.soundEffectsEnabled,
        };

        set({ userStats: updatedStats });
        await db.userStats.put(updatedStats);
    },

    startLessonSession: async (lessonId: string) => {
        const lesson = await db.lessons.get(lessonId);
        if (!lesson) {
            throw new Error(`Lesson with id "${lessonId}" not found in IndexedDB.`);
        }

        let challenges = await db.challenges
            .where("lessonId")
            .equals(lessonId)
            .toArray();

        challenges = challenges.sort((a, b) => a.order - b.order);

        const currentStats = get().userStats;
        const hasNoLamps = currentStats ? currentStats.lampsCount <= 0 : false;

        set({
            session: {
                lessonId,
                challengesQueue: challenges,
                currentChallengeIndex: 0,
                mistakeCountInSession: 0,
                questionStartTimeMs: Date.now(),
                hasChangedSelection: false,
                aqeeqMood: "idle",
                isAnswerChecked: false,
                isCurrentAnswerCorrect: null,
                showDeepTip: false,
                isLampRecoveryModalOpen: hasNoLamps,
            },
        });
    },

    markSelectionChanged: () => {
        const { session } = get();
        if (session.isAnswerChecked || session.hasChangedSelection) return;

        set({
            session: {
                ...session,
                hasChangedSelection: true,
                aqeeqMood: "thinking",
            },
        });
    },

    setAqeeqMood: (mood: AqeeqMood) => {
        set((state) => ({
            session: {
                ...state.session,
                aqeeqMood: mood,
            },
        }));
    },

    toggleDeepTip: () => {
        set((state) => {
            const nextShowDeepTip = !state.session.showDeepTip;
            return {
                session: {
                    ...state.session,
                    showDeepTip: nextShowDeepTip,
                    aqeeqMood: nextShowDeepTip ? "deep_tip" : "idle",
                },
            };
        });
    },

    submitChallengeAnswer: async (userAnswer: string | string[]) => {
        const { session, userStats } = get();
        const currentChallenge =
            session.challengesQueue[session.currentChallengeIndex];

        if (!currentChallenge) {
            return {
                isCorrect: false,
                assignedFsrsRating: 1,
                triggeredFalseFriendTrap: false,
            };
        }

        const responseTimeMs = Math.max(
            0,
            Date.now() - session.questionStartTimeMs
        );
        const isCorrect = evaluateAnswerCorrectness(
            userAnswer,
            currentChallenge.correctAnswer
        );

        const assignedFsrsRating = calculateImplicitFsrsRating({
            isCorrect,
            responseTimeMs,
            hasChangedSelection: session.hasChangedSelection,
        });

        const triggeredFalseFriendTrap =
            !isCorrect &&
            currentChallenge.trapOption !== null &&
            typeof userAnswer === "string" &&
            normalizeText(userAnswer) === normalizeText(currentChallenge.trapOption);

        // ثبت وضعیت یادگیری در جدول FSRS برای کلمه هدف
        if (currentChallenge.targetWordId) {
            await recordWordReview(currentChallenge.targetWordId, assignedFsrsRating);
        }

        let nextLampsCount = userStats?.lampsCount ?? 5;
        let nextMistakeCount = session.mistakeCountInSession;

        if (!isCorrect) {
            nextLampsCount = Math.max(0, nextLampsCount - 1);
            nextMistakeCount += 1;

            if (userStats) {
                const updatedStats: UserStats = {
                    ...userStats,
                    lampsCount: nextLampsCount,
                };
                set({ userStats: updatedStats });
                await db.userStats.put(updatedStats);
            }
        }

        const nextAqeeqMood: AqeeqMood = isCorrect
            ? "happy"
            : triggeredFalseFriendTrap
                ? "warning"
                : "thinking";

        set({
            session: {
                ...session,
                mistakeCountInSession: nextMistakeCount,
                aqeeqMood: nextAqeeqMood,
                isAnswerChecked: true,
                isCurrentAnswerCorrect: isCorrect,
                isLampRecoveryModalOpen: nextLampsCount === 0,
            },
        });

        return {
            isCorrect,
            assignedFsrsRating,
            triggeredFalseFriendTrap,
        };
    },

    nextChallengeOrFinish: async () => {
        const { session, userStats } = get();

        if (userStats && userStats.lampsCount <= 0) {
            set({
                session: {
                    ...session,
                    isLampRecoveryModalOpen: true,
                },
            });
            return "NEEDS_LAMP_RECOVERY";
        }

        const nextIndex = session.currentChallengeIndex + 1;
        if (nextIndex < session.challengesQueue.length) {
            set({
                session: {
                    ...session,
                    currentChallengeIndex: nextIndex,
                    questionStartTimeMs: Date.now(),
                    hasChangedSelection: false,
                    aqeeqMood: "idle",
                    isAnswerChecked: false,
                    isCurrentAnswerCorrect: null,
                    showDeepTip: false,
                },
            });
            return "NEXT_QUESTION";
        }

        // پایان درس: اعطای پاداش نور و عقیق، باز کردن مرحله/شهر بعدی و ثبت فعالیت چله انس
        if (session.lessonId && userStats) {
            const completedLesson = await db.lessons.get(session.lessonId);
            const rewardNoor = completedLesson?.rewardNoorXp ?? 20;
            const rewardAqeeq = completedLesson?.rewardAqeeqGem ?? 10;

            const updatedCompletedLessons = userStats.completedLessonIds.includes(
                session.lessonId
            )
                ? userStats.completedLessonIds
                : [...userStats.completedLessonIds, session.lessonId];

            const updatedUnlockedCities = [...userStats.unlockedCityIds];
            let nextLessonId = userStats.currentLessonId;

            if (completedLesson) {
                const cityLessons = await db.lessons
                    .where("cityId")
                    .equals(completedLesson.cityId)
                    .toArray();
                cityLessons.sort((a, b) => a.order - b.order);

                const nextLessonInCity = cityLessons.find(
                    (l) => !updatedCompletedLessons.includes(l.id)
                );

                if (nextLessonInCity) {
                    nextLessonId = nextLessonInCity.id;
                } else {
                    // اگر تمام دروس این شهر کامل شد، ایستگاه شهر بعدی را باز کن
                    const currentCity = await db.cities.get(completedLesson.cityId);
                    if (currentCity) {
                        const nextCity = await db.cities
                            .where("order")
                            .equals(currentCity.order + 1)
                            .first();

                        if (nextCity && !updatedUnlockedCities.includes(nextCity.id)) {
                            updatedUnlockedCities.push(nextCity.id);
                        }

                        if (nextCity) {
                            const firstLessonOfNextCity = await db.lessons
                                .where("cityId")
                                .equals(nextCity.id)
                                .sortBy("order");
                            if (firstLessonOfNextCity.length > 0) {
                                nextLessonId = firstLessonOfNextCity[0].id;
                            }
                        }
                    }
                }
            }

            const updatedStats: UserStats = {
                ...userStats,
                noorXp: userStats.noorXp + rewardNoor,
                aqeeqGems: userStats.aqeeqGems + rewardAqeeq,
                completedLessonIds: updatedCompletedLessons,
                unlockedCityIds: updatedUnlockedCities,
                currentLessonId: nextLessonId,
            };

            set({ userStats: updatedStats });
            await db.userStats.put(updatedStats);
            await get().recordDailyChillehActivity();
        }

        return "LESSON_COMPLETED";
    },

    abortLessonSession: () => {
        set({
            session: { ...INITIAL_SESSION_STATE },
        });
    },

    completeLampRecoveryExercise: async () => {
        const { userStats, session } = get();
        if (!userStats) return;

        const updatedStats: UserStats = {
            ...userStats,
            lampsCount: 5,
        };

        set({
            userStats: updatedStats,
            session: {
                ...session,
                isLampRecoveryModalOpen: false,
                aqeeqMood: "happy",
            },
        });

        await db.userStats.put(updatedStats);
    },

    recordDailyChillehActivity: async () => {
        const currentStats = get().userStats;
        if (!currentStats) return;

        const todayIso = getTodayLocalDateIso();
        const lastDateIso = currentStats.lastActiveDateIso;

        // اگر امروز قبلاً فعالیت ثبت شده، نیازی به افزایش دوباره شمارنده روزانه نیست
        if (lastDateIso === todayIso) {
            return;
        }

        let nextChillehDays = 1;
        if (lastDateIso) {
            const dayDiff = getCalendarDayDifference(lastDateIso, todayIso);
            if (dayDiff === 1) {
                nextChillehDays = currentStats.chillehCurrentDays + 1;
            } else if (dayDiff <= 0) {
                nextChillehDays = currentStats.chillehCurrentDays;
            } else {
                // در صورت وقفه بیش از یک روز، شروع مجدد پله چله با حفظ بهترین رکورد
                nextChillehDays = 1;
            }
        }

        const nextBestDays = Math.max(currentStats.chillehBestDays, nextChillehDays);
        const nextStage: 7 | 14 | 40 =
            nextChillehDays >= 14 ? 40 : nextChillehDays >= 7 ? 14 : 7;

        const updatedStats: UserStats = {
            ...currentStats,
            chillehCurrentDays: nextChillehDays,
            chillehBestDays: nextBestDays,
            chillehStage: nextStage,
            lastActiveDateIso: todayIso,
        };

        set({ userStats: updatedStats });
        await db.userStats.put(updatedStats);
    },
}));