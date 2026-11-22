// src/services/__tests__/contentLoader.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ldb } from "../../db/learningDb";
import { syncContent } from "../contentLoader";
import { newCard } from "../../learning/cardScheduler";

describe("contentLoader - syncContent preserves user data", () => {
  beforeEach(async () => {
    await ldb.delete();
    await ldb.open();
  });

  it("syncContent preserves existing cards, attempts, and confusions across syncs", async () => {
    // 1. Seed user data (cards, attempts)
    const card = newCard("w:w28_001_001");
    card.streak = 5;
    await ldb.cards.put(card);

    await ldb.attempts.add({
      qid: "q1",
      unitId: "u_p385a",
      stage: 1,
      at: Date.now(),
      correct: true,
      usedHint: false,
      responseMs: 2500,
      perTarget: { "w:w28_001_001": true },
      sessionType: "STAGE",
    });

    await ldb.confusions.add({
      qid: "q1",
      target: "w:w28_001_001",
      chosenTag: "false_friend",
      at: Date.now(),
    });

    // 2. Mock fetch for manifest and unit content
    const mockManifest = {
      schema: "qasas.manifest.v1",
      contentHash: "hash-v1",
      base: { file: "base/qasas.base.json", hash: "base-h1" },
      units: [
        {
          id: "u_p385a",
          order: 1,
          verses: ["v28_001"],
          files: [{ file: "units/u_p385a.partA.json", part: "A", hash: "partA-h1" }],
        },
      ],
    };

    const mockBase = {
      verses: [
        {
          n: 1,
          arText: "طسم",
          fa: "طا، سین، میم.",
          words: [{ id: "w28_001_001", i: 1, ar: "طسم" }],
        },
      ],
    };

    const mockPartA = {
      schema: "qasas.content.v1",
      unitId: "u_p385a",
      part: "A",
      lexicon: [{ wordId: "w28_001_001", ar: "طسم", fa: "حروف مقطعه" }],
      chunks: [{ verse: 1, chunks: [{ from: 1, to: 1 }] }],
      questions: [
        {
          id: "q_test_1",
          unitId: "u_p385a",
          type: "WORD_AR_TO_FA",
          shape: "choice",
          stage: 1,
          difficulty: 1,
          skill: "word",
          targets: ["w:w28_001_001"],
          promptFa: "معنا؟",
          stem: {},
          options: [{ id: "o1", fa: "حروف" }],
          answer: "o1",
          explanationFa: "توضیح",
        },
      ],
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockManifest) });
      }
      if (url.includes("qasas.base.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBase) });
      }
      if (url.includes("u_p385a.partA.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPartA) });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    // 3. First sync
    const res1 = await syncContent();
    expect(res1.updated).toBe(true);
    expect(res1.contentHash).toBe("hash-v1");

    // Verify content loaded
    const qCount = await ldb.questions.count();
    expect(qCount).toBe(1);
    const lexCount = await ldb.lexicon.count();
    expect(lexCount).toBe(1);

    // Verify user card and attempt are STILL there!
    const savedCard = await ldb.cards.get("w:w28_001_001");
    expect(savedCard).toBeDefined();
    expect(savedCard?.streak).toBe(5);

    const attemptCount = await ldb.attempts.count();
    expect(attemptCount).toBe(1);

    const confusionCount = await ldb.confusions.count();
    expect(confusionCount).toBe(1);

    await ldb.unitProgress.put({ unitId: "u_p385a", unlocked: true, stagePassed: { 1: true }, currentStage: 2, mastered: false, updatedAt: Date.now() });
    await ldb.meta.put({ key: "contentSyncVersion", value: 1 });

    // 4. Same content hash still forces one rebuild for legacy sync versions.
    const res2 = await syncContent();
    expect(res2.updated).toBe(true);

    // Data and stage progress still preserved!
    expect((await ldb.unitProgress.get("u_p385a"))?.currentStage).toBe(2);
    expect(await ldb.cards.count()).toBe(1);
    expect(await ldb.attempts.count()).toBe(1);

    const noOp = await syncContent();
    expect(noOp.updated).toBe(false);

    mockManifest.contentHash = "hash-v2";
    mockManifest.units[0].files[0].hash = "partA-h2";
    mockPartA.questions = [];
    const res3 = await syncContent();
    expect(res3.updated).toBe(true);
    expect(await ldb.questions.count()).toBe(0);
    expect(await ldb.cards.count()).toBe(1);
    expect((await ldb.unitProgress.get("u_p385a"))?.currentStage).toBe(2);
  });
});
