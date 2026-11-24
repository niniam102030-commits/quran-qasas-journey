// src/learning/garden.ts
// منطق خالص «باغ حفظ» (G4) — نگاشت پیشرفت و بدهی مرور هر واحد به مرحله رشد گیاه (۰ تا ۴) و وضعیت پژمردگی

export interface PlantInput {
  unitId: string;
  stagePassedCount: number;
  mastered: boolean;
  dueCards: number;
  totalCards: number;
}

export interface PlantState {
  unitId: string;
  stage: 0 | 1 | 2 | 3 | 4;
  wilted: boolean;
  mastered: boolean;
}

export function gardenState(units: PlantInput[]): PlantState[] {
  return units.map((u) => {
    let stage: 0 | 1 | 2 | 3 | 4;
    if (u.mastered) {
      stage = 4;
    } else if (u.stagePassedCount >= 8) {
      stage = 3;
    } else if (u.stagePassedCount >= 1) {
      stage = u.stagePassedCount >= 4 ? 2 : 1;
    } else if (u.totalCards === 0) {
      stage = 0;
    } else {
      stage = 1;
    }

    const wilted = u.totalCards > 0 && u.dueCards / u.totalCards > 0.3;
    return {
      unitId: u.unitId,
      stage,
      wilted,
      mastered: u.mastered,
    };
  });
}
