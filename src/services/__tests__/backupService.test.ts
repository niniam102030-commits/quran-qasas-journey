import { describe, it, expect } from "vitest";
import { parseAndValidateBackup, BACKUP_APP_ID } from "../backupService";

function validBackup() {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: 2,
    exportedAt: "2026-11-24T00:00:00.000Z",
    cards: [
      {
        key: "vr:5",
        kind: "vr",
        due: "2026-11-25T00:00:00.000Z",
        stability: 3.5,
        difficulty: 5.2,
        elapsedDays: 1,
        scheduledDays: 4,
        reps: 2,
        lapses: 0,
        state: 2,
        lastReview: "2026-11-24T00:00:00.000Z",
        streak: 2,
        extraMaliciousField: "should-be-stripped",
      },
    ],
    attempts: [
      {
        id: 1,
        qid: "q_001",
        unitId: "u_p385b",
        stage: 1,
        at: 1700000000000,
        correct: true,
        usedHint: false,
        responseMs: 2400,
        perTarget: { "vr:5": true },
        sessionType: "STAGE",
      },
    ],
    confusions: [
      {
        id: 1,
        qid: "q_001",
        target: "w:w28_002_004",
        chosenTag: "false_friend",
        at: 1700000000000,
      },
    ],
    unitProgress: [
      {
        unitId: "u_p385b",
        unlocked: true,
        stagePassed: { 1: true },
        stageLessons: { 1: 2 },
        currentStage: 2,
        mastered: false,
        updatedAt: 1700000000000,
      },
    ],
    profile: {
      id: "main",
      chillehCurrentDays: 5,
      chillehBestDays: 12,
      chillehStage: 7,
      lastActivityDate: "2026-11-24",
      chillehShieldActive: true,
      noorXp: 450,
      aqeeqGems: 25,
      updatedAt: 1700000000000,
    },
  };
}

describe("backupService.parseAndValidateBackup", () => {
  it("accepts a valid backup and strips unknown fields", () => {
    const res = parseAndValidateBackup(JSON.stringify(validBackup()));
    expect(res.cards).toHaveLength(1);
    expect(res.cards[0].key).toBe("vr:5");
    expect((res.cards[0] as unknown as Record<string, unknown>).extraMaliciousField).toBeUndefined();
    expect(res.profile?.noorXp).toBe(450);
  });

  it("rejects wrong app id", () => {
    const bad = { ...validBackup(), app: "other-app" };
    expect(() => parseAndValidateBackup(JSON.stringify(bad))).toThrow();
  });

  it("rejects unsupported schemaVersion", () => {
    const bad = { ...validBackup(), schemaVersion: 99 };
    expect(() => parseAndValidateBackup(JSON.stringify(bad))).toThrow();
  });

  it("rejects card with mismatched kind/key or invalid state", () => {
    const badKind = validBackup();
    badKind.cards[0].kind = "w";
    expect(() => parseAndValidateBackup(JSON.stringify(badKind))).toThrow();

    const badState = validBackup();
    (badState.cards[0] as unknown as Record<string, unknown>).state = 9;
    expect(() => parseAndValidateBackup(JSON.stringify(badState))).toThrow();
  });

  it("rejects negative or NaN profile values and invalid chillehStage", () => {
    const badStage = validBackup();
    (badStage.profile as unknown as Record<string, unknown>).chillehStage = 99;
    expect(() => parseAndValidateBackup(JSON.stringify(badStage))).toThrow();

    const badXp = validBackup();
    badXp.profile.noorXp = -10;
    expect(() => parseAndValidateBackup(JSON.stringify(badXp))).toThrow();
  });

  it("rejects invalid perTarget values or prototype pollution keys", () => {
    const bad = validBackup();
    bad.attempts[0].perTarget = JSON.parse('{"__proto__": true}');
    expect(() => parseAndValidateBackup(JSON.stringify(bad))).toThrow();
  });
});
