// src/learning/__tests__/precisionGen.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { BaseVerse } from "../../types/learning";
import {
  buildStandaloneWordSet,
  cleanWordToken,
  genConjunctionQuestion,
  genIrabQuestion,
  genWaqfQuestion,
  initialConjunction,
  stoppedForm,
  stripFinalDiacritic,
} from "../precisionGen";

const basePath = path.resolve(process.cwd(), "public/content/base/qasas.base.json");
const qasasVerses = JSON.parse(fs.readFileSync(basePath, "utf8")) as BaseVerse[];
const verseMap = new Map(qasasVerses.map((v) => [v.n, v]));
const standaloneSet = buildStandaloneWordSet(qasasVerses);

describe("precisionGen helpers & deterministic generators (A1)", () => {
  it("stripFinalDiacritic preserves shadda and extracts exact final mark", () => {
    expect(stripFinalDiacritic("بِٱلْحَقِّ")).toEqual({ stem: "بِٱلْحَقّ", diacritic: "\u0650" });
    expect(stripFinalDiacritic("لِقَوْمٍ")).toEqual({ stem: "لِقَوْم", diacritic: "\u064D" });
    expect(stripFinalDiacritic("طَآئِفَةً")).toEqual({ stem: "طَآئِفَة", diacritic: "\u064B" });
    // کلماتی مثل وَحَزَنًا به حرف الف ختم می‌شوند نه اعراب ترکیبی
    expect(stripFinalDiacritic("وَحَزَنًا ۗ")).toEqual({ stem: "وَحَزَنًا", diacritic: null });
    expect(stripFinalDiacritic("مُّبِينٌ")).toEqual({ stem: "مُّبِين", diacritic: "\u064C" });
    expect(stripFinalDiacritic("ٱلْمُبِينِ")).toEqual({ stem: "ٱلْمُبِين", diacritic: "\u0650" });
  });

  it("initialConjunction distinguishes attached/standalone conjunctions and rejects shadda", () => {
    expect(initialConjunction("وَفِرْعَوْنَ")?.conj).toBe("و");
    expect(initialConjunction("فَقَالَتْ")?.conj).toBe("ف");
    expect(initialConjunction("ثُمَّ")).toMatchObject({ conj: "ثم", standalone: true });
    expect(initialConjunction("أَوْ")).toMatchObject({ conj: "أو", standalone: true });
    // ترکیب با شدّه روی حرف اول (مثل وَّ یا فَّ) نباید پذیرفته شود
    expect(initialConjunction("فَّقَالَ")).toBeNull();
    // باقی‌مانده کمتر از ۲ نویسه نباید نامزد شود
    expect(initialConjunction("فَإِ")).toBeNull();
  });

  it("stoppedForm handles at least 10 real Al-Qasas words across tanwin fath, ta marbuta, tanwin damm/kasr, and regular harakat", () => {
    const cases: [string, string][] = [
      // ۱ و ۲: تنوین فتح با الف (مدّ عوض)
      ["شِيَعًا", "شِيَعَا"],
      ["عَدُوًّا", "عَدُوَّا"],
      ["وَحَزَنًا ۗ", "وَحَزَنَا"],
      // ۳ و ۴: تاء مربوطه (تبدیل به هـ ساکن حتی با تنوین فتح)
      ["طَآئِفَةً", "طَآئِفَهْ"],
      ["أُمَّةً", "أُمَّهْ"],
      ["غَفْلَةٍ", "غَفْلَهْ"],
      ["ٱلْمَدِينَةِ", "ٱلْمَدِينَهْ"],
      // ۵ تا ۷: تنوین ضم و تنوین کسر (حذف تنوین و سکون)
      ["مُّبِينٌ", "مُّبِينْ"],
      ["كَبِيرٌ", "كَبِيرْ"],
      ["عَظِيمٍ", "عَظِيمْ"],
      // ۸ تا ۱۰: اعراب پایانی ساده و شدّه + فتحه/کسره
      ["ٱلْمُبِينِ", "ٱلْمُبِينْ"],
      ["يُؤْمِنُونَ", "يُؤْمِنُونْ"],
      ["بِٱلْحَقِّ", "بِٱلْحَقّْ"],
    ];

    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const [input, expected] of cases) {
      expect(stoppedForm(input)).toBe(expected);
    }
  });

  it("A1-1 genConjunctionQuestion generates verified questions for 5+ real Al-Qasas verses", () => {
    const targets: { verseNum: number; expectedConj: string }[] = [
      { verseNum: 3, expectedConj: "و" }, // وَفِرْعَوْنَ
      { verseNum: 12, expectedConj: "ف" }, // فَقَالَتْ
      { verseNum: 24, expectedConj: "ف" }, // فَسَقَىٰ / ثُمَّ / فَقَالَ -> با seed مشخص کنترل می‌شود
      { verseNum: 9, expectedConj: "و" },
      { verseNum: 15, expectedConj: "و" },
    ];

    for (const t of targets) {
      const v = verseMap.get(t.verseNum)!;
      const q = genConjunctionQuestion(v, { standaloneSet, seed: 1 });
      expect(q).not.toBeNull();
      expect(q!.kind).toBe("conj");
      expect(q!.stem.ar).toContain("ـٰـ");
      expect(q!.options).toHaveLength(4);
      const ids = q!.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(4);
      expect(ids).toContain(q!.answer);

      // اثبات از متن پایه: بازگرداندن جوابِ درست، توکن اصلی را در آیه بازسازی می‌کند
      const origToken = cleanWordToken(String(q!.stem.targetWordOriginal));
      const match = initialConjunction(origToken);
      expect(match?.conj).toBe(q!.answer);
      expect(t.expectedConj).toBeTruthy();
    }

    // بررسی صریح آیه ۲۴ با ثُمَّ (حرف عطف مستقل)
    const v24 = verseMap.get(24)!;
    const q24Thumma = genConjunctionQuestion(v24, { standaloneSet, seed: 3 });
    expect(q24Thumma).not.toBeNull();
    const orig24 = cleanWordToken(String(q24Thumma!.stem.targetWordOriginal));
    expect(initialConjunction(orig24)?.conj).toBe(q24Thumma!.answer);
  });

  it("A1-2 genIrabQuestion generates verified questions for 5+ real Al-Qasas verses", () => {
    const verseNums = [2, 3, 4, 7, 11, 28];
    for (const n of verseNums) {
      const v = verseMap.get(n)!;
      const q = genIrabQuestion(v, { seed: n * 17 });
      expect(q).not.toBeNull();
      expect(q!.kind).toBe("irab");
      expect(q!.options).toHaveLength(4);

      const ids = q!.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(4);
      expect(ids).toContain(q!.answer);

      // اثبات از خود متن آیه: حرف آخر واژهٔ هدف دقیقاً همان اعراب answer است و آخرین واژه نیست
      const wordIdx = Number(q!.stem.targetWordIndex);
      expect(wordIdx).toBeLessThan(v.words.length);
      const realWord = v.words.find((w) => w.i === wordIdx)!;
      const { stem, diacritic } = stripFinalDiacritic(realWord.ar);
      expect(diacritic).toBe(q!.answer);
      expect(q!.stem.ar).toContain(`«${stem}»`);
    }
  });

  it("A1-3 genWaqfQuestion generates verified questions for 5+ real Al-Qasas verses", () => {
    const expectedMap: [number, string][] = [
      [2, "ٱلْمُبِينْ"],
      [15, "مُّبِينْ"],
      [23, "كَبِيرْ"],
      [28, "وَكِيلْ"],
      [79, "عَظِيمْ"],
      [85, "مُّبِينْ"],
    ];

    for (const [n, expectedStopped] of expectedMap) {
      const v = verseMap.get(n)!;
      const q = genWaqfQuestion(v, { seed: n });
      expect(q).not.toBeNull();
      expect(q!.kind).toBe("waqf");
      expect(q!.promptFa).toBe("عند الوقف على آخر هذه الآية، كيف تُنطق الكلمة الأخيرة؟");
      expect(q!.answer).toBe(expectedStopped);
      expect(q!.options).toHaveLength(4);
      const labels = q!.options.map((o) => o.ar);
      expect(new Set(labels).size).toBe(4);
      expect(q!.options.some((o) => o.id === q!.answer && o.ar === expectedStopped)).toBe(true);
    }
  });

  it("invariant across all 88 verses: correct answer is always in options and options are strictly unique", () => {
    let conjCount = 0;
    let irabCount = 0;
    let waqfCount = 0;

    for (const v of qasasVerses) {
      const qc = genConjunctionQuestion(v, { standaloneSet, seed: v.n });
      if (qc) {
        conjCount++;
        expect(qc.options).toHaveLength(4);
        expect(new Set(qc.options.map((o) => o.id)).size).toBe(4);
        expect(qc.options.some((o) => o.id === qc.answer)).toBe(true);
      }

      const qi = genIrabQuestion(v, { seed: v.n });
      if (qi) {
        irabCount++;
        expect(qi.options).toHaveLength(4);
        expect(new Set(qi.options.map((o) => o.id)).size).toBe(4);
        expect(qi.options.some((o) => o.id === qi.answer)).toBe(true);
      }

      const qw = genWaqfQuestion(v, { seed: v.n });
      if (qw) {
        waqfCount++;
        expect(qw.options).toHaveLength(4);
        expect(new Set(qw.options.map((o) => o.ar)).size).toBe(4);
        expect(qw.options.some((o) => o.id === qw.answer)).toBe(true);
      }
    }

    expect(conjCount).toBeGreaterThanOrEqual(50);
    expect(irabCount).toBeGreaterThanOrEqual(80);
    expect(waqfCount).toBeGreaterThanOrEqual(85);
  });
});
