import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE, ldb } from "../../db/learningDb";
import { STORY_CHAPTERS } from "../../learning/chapters";
import { planMuraja } from "../../learning/muraja";
import { getMeta } from "../metaStore";
import { markAllStagesPassed, resetOnboardingForDev, seedDevTestData } from "../devModeService";

describe("devModeService", () => {
  beforeEach(async () => {
    await ldb.open();
    await Promise.all([
      ldb.profile.clear(),
      ldb.unitProgress.clear(),
      ldb.cards.clear(),
      ldb.confusions.clear(),
      ldb.questions.clear(),
      ldb.meta.clear(),
    ]);

    await ldb.unitProgress.bulkPut([
      { unitId: "u_p385b", unlocked: true, stagePassed: {}, currentStage: 1, mastered: false, updatedAt: 1000 },
      { unitId: "u_p386a", unlocked: true, stagePassed: {}, currentStage: 1, mastered: false, updatedAt: 1000 },
      { unitId: "u_p386b", unlocked: false, stagePassed: {}, currentStage: 1, mastered: false, updatedAt: 1000 },
      { unitId: "u_p387a", unlocked: true, stagePassed: {}, currentStage: 1, mastered: false, updatedAt: 1000 },
    ]);

    await ldb.questions.bulkPut(
      Array.from({ length: 6 }, (_, i) => ({
        id: `q-dev-${i + 1}`,
        unitId: "u_p385b",
        stage: 1,
        skill: "vocab",
        type: "VOCAB",
        shape: "choice" as const,
        difficulty: 1,
        targets: [`w:w28_001_00${i + 1}`],
      })),
    );
  });

  it("seedDevTestData unlocks units, charges gems >= 1000, populates SABQ/SABQI/MANZIL and blind spots without lowering higher gems", async () => {
    const fixedNow = new Date("2026-11-24T12:00:00Z");
    await ldb.profile.put({ ...DEFAULT_USER_PROFILE, aqeeqGems: 1500, updatedAt: 1000 });

    const res = await seedDevTestData(fixedNow);
    expect(res.unlockedUnits).toBe(4);
    expect(res.seededCards).toBe(32);
    expect(res.gems).toBe(1500);

    const prof = await ldb.profile.get("main");
    expect(prof?.aqeeqGems).toBe(1500);
    expect(prof?.noorXp).toBeGreaterThanOrEqual(2500);
    expect(prof?.chillehCurrentDays).toBeGreaterThanOrEqual(14);

    const units = await ldb.unitProgress.toArray();
    expect(units.every((u) => u.unlocked)).toBe(true);

    const muraja = planMuraja(
      units.map((u, idx) => ({
        unitId: u.unitId,
        order: idx + 1,
        stage8PassedAt: u.stagePassed[8] ? u.updatedAt : null,
      })),
      fixedNow,
    );
    expect(muraja.sabq.length).toBeGreaterThanOrEqual(1);
    expect(muraja.sabqi.length).toBeGreaterThanOrEqual(1);
    expect(muraja.manzil.length).toBeGreaterThanOrEqual(1);

    expect(await getMeta<boolean>("onboardingDone", false)).toBe(true);
    const blindPack = await getMeta<{ questionIds: string[] } | null>("blindSpotPack", null);
    expect(blindPack?.questionIds.length).toBe(6);
  });

  it("markAllStagesPassed completes all units stages 1..8 and grants all chapter medals", async () => {
    const res = await markAllStagesPassed(new Date("2026-11-24T12:00:00Z"));
    expect(res.updatedUnits).toBe(4);

    const units = await ldb.unitProgress.toArray();
    for (const u of units) {
      expect(u.mastered).toBe(true);
      for (let s = 1; s <= 8; s++) {
        expect(u.stagePassed[s]).toBe(true);
      }
    }

    const medals = await getMeta<string[]>("chapterMedals", []);
    expect(medals).toEqual(STORY_CHAPTERS.map((c) => c.id));
  });

  it("resetOnboardingForDev sets onboardingDone to false", async () => {
    await seedDevTestData();
    expect(await getMeta<boolean>("onboardingDone", false)).toBe(true);
    await resetOnboardingForDev();
    expect(await getMeta<boolean>("onboardingDone", true)).toBe(false);
  });
});
