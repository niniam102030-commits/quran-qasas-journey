import "fake-indexeddb/auto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ldb, verseKey } from "../../db/learningDb";
import {
  computePackContentHash,
  fetchPacksCatalog,
  listInstalledSurahs,
  uninstallSurahPack,
  validateAndInstallSurahPack,
  type SurahPackFile,
} from "../surahPackService";
import { genConjunctionQuestion, genIrabQuestion, genWaqfQuestion, buildStandaloneWordSet } from "../../learning/precisionGen";
import { buildConnectionDrillQueue } from "../../learning/connectionDrills";
import { assembleExamQueue } from "../../learning/examEngine";
import { newCard } from "../../learning/cardScheduler";
import type { BaseVerse, UnitPlan } from "../../types/learning";

async function loadRealSurah1Pack(): Promise<SurahPackFile> {
  const packPath = path.resolve(process.cwd(), "release", "packs", "surah-1.pack.json");
  const raw = await fs.readFile(packPath, "utf8");
  return JSON.parse(raw) as SurahPackFile;
}

describe("surahPackService", () => {
  beforeEach(async () => {
    await ldb.open();
    await Promise.all([
      ldb.baseVerses.clear(),
      ldb.unitProgress.clear(),
      ldb.questions.clear(),
      ldb.lexicon.clear(),
      ldb.chunks.clear(),
      ldb.meta.clear(),
      ldb.surahPacks.clear(),
      ldb.cards.clear(),
    ]);

    // کاشت داده‌های نمونه سوره ۲۸ برای اطمینان از مصون‌ماندن آن‌ها هنگام نصب/حذف پک دیگر
    await ldb.baseVerses.bulkPut([
      { id: verseKey(28, 1), surah: 28, n: 1, arText: "طسم", fa: "طا سین میم", words: [] },
      { id: verseKey(28, 2), surah: 28, n: 2, arText: "تِلْكَ آيَاتُ الْكِتَابِ الْمُبِينِ", fa: "...", words: [] },
    ]);
    await ldb.unitProgress.put({
      unitId: "u_p385b",
      unlocked: true,
      stagePassed: { 1: true, 2: true },
      currentStage: 3,
      mastered: false,
      updatedAt: 1700000000000,
    });
    await ldb.cards.put({
      ...newCard("vr:1"),
      stability: 4,
      difficulty: 4,
      elapsedDays: 1,
      scheduledDays: 2,
      reps: 1,
      lapses: 0,
      state: 2,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects packs with mismatched SHA-256 hash before touching IndexedDB", async () => {
    const pack = await loadRealSurah1Pack();
    const expectedHash = await computePackContentHash(pack);
    expect(pack.contentHash).toBe(expectedHash);

    const tampered: SurahPackFile = {
      ...pack,
      base: {
        ...pack.base,
        verses: pack.base.verses.map((v, i) => (i === 0 ? { ...v, arText: "متن دستکاری شده" } : v)),
      },
    };

    await expect(validateAndInstallSurahPack(tampered)).rejects.toThrow(/SHA-256/);
    expect(await ldb.baseVerses.where("surah").equals(1).count()).toBe(0);
    expect(await ldb.surahPacks.get(1)).toBeUndefined();
    expect(await ldb.baseVerses.where("surah").equals(28).count()).toBe(2);
  });

  it("installs real surah-1 pack cleanly without overwriting Surah 28 and works with A1/A3/Exam", async () => {
    const pack = await loadRealSurah1Pack();
    const meta = await validateAndInstallSurahPack(pack);

    expect(meta.surah).toBe(1);
    expect(meta.verses).toBe(7);
    expect(meta.hasMergedContent).toBe(false);
    expect(meta.questionCount).toBe(0);

    // هم‌زیستی هر دو سوره بدون آسیب به سوره ۲۸
    expect(await ldb.baseVerses.where("surah").equals(1).count()).toBe(7);
    expect(await ldb.baseVerses.where("surah").equals(28).count()).toBe(2);
    expect((await ldb.unitProgress.get("u_p385b"))?.stagePassed?.[2]).toBe(true);

    const installed = await listInstalledSurahs();
    expect(installed.map((s) => s.surahNumber)).toEqual([28, 1]);

    // کارکرد مولدهای A1، دریل A3 و شبیه‌ساز آزمون روی پک بدون سؤال مرحله‌ای
    const verses1 = (await ldb.baseVerses.where("surah").equals(1).sortBy("n")) as unknown as BaseVerse[];
    const storedMeta = (await ldb.meta.get("surahPackMeta:1"))?.value as { units: UnitPlan[] };
    expect(storedMeta.units.length).toBeGreaterThanOrEqual(1);

    const standalone = buildStandaloneWordSet(verses1);
    const a1Questions = verses1.flatMap((v) => {
      const out = [];
      const c = genConjunctionQuestion(v, { lexiconSet: standalone, surah: 1 });
      if (c) out.push(c);
      const ir = genIrabQuestion(v, { surah: 1 });
      if (ir) out.push(ir);
      const wq = genWaqfQuestion(v, { surah: 1 });
      if (wq) out.push(wq);
      return out;
    });
    expect(a1Questions.length).toBeGreaterThan(0);

    const drills = buildConnectionDrillQueue({
      units: storedMeta.units,
      verses: verses1,
      surah: 1,
      seed: 20261124,
    });
    expect(drills.length).toBeGreaterThan(0);

    const exam = assembleExamQueue({
      scope: { type: "surah", id: "surah-1", labelFa: "کل سوره حمد" },
      units: storedMeta.units,
      verses: verses1,
      bankQuestions: [],
      lexiconSet: standalone,
      surah: 1,
      seed: 20261124,
    });
    expect(exam.queue.length).toBeGreaterThan(0);
    expect(exam.shortfallNotes.length).toBeGreaterThan(0);
  });

  it("uninstalls only the target surah pack and preserves Surah 28 data", async () => {
    const pack = await loadRealSurah1Pack();
    await validateAndInstallSurahPack(pack);
    expect(await ldb.baseVerses.where("surah").equals(1).count()).toBe(7);

    await expect(uninstallSurahPack(28)).rejects.toThrow();

    await uninstallSurahPack(1);
    expect(await ldb.baseVerses.where("surah").equals(1).count()).toBe(0);
    expect(await ldb.surahPacks.get(1)).toBeUndefined();
    expect(await ldb.meta.get("surahPackMeta:1")).toBeUndefined();

    // سوره ۲۸ دست‌نخورده مانده است
    expect(await ldb.baseVerses.where("surah").equals(28).count()).toBe(2);
    expect((await ldb.cards.get("vr:1"))?.stability).toBe(4);
    expect((await ldb.unitProgress.get("u_p385b"))?.stagePassed?.[1]).toBe(true);
  });

  it("returns empty catalog gracefully when offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const catalog = await fetchPacksCatalog();
    expect(catalog).toEqual([]);
  });
});
