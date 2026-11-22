import { describe, it, expect } from "vitest";
import { diffVersePair, findMutashabihatPairs, normalizeArabic } from "../mutashabihat";

describe("mutashabihat", () => {
  it("normalizes Uthmani diacritics and alef variants", () => {
    expect(normalizeArabic("ٱلْمُبِينِ")).toBe("المبين");
    expect(normalizeArabic("أَصْبَحَ")).toBe("اصبح");
  });

  it("detects similar verses and computes word-level diff", () => {
    const verses = [
      { n: 15, arText: "وَدَخَلَ ٱلْمَدِينَةَ عَلَىٰ حِينِ غَفْلَةٍ مِّنْ أَهْلِهَا" },
      { n: 18, arText: "فَأَصْبَحَ فِى ٱلْمَدِينَةِ خَآئِفًا يَتَرَقَّبُ" },
      { n: 21, arText: "فَخَرَجَ مِنْهَا خَآئِفًا يَتَرَقَّبُ قَالَ رَبِّ نَجِّنِى مِنَ ٱلْقَوْمِ ٱلظَّـٰلِمِينَ" },
    ];

    const pairs = findMutashabihatPairs(verses, 0.2);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].verseA).toBe(18);
    expect(pairs[0].verseB).toBe(21);

    const diff = diffVersePair(verses[1], verses[2]);
    const sharedB = diff.wordsB.filter((w) => w.shared).map((w) => normalizeArabic(w.ar));
    expect(sharedB).toContain("خائفا");
    expect(sharedB).toContain("يترقب");
    const uniqueB = diff.wordsB.filter((w) => !w.shared).map((w) => normalizeArabic(w.ar));
    expect(uniqueB).toContain("فخرج");
  });
});
