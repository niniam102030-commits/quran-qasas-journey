// src/hooks/useContinuousPlay.ts
// هوک و کنترلر پخش پیوستهٔ واحد در مصحف (B3): پخش پشت‌سرهم آیات، هایلایت کلمه‌به‌کلمه و اسکرول خودکار قابل تنظیم
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAndCacheVerseAudio, getMenshawiUrls } from "../services/menshawiAudio";
import { findActiveWordAtMs, type WordAudioSegment } from "../services/qulReferenceService";

export type ContinuousPlayStatus = "idle" | "loading" | "playing" | "paused";

export interface AudioElementLike {
  src?: string;
  currentTime: number;
  ontimeupdate: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play: () => Promise<void>;
  pause: () => void;
}

export interface ContinuousPlayState {
  status: ContinuousPlayStatus;
  activeVerse: number | null;
  activeWord: { verse: number; wordIndex: number } | null;
  error: string | null;
}

/** ساخت صف مرتب و بدون تکرار آیات یک واحد */
export function buildContinuousVerseQueue(verses: readonly number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of verses) {
    if (Number.isInteger(v) && v > 0 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** انتخاب اندیس آیه بعد در پخش پیوسته؛ در پایان واحد null برمی‌گرداند */
export function nextContinuousIndex(currentIndex: number, total: number): number | null {
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || total <= 0) return null;
  const next = currentIndex + 1;
  return next < total ? next : null;
}

/** آیا هنگام تغییر آیه فعال باید اسکرول خودکار انجام شود؟ */
export function shouldAutoScrollVerse(autoFollow: boolean, activeVerse: number | null): boolean {
  return Boolean(autoFollow) && activeVerse !== null;
}

export interface ContinuousPlayControllerDeps {
  verses: number[];
  surahNumber?: number;
  audioTimings: Record<string, WordAudioSegment[]>;
  autoFollow: boolean;
  onScrollToVerse?: (verse: number) => void;
  onStateChange: (state: ContinuousPlayState) => void;
  fetchVerseBlob?: (verse: number, signal: AbortSignal, surah: number) => Promise<Blob>;
  createAudio?: (url: string) => AudioElementLike;
}

/**
 * کنترلر مستقل از DOM برای پخش پیوسته و دنبال‌کردن آیات — قابل تست واحد در Node و استفاده‌شده در هوک React
 */
export function createContinuousPlayController(deps: ContinuousPlayControllerDeps) {
  let verses = buildContinuousVerseQueue(deps.verses);
  let surahNumber = deps.surahNumber ?? 28;
  let audioTimings = deps.audioTimings;
  let autoFollow = deps.autoFollow;
  let onScrollToVerse = deps.onScrollToVerse;
  const fetchVerseBlob = deps.fetchVerseBlob ?? fetchAndCacheVerseAudio;
  const createAudio = deps.createAudio ?? ((url) => new Audio(url) as unknown as AudioElementLike);

  let state: ContinuousPlayState = {
    status: "idle",
    activeVerse: null,
    activeWord: null,
    error: null,
  };

  let audio: AudioElementLike | null = null;
  let objectUrl: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let abortController: AbortController | null = null;
  let runId = 0;

  const setState = (patch: Partial<ContinuousPlayState>) => {
    state = { ...state, ...patch };
    deps.onStateChange(state);
  };

  const clearTimersAndAudio = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (audio) {
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio = null;
    }
    if (objectUrl) {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
      objectUrl = null;
    }
  };

  const stop = () => {
    runId += 1;
    clearTimersAndAudio();
    setState({ status: "idle", activeVerse: null, activeWord: null });
  };

  const updateWordFor = (verse: number, curAudio: AudioElementLike, myRunId: number) => {
    if (myRunId !== runId) return;
    const ms = Number.isFinite(curAudio.currentTime) ? curAudio.currentTime * 1000 : 0;
    const wordIdx = findActiveWordAtMs(audioTimings[String(verse)], ms);
    const prev = state.activeWord;
    if (wordIdx === null) {
      if (prev !== null) setState({ activeWord: null });
    } else if (!prev || prev.verse !== verse || prev.wordIndex !== wordIdx) {
      setState({ activeWord: { verse, wordIndex: wordIdx } });
    }
  };

  const playVerseAtIndex = async (index: number, myRunId: number) => {
    if (myRunId !== runId || index < 0 || index >= verses.length) {
      if (myRunId === runId) stop();
      return;
    }

    const verse = verses[index];
    clearTimersAndAudio();
    const controller = new AbortController();
    abortController = controller;

    setState({ status: "loading", activeVerse: verse, activeWord: null, error: null });

    if (shouldAutoScrollVerse(autoFollow, verse)) {
      onScrollToVerse?.(verse);
    }

    let playUrl: string;
    try {
      const blob = await fetchVerseBlob(verse, controller.signal, surahNumber);
      if (myRunId !== runId || controller.signal.aborted) return;
      playUrl =
        typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(blob)
          : `blob://verse-${surahNumber}-${verse}`;
      objectUrl = playUrl;
    } catch (err) {
      if (myRunId !== runId || controller.signal.aborted) return;
      const fallback = getMenshawiUrls(verse, surahNumber)[0];
      if (!fallback) {
        setState({ error: err instanceof Error ? err.message : "خطا در بارگذاری صوت آیه" });
        stop();
        return;
      }
      playUrl = fallback;
    }

    const curAudio = createAudio(playUrl);
    audio = curAudio;

    curAudio.ontimeupdate = () => updateWordFor(verse, curAudio, myRunId);
    curAudio.onended = () => {
      if (myRunId !== runId) return;
      const nextIdx = nextContinuousIndex(index, verses.length);
      if (nextIdx === null) {
        stop();
      } else {
        void playVerseAtIndex(nextIdx, myRunId);
      }
    };
    curAudio.onerror = () => {
      if (myRunId !== runId) return;
      setState({ error: `خطا در پخش صوت آیه ${verse}` });
      stop();
    };

    try {
      await curAudio.play();
      if (myRunId !== runId) {
        curAudio.pause();
        return;
      }
      setState({ status: "playing" });
      timer = setInterval(() => updateWordFor(verse, curAudio, myRunId), 65);
    } catch (err) {
      if (myRunId === runId) {
        setState({ error: err instanceof Error ? err.message : `پخش آیه ${verse} متوقف شد` });
        stop();
      }
    }
  };

  const start = (startIndex = 0) => {
    if (verses.length === 0) return;
    const myRunId = ++runId;
    const clamped = Math.max(0, Math.min(startIndex, verses.length - 1));
    void playVerseAtIndex(clamped, myRunId);
  };

  const togglePause = async () => {
    if (!audio) return;
    if (state.status === "playing") {
      audio.pause();
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      setState({ status: "paused" });
    } else if (state.status === "paused") {
      const myRunId = runId;
      const verse = state.activeVerse;
      try {
        await audio.play();
        if (myRunId !== runId) return;
        setState({ status: "playing" });
        if (verse !== null && audio) {
          const curAudio = audio;
          timer = setInterval(() => updateWordFor(verse, curAudio, myRunId), 65);
        }
      } catch {
        stop();
      }
    }
  };

  const updateOptions = (next: Partial<Pick<ContinuousPlayControllerDeps, "verses" | "surahNumber" | "audioTimings" | "autoFollow" | "onScrollToVerse">>) => {
    if (next.verses) verses = buildContinuousVerseQueue(next.verses);
    if (next.surahNumber !== undefined) surahNumber = next.surahNumber;
    if (next.audioTimings) audioTimings = next.audioTimings;
    if (next.autoFollow !== undefined) autoFollow = next.autoFollow;
    if (next.onScrollToVerse !== undefined) onScrollToVerse = next.onScrollToVerse;
  };

  return {
    getState: () => state,
    start,
    togglePause,
    stop,
    updateOptions,
  };
}

export interface UseContinuousPlayOptions {
  verses: number[];
  surahNumber?: number;
  audioTimings: Record<string, WordAudioSegment[]>;
  autoFollow: boolean;
  onScrollToVerse?: (verse: number) => void;
  fetchVerseBlob?: (verse: number, signal: AbortSignal, surah: number) => Promise<Blob>;
  createAudio?: (url: string) => AudioElementLike;
}

export function useContinuousPlay(opts: UseContinuousPlayOptions) {
  const [state, setState] = useState<ContinuousPlayState>({
    status: "idle",
    activeVerse: null,
    activeWord: null,
    error: null,
  });

  const controllerRef = useRef<ReturnType<typeof createContinuousPlayController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createContinuousPlayController({
      ...opts,
      onStateChange: setState,
    });
  }

  useEffect(() => {
    controllerRef.current?.updateOptions({
      verses: opts.verses,
      surahNumber: opts.surahNumber,
      audioTimings: opts.audioTimings,
      autoFollow: opts.autoFollow,
      onScrollToVerse: opts.onScrollToVerse,
    });
  }, [opts.verses, opts.surahNumber, opts.audioTimings, opts.autoFollow, opts.onScrollToVerse]);

  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
    };
  }, []);

  const start = useCallback((startIndex = 0) => controllerRef.current?.start(startIndex), []);
  const togglePause = useCallback(() => controllerRef.current?.togglePause(), []);
  const stop = useCallback(() => controllerRef.current?.stop(), []);

  return {
    ...state,
    start,
    togglePause,
    stop,
  };
}
