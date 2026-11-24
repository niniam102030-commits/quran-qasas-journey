// src/learning/__tests__/tajweed.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BaseVerse } from "../../types/learning";
import {
  extractTajweedExamples,
  getWordTajweedStyle,
  TAJWEED_RULES,
  type SurahTajweedData,
  type TajweedRuleId,
} from "../tajweed";

const basePath = path.resolve(process.cwd(), "public/content/base/qasas.base.json");
const tajweedPath = path.resolve(process.cwd(), "public/content/base/qasas.tajweed.json");

const qasasVerses = JSON.parse(fs.readFileSync(basePath, "utf8")) as BaseVerse[];
const tajweedData = JSON.parse(fs.readFileSync(tajweedPath, "utf8")) as SurahTajweedData;

const ALLOWED_RULES = new Set<TajweedRuleId>(TAJWEED_RULES.map((r) => r.id));

describe("tajweed data & helpers (B2)", () => {
  it("qasas.tajweed.json follows schema v1, covers Surah 28 verses, and every w index aligns with base words", () => {
    expect(tajweedData.schema).toBe("qasas.tajweed.v1");
    expect(tajweedData.surah).toBe(28);
    expect(qasasVerses).toHaveLength(88);

    const verseMap = new Map(qasasVerses.map((v) => [v.n, v]));
    let totalEntries = 0;

    for (const [vKey, entries] of Object.entries(tajweedData.verses)) {
      const vNum = Number(vKey);
      const bv = verseMap.get(vNum);
      expect(bv).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        totalEntries++;
        expect(Number.isInteger(entry.w)).toBe(true);
        expect(entry.w).toBeGreaterThanOrEqual(0);
        expect(entry.w).toBeLessThan(bv!.words.length);
        expect(entry.rules.length).toBeGreaterThan(0);
        for (const r of entry.rules) {
          expect(ALLOWED_RULES.has(r)).toBe(true);
        }
      }
    }

    expect(Object.keys(tajweedData.verses).length).toBe(88);
    expect(totalEntries).toBeGreaterThan(500);
  });

  it("supports all 8 standard rules with distinct colors and marks multi-rule words with dotted underline", () => {
    expect(TAJWEED_RULES).toHaveLength(8);
    const ids = TAJWEED_RULES.map((r) => r.id);
    expect(ids).toEqual([
      "ghunnah",
      "ikhfa",
      "idgham",
      "iqlab",
      "izhar",
      "madd",
      "qalqalah",
      "tafkhim",
    ]);

    const single = getWordTajweedStyle(["ikhfa"]);
    expect(single.hasMultiple).toBe(false);
    expect(single.primaryRule?.id).toBe("ikhfa");
    expect(single.className).not.toContain("decoration-dotted");

    const multi = getWordTajweedStyle(["ikhfa", "ghunnah"]);
    expect(multi.hasMultiple).toBe(true);
    expect(multi.primaryRule?.id).toBe("ikhfa");
    expect(multi.className).toContain("decoration-dotted");
  });

  it("extractTajweedExamples extracts up to 3 real Surah Al-Qasas examples matching qasas.base.json", () => {
    const taggedRules: TajweedRuleId[] = ["ghunnah", "ikhfa", "idgham", "iqlab", "madd", "qalqalah"];
    for (const ruleId of taggedRules) {
      const examples = extractTajweedExamples(tajweedData, qasasVerses, ruleId, 3);
      expect(examples).toHaveLength(3);
      for (const ex of examples) {
        const bv = qasasVerses.find((v) => v.n === ex.verse)!;
        expect(bv.words[ex.wordIndex0].ar).toBe(ex.wordAr);
        expect(ex.allRules).toContain(ruleId);
      }
    }
  });
});
