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
});
