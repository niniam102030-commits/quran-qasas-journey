// src/learning/__tests__/recitationAlign.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BaseVerse } from "../../types/learning";
import { verifyVerseRecitation } from "../../services/recitationVerifier";
import {
  alignTranscriptToVerse,
  buildVerifierTranscriptFromAlignment,
  calibrationToMap,
  computePrecisionAccuracy,
  incrementCalibrationWord,
  MAX_CALIBRATION_ENTRIES,
  normalizeForAlign,
  segmentVerse,
  type RecitationCalibrationData,
} from "../recitationAlign";

const qasasPath = path.resolve(process.cwd(), "public/content/base/qasas.base.json");
const qasasVerses = JSON.parse(fs.readFileSync(qasasPath, "utf8")) as BaseVerse[];

function getVerse(n: number): BaseVerse {
  const v = qasasVerses.find((x) => x.n === n);
  if (!v) throw new Error(`Verse ${n} not found`);
  return v;
}

describe("recitationAlign — segmentVerse on real Al-Qasas verses (1-2)", () => {
  it("produces expected manual segments on 6 real Qasas verses (respecting waqf marks and 3..6 bounds)", () => {
    // آیه ۲ (۴ کلمه)
    const v2 = getVerse(2);
    expect(segmentVerse(v2.words.map((w) => ({ text: w.ar })))).toEqual([{ start: 0, end: 3 }]);

    // آیه ۳ (۹ کلمه بدون علامت وقف -> ۵ + ۴)
    const v3 = getVerse(3);
    expect(segmentVerse(v3.words.map((w) => ({ text: w.ar })))).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 8 },
    ]);

    // آیه ۵ (۱۲ کلمه بدون علامت وقف -> ۵ + ۴ + ۳)
    const v5 = getVerse(5);
    expect(segmentVerse(v5.words.map((w) => ({ text: w.ar })))).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 8 },
      { start: 9, end: 11 },
    ]);

    // آیه ۷ (۲۲ کلمه با وقف ۖ روی اندیس ۵ و ۱۵ -> ۶ + ۵ + ۵ + ۶)
    const v7 = getVerse(7);
    expect(segmentVerse(v7.words.map((w) => ({ text: w.ar })))).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 10 },
      { start: 11, end: 15 },
      { start: 16, end: 21 },
    ]);

    // آیه ۱۴ (۱۰ کلمه با وقف ۚ روی اندیس ۶ -> ۴ + ۳ + ۳)
    const v14 = getVerse(14);
    expect(segmentVerse(v14.words.map((w) => ({ text: w.ar })))).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 6 },
      { start: 7, end: 9 },
    ]);

    // آیه ۲۴ (۱۵ کلمه بدون علامت وقف -> ۵ + ۵ + ۵)
    const v24 = getVerse(24);
    expect(segmentVerse(v24.words.map((w) => ({ text: w.ar })))).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
    ]);
  });

  it("merges short (< 3 words) waqf segments with neighbors and enforces 3..6 word bounds across all multi-word Qasas verses", () => {
    for (const v of qasasVerses) {
      const segs = segmentVerse(v.words.map((w) => ({ text: w.ar })));
      expect(segs.length).toBeGreaterThan(0);
      expect(segs[0].start).toBe(0);
      expect(segs[segs.length - 1].end).toBe(v.words.length - 1);

      for (let i = 0; i < segs.length; i++) {
        const len = segs[i].end - segs[i].start + 1;
        if (v.words.length >= 3) {
          expect(len).toBeGreaterThanOrEqual(3);
          expect(len).toBeLessThanOrEqual(6);
        }
        if (i > 0) {
          expect(segs[i].start).toBe(segs[i - 1].end + 1);
        }
      }
    }
  });
});

describe("recitationAlign — alignTranscriptToVerse scenarios (1-1)", () => {
  const v3Words = getVerse(3).words.map((w) => w.ar);
  // [0:نَتْلُوا, 1:عَلَيْكَ, 2:مِن, 3:نَّبَإِ, 4:مُوسَىٰ, 5:وَفِرْعَوْنَ, 6:بِٱلْحَقِّ, 7:لِقَوْمٍ, 8:يُؤْمِنُونَ]

  it("1) full correct recitation marks all words matched with coverage=1 and confirmedErrors=0", () => {
    const spoken = ["نتلوا", "عليك", "من", "نبا", "موسى", "وفرعون", "بالحق", "لقوم", "يؤمنون"];
    const res = alignTranscriptToVerse(v3Words, spoken);

    expect(res.words.map((w) => w.state)).toEqual(new Array(9).fill("matched"));
    expect(res.coverage).toBe(1);
    expect(res.confirmedErrors).toBe(0);
    expect(res.extraWords).toBe(0);
  });

  it("2) deletion of one word marks the missing word uncertain and keeps remaining words matched", () => {
    // حذف «مُوسَىٰ» (اندیس ۴)
    const spoken = ["نتلوا", "عليك", "من", "نبا", "وفرعون", "بالحق", "لقوم", "يؤمنون"];
    const res = alignTranscriptToVerse(v3Words, spoken);

    expect(res.words[4].state).toBe("uncertain");
    expect(res.words.filter((_, idx) => idx !== 4).every((w) => w.state === "matched")).toBe(true);
    expect(res.confirmedErrors).toBe(0);
    expect(res.extraWords).toBe(0);
  });

  it("3) substitution of one word with a foreign word in a stable neighborhood marks it substituted", () => {
    // جایگزینی «مُوسَىٰ» (اندیس ۴) با کلمه بیگانه «ابراهيم»
    const spoken = ["نتلوا", "عليك", "من", "نبا", "ابراهيم", "وفرعون", "بالحق", "لقوم", "يؤمنون"];
    const res = alignTranscriptToVerse(v3Words, spoken);

    expect(res.words[4].state).toBe("substituted");
    expect(res.words[4].heard).toBe("ابراهيم");
    expect(res.words.filter((_, idx) => idx !== 4).every((w) => w.state === "matched")).toBe(true);
    expect(res.confirmedErrors).toBe(1);
  });

  it("4) noisy ASR output with gray-zone or consecutive distorted words marks them uncertain, never substituted", () => {
    // «علیک» -> «عليكم» (شباهت ۴/۵ = ۰٫۸ یا «عليه» ۳/۴ = ۰٫۷۵ خاکستری)، و دو کلمه متوالی ۴ و ۵ تحریف‌شدهٔ شدید
    const spoken = ["نتلوا", "عليه", "من", "نبا", "خشب", "قمر", "بالحق", "لقوم", "يعلمون"];
    const res = alignTranscriptToVerse(v3Words, spoken);

    // کلمه ۱ («عليه» در برابر «عليك»: شباهت ۰٫۷۵ در بازه خاکستری [0.5, 0.8)) -> uncertain
    expect(res.words[1].state).toBe("uncertain");
    // کلمات ۴ و ۵ («خشب»، «قمر»): دو تحریف متوالی -> ناحیه ناپایدار -> هر دو uncertain (هرگز substituted نمی‌شوند)
    expect(res.words[4].state).toBe("uncertain");
    expect(res.words[5].state).toBe("uncertain");
    // کلمه ۸ («يعلمون» در برابر «يومنون»: شباهت ۴/۶ = ۰٫۶۶ در بازه خاکستری) -> uncertain
    expect(res.words[8].state).toBe("uncertain");
    expect(res.confirmedErrors).toBe(0);
  });

  it("5) repetition / stutter of a word reports extraWords without marking any reference word wrong", () => {
    // تکرار «عليك» و «موسى»
    const spoken = ["نتلوا", "عليك", "عليك", "من", "نبا", "موسى", "موسى", "وفرعون", "بالحق", "لقوم", "يؤمنون"];
    const res = alignTranscriptToVerse(v3Words, spoken);

    expect(res.words.every((w) => w.state === "matched")).toBe(true);
    expect(res.confirmedErrors).toBe(0);
    expect(res.extraWords).toBe(2);
  });

  it("never marks a word substituted when tokenConfidence < 0.5 or similarity is in gray zone [0.5, 0.8)", () => {
    const spoken = ["نتلوا", "عليك", "من", "نبا", "ابراهيم", "وفرعون", "بالحق", "لقوم", "يؤمنون"];
    const confidences = [0.95, 0.95, 0.95, 0.95, 0.35, 0.95, 0.95, 0.95, 0.95];

    const res = alignTranscriptToVerse(v3Words, spoken, { tokenConfidences: confidences });
    expect(res.words[4].state).toBe("uncertain");
    expect(res.confirmedErrors).toBe(0);
  });
});

describe("recitationAlign — personal calibration & precision neutrality (sections 2 & 3)", () => {
  const v2Words = getVerse(2).words.map((w) => w.ar); // تِلْكَ ءَايَٰتُ ٱلْكِتَٰبِ ٱلْمُبِينِ

  it("caps calibrated words with >= 2 user confirmations at uncertain (never substituted) and enforces 500-entry limit", () => {
    let cal: RecitationCalibrationData = { confirmed: {} };
    // ۱ بار تأیید هنوز مصونیت کامل نمی‌دهد
    cal = incrementCalibrationWord(cal, v2Words[2]);
    const spokenForeign = ["تلك", "ايات", "فرعون", "المبين"];

    const res1 = alignTranscriptToVerse(v2Words, spokenForeign, {
      calibration: calibrationToMap(cal),
    });
    expect(res1.words[2].state).toBe("substituted");

    // بار دوم تأیید -> شمار = ۲ -> دیگر هرگز substituted نمی‌شود
    cal = incrementCalibrationWord(cal, v2Words[2]);
    expect(cal.confirmed[normalizeForAlign(v2Words[2])]).toBe(2);

    const res2 = alignTranscriptToVerse(v2Words, spokenForeign, {
      calibration: calibrationToMap(cal),
    });
    expect(res2.words[2].state).toBe("uncertain");
    expect(res2.confirmedErrors).toBe(0);

    // تست سقف ۵۰۰ مدخل و حذف کم‌شمارترین‌ها
    let bigCal = { confirmed: {} as Record<string, number> };
    for (let i = 1; i <= MAX_CALIBRATION_ENTRIES; i++) {
      bigCal.confirmed[`كلمه${i}`] = i === 1 ? 1 : 5;
    }
    bigCal = incrementCalibrationWord(bigCal, "كلمهجديد", MAX_CALIBRATION_ENTRIES);
    expect(Object.keys(bigCal.confirmed).length).toBe(MAX_CALIBRATION_ENTRIES);
    expect(bigCal.confirmed["كلمهجديد"]).toBe(1);
    expect(bigCal.confirmed["كلمه1"]).toBeUndefined();
  });

  it("excludes uncertain words from precision accuracy denominator and only sends unconfirmed substituted errors to verifier", () => {
    const aligned = [
      { ref: v2Words[0], state: "matched" as const },
      { ref: v2Words[1], state: "uncertain" as const },
      { ref: v2Words[2], state: "substituted" as const, heard: "السماء", userConfirmed: false },
      { ref: v2Words[3], state: "substituted" as const, heard: "العظيم", userConfirmed: true },
    ];

    // ۲ کلمه درست (matched + userConfirmed)، ۱ کلمه خطای قطعی، ۱ کلمه uncertain (خارج از مخرج) -> 2 / 3 = 67%
    expect(computePrecisionAccuracy(aligned)).toBe(67);

    // اگر خطای قطعی هم با لمس کاربر تأیید شود -> 3 / 3 = 100% (با وجود ۱ کلمه uncertain)
    const afterConfirm = aligned.map((w, i) => (i === 2 ? { ...w, state: "matched" as const, userConfirmed: true } : w));
    expect(computePrecisionAccuracy(afterConfirm)).toBe(100);

    // بررسی پل وریفایر: فقط کلمهٔ اندیس ۲ (substituted تأییدنشده) در verifyVerseRecitation خطا می‌شود
    const synth = buildVerifierTranscriptFromAlignment(aligned);
    const verified = verifyVerseRecitation(getVerse(2).words, synth);
    const errorWords = verified.wordResults.filter((w) => w.status !== "correct");
    expect(errorWords).toHaveLength(1);
    expect(errorWords[0].expectedAr).toBe(v2Words[2]);
  });
});

describe("recitationAlign — judgeRecitationAttempt (v1.5 attempt-level gates)", () => {
  const ref = ["قال", "رجل", "من", "المؤمنين", "صدقوا", "ما", "عاهدوا", "الله", "عليه"];

  it("silence (empty transcript) is no_speech, never uncertain-per-word judgement", async () => {
    const { judgeRecitationAttempt } = await import("../recitationAlign");
    const res = judgeRecitationAttempt(ref, []);
    expect(res.outcome).toBe("no_speech");
    expect(res.missedCount).toBe(0);
    expect(res.confirmedErrors).toBe(0);
  });

  it("completely unrelated speech is not_this_text with all words missed (coverage gate)", async () => {
    const { judgeRecitationAttempt } = await import("../recitationAlign");
    const res = judgeRecitationAttempt(ref, ["سلام", "دوستان", "امروز", "هوا", "خوب", "است", "برویم", "بیرون", "بازی"]);
    expect(res.outcome).toBe("not_this_text");
    expect(res.missedCount).toBe(ref.length);
    expect(res.words.every((w) => w.state === "missed")).toBe(true);
  });

  it("a different verse is rejected by the coverage gate", async () => {
    const { judgeRecitationAttempt } = await import("../recitationAlign");
    const other = getVerse(3).words.map((w) => w.ar);
    const res = judgeRecitationAttempt(ref, other);
    expect(res.outcome).toBe("not_this_text");
  });

  it("perfect recitation is judged with full coverage and no missed", async () => {
    const { judgeRecitationAttempt } = await import("../recitationAlign");
    const res = judgeRecitationAttempt(ref, [...ref]);
    expect(res.outcome).toBe("judged");
    expect(res.coverage).toBe(1);
    expect(res.missedCount).toBe(0);
    expect(res.heardRatio).toBe(1);
  });

  it("field case (2026-11-25 log): correct Qasas 28:2 as ASR hears it is fully matched at balanced", async () => {
    const { judgeRecitationAttempt, JUDGE_PROFILES } = await import("../recitationAlign");
    // کالیبراسیون میدانی: آستانهٔ متعادل ۰٫۷۵ قفل است؛ «ءايت» مدل برای «ءَايَٰتُ» دقیقاً ۰٫۷۵ می‌گیرد
    expect(JUDGE_PROFILES.balanced.matchSim).toBe(0.75);
    const verse2 = getVerse(2).words.map((w) => w.ar);
    const res = judgeRecitationAttempt(verse2, ["تلك", "ءايت", "الكتب", "المبين"]);
    expect(res.outcome).toBe("judged");
    expect(res.words.every((w) => w.state === "matched")).toBe(true);
  });

  it("a long omitted run becomes missed (island cap), a short gap stays uncertain", async () => {
    const { judgeRecitationAttempt } = await import("../recitationAlign");
    // omit 4 consecutive words in the middle (run of 4 > balanced cap of 2)
    const partial = [ref[0], ref[1], ref[6], ref[7], ref[8]];
    const res = judgeRecitationAttempt(ref, partial);
    expect(res.outcome).toBe("judged");
    expect(res.missedCount).toBeGreaterThanOrEqual(4);
    // omit a single word: stays uncertain, not missed
    const oneGap = ref.filter((_, i) => i !== 4);
    const res2 = judgeRecitationAttempt(ref, oneGap);
    expect(res2.words[4].state).toBe("uncertain");
    expect(res2.missedCount).toBe(0);
  });

  it("stricter profile rejects what the lenient profile tolerates", async () => {
    const { judgeRecitationAttempt } = await import("../recitationAlign");
    const half = ref.slice(0, 4);
    const lenient = judgeRecitationAttempt(ref, half, { profile: "lenient" });
    const strict = judgeRecitationAttempt(ref, half, { profile: "very_strict" });
    expect(strict.outcome).toBe("not_this_text");
    expect(lenient.coverage).toBeLessThan(0.5);
  });

  it("blind pass requires every word heard; uncertain never passes", async () => {
    const { isBlindRecitationPassed } = await import("../recitationAlign");
    expect(isBlindRecitationPassed([{ state: "matched" }, { state: "matched" }])).toBe(true);
    expect(isBlindRecitationPassed([{ state: "matched" }, { state: "uncertain" }])).toBe(false);
    expect(isBlindRecitationPassed([{ state: "matched" }, { state: "missed" }])).toBe(false);
  });

  it("missed counts as an error in precision accuracy and verifier transcript", async () => {
    const { computePrecisionAccuracy, buildVerifierTranscriptFromAlignment } = await import("../recitationAlign");
    const words = [
      { ref: "قال", state: "matched" as const },
      { ref: "رجل", state: "missed" as const },
    ];
    expect(computePrecisionAccuracy(words)).toBe(50);
    expect(buildVerifierTranscriptFromAlignment(words)).toBe("قال خطا");
  });
});
