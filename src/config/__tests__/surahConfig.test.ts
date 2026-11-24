import { describe, it, expect } from "vitest";
import {
  ACTIVE_SURAH,
  SURAH_PACK_REGISTRY,
  formatSurahCardKey,
  parseSurahCardKey,
  getSurahByNumber,
} from "../surahConfig";

describe("surahConfig multi-surah architecture", () => {
  it("registers Surah 28 (Al-Qasas) as installed active pack", () => {
    expect(ACTIVE_SURAH.number).toBe(28);
    expect(ACTIVE_SURAH.slug).toBe("qasas");
    expect(ACTIVE_SURAH.verseCount).toBe(88);
    expect(SURAH_PACK_REGISTRY.length).toBeGreaterThanOrEqual(1);
    expect(getSurahByNumber(28)?.installed).toBe(true);
  });

  it("preserves legacy key format for Surah 28 and namespaces other surahs", () => {
    expect(formatSurahCardKey("vr", 5, 28)).toBe("vr:5");
    expect(formatSurahCardKey("vr", 255, 2)).toBe("vr:2:255");
    expect(formatSurahCardKey("w", "w36_001_001", 36)).toBe("w:36:w36_001_001");
  });

  it("parses both legacy and multi-surah card keys accurately", () => {
    expect(parseSurahCardKey("vr:12")).toEqual({ kind: "vr", surahNumber: 28, targetId: "12" });
    expect(parseSurahCardKey("vt:36:12")).toEqual({ kind: "vt", surahNumber: 36, targetId: "12" });
    expect(parseSurahCardKey("invalid")).toBeNull();
    expect(parseSurahCardKey("vr:999:1")).toBeNull();
  });
});
