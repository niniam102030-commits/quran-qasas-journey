// src/services/devModeService.ts
// سرویس کمکی حالت توسعه‌دهنده برای کاشت دادهٔ تست، باز کردن مراحل و تست سریع قابلیت‌های برنامه
import { DEFAULT_USER_PROFILE, ldb } from "../db/learningDb";
import { formatSurahCardKey, getActiveSurahNumber } from "../config/surahConfig";
import { getLocalSaturdayWeekIso, type BlindSpotPack } from "../learning/blindSpots";
import { newCard, type StoredCard } from "../learning/cardScheduler";
import { STORY_CHAPTERS } from "../learning/chapters";
import type { ExamLogEntry } from "../learning/examEngine";
import { LESSONS_PER_STAGE } from "../learning/mastery";
import { getMeta, setMeta } from "./metaStore";
import { getLocalDateIso } from "./profileService";

const ALL_STAGES_PASSED: Record<number, boolean> = {
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
  6: true,
  7: true,
  8: true,
};

const ALL_STAGES_LESSONS: Record<number, number> = {
  1: LESSONS_PER_STAGE,
  2: LESSONS_PER_STAGE,
  3: LESSONS_PER_STAGE,
  4: LESSONS_PER_STAGE,
  5: LESSONS_PER_STAGE,
  6: LESSONS_PER_STAGE,
  7: LESSONS_PER_STAGE,
  8: LESSONS_PER_STAGE,
};

async function resolveOrderedUnitIdsForActiveSurah(activeSurah: number): Promise<string[]> {
  const allProgress = await ldb.unitProgress.toArray();
  const scoped = allProgress.filter((u) =>
    activeSurah === 28 ? !/^s\d+_/.test(u.unitId) : u.unitId.startsWith(`s${activeSurah}_`),
  );

  if (activeSurah !== 28) {
    const packMeta = await getMeta<{ units?: { id: string; order?: number }[] } | null>(
      `surahPackMeta:${activeSurah}`,
      null,
    );
    if (packMeta?.units?.length) {
      return packMeta.units
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((u) => u.id);
    }
  }

  return scoped.map((u) => u.unitId).sort();
}

/**
 * کاشت دادهٔ واقع‌گرایانه برای تست سریع:
 * - تکمیل آنبوردینگ و باز کردن همهٔ واحدها
 * - شارژ حداقل ۱۰۰۰ عقیق و ۲۵۰۰ نور و چلهٔ ۱۴روزه برای تست فروشگاه و سپر
 * - پاس کردن ۳ واحد اول با زمان‌بندی متنوع برای فعال‌شدن سبق، سبقی، منزل، فصل ۱ و باغ
 * - افزودن آیات طلایی، کارت‌های موعدگذشته، نقاط کور و لاگ نمونهٔ آزمون/تسمیع
 */
export async function seedDevTestData(now: Date = new Date()): Promise<{
  unlockedUnits: number;
  seededCards: number;
  gems: number;
}> {
  const nowMs = now.getTime();
  const activeSurah = getActiveSurahNumber();
  const orderedUnitIds = await resolveOrderedUnitIdsForActiveSurah(activeSurah);

  const [existingProfile, allUnits, sampleQs] = await Promise.all([
    ldb.profile.get("main"),
    ldb.unitProgress.toArray(),
    ldb.questions.limit(10).toArray(),
  ]);

  const baseProf = existingProfile ?? { ...DEFAULT_USER_PROFILE };
  const gems = Math.max(baseProf.aqeeqGems ?? 0, 1000);
  const nextProfile = {
    ...baseProf,
    aqeeqGems: gems,
    noorXp: Math.max(baseProf.noorXp ?? 0, 2500),
    chillehCurrentDays: Math.max(baseProf.chillehCurrentDays ?? 0, 14),
    chillehBestDays: Math.max(baseProf.chillehBestDays ?? 0, 14),
    chillehStage: (baseProf.chillehStage === 40 ? 40 : 14) as 7 | 14 | 40,
    lastActivityDate: getLocalDateIso(now),
    updatedAt: nowMs,
  };

  // ۳ واحد نخست با فاصلهٔ زمانی مختلف برای پوشش هم‌زمان سبق، سبقی و منزل
  const staggeredDaysAgo = [2, 15, 45];
  const unitMap = new Map(allUnits.map((u) => [u.unitId, u]));
  for (let i = 0; i < Math.min(3, orderedUnitIds.length); i++) {
    const uid = orderedUnitIds[i];
    const prev = unitMap.get(uid);
    unitMap.set(uid, {
      unitId: uid,
      unlocked: true,
      stagePassed: { ...ALL_STAGES_PASSED },
      stageLessons: { ...ALL_STAGES_LESSONS },
      currentStage: 8,
      mastered: true,
      updatedAt: nowMs - staggeredDaysAgo[i] * 86400_000,
    });
    void prev;
  }

  // اطمینان از بازبودن همهٔ واحدها بدون پاک‌کردن پیشرفت سایر واحدها
  const updatedUnits = [...unitMap.values()].map((u) => ({
    ...u,
    unlocked: true,
  }));

  // ساخت کارت‌های طلایی برای آیات ۱ تا ۵ + کارت‌های موعدگذشته برای بدهی مرور و فریز
  const futureDueIso = new Date(nowMs + 10 * 86400_000).toISOString();
  const pastDueIso = new Date(nowMs - 2 * 86400_000).toISOString();
  const cardsToSave: StoredCard[] = [];

  for (let v = 1; v <= 5; v++) {
    for (const kind of ["vr", "vt", "vn", "sq"] as const) {
      const key = formatSurahCardKey(kind, v, activeSurah);
      cardsToSave.push({
        ...newCard(key, now),
        state: 2,
        stability: 24,
        difficulty: 3.5,
        elapsedDays: 5,
        scheduledDays: 10,
        reps: 4,
        lapses: 0,
        due: futureDueIso,
        lastReview: new Date(nowMs - 5 * 86400_000).toISOString(),
      });
    }
  }

  for (let v = 6; v <= 8; v++) {
    for (const kind of ["vr", "vt", "vn", "sq"] as const) {
      const key = formatSurahCardKey(kind, v, activeSurah);
      cardsToSave.push({
        ...newCard(key, now),
        state: 2,
        stability: 3,
        difficulty: 6,
        elapsedDays: 5,
        scheduledDays: 3,
        reps: 2,
        lapses: 1,
        due: pastDueIso,
        lastReview: new Date(nowMs - 5 * 86400_000).toISOString(),
      });
    }
  }

  await ldb.transaction(
    "rw",
    [ldb.profile, ldb.unitProgress, ldb.cards, ldb.confusions, ldb.meta],
    async () => {
      await ldb.profile.put(nextProfile);
      if (updatedUnits.length > 0) {
        await ldb.unitProgress.bulkPut(updatedUnits);
      }
      if (cardsToSave.length > 0) {
        await ldb.cards.bulkPut(cardsToSave);
      }

      if (sampleQs.length > 0) {
        const existingConfusions = await ldb.confusions.count();
        if (existingConfusions === 0) {
          const tags = ["false_friend", "neighbor_verse", "similar_verse", "same_root"];
          await ldb.confusions.bulkAdd(
            sampleQs.slice(0, 6).map((q, idx) => ({
              qid: q.id,
              target: q.targets?.[0] ?? formatSurahCardKey("vr", idx + 1, activeSurah),
              chosenTag: tags[idx % tags.length],
              at: nowMs - idx * 3600_000,
            })),
          );
        }

        const blindPack: BlindSpotPack = {
          weekIso: getLocalSaturdayWeekIso(now),
          questionIds: sampleQs.map((q) => q.id),
          topTargets: [...new Set(sampleQs.slice(0, 4).map((q) => q.targets?.[0]).filter(Boolean) as string[])],
        };
        await ldb.meta.put({ key: "blindSpotPack", value: blindPack });
      }
    },
  );

  await setMeta("onboardingDone", true);

  const prevTasmi = await getMeta<{ at: number; dateIso: string; unitId: string; total: number; slipped: number }[]>(
    "tasmiiLog",
    [],
  );
  if (prevTasmi.length === 0 && orderedUnitIds[0]) {
    await setMeta("tasmiiLog", [
      {
        at: nowMs - 86400_000,
        dateIso: getLocalDateIso(new Date(nowMs - 86400_000)),
        unitId: orderedUnitIds[0],
        total: 5,
        slipped: 1,
      },
    ]);
  }

  const prevExam = await getMeta<ExamLogEntry[]>("examLog", []);
  if (prevExam.length === 0 && orderedUnitIds[0]) {
    await setMeta("examLog", [
      {
        id: `dev-exam-${nowMs}`,
        at: nowMs - 7200_000,
        scope: { type: "unit", id: orderedUnitIds[0], labelFa: "واحد ۱ (نمونه تست)" },
        total: 20,
        correct: 17,
        score: 84,
        level: "قبول",
        elapsedSec: 185,
        byType: {
          conj: { asked: 2, wrong: 0 },
          irab_waqf: { asked: 4, wrong: 1 },
          mutashabih: { asked: 4, wrong: 1 },
          connection: { asked: 4, wrong: 0 },
          lafz_mana: { asked: 6, wrong: 1 },
        },
      },
    ]);
  }

  return {
    unlockedUnits: updatedUnits.length,
    seededCards: cardsToSave.length,
    gems,
  };
}

/** پاس‌کردن یکجای همهٔ واحدها، مراحل ۱ تا ۸، مدال‌های فصل‌ها و شارژ عقیق */
export async function markAllStagesPassed(now: Date = new Date()): Promise<{ updatedUnits: number }> {
  const nowMs = now.getTime();
  const [existingProfile, allUnits] = await Promise.all([
    ldb.profile.get("main"),
    ldb.unitProgress.toArray(),
  ]);

  const baseProf = existingProfile ?? { ...DEFAULT_USER_PROFILE };
  const nextProfile = {
    ...baseProf,
    aqeeqGems: Math.max(baseProf.aqeeqGems ?? 0, 1000),
    noorXp: Math.max(baseProf.noorXp ?? 0, 5000),
    chillehCurrentDays: Math.max(baseProf.chillehCurrentDays ?? 0, 14),
    chillehBestDays: Math.max(baseProf.chillehBestDays ?? 0, 14),
    chillehStage: (baseProf.chillehStage === 40 ? 40 : 14) as 7 | 14 | 40,
    lastActivityDate: getLocalDateIso(now),
    updatedAt: nowMs,
  };

  const nextUnits = allUnits.map((u, idx) => ({
    ...u,
    unlocked: true,
    stagePassed: { ...ALL_STAGES_PASSED },
    stageLessons: { ...ALL_STAGES_LESSONS },
    currentStage: 8,
    mastered: true,
    updatedAt: nowMs - idx * 86400_000,
  }));

  await ldb.transaction("rw", [ldb.profile, ldb.unitProgress], async () => {
    await ldb.profile.put(nextProfile);
    if (nextUnits.length > 0) {
      await ldb.unitProgress.bulkPut(nextUnits);
    }
  });

  await Promise.all([
    setMeta("onboardingDone", true),
    setMeta("chapterMedals", STORY_CHAPTERS.map((c) => c.id)),
  ]);

  return { updatedUnits: nextUnits.length };
}

/** فعال‌کردن مجدد ویزارد آنبوردینگ در مراجعت بعدی */
export async function resetOnboardingForDev(): Promise<void> {
  await setMeta("onboardingDone", false);
}
