import { describe, it, expect } from "vitest";
import { normalizeArabicForRecitation, verifyVerseRecitation } from "../recitationVerifier";

const AYAH_2_WORDS = [
  { id: "w28_002_001", ar: "تِلْكَ" },
  { id: "w28_002_002", ar: "ءَايَـٰتُ" },
  { id: "w28_002_003", ar: "ٱلْكِتَـٰبِ" },
  { id: "w28_002_004", ar: "ٱلْمُبِينِ" },
];

describe("recitationVerifier", () => {
  it("normalizes Uthmani diacritics and alef variants", () => {
    expect(normalizeArabicForRecitation("ٱلْكِتَـٰبِ")).toBe("الكتاب");
    expect(normalizeArabicForRecitation("ءَايَـٰتُ")).toBe("ايات");
    expect(normalizeArabicForRecitation("آيات")).toBe("ايات");
  });

  it("scores 100% on accurate Arabic recitation despite Uthmani spelling differences", () => {
    const res = verifyVerseRecitation(AYAH_2_WORDS, "تلك آيات الكتاب المبين");
    expect(res.accuracyPercent).toBe(100);
    expect(res.matchedWordIds).toEqual([
      "w28_002_001",
      "w28_002_002",
      "w28_002_003",
      "w28_002_004",
    ]);
    expect(res.extraWords).toHaveLength(0);
  });

  it("detects missing and substituted words cleanly", () => {
    const res = verifyVerseRecitation(AYAH_2_WORDS, "تلك آيات الكريم");
    expect(res.wordResults[0].status).toBe("correct");
    expect(res.wordResults[1].status).toBe("correct");
    expect(res.wordResults.some((w) => w.status === "missing")).toBe(true);
    expect(res.wordResults.some((w) => w.status === "substituted")).toBe(true);
    expect(res.accuracyPercent).toBe(50);
  });

  it("captures extra spoken words", () => {
    const res = verifyVerseRecitation(AYAH_2_WORDS, "تلك آيات الكتاب الحكيم المبين");
    expect(res.accuracyPercent).toBe(100);
    expect(res.extraWords).toEqual(["الحكيم"]);
  });
});
