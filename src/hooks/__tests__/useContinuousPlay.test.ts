// src/hooks/__tests__/useContinuousPlay.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  buildContinuousVerseQueue,
  createContinuousPlayController,
  nextContinuousIndex,
  shouldAutoScrollVerse,
  type AudioElementLike,
  type ContinuousPlayState,
} from "../useContinuousPlay";

function makeFakeAudio(): AudioElementLike & { triggerEnded: () => void } {
  const obj: AudioElementLike & { triggerEnded: () => void } = {
    currentTime: 0,
    ontimeupdate: null,
    onended: null,
    onerror: null,
    play: vi.fn(async () => {}),
    pause: vi.fn(() => {}),
    triggerEnded: () => {
      obj.onended?.();
    },
  };
  return obj;
}

describe("useContinuousPlay (B3)", () => {
  it("builds deduplicated ordered verse queue and selects next index until end of unit", () => {
    expect(buildContinuousVerseQueue([1, 2, 2, 3, -1, 4])).toEqual([1, 2, 3, 4]);
    expect(nextContinuousIndex(0, 3)).toBe(1);
    expect(nextContinuousIndex(1, 3)).toBe(2);
    expect(nextContinuousIndex(2, 3)).toBeNull();
    expect(shouldAutoScrollVerse(true, 5)).toBe(true);
    expect(shouldAutoScrollVerse(false, 5)).toBe(false);
    expect(shouldAutoScrollVerse(true, null)).toBe(false);
  });

  it("plays unit verses in exact order, scrolls when autoFollow=true, highlights words, and resets at end", async () => {
    const audioInstances: ReturnType<typeof makeFakeAudio>[] = [];
    const scrolled: number[] = [];
    let latestState: ContinuousPlayState = { status: "idle", activeVerse: null, activeWord: null, error: null };

    const ctrl = createContinuousPlayController({
      verses: [10, 11, 12],
      surahNumber: 28,
      audioTimings: {
        "10": [[1, 0, 500], [2, 500, 1200]],
        "11": [[1, 0, 700]],
        "12": [[1, 0, 600]],
      },
      autoFollow: true,
      onScrollToVerse: (v) => scrolled.push(v),
      onStateChange: (s) => {
        latestState = s;
      },
      fetchVerseBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
      createAudio: () => {
        const a = makeFakeAudio();
        audioInstances.push(a);
        return a;
      },
    });

    ctrl.start(0);
    await vi.waitFor(() => expect(latestState.status).toBe("playing"));
    expect(latestState.activeVerse).toBe(10);
    expect(scrolled).toEqual([10]);

    // شبیه‌سازی پیشرفت صوت برای هایلایت کلمه دوم آیه ۱۰
    audioInstances[0].currentTime = 0.65;
    audioInstances[0].ontimeupdate?.();
    expect(latestState.activeWord).toEqual({ verse: 10, wordIndex: 2 });

    // پایان آیه ۱۰ ⇒ رفتن به آیه ۱۱
    audioInstances[0].triggerEnded();
    await vi.waitFor(() => expect(latestState.activeVerse).toBe(11));
    await vi.waitFor(() => expect(latestState.status).toBe("playing"));
    expect(scrolled).toEqual([10, 11]);

    // پایان آیه ۱۱ ⇒ رفتن به آیه ۱۲
    audioInstances[1].triggerEnded();
    await vi.waitFor(() => expect(latestState.activeVerse).toBe(12));
    await vi.waitFor(() => expect(latestState.status).toBe("playing"));
    expect(scrolled).toEqual([10, 11, 12]);

    // پایان آیه ۱۲ (آخرین آیه واحد) ⇒ توقف و پاکسازی state
    audioInstances[2].triggerEnded();
    expect(latestState.status).toBe("idle");
    expect(latestState.activeVerse).toBeNull();
    expect(latestState.activeWord).toBeNull();
  });

  it("does not scroll when autoFollow=false and stops cleanly on pause/exit", async () => {
    const audioInstances: ReturnType<typeof makeFakeAudio>[] = [];
    const scrolled: number[] = [];
    let latestState: ContinuousPlayState = { status: "idle", activeVerse: null, activeWord: null, error: null };

    const ctrl = createContinuousPlayController({
      verses: [1, 2],
      surahNumber: 28,
      audioTimings: {},
      autoFollow: false,
      onScrollToVerse: (v) => scrolled.push(v),
      onStateChange: (s) => {
        latestState = s;
      },
      fetchVerseBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
      createAudio: () => {
        const a = makeFakeAudio();
        audioInstances.push(a);
        return a;
      },
    });

    ctrl.start(0);
    await vi.waitFor(() => expect(latestState.status).toBe("playing"));
    expect(scrolled).toEqual([]);

    await ctrl.togglePause();
    expect(latestState.status).toBe("paused");
    expect(audioInstances[0].pause).toHaveBeenCalled();

    ctrl.stop();
    expect(latestState.status).toBe("idle");
    expect(latestState.activeVerse).toBeNull();
  });
});
