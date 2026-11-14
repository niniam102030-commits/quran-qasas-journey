// src/components/challenges/AdaptivePlacementModal.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../../db/database";
import { useAppStore } from "../../store/useAppStore";
import type {
  WordMorphology,
  WordCategory,
  AqeeqMood,
  FSRSRating,
  FSRSCardState,
} from "../../types/schema";

interface AdaptivePlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlacementComplete: () => void;
}

type PlacementStage = "WELCOME_SELECT" | "ADAPTIVE_QUIZ" | "RESULT_SUMMARY";

interface AdaptiveQuestion {
  word: WordMorphology;
  layer: 1 | 2 | 3;
  promptFa: string;
  options: string[];
  correctOption: string;
  trapOption: string | null;
}

const TOTAL_CAT_QUESTIONS = 12;

// بانک پشتیبان در صورتی که دیتابیس اولیه کمتر از ۱۲ کلمه در سید اولیه داشته باشد
const FALLBACK_WORDS: WordMorphology[] = [
  {
    id: "cat_w_1",
    arabicUthmani: "السَّمِيعُ",
    category: "cognate",
    rootLetters: "س م ع",
    meaningFa: "شنوا",
    persianCognateHint: "هم‌خانواده با «سمعک» و «استماع» در فارسی",
    falseFriendTrapFa: null,
    deepTipFa: null,
    audioWbwUrl: "",
    segments: [{ text: "السَّمِيعُ", type: "root", meaningFa: "شنوا", connectsLeft: false }],
  },
  {
    id: "cat_w_2",
    arabicUthmani: "الْعَلِيمُ",
    category: "cognate",
    rootLetters: "ع ل م",
    meaningFa: "بسیار دانا",
    persianCognateHint: "هم‌خانواده با «علم» و «معلم» در فارسی",
    falseFriendTrapFa: null,
    deepTipFa: null,
    audioWbwUrl: "",
    segments: [{ text: "الْعَلِيمُ", type: "root", meaningFa: "دانا", connectsLeft: false }],
  },
  {
    id: "cat_w_3",
    arabicUthmani: "يَحْزُنكَ",
    category: "cognate",
    rootLetters: "ح ز ن",
    meaningFa: "تو را اندوهگین کند",
    persianCognateHint: "هم‌خانواده با «حُزن» و «محزون» در فارسی",
    falseFriendTrapFa: null,
    deepTipFa: null,
    audioWbwUrl: "",
    segments: [
      { text: "يَحْزُن", type: "root", meaningFa: "اندوهگین کند", connectsLeft: true },
      { text: "كَ", type: "pronoun", meaningFa: "تو را", connectsLeft: false },
    ],
  },
  {
    id: "cat_w_4",
    arabicUthmani: "فَسَيَكْفِيكَهُمُ",
    category: "frequent",
    rootLetters: "ك ف ي",
    meaningFa: "پس به‌زودی تو را از آنان کفایت می‌کند",
    persianCognateHint: "هم‌خانواده با «کافی» و «کفایت»",
    falseFriendTrapFa: null,
    deepTipFa: "ترکیب دو پیشوند (فَ + سَ)، ریشه (يَكْفِي) و دو ضمیر (كَ + هُمُ).",
    audioWbwUrl: "",
    segments: [
      { text: "فَ", type: "prefix", meaningFa: "پس", connectsLeft: true },
      { text: "سَ", type: "prefix", meaningFa: "به‌زودی", connectsLeft: true },
      { text: "يَكْفِي", type: "root", meaningFa: "کفایت می‌کند", connectsLeft: true },
      { text: "كَ", type: "pronoun", meaningFa: "تو را", connectsLeft: true },
      { text: "هُمُ", type: "pronoun", meaningFa: "آنان", connectsLeft: false },
    ],
  },
  {
    id: "cat_w_5",
    arabicUthmani: "أَنزَلْنَا",
    category: "frequent",
    rootLetters: "ن ز ل",
    meaningFa: "فرود آوردیم (نازل کردیم)",
    persianCognateHint: "هم‌خانواده با «نزول» و «منزل»",
    falseFriendTrapFa: null,
    deepTipFa: null,
    audioWbwUrl: "",
    segments: [
      { text: "أَنزَلْ", type: "root", meaningFa: "فرود آوردیم", connectsLeft: true },
      { text: "نَا", type: "pronoun", meaningFa: "ما", connectsLeft: false },
    ],
  },
  {
    id: "cat_w_6",
    arabicUthmani: "يَظْلِمُونَ",
    category: "frequent",
    rootLetters: "ظ ل م",
    meaningFa: "ستم می‌کنند",
    persianCognateHint: "هم‌خانواده با «ظلم» و «مظلوم»",
    falseFriendTrapFa: null,
    deepTipFa: null,
    audioWbwUrl: "",
    segments: [
      { text: "يَظْلِمُ", type: "root", meaningFa: "ستم می‌کند", connectsLeft: true },
      { text: "ونَ", type: "pronoun", meaningFa: "آنان", connectsLeft: false },
    ],
  },
  {
    id: "cat_w_7",
    arabicUthmani: "الْعَصْرِ",
    category: "false_friend",
    rootLetters: "ع ص ر",
    meaningFa: "دوران، زمانه (یا فشردن)",
    persianCognateHint: null,
    falseFriendTrapFa: "ساعات بعد از ظهر (معنای رایج در فارسی امروز)",
    deepTipFa: "در قرآن «والعصر» سوگند به کل تاریخ و زمانه انسان است، نه صرفاً ساعت عصر.",
    audioWbwUrl: "",
    segments: [{ text: "الْعَصْرِ", type: "root", meaningFa: "زمانه", connectsLeft: false }],
  },
  {
    id: "cat_w_8",
    arabicUthmani: "صَوَامِعُ",
    category: "false_friend",
    rootLetters: "ص م ع",
    meaningFa: "دیرها و عبادتگاه‌های راهبان",
    persianCognateHint: null,
    falseFriendTrapFa: "کارخانه‌های صنعتی (اشتباه لفظی با صنايع)",
    deepTipFa: "صوامع جمع صومعه است که در زبان فارسی هم به معنای عبادتگاه عارفان به کار می‌رود.",
    audioWbwUrl: "",
    segments: [{ text: "صَوَامِعُ", type: "root", meaningFa: "عبادتگاه‌ها", connectsLeft: false }],
  },
  {
    id: "cat_w_9",
    arabicUthmani: "بَعَثْنَا",
    category: "false_friend",
    rootLetters: "ب ع ث",
    meaningFa: "برانگیختیم (فرستادیم)",
    persianCognateHint: "هم‌خانواده با «بعثت» و «مبعوث»",
    falseFriendTrapFa: "علت و سبب شدیم (اشتباه با کلمه «باعث» در مکالمه روزمره)",
    deepTipFa: null,
    audioWbwUrl: "",
    segments: [
      { text: "بَعَثْ", type: "root", meaningFa: "برانگیختیم", connectsLeft: true },
      { text: "نَا", type: "pronoun", meaningFa: "ما", connectsLeft: false },
    ],
  },
  {
    id: "cat_w_10",
    arabicUthmani: "أُمَّةٌ",
    category: "false_friend",
    rootLetters: "أ م م",
    meaningFa: "جامعه هدفمند، گروه پیرو یک راه (و گاه به معنای زمان/پیشوا)",
    persianCognateHint: null,
    falseFriendTrapFa: "صرفاً جمعیت زیاد بدون هدف مشترک",
    deepTipFa: null,
    audioWbwUrl: "",
    segments: [{ text: "أُمَّةٌ", type: "root", meaningFa: "جامعه هدفمند", connectsLeft: false }],
  },
  {
    id: "cat_w_11",
    arabicUthmani: "فِتْنَةٌ",
    category: "false_friend",
    rootLetters: "ف ت ن",
    meaningFa: "آزمایش و ابتلای الهی (مانند گداختن طلا در آتش برای خالص‌سازی)",
    persianCognateHint: null,
    falseFriendTrapFa: "صرفاً آشوبگری و توطئه سیاسی",
    deepTipFa: "ریشه فتنه از قرار دادن طلا در کوره برای سنجش عیار آن گرفته شده است.",
    audioWbwUrl: "",
    segments: [{ text: "فِتْنَةٌ", type: "root", meaningFa: "آزمایش و سنجش عیار", connectsLeft: false }],
  },
  {
    id: "cat_w_12",
    arabicUthmani: "شَهِيدٌ",
    category: "false_friend",
    rootLetters: "ش ه د",
    meaningFa: "گواه، ناظر و حاضر (در بسیاری از آیات قرآن)",
    persianCognateHint: "هم‌خانواده با «شاهد» و «مشاهده»",
    falseFriendTrapFa: "صرفاً فرد کشته‌شده در میدان نبرد (در تمام آیات)",
    deepTipFa: "در آیاتی مانند «وَاللهُ عَلى كُلِّ شَيْءٍ شَهِيدٌ»، شهید به معنای گواه و ناظر مطلق است.",
    audioWbwUrl: "",
    segments: [{ text: "شَهِيدٌ", type: "root", meaningFa: "گواه و ناظر", connectsLeft: false }],
  },
];

const DISTRACTOR_MEANINGS: string[] = [
  "آمرزنده گناهان",
  "پاداش بزرگ و جاودان",
  "فرمانروای روز جزا",
  "پرهیزگاران و نیکوکاران",
  "آفریننده آسمان‌ها",
  "هدایت‌کننده به راه راست",
];

export const AdaptivePlacementModal: React.FC<AdaptivePlacementModalProps> = ({
  isOpen,
  onClose,
  onPlacementComplete,
}) => {
  const { initApp, setAqeeqMood } = useAppStore();

  const [stage, setStage] = useState<PlacementStage>("WELCOME_SELECT");
  const [wordPool, setWordPool] = useState<WordMorphology[]>([]);
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [thetaAbility, setThetaAbility] = useState<number>(1.2); // دامنه 1.0 تا 3.0
  const [usedWordIds, setUsedWordIds] = useState<Set<string>>(new Set());

  const [currentQuestion, setCurrentQuestion] = useState<AdaptiveQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [hitTrap, setHitTrap] = useState<boolean>(false);
  const [localMood, setLocalMood] = useState<AqeeqMood>("idle");

  // آمار پاسخ‌های آزمون
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [fastBonusCount, setFastBonusCount] = useState<number>(0);
  const [gradedHistory, setGradedHistory] = useState<
    Array<{ wordId: string; rating: FSRSRating; layer: 1 | 2 | 3 }>
  >([]);
  const [unlockedSummary, setUnlockedSummary] = useState<{
    levelTitle: string;
    unlockedCitiesCount: number;
    rewardGems: number;
    rewardNoor: number;
  } | null>(null);

  const questionStartRef = useRef<number>(performance.now());

  // بارگذاری بانک کلمات از Dexie + ترکیب با بانک پشتیبان برای تضمین ۱۲ سوال متنوع
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;

    async function loadPool() {
      const dbWords = await db.words.toArray();
      const mergedMap = new Map<string, WordMorphology>();
      dbWords.forEach((w) => mergedMap.set(w.id, w));
      FALLBACK_WORDS.forEach((w) => {
        if (!mergedMap.has(w.id)) mergedMap.set(w.id, w);
      });
      if (mounted) {
        setWordPool(Array.from(mergedMap.values()));
      }
    }

    loadPool();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // تولید سوال بعدی بر اساس تراز توانایی فعلی کاربر (Theta)
  const buildNextQuestion = (targetTheta: number, alreadyUsed: Set<string>): AdaptiveQuestion | null => {
    if (wordPool.length === 0) return null;

    const targetCategory: WordCategory =
      targetTheta < 1.65 ? "cognate" : targetTheta < 2.35 ? "frequent" : "false_friend";

    const targetLayer: 1 | 2 | 3 =
      targetCategory === "cognate" ? 1 : targetCategory === "frequent" ? 2 : 3;

    // فیلتر کلمات استفاده‌نشده در لایه هدف، یا در کل بانک در صورت اتمام لایه
    let candidates = wordPool.filter(
      (w) => w.category === targetCategory && !alreadyUsed.has(w.id)
    );
    if (candidates.length === 0) {
      candidates = wordPool.filter((w) => !alreadyUsed.has(w.id));
    }
    if (candidates.length === 0) {
      candidates = wordPool;
    }

    const chosenWord = candidates[Math.floor(Math.random() * candidates.length)];
    const trapOption = chosenWord.falseFriendTrapFa;

    // ساخت گزینه‌های انحرافی
    const otherMeanings = wordPool
      .filter((w) => w.id !== chosenWord.id && w.meaningFa !== chosenWord.meaningFa)
      .map((w) => w.meaningFa);

    const distractorPool = Array.from(new Set([...otherMeanings, ...DISTRACTOR_MEANINGS]));
    const pickedDistractors: string[] = [];

    if (trapOption) {
      pickedDistractors.push(trapOption);
    }

    for (const d of distractorPool) {
      if (pickedDistractors.length >= 3) break;
      if (d !== chosenWord.meaningFa && !pickedDistractors.includes(d)) {
        pickedDistractors.push(d);
      }
    }

    const allOptions = [chosenWord.meaningFa, ...pickedDistractors.slice(0, 3)].sort(
      () => Math.random() - 0.5
    );

    const promptFa =
      targetLayer === 3
        ? `مراقب کلمات فریبنده باش! معنای دقیق قرآنی «${chosenWord.arabicUthmani}» کدام است؟`
        : targetLayer === 2
        ? `معنای ساختار قرآنی «${chosenWord.arabicUthmani}» چیست؟`
        : `کلمه هم‌ریشه «${chosenWord.arabicUthmani}» در قرآن به چه معناست؟`;

    return {
      word: chosenWord,
      layer: targetLayer,
      promptFa,
      options: allOptions,
      correctOption: chosenWord.meaningFa,
      trapOption: trapOption || null,
    };
  };

  // شروع آزمون ۱۲ سوالی
  const startAdaptiveQuiz = (initialTheta: number) => {
    const emptySet = new Set<string>();
    const firstQ = buildNextQuestion(initialTheta, emptySet);
    if (!firstQ) return;

    emptySet.add(firstQ.word.id);
    setUsedWordIds(emptySet);
    setThetaAbility(initialTheta);
    setQuestionIndex(0);
    setCorrectCount(0);
    setFastBonusCount(0);
    setGradedHistory([]);
    setCurrentQuestion(firstQ);
    setSelectedOption(null);
    setIsSubmitted(false);
    setHitTrap(false);
    setLocalMood("idle");
    questionStartRef.current = performance.now();
    setStage("ADAPTIVE_QUIZ");
  };

  // انتخاب مستقیم مسیر بدون آزمون (شروع از صفر یا آشنا با معانی پایه)
  const handleDirectPathSelect = async (presetLevel: "BEGINNER" | "ELEMENTARY") => {
    const allCities = await db.cities.orderBy("order").toArray();
    const allLessons = await db.lessons.orderBy("order").toArray();
    const stats = await db.userStats.get("singleton_user");

    if (!stats) return;

    if (presetLevel === "BEGINNER") {
      const firstCityId = allCities[0]?.id ?? "qom_jamkaran";
      const firstLessonId = allLessons[0]?.id ?? "lesson_qom_1";

      await db.userStats.update("singleton_user", {
        unlockedCityIds: [firstCityId],
        currentCityId: firstCityId,
        currentLessonId: firstLessonId,
        aqeeqGems: stats.aqeeqGems + 20,
      });

      setUnlockedSummary({
        levelTitle: "سطح ۱: نوآموز سفر نور (شروع از قم و جمکران)",
        unlockedCitiesCount: 1,
        rewardGems: 20,
        rewardNoor: 0,
      });
    } else {
      // سطح آشنا با معانی پایه: باز کردن ۲ شهر اول (در صورت وجود در دیتابیس)
      const unlockedCities = allCities.slice(0, Math.min(2, allCities.length)).map((c) => c.id);
      if (unlockedCities.length === 0) unlockedCities.push("qom_jamkaran");

      const targetCityId = unlockedCities[unlockedCities.length - 1];
      const cityLessons = allLessons.filter((l) => l.cityId === targetCityId);
      const targetLessonId = cityLessons[0]?.id ?? allLessons[0]?.id ?? "lesson_qom_1";

      await db.userStats.update("singleton_user", {
        unlockedCityIds: unlockedCities,
        currentCityId: targetCityId,
        currentLessonId: targetLessonId,
        aqeeqGems: stats.aqeeqGems + 35,
        noorXp: stats.noorXp + 25,
      });

      setUnlockedSummary({
        levelTitle: "سطح ۲: آشنا با واژگان هم‌ریشه و پایه",
        unlockedCitiesCount: unlockedCities.length,
        rewardGems: 35,
        rewardNoor: 25,
      });
    }

    localStorage.setItem("quran_journey_placement_done_v1", "true");
    await initApp();
    setStage("RESULT_SUMMARY");
  };

  // بررسی پاسخ سوال فعلی در موتور CAT
  const handleCheckAdaptiveAnswer = () => {
    if (!currentQuestion || !selectedOption || isSubmitted) return;

    const elapsedMs = performance.now() - questionStartRef.current;
    const isCorrect = selectedOption === currentQuestion.correctOption;
    const isTrap =
      !isCorrect &&
      currentQuestion.trapOption !== null &&
      selectedOption === currentQuestion.trapOption;

    setIsSubmitted(true);
    setHitTrap(isTrap);

    let assignedRating: FSRSRating = 1;
    let nextTheta = thetaAbility;

    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
      if (elapsedMs < 4000) {
        assignedRating = 4; // Easy
        nextTheta = Math.min(3.0, thetaAbility + 0.45);
        setFastBonusCount((prev) => prev + 1);
      } else if (elapsedMs <= 9000) {
        assignedRating = 3; // Good
        nextTheta = Math.min(3.0, thetaAbility + 0.22);
      } else {
        assignedRating = 2; // Hard
        nextTheta = Math.min(3.0, thetaAbility + 0.05);
      }
      setLocalMood("happy");
      setAqeeqMood("happy");
    } else {
      assignedRating = 1; // Again
      nextTheta = Math.max(1.0, thetaAbility - 0.4);
      setLocalMood(isTrap ? "warning" : "thinking");
      setAqeeqMood(isTrap ? "warning" : "thinking");
    }

    setThetaAbility(nextTheta);
    setGradedHistory((prev) => [
      ...prev,
      {
        wordId: currentQuestion.word.id,
        rating: assignedRating,
        layer: currentQuestion.layer,
      },
    ]);
  };

  // رفتن به سوال بعدی یا پایان آزمون ۱۲ سوالی و ثبت در دیتابیس
  const handleNextOrFinishCat = async () => {
    if (questionIndex + 1 < TOTAL_CAT_QUESTIONS) {
      const nextQ = buildNextQuestion(thetaAbility, usedWordIds);
      if (nextQ) {
        const updatedSet = new Set(usedWordIds);
        updatedSet.add(nextQ.word.id);
        setUsedWordIds(updatedSet);
        setCurrentQuestion(nextQ);
        setQuestionIndex((prev) => prev + 1);
        setSelectedOption(null);
        setIsSubmitted(false);
        setHitTrap(false);
        setLocalMood("idle");
        questionStartRef.current = performance.now();
        return;
      }
    }

    // پایان ۱۲ سوال: محاسبه سطح نهایی و بروزرسانی Dexie IndexedDB
    const accuracyRatio = correctCount / TOTAL_CAT_QUESTIONS;
    const normalizedScore = Math.min(
      100,
      Math.round(accuracyRatio * 75 + ((thetaAbility - 1) / 2) * 25)
    );

    const allCities = await db.cities.orderBy("order").toArray();
    const allLessons = await db.lessons.orderBy("order").toArray();
    const stats = await db.userStats.get("singleton_user");

    let targetCityCount = 1;
    let levelTitle = "سطح ۱: آغازگر تدبر (ایستگاه قم و جمکران)";
    let rewardGems = 30;
    let rewardNoor = 25;

    if (normalizedScore >= 85) {
      targetCityCount = Math.max(1, Math.min(4, allCities.length));
      levelTitle = "سطح ۴: پیشتاز تدبر و شکارچی کلمات فریبنده";
      rewardGems = 100;
      rewardNoor = 80;
    } else if (normalizedScore >= 65) {
      targetCityCount = Math.max(1, Math.min(3, allCities.length));
      levelTitle = "سطح ۳: مسلط بر ساختار و واژگان پرتکرار قرآن";
      rewardGems = 70;
      rewardNoor = 55;
    } else if (normalizedScore >= 38) {
      targetCityCount = Math.max(1, Math.min(2, allCities.length));
      levelTitle = "سطح ۲: آشنا با هم‌ریشه‌ها و معانی پایه";
      rewardGems = 45;
      rewardNoor = 35;
    }

    const unlockedCities =
      allCities.length > 0
        ? allCities.slice(0, targetCityCount).map((c) => c.id)
        : ["qom_jamkaran"];

    const activeCityId = unlockedCities[unlockedCities.length - 1];
    const priorCities = unlockedCities.slice(0, -1);

    // دروسی که در شهرهای قبلی قرار دارند به عنوان تکمیل‌شده علامت‌گذاری می‌شوند
    const autoCompletedLessonIds = allLessons
      .filter((l) => priorCities.includes(l.cityId))
      .map((l) => l.id);

    const activeCityLessons = allLessons.filter((l) => l.cityId === activeCityId);
    const nextActiveLessonId =
      activeCityLessons[0]?.id ?? allLessons[0]?.id ?? "lesson_qom_1";

    // ثبت وضعیت اولیه کارت‌های FSRS برای کلمات پاسخ‌داده‌شده در آزمون
    const nowIso = new Date().toISOString();
    const fsrsEntries: FSRSCardState[] = gradedHistory
      .filter((h) => !h.wordId.startsWith("cat_w_")) // فقط کلمات واقعی موجود در دیتابیس
      .map((h) => {
        const scheduledDays = h.rating === 4 ? 7 : h.rating === 3 ? 3 : h.rating === 2 ? 1 : 0;
        const dueDate = new Date(Date.now() + scheduledDays * 86400000).toISOString();
        return {
          wordId: h.wordId,
          due: dueDate,
          stability: scheduledDays || 0.5,
          difficulty: h.rating === 4 ? 3 : h.rating === 3 ? 5 : 7,
          elapsedDays: 0,
          scheduledDays,
          reps: 1,
          lapses: h.rating === 1 ? 1 : 0,
          state: (h.rating >= 3 ? 2 : 1) as 0 | 1 | 2 | 3,
          lastReview: nowIso,
        };
      });

    if (fsrsEntries.length > 0) {
      await db.fsrsCards.bulkPut(fsrsEntries);
    }

    if (stats) {
      const mergedUnlocked = Array.from(new Set([...stats.unlockedCityIds, ...unlockedCities]));
      const mergedCompleted = Array.from(
        new Set([...stats.completedLessonIds, ...autoCompletedLessonIds])
      );

      await db.userStats.update("singleton_user", {
        unlockedCityIds: mergedUnlocked,
        completedLessonIds: mergedCompleted,
        currentCityId: activeCityId,
        currentLessonId: nextActiveLessonId,
        aqeeqGems: stats.aqeeqGems + rewardGems,
        noorXp: stats.noorXp + rewardNoor,
      });
    }

    localStorage.setItem("quran_journey_placement_done_v1", "true");
    await initApp();

    setUnlockedSummary({
      levelTitle,
      unlockedCitiesCount: unlockedCities.length,
      rewardGems,
      rewardNoor,
    });
    setStage("RESULT_SUMMARY");
  };

  // نشانگر بصری نگین عقیق هوشمند داخل مودال
  const aqeeqStatusBadge = useMemo(() => {
    const moodConfig: Record<
      AqeeqMood,
      { label: string; ringClass: string; gemBg: string }
    > = {
      idle: {
        label: "نگین عقیق آماده سنجش شماست",
        ringClass: "ring-brand-primary/30",
        gemBg: "from-brand-primary to-brand-primaryDark",
      },
      thinking: {
        label: "اشکالی ندارد! سوال بعدی را متناسب با سطح شما تنظیم می‌کنم",
        ringClass: "ring-sky-400/40",
        gemBg: "from-sky-500 to-sky-700",
      },
      happy: {
        label: "طیب‌الله انفاسکم! سطح سوال بعدی بالاتر رفت",
        ringClass: "ring-brand-success/40",
        gemBg: "from-brand-success to-brand-successDark",
      },
      warning: {
        label: "تله کلمات فریبنده! معنای قرآنی با فارسی روزمره تفاوت دارد",
        ringClass: "ring-brand-amber/50",
        gemBg: "from-brand-amber to-brand-amberDark",
      },
      deep_tip: {
        label: "نکته عمیق‌تر واژگانی",
        ringClass: "ring-brand-amber/40",
        gemBg: "from-brand-amber to-brand-amberDark",
      },
    };
    return moodConfig[localMood];
  }, [localMood]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-termeh-bg dark:bg-lapis-bg border-2 border-termeh-border dark:border-lapis-border shadow-2xl overflow-hidden my-auto">
        {/* نوار بالای مودال */}
        <div className="bg-gradient-to-l from-brand-primary to-brand-primaryDark px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${aqeeqStatusBadge.gemBg} ring-4 ${aqeeqStatusBadge.ringClass} flex items-center justify-center shadow-inner transition-all duration-300`}
            >
              <span className="text-lg">💎</span>
            </div>
            <div>
              <h2 className="font-extrabold text-base md:text-lg">
                قطب‌نمای هوشمند سفر نور
              </h2>
              <p className="text-xs text-white/85">{aqeeqStatusBadge.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-sm font-bold px-2.5 py-1 rounded-xl bg-white/10"
            aria-label="بستن"
          >
            ✕
          </button>
        </div>

        {/* بدنه مرحله ۱: خوش‌آمدگویی و انتخاب یکی از ۳ مسیر */}
        {stage === "WELCOME_SELECT" && (
          <div className="p-6 space-y-5">
            <div className="text-center space-y-2">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20">
                تعیین سطح تطبیقی دو مرحله‌ای
              </span>
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">
                سفر فهم قرآن را از کجا آغاز کنیم؟
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                بیش از ۵۰٪ واژگان قرآن کریم در زبان فارسی روزمره ما حضور دارند. مسیر مناسب خود را انتخاب کنید:
              </p>
            </div>

            <div className="space-y-3.5">
              {/* گزینه ۱: شروع از صفر */}
              <button
                onClick={() => handleDirectPathSelect("BEGINNER")}
                className="btn-3d-neutral w-full text-right flex items-center justify-between p-4"
              >
                <div className="space-y-1 pl-3">
                  <div className="font-extrabold text-slate-800 dark:text-white text-base">
                    🌱 شروع از صفر (مناسب نوجوانان و نوآموزان)
                  </div>
                  <p className="text-xs font-normal text-slate-500 dark:text-slate-300">
                    شروع گام‌به‌گام از ایستگاه اول (قم و جمکران) با کلمات هم‌ریشه فارسی بدون نیاز به آزمون
                  </p>
                </div>
                <span className="text-brand-primary font-black text-lg">←</span>
              </button>

              {/* گزینه ۲: آشنا با معانی پایه */}
              <button
                onClick={() => handleDirectPathSelect("ELEMENTARY")}
                className="btn-3d-neutral w-full text-right flex items-center justify-between p-4"
              >
                <div className="space-y-1 pl-3">
                  <div className="font-extrabold text-slate-800 dark:text-white text-base">
                    🌿 آشنا با معانی پایه قرآن
                  </div>
                  <p className="text-xs font-normal text-slate-500 dark:text-slate-300">
                    کلمات ساده را می‌شناسم؛ بازگشایی ایستگاه‌های آغازین و تمرکز بر ساختار آیات
                  </p>
                </div>
                <span className="text-brand-primary font-black text-lg">←</span>
              </button>

              {/* گزینه ۳: تعیین سطح هوشمند ۱۲ سوالی CAT */}
              <button
                onClick={() => startAdaptiveQuiz(1.4)}
                className="btn-3d-primary w-full text-right flex items-center justify-between p-4"
              >
                <div className="space-y-1 pl-3">
                  <div className="font-extrabold text-white text-base flex items-center gap-2">
                    <span>✨ تعیین سطح هوشمند (آزمون تطبیقی ۱۲ سوالی)</span>
                  </div>
                  <p className="text-xs font-normal text-white/90">
                    سنجش هوشمند سرعت و دقت شما در ۳ لایه (هم‌ریشه، پرتکرار و کلمات فریبنده) + باز کردن خودکار شهرها
                  </p>
                </div>
                <span className="text-white font-black text-lg">←</span>
              </button>
            </div>
          </div>
        )}

        {/* بدنه مرحله ۲: آزمون ۱۲ سوالی تطبیقی CAT */}
        {stage === "ADAPTIVE_QUIZ" && currentQuestion && (
          <div className="p-6 space-y-5">
            {/* نوار پیشرفت و نشانگر لایه سختی سوال */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-500 dark:text-slate-400">
                  سوال {questionIndex + 1} از {TOTAL_CAT_QUESTIONS}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full ${
                    currentQuestion.layer === 1
                      ? "bg-morph-prefixBg text-morph-prefix"
                      : currentQuestion.layer === 2
                      ? "bg-morph-rootBg text-morph-root"
                      : "bg-morph-pronounBg text-morph-pronoun"
                  }`}
                >
                  {currentQuestion.layer === 1 && "لایه ۱: هم‌ریشه فارسی"}
                  {currentQuestion.layer === 2 && "لایه ۲: واژگان و ترکیب پرتکرار"}
                  {currentQuestion.layer === 3 && "لایه ۳: شکار کلمات فریبنده"}
                </span>
              </div>
              <div className="w-full h-3 bg-termeh-border dark:bg-lapis-card rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-primary transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.round(((questionIndex + 1) / TOTAL_CAT_QUESTIONS) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* کارت نمایش کلمه قرآنی با رسم‌الخط عثمان طه و تفکیک رنگی */}
            <div className="rounded-2xl bg-termeh-card dark:bg-lapis-card border-2 border-termeh-border dark:border-lapis-border p-5 text-center space-y-3">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {currentQuestion.promptFa}
              </p>
              <div className="quran-text text-3xl md:text-4xl text-slate-900 dark:text-white py-2">
                {currentQuestion.word.arabicUthmani}
              </div>
              {currentQuestion.word.rootLetters && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-morph-rootBg text-morph-root text-xs font-bold">
                  <span>ریشه:</span>
                  <span className="quran-text text-sm">{currentQuestion.word.rootLetters}</span>
                </div>
              )}
            </div>

            {/* گزینه‌ها */}
            <div className="grid grid-cols-1 gap-2.5">
              {currentQuestion.options.map((optionText, idx) => {
                const isSelected = selectedOption === optionText;
                const isCorrectOption = optionText === currentQuestion.correctOption;

                let btnStyle = "btn-3d-neutral";
                if (isSubmitted) {
                  if (isCorrectOption) {
                    btnStyle = "btn-3d-success";
                  } else if (isSelected && hitTrap) {
                    btnStyle = "btn-3d-amber";
                  } else if (isSelected && !isCorrectOption) {
                    btnStyle = "btn-3d-ruby";
                  }
                } else if (isSelected) {
                  btnStyle = "btn-3d-primary";
                }

                return (
                  <button
                    key={idx}
                    disabled={isSubmitted}
                    onClick={() => setSelectedOption(optionText)}
                    className={`${btnStyle} w-full text-right justify-between py-3 px-4 text-sm`}
                  >
                    <span>{optionText}</span>
                    {isSubmitted && isCorrectOption && <span>✓</span>}
                    {isSubmitted && isSelected && !isCorrectOption && (
                      <span>{hitTrap ? "⚠️ تله لفظی" : "✕"}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* بازخورد پاسخ یا دکمه ثبت */}
            {isSubmitted ? (
              <div className="space-y-3 pt-2">
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed border ${
                    selectedOption === currentQuestion.correctOption
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-brand-success text-emerald-900 dark:text-emerald-200"
                      : hitTrap
                      ? "bg-amber-50 dark:bg-amber-950/40 border-brand-amber text-amber-900 dark:text-amber-200"
                      : "bg-rose-50 dark:bg-rose-950/40 border-brand-ruby text-rose-900 dark:text-rose-200"
                  }`}
                >
                  <div className="font-extrabold mb-1">
                    {selectedOption === currentQuestion.correctOption
                      ? "احسنت! پاسخ شما کاملاً صحیح بود."
                      : hitTrap
                      ? "مراقب مشترک لفظی باشید!"
                      : `پاسخ صحیح: «${currentQuestion.correctOption}»`}
                  </div>
                  {currentQuestion.word.persianCognateHint && (
                    <p>{currentQuestion.word.persianCognateHint}</p>
                  )}
                  {currentQuestion.word.deepTipFa && (
                    <p className="mt-1 font-medium">{currentQuestion.word.deepTipFa}</p>
                  )}
                </div>

                <button
                  onClick={handleNextOrFinishCat}
                  className="btn-3d-primary w-full py-3.5 text-base"
                >
                  {questionIndex + 1 < TOTAL_CAT_QUESTIONS
                    ? "سوال بعدی ←"
                    : "مشاهده نتیجه تعیین سطح و بازگشایی شهرها"}
                </button>
              </div>
            ) : (
              <button
                disabled={!selectedOption}
                onClick={handleCheckAdaptiveAnswer}
                className={`w-full py-3.5 text-base ${
                  selectedOption
                    ? "btn-3d-primary"
                    : "btn-3d bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                }`}
              >
                ثبت و بررسی پاسخ
              </button>
            )}
          </div>
        )}

        {/* بدنه مرحله ۳: خلاصه نتیجه و شهرهای بازشده */}
        {stage === "RESULT_SUMMARY" && unlockedSummary && (
          <div className="p-6 text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-brand-amber to-brand-amberDark flex items-center justify-center text-4xl shadow-lg">
              🌟
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-extrabold text-brand-primary">
                تعیین سطح با موفقیت انجام شد
              </span>
              <h3 className="text-xl font-black text-slate-800 dark:text-white">
                {unlockedSummary.levelTitle}
              </h3>
              {correctCount > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  پاسخ صحیح: {correctCount} از {TOTAL_CAT_QUESTIONS} سوال | پاسخ‌های سریع:{" "}
                  {fastBonusCount} مورد
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border">
                <div className="text-lg font-black text-brand-primary">
                  {unlockedSummary.unlockedCitiesCount} ایستگاه
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  شهر بازشده در نقشه
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border">
                <div className="text-lg font-black text-brand-amber">
                  +{unlockedSummary.rewardGems} 💎
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  هدیه عقیق آغازین
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border">
                <div className="text-lg font-black text-brand-success">
                  +{unlockedSummary.rewardNoor} ✨
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  امتیاز نور
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                onPlacementComplete();
                onClose();
              }}
              className="btn-3d-success w-full py-3.5 text-base"
            >
              ورود به نقشه سفر و شروع یادگیری
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
