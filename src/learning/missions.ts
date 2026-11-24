// src/learning/missions.ts
// منطق خالص مأموریت‌های روزانه (G3) — ۳ مأموریت قطعی بر اساس تاریخ + محاسبه پیشرفت از داده‌های روز
import { rng, shuffle } from "./sessionPlanner";

export type MissionKind =
  | "REVIEW_N"
  | "LESSON_ONE"
  | "TASMI_ONE"
  | "PRECISION_N"
  | "TESTOUT_TRY"
  | "CYCLE_ONE";

export interface DailyMission {
  kind: MissionKind;
  titleFa: string;
  target: number;
  rewardGems: number;
}

export interface MissionFacts {
  reviewAnswers: number;
  lessonsCompleted: number;
  tasmiCount: number;
  precisionCorrect: number;
  testOutAttempts: number;
  cycleSessions: number;
}

function hashDateIso(dateIso: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateIso.length; i++) {
    h ^= dateIso.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

/**
 * انتخاب قطعی ۳ مأموریت متمایز برای یک تاریخ مشخص (YYYY-MM-DD).
 * CYCLE_ONE تنها زمانی در استخر قرار می‌گیرد که کاربر حداقل یک واحد پاس‌شده داشته باشد.
 */
export function missionsForDate(dateIso: string, hasPassedUnit = false): DailyMission[] {
  const seed = hashDateIso(dateIso);
  const rand = rng(seed);
  const reviewTarget = rand() < 0.5 ? 10 : 15;

  const pool: DailyMission[] = [
    {
      kind: "REVIEW_N",
      titleFa: `مرور ${toFarsi(reviewTarget)} کارت امروز`,
      target: reviewTarget,
      rewardGems: 3,
    },
    {
      kind: "LESSON_ONE",
      titleFa: "تکمیل یک درس کامل",
      target: 1,
      rewardGems: 3,
    },
    {
      kind: "TASMI_ONE",
      titleFa: "ثبت یک تسمیع از حفظ",
      target: 1,
      rewardGems: 4,
    },
    {
      kind: "PRECISION_N",
      titleFa: `${toFarsi(10)} پاسخ درست در مراحل ۴ تا ۸`,
      target: 10,
      rewardGems: 3,
    },
    {
      kind: "TESTOUT_TRY",
      titleFa: "شرکت در یک آزمون میانبر",
      target: 1,
      rewardGems: 2,
    },
  ];

  if (hasPassedUnit) {
    pool.push({
      kind: "CYCLE_ONE",
      titleFa: "یک جلسه مرور سبقی یا منزل",
      target: 1,
      rewardGems: 3,
    });
  }

  return shuffle(pool, rand).slice(0, 3);
}

export function missionProgress(
  missions: DailyMission[],
  facts: MissionFacts,
): { mission: DailyMission; done: number; complete: boolean }[] {
  return missions.map((mission) => {
    let raw = 0;
    switch (mission.kind) {
      case "REVIEW_N":
        raw = facts.reviewAnswers;
        break;
      case "LESSON_ONE":
        raw = facts.lessonsCompleted;
        break;
      case "TASMI_ONE":
        raw = facts.tasmiCount;
        break;
      case "PRECISION_N":
        raw = facts.precisionCorrect;
        break;
      case "TESTOUT_TRY":
        raw = facts.testOutAttempts;
        break;
      case "CYCLE_ONE":
        raw = facts.cycleSessions;
        break;
    }
    const done = Math.min(mission.target, Math.max(0, raw));
    return {
      mission,
      done,
      complete: done >= mission.target,
    };
  });
}
