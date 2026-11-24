// src/learning/__tests__/connectionDrills.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { BaseVerse, UnitPlan } from "../../types/learning";
import {
  buildConnectionDrillQueue,
  dailyDrillSeed,
  genMidStartQuestion,
  genUnitLinkQuestions,
} from "../connectionDrills";

const basePath = path.resolve(process.cwd(), "public/content/base/qasas.base.json");
const planPath = path.resolve(process.cwd(), "public/content/base/units-plan.json");
const qasasVerses = JSON.parse(fs.readFileSync(basePath, "utf8")) as BaseVerse[];
const unitsPlan = JSON.parse(fs.readFileSync(planPath, "utf8")) as UnitPlan[];
const verseMap = new Map(qasasVerses.map((v) => [v.n, v]));

describe("connectionDrills (A3)", () => {
  it("generates unit-to-unit link questions for every consecutive pair of the 22 Al-Qasas units", () => {
    const seed = dailyDrillSeed(new Date("2026-11-24T10:00:00Z"));
    const links = genUnitLinkQuestions(unitsPlan, verseMap, { seed, surah: 28 });

    // ۲۲ واحد ⇒ دقیقاً ۲۱ جفت متوالی
    expect(links).toHaveLength(21);

    const sorted = unitsPlan.slice().sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length - 1; i++) {
      const q = links[i];
      const prev = sorted[i];
      const next = sorted[i + 1];
      expect(q.kind).toBe("link");
      expect(q.promptFa).toBe("آیهٔ آغازین واحد بعد کدام است؟");
      expect(q.stem.ar).toBe(verseMap.get(prev.verseTo)!.arText);
      expect(q.answer).toBe(`v:${next.verseFrom}`);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.id)).size).toBe(4);
      expect(q.options.some((o) => o.id === q.answer && o.ar === verseMap.get(next.verseFrom)!.arText)).toBe(true);
    }

    // تکرارپذیری قطعی با seed روز
    const linksRepeat = genUnitLinkQuestions(unitsPlan, verseMap, { seed, surah: 28 });
    expect(linksRepeat.map((q) => q.options.map((o) => o.id))).toEqual(
      links.map((q) => q.options.map((o) => o.id)),
    );
  });

  it("skips verses with < 6 words and generates deterministic mid-start questions for verses with >= 6 words", () => {
    // آیه ۱ فقط ۱ کلمه و آیه ۲ فقط ۴ کلمه دارد
    expect(genMidStartQuestion(verseMap.get(1)!)).toBeNull();
    expect(genMidStartQuestion(verseMap.get(2)!)).toBeNull();

    // آیات دارای ≥ ۶ کلمه
    let generated = 0;
    for (const v of qasasVerses) {
      if (v.words.length < 6) continue;
      const q = genMidStartQuestion(v, { seed: 20261124, surah: 28 });
      if (!q) continue;
      generated++;
      expect(q.kind).toBe("midstart");
      expect(q.promptFa).toBe("کلمهٔ بعد چیست؟");
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.ar)).size).toBe(4);
      const cut = Number(q.stem.cut);
      expect(cut).toBeGreaterThanOrEqual(3);
      expect(cut).toBeLessThanOrEqual(v.words.length - 2);
      const correctOpt = q.options.find((o) => o.id === q.answer);
      expect(correctOpt).toBeDefined();
      expect(v.words[cut].ar).toContain(correctOpt!.ar!);
    }
    expect(generated).toBeGreaterThanOrEqual(75);
  });

  it("buildConnectionDrillQueue returns balanced mixed questions for unit or full surah", () => {
    const queue = buildConnectionDrillQueue({
      units: unitsPlan,
      verses: qasasVerses,
      scopeUnitId: "u_p386a",
      seed: 20261124,
      size: 10,
    });
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.some((q) => q.kind === "link")).toBe(true);
    expect(queue.some((q) => q.kind === "midstart")).toBe(true);
  });
});
