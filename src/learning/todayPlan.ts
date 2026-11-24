// src/learning/todayPlan.ts
// منطق خالص ساخت کارت «برنامهٔ امروز» (U1) — حداکثر ۴ وظیفه با ترتیب اولویت ثابت

export type TodayTaskKind =
  | "REVIEW"
  | "LESSON"
  | "TASMI"
  | "TESTOUT_SUGGEST"
  | "MANZIL"
  | "BLINDSPOTS";

export interface TodayTask {
  kind: TodayTaskKind;
  titleFa: string;
  detailFa: string;
  unitId?: string;
  stage?: number;
  count?: number;
}

export interface BuildTodayPlanInput {
  dueCount: number;
  reviewCap: number;
  currentUnitId: string | null;
  currentStage: number; // اولین واحدی که هر ۸ مرحله‌اش پاس نشده
  allUnitsPassed: boolean;
  tasmiDoneToday: boolean;
  manzilUnitIds: string[];
  blindSpotAvailable: boolean;
  /** آخرین واحد پاس‌شده برای وظیفه تسمیع (اختیاری؛ در صورت نبود، وجود واحد پاس‌شده استنباط می‌شود) */
  lastPassedUnitId?: string | null;
  hasPassedUnit?: boolean;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

export function buildTodayPlan(input: BuildTodayPlanInput): TodayTask[] {
  const tasks: TodayTask[] = [];

  // ۱) مرور امروز
  if (input.dueCount > 0) {
    const count = Math.min(input.dueCount, Math.max(1, input.reviewCap));
    tasks.push({
      kind: "REVIEW",
      titleFa: "مرور امروز",
      detailFa: `${toFarsi(count)} کارت آمادهٔ مرور هوشمند`,
      count,
    });
  }

  // ۲) درس جدید از اولین واحد ناتمام
  if (!input.allUnitsPassed && input.currentUnitId) {
    const st = Math.min(8, Math.max(1, input.currentStage || 1));
    tasks.push({
      kind: "LESSON",
      titleFa: `ادامهٔ مرحلهٔ ${toFarsi(st)}`,
      detailFa: "یک درس کوتاه از نیم‌صفحهٔ جاری",
      unitId: input.currentUnitId,
      stage: st,
    });
  }

  // ۳) چرخهٔ منزل امروز
  if (input.manzilUnitIds.length > 0) {
    tasks.push({
      kind: "MANZIL",
      titleFa: "مرور منزل امروز",
      detailFa: `مرور چرخشی ${toFarsi(input.manzilUnitIds.length)} نیم‌صفحهٔ تثبیت‌شده`,
      count: input.manzilUnitIds.length,
    });
  }

  // ۴) بستهٔ هفتگی نقاط کور
  if (input.blindSpotAvailable) {
    tasks.push({
      kind: "BLINDSPOTS",
      titleFa: "تمرین نقاط کور هفته",
      detailFa: "مرور هدفمند بیشترین لغزش‌های اخیر",
    });
  }

  // ۵) تسمیع آخرین واحد پاس‌شده
  const anyPassed =
    input.hasPassedUnit !== undefined
      ? input.hasPassedUnit
      : input.allUnitsPassed ||
        Boolean(input.lastPassedUnitId) ||
        input.manzilUnitIds.length > 0 ||
        (Boolean(input.currentUnitId) && input.currentUnitId !== "u_p385b");

  if (!input.tasmiDoneToday && anyPassed) {
    tasks.push({
      kind: "TASMI",
      titleFa: "تسمیع از حفظ",
      detailFa: "خودارزیابی تلاوت آخرین نیم‌صفحهٔ پاس‌شده",
      unitId: input.lastPassedUnitId ?? input.manzilUnitIds[input.manzilUnitIds.length - 1],
    });
  }

  return tasks.slice(0, 4);
}
