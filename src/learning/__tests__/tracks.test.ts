// src/learning/__tests__/tracks.test.ts
import { describe, expect, it } from "vitest";
import { questionAllowedInTrack, trackWorkRatio } from "../tracks";

describe("questionAllowedInTrack", () => {
  it("مسیر کامل همه را می‌پذیرد", () => {
    expect(questionAllowedInTrack("VERSE_TO_NUMBER", "full")).toBe(true);
    expect(questionAllowedInTrack("WORD_AR_TO_FA", "full")).toBe(true);
  });
  it("مسیر سبک فقط شماره‌ها را حذف می‌کند", () => {
    expect(questionAllowedInTrack("VERSE_TO_NUMBER", "light")).toBe(false);
    expect(questionAllowedInTrack("BUILD_FROM_NUMBER", "light")).toBe(false);
    expect(questionAllowedInTrack("WORD_AR_TO_FA", "light")).toBe(true);
  });
  it("مسیر واژگان فقط واژه و ترجمه است", () => {
    expect(questionAllowedInTrack("WORD_FA_TO_AR", "vocab")).toBe(true);
    expect(questionAllowedInTrack("CLOZE_FA", "vocab")).toBe(true);
    expect(questionAllowedInTrack("CLOZE_AR", "vocab")).toBe(false);
    expect(questionAllowedInTrack("NEXT_VERSE_CHOICE", "vocab")).toBe(false);
  });
  it("مسیر حفظ واژگان و شماره‌ها را حذف می‌کند", () => {
    expect(questionAllowedInTrack("WORD_AR_TO_FA", "hifz")).toBe(false);
    expect(questionAllowedInTrack("MATCH_NUMBER_OPENING", "hifz")).toBe(false);
    expect(questionAllowedInTrack("BUILD_NEXT_VERSE", "hifz")).toBe(true);
    expect(questionAllowedInTrack("MUTASHABIH_SPOT", "hifz")).toBe(true);
  });
  it("نسبت کار مسیرها بین ۰ و ۱ است", () => {
    expect(trackWorkRatio("full")).toBe(1);
    expect(trackWorkRatio("hifz")).toBeLessThan(trackWorkRatio("vocab"));
  });
});
