import { describe, expect, it } from "vitest";
import { buildFaClozeModel, faClozeServable, type FaClozeQuestion } from "../faCloze";
import { stagePassed } from "../mastery";

// آینه‌ی q_u_p385b_C_0064: ساقه فقط hiddenIdx دارد و پاسخ‌ها فقط داخل
// ترجمه‌ی کاملِ متنِ explanationFa پیدا می‌شوند (مد ۶).
const explanationOnly: FaClozeQuestion = {
  stem: { verse: 5, hiddenIdx: [1, 2, 3] },
  bank: [
    { id: "b1", fa: "نعمت های باارزش دهیم" },
    { id: "b2", fa: "پیشوایان مردم" },
    { id: "b3", fa: "وارثان [اموال، ثروت ها و سرزمین های فرعونیان] گردانیم" },
    { id: "b4", fa: "گروه گروه ساخت" },
    { id: "b5", fa: "بر تو می‌خوانیم" },
  ],
  answer: { "1": "b1", "2": "b2", "3": "b3" },
  explanationFa:
    "ترجمه کامل آیه ۵: «و ما می‌خواستیم به آنان که در آن سرزمین به ناتوانی و زبونی گرفته شده بودند، نعمت های باارزش دهیم، و آنان را پیشوایان مردم و وارثان [اموال، ثروت ها و سرزمین های فرعونیان] گردانیم.»",
};

const unbuildable: FaClozeQuestion = {
  stem: { verse: 5, hiddenIdx: [1, 2] },
  bank: [
    { id: "b1", fa: "عبارت الف" },
    { id: "b2", fa: "عبارت ب" },
  ],
  answer: { "1": "b1", "2": "b2" },
  explanationFa: "توضیحی بدون متن کامل ترجمه.",
};

describe("buildFaClozeModel — مد ۶ (explanationFa)", () => {
  it("از ترجمه‌ی کاملِ داخل توضیح، قالب می‌سازد و کلیدها به ترتیب متن‌اند", () => {
    const model = buildFaClozeModel(explanationOnly, null);
    expect(model).not.toBeNull();
    expect(model!.keys).toEqual(["1", "2", "3"]);
    expect(model!.parts.length).toBe(4);
    expect(model!.parts[0]).toContain("و ما می‌خواستیم");
    expect(faClozeServable(explanationOnly, null)).toBe(true);
  });

  it("سؤالِ بدون هیچ متنِ قابل‌استخراج، نساختنی است و نباید سرو شود", () => {
    expect(buildFaClozeModel(unbuildable, "ترجمه‌ی پایه‌ی نامرتبط")).toBeNull();
    expect(faClozeServable(unbuildable, null)).toBe(false);
  });
});

describe("stagePassed — حداقلِ مقیاس‌شده با طول صف", () => {
  const att = (n: number, correct = true) =>
    Array.from({ length: n }, () => ({ stage: 1, correct, usedHint: false }));

  it("پیش‌فرض: کمتر از ۴ تلاش اول هرگز پاس نیست", () => {
    expect(stagePassed(att(1), 1)).toBe(false);
    expect(stagePassed(att(3), 1)).toBe(false);
  });

  it("با حداقلِ برابرِ طول صف، درس کوتاهِ کامل پاس می‌شود", () => {
    expect(stagePassed(att(1), 1, 1)).toBe(true);
    expect(stagePassed(att(3), 1, 3)).toBe(true);
  });

  it("نسبت همچنان لازم است", () => {
    expect(stagePassed([...att(2), ...att(2, false)], 1, 4)).toBe(false);
  });
});
