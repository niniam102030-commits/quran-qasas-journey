import { describe, it, expect } from "vitest";
import { getMenshawiUrls } from "../menshawiAudio";

describe("menshawiAudio.getMenshawiUrls", () => {
  it("defaults to Surah 28 (Al-Qasas) with zero-padded verse number", () => {
    const urls = getMenshawiUrls(5);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe("https://verses.quran.com/Minshawi/Murattal/mp3/028005.mp3");
    expect(urls[1]).toBe("https://audio.qurancdn.com/Minshawi/Murattal/mp3/028005.mp3");
    expect(urls[2]).toBe("https://everyayah.com/data/Minshawy_Murattal_128kbps/028005.mp3");
  });

  it("supports custom surah numbers for multi-surah packs", () => {
    const urls = getMenshawiUrls(255, 2);
    expect(urls[0]).toBe("https://verses.quran.com/Minshawi/Murattal/mp3/002255.mp3");
    expect(urls[2]).toBe("https://everyayah.com/data/Minshawy_Murattal_128kbps/002255.mp3");
  });
});
