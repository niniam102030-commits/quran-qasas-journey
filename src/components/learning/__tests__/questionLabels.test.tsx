import { describe, expect, it } from "vitest";
import { labelOption } from "../questionOptionLabel";

describe("question option labels", () => {
  it("renders word token text", () => {
    expect(labelOption({ id: "o1", words: ["موسى", "إلى", "المدين"] })).toBe("موسى إلى المدين");
  });

  it("renders a word range fallback with localized numbers", () => {
    expect(labelOption({ id: "o1", wordRange: { verse: 44, from: 9, to: 13 } })).toBe("آیه ۴۴، واژه‌های ۹ تا ۱۳");
  });

  it("uses resolved Arabic text when available", () => {
    expect(labelOption({ id: "o1", wordRange: { verse: 44, from: 9, to: 13 } }, { o1: "ٱلْأَمْرَ وَمَا" })).toBe("ٱلْأَمْرَ وَمَا");
  });

  it("falls back to fa when ar is an empty string", () => {
    expect(labelOption({ id: "r1", ar: "", fa: "آن سرزمین" })).toBe("آن سرزمین");
    expect(labelOption({ id: "r2", ar: "   ", fa: "پیشوایان مردم" })).toBe("پیشوایان مردم");
  });

  it("renders localized verse numbers from n field when num is absent", () => {
    expect(labelOption({ id: "l1", n: 24 })).toBe("۲۴");
  });

  it("renders wordsAr array as space-joined Arabic text", () => {
    expect(labelOption({ id: "o1", wordsAr: ["فَأَخَذْنَـٰهُ", "وَجُنُودَهُۥ"] })).toBe("فَأَخَذْنَـٰهُ وَجُنُودَهُۥ");
  });
});
