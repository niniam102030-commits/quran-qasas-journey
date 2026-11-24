import { describe, it, expect } from "vitest";
import { normalizeArabicForRecitation, verifyVerseRecitation } from "../recitationVerifier";

const AYAH_2_WORDS = [
  { id: "w28_002_001", ar: "تِلْكَ" },
  { id: "w28_002_002", ar: "ءَايَـٰتُ" },
  { id: "w28_002_003", ar: "ٱلْكِتَـٰبِ" },
  { id: "w28_002_004", ar: "ٱلْمُبِينِ" },
];

describe("recitationVerifier", () => {
  it("normalizes Uthmani diacritics and genuine Uthmani orthography variants", () => {
    expect(normalizeArabicForRecitation("ٱلْكِتَـٰبِ")).toBe("الكتاب");
    expect(normalizeArabicForRecitation("ءَايَـٰتُ")).toBe("ايات");
    expect(normalizeArabicForRecitation("آيات")).toBe("ايات");
    expect(normalizeArabicForRecitation("ٱلصَّلَوٰةَ")).toBe("الصلواة".replace("واة", "اه"));
    expect(normalizeArabicForRecitation("الرحمن")).toBe("الرحمان");
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

  it("strictly rejects single-letter omissions/substitutions like وقال vs قال and عليهم vs عليكم", () => {
    const wawCheck = verifyVerseRecitation([{ id: "w1", ar: "وَقَالَ" }], "قال");
    expect(wawCheck.wordResults[0].status).toBe("substituted");
    expect(wawCheck.accuracyPercent).toBe(0);

    const pronounCheck = verifyVerseRecitation([{ id: "w2", ar: "عَلَيْهِمْ" }], "عليكم");
    expect(pronounCheck.wordResults[0].status).toBe("substituted");
    expect(pronounCheck.accuracyPercent).toBe(0);

    const patternCheck = verifyVerseRecitation([{ id: "w3", ar: "كِتَـٰبٌ" }], "كاتب");
    expect(patternCheck.wordResults[0].status).toBe("substituted");
    expect(patternCheck.accuracyPercent).toBe(0);
  });

  it("detects missing and substituted words cleanly", () => {
    const res = verifyVerseRecitation(AYAH_2_WORDS, "تلك آيات الكريم");
    expect(res.wordResults[0].status).toBe("correct");
    expect(res.wordResults[1].status).toBe("correct");
    expect(res.wordResults.some((w) => w.status === "missing")).toBe(true);
    expect(res.wordResults.some((w) => w.status === "substituted")).toBe(true);
    expect(res.accuracyPercent).toBe(50);
  });

  it("captures and penalizes extra spoken words in accuracyPercent", () => {
    const res = verifyVerseRecitation(AYAH_2_WORDS, "تلك آيات الكتاب الحكيم المبين");
    expect(res.extraWords).toEqual(["الحكيم"]);
    expect(res.correctCount).toBe(4);
    expect(res.accuracyPercent).toBe(80); // 4 / (4 + 1) = 80%
  });
});
