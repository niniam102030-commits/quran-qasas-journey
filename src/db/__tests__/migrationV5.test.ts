import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { LearningDB, verseKey } from "../learningDb";

describe("LearningDB schema migration v4 -> v5", () => {
  const createdNames: string[] = [];

  afterEach(async () => {
    for (const name of createdNames) {
      await Dexie.delete(name).catch(() => {});
    }
    createdNames.length = 0;
  });

  it("migrates v4 baseVerses primary key from numeric n to composite <surah>:<verse> id without losing data", async () => {
    const dbName = `test-migration-v5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createdNames.push(dbName);

    // 1. ایجاد دیتابیس نسخه ۴ با کلید اصلی عددی n روی baseVerses
    const v4Db = new Dexie(dbName);
    v4Db.version(4).stores({
      questions: "id, unitId, [unitId+stage], stage, type, *targets",
      lexicon: "wordId, unitId",
      chunks: "id, unitId, verse",
      baseVerses: "n",
      cards: "key, kind, due, state",
      attempts: "++id, qid, unitId, [unitId+stage], at",
      confusions: "++id, qid, target, at",
      unitProgress: "unitId",
      meta: "key",
      audioCache: "verse, surah",
      surahAudioCache: "[surah+verse], surah",
      profile: "id",
      surahPacks: "surahNumber, slug",
    });
    await v4Db.open();

    await v4Db.table("baseVerses").bulkPut([
      {
        n: 1,
        id: "v28_001",
        page: 385,
        arText: "طسم",
        fa: "طا سین میم",
        words: [{ id: "w28_001_001", i: 1, ar: "طسم", page: 385, line: 10 }],
      },
      {
        n: 2,
        id: "v28_002",
        page: 385,
        arText: "تِلْكَ آيَاتُ الْكِتَابِ الْمُبِينِ",
        fa: "این است آیات کتاب روشنگر",
        words: [{ id: "w28_002_001", i: 1, ar: "تِلْكَ", page: 385, line: 11 }],
      },
    ]);
    await v4Db.table("cards").put({
      key: "vr:1",
      kind: "vr",
      due: new Date().toISOString(),
      stability: 3.5,
      difficulty: 4,
      elapsed_days: 1,
      scheduled_days: 2,
      reps: 1,
      lapses: 0,
      state: 2,
    });
    await v4Db.table("unitProgress").put({
      unitId: "u_p385b",
      unlocked: true,
      stagePassed: { 1: true },
      currentStage: 2,
      mastered: false,
      updatedAt: 1700000000000,
    });
    v4Db.close();

    // 2. بازکردن مجدد با LearningDB (نسخه ۵) و بررسی مهاجرت
    const v5Db = new LearningDB(dbName);
    await v5Db.open();

    const rows = await v5Db.baseVerses.orderBy("n").toArray();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(verseKey(28, 1));
    expect(rows[0].surah).toBe(28);
    expect(rows[0].n).toBe(1);
    expect(rows[0].verseId).toBe("v28_001");
    expect(rows[0].arText).toBe("طسم");

    const v2 = await v5Db.baseVerses.get("28:2");
    expect(v2).toBeDefined();
    expect(v2?.surah).toBe(28);
    expect(v2?.n).toBe(2);
    expect(v2?.verseId).toBe("v28_002");

    // کلید موقت مهاجرت باید پاک شده باشد و داده‌های یادگیری حفظ شوند
    expect(await v5Db.meta.get("__v5_baseVerses_tmp")).toBeUndefined();
    expect((await v5Db.cards.get("vr:1"))?.stability).toBe(3.5);
    expect((await v5Db.unitProgress.get("u_p385b"))?.stagePassed?.[1]).toBe(true);

    // هم‌زیستی آیه ۱ سوره دیگر بدون تداخل با ۲۸:۱
    await v5Db.baseVerses.put({
      id: verseKey(1, 1),
      surah: 1,
      n: 1,
      arText: "بِسْمِ اللَّهِ الرَّحْمَـٰنِ الرَّحِيمِ",
    });
    expect(await v5Db.baseVerses.where("surah").equals(28).count()).toBe(2);
    expect(await v5Db.baseVerses.where("surah").equals(1).count()).toBe(1);

    v5Db.close();
  });
});
