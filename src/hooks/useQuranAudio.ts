// src/hooks/useQuranAudio.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../db/database";
import { audioCacheService } from "../db/audioCacheService";
import type { VerseData, VoiceClip } from "../types/schema";

export type PlaybackSpeed = 1.0 | 0.75; // 1.0: سرعت عادی، 0.75: سرعت تدبر

export interface AudioPlaybackState {
    isPlaying: boolean;
    activeUrl: string | null;
    activeVerseId: string | null;
    activeWordId: string | null;     // شناسه کلمه‌ای که همین لحظه در تلاوت استاد منشاوی خوانده می‌شود
    currentTimeMs: number;
    durationMs: number;
    playbackSpeed: PlaybackSpeed;
    audioEnergy: number;             // عددی بین 0 تا 1 برای رقص نور هاله صوتی (AudioWaveHalo)
}

type StateListener = (state: AudioPlaybackState) => void;

/**
 * سرویس مرکزی پخش صوت (Singleton) با پشتیبانی از:
 * ۱. کارائوکه کلمه‌به‌کلمه تلاوت استاد منشاوی با دقت ۶۰ فریم بر ثانیه
 * ۲. سوئیچ خودکار به فایل‌های تک‌کلمه QuranWBW در صورت عدم دسترسی به صوت کامل یا کلیک روی کلمه
 * ۳. استخراج انرژی موج صوتی برای هاله نورانی دور قاب میزبان/قاری
 */
class QuranAudioController {
    private audio: HTMLAudioElement;
    private rafId: number | null = null;
    private currentVerse: VerseData | null = null;
    private listeners: Set<StateListener> = new Set();

    // Web Audio API برای تحلیل واقعی فرکانس صوت (با فال‌بک ریاضی در صورت محدودیت مرورگر)
    private audioCtx: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private sourceNode: MediaElementAudioSourceNode | null = null;
    private freqData: Uint8Array<ArrayBuffer> | null = null;

    private state: AudioPlaybackState = {
        isPlaying: false,
        activeUrl: null,
        activeVerseId: null,
        activeWordId: null,
        currentTimeMs: 0,
        durationMs: 0,
        playbackSpeed: 1.0,
        audioEnergy: 0,
    };

    constructor() {
        this.audio = new Audio();
        this.audio.preload = "auto";
        this.bindAudioEvents();
    }

    private bindAudioEvents() {
        this.audio.addEventListener("loadedmetadata", () => {
            this.updateState({
                durationMs: Math.round((this.audio.duration || 0) * 1000),
            });
        });

        this.audio.addEventListener("play", () => {
            this.updateState({ isPlaying: true });
            this.startSyncLoop();
        });

        this.audio.addEventListener("pause", () => {
            this.stopSyncLoop();
            this.updateState({ isPlaying: false, audioEnergy: 0 });
        });

        this.audio.addEventListener("ended", () => {
            this.stopSyncLoop();
            this.updateState({
                isPlaying: false,
                activeWordId: null,
                currentTimeMs: 0,
                audioEnergy: 0,
            });
        });
    }

    private initWebAudioAnalyser() {
        if (this.analyser || typeof window === "undefined") return;
        try {
            const AudioContextClass =
                window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) return;

            this.audioCtx = new AudioContextClass();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 64;
            this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        } catch {
            // در صورت محدودیت WebView، از موج سینوسی طبیعی جایگزین استفاده می‌شود
        }
    }

    private computeCurrentEnergy(timeMs: number): number {
        if (this.analyser && this.freqData) {
            this.analyser.getByteFrequencyData(this.freqData);
            let sum = 0;
            for (let i = 0; i < this.freqData.length; i++) {
                sum += this.freqData[i];
            }
            const avg = sum / (this.freqData.length * 255);
            if (avg > 0.02) return Math.min(1, avg * 1.6);
        }
        // منحنی طبیعی شبیه‌ساز طنین صوت در حالت آفلاین/محدودیت CORS
        const wave1 = Math.sin(timeMs * 0.012) * 0.35;
        const wave2 = Math.cos(timeMs * 0.027) * 0.25;
        return Math.max(0.15, Math.min(0.95, 0.5 + wave1 + wave2));
    }

    private startSyncLoop() {
        this.stopSyncLoop();

        const tick = () => {
            if (this.audio.paused) return;

            const currentTimeMs = Math.round(this.audio.currentTime * 1000);
            let matchedWordId: string | null = this.state.activeWordId;

            if (this.currentVerse && this.currentVerse.wordTimestamps.length > 0) {
                const matched = this.currentVerse.wordTimestamps.find(
                    (ts) => currentTimeMs >= ts.startMs && currentTimeMs <= ts.endMs
                );
                matchedWordId = matched ? matched.wordId : null;
            }

            const energy = this.computeCurrentEnergy(currentTimeMs);

            this.updateState({
                currentTimeMs,
                activeWordId: matchedWordId,
                audioEnergy: energy,
            });

            this.rafId = requestAnimationFrame(tick);
        };

        this.rafId = requestAnimationFrame(tick);
    }

    private stopSyncLoop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private updateState(partial: Partial<AudioPlaybackState>) {
        this.state = { ...this.state, ...partial };
        this.listeners.forEach((listener) => listener(this.state));
    }

    subscribe(listener: StateListener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => {
            this.listeners.delete(listener);
        };
    }

    getState(): AudioPlaybackState {
        return this.state;
    }

    setPlaybackSpeed(speed: PlaybackSpeed) {
        this.audio.playbackRate = speed;
        this.updateState({ playbackSpeed: speed });
    }

    stop() {
        this.stopSyncLoop();
        this.audio.pause();
        this.audio.currentTime = 0;
        this.currentVerse = null;
        this.updateState({
            isPlaying: false,
            activeWordId: null,
            currentTimeMs: 0,
            audioEnergy: 0,
        });
    }

    /**
     * پخش تلاوت کامل آیه با صدای استاد منشاوی + هایلایت کلمه‌به‌کلمه.
     * اگر فایل صوتی کامل آیه در دسترس نبود، به صورت خودکار کلمات آیه را
     * یکی‌یکی از دیتاست پشتیبان QuranWBW به ترتیب زنجیره‌ای پخش و هایلایت می‌کند.
     */
    async playVerse(verse: VerseData, cityId: string = "global"): Promise<void> {
        this.stop();
        this.initWebAudioAnalyser();
        if (this.audioCtx?.state === "suspended") {
            await this.audioCtx.resume().catch(() => { });
        }

        this.currentVerse = verse;
        const resolvedUrl = await audioCacheService.resolvePlayableUrl(
            verse.menshawiAudioUrl,
            cityId
        );

        try {
            this.audio.src = resolvedUrl;
            this.audio.playbackRate = this.state.playbackSpeed;
            this.updateState({
                activeUrl: verse.menshawiAudioUrl,
                activeVerseId: verse.id,
                activeWordId: verse.wordTimestamps[0]?.wordId ?? null,
            });
            await this.audio.play();
        } catch {
            // فعال‌سازی پشتیبان خودکار QuranWBW در صورت عدم بارگذاری فایل اصلی آیه
            await this.playVerseViaWbwFallback(verse, cityId);
        }
    }

    /**
     * پشتیبان پخش ترتیبی کلمه‌به‌کلمه (QuranWBW Fallback)
     */
    private async playVerseViaWbwFallback(verse: VerseData, cityId: string): Promise<void> {
        for (const ts of verse.wordTimestamps) {
            const word = await db.words.get(ts.wordId);
            if (!word?.audioWbwUrl) continue;

            this.updateState({
                activeVerseId: verse.id,
                activeWordId: word.id,
                isPlaying: true,
                audioEnergy: 0.75,
            });

            await this.playSingleWordByUrl(word.audioWbwUrl, word.id, cityId);
        }

        this.updateState({
            isPlaying: false,
            activeWordId: null,
            audioEnergy: 0,
        });
    }

    /**
     * پخش صوت تلفظ یک کلمه مجزا از دیتاست QuranWBW
     */
    async playSingleWord(wordId: string, cityId: string = "global"): Promise<void> {
        const word = await db.words.get(wordId);
        if (!word?.audioWbwUrl) return;
        await this.playSingleWordByUrl(word.audioWbwUrl, word.id, cityId);
    }

    async playSingleWordByUrl(
        audioWbwUrl: string,
        wordId: string | null = null,
        cityId: string = "global"
    ): Promise<void> {
        this.stop();
        this.initWebAudioAnalyser();
        if (this.audioCtx?.state === "suspended") {
            await this.audioCtx.resume().catch(() => { });
        }

        const resolvedUrl = await audioCacheService.resolvePlayableUrl(audioWbwUrl, cityId);

        return new Promise((resolve) => {
            const handleEnded = () => {
                this.audio.removeEventListener("ended", handleEnded);
                this.audio.removeEventListener("error", handleEnded);
                resolve();
            };

            this.audio.addEventListener("ended", handleEnded);
            this.audio.addEventListener("error", handleEnded);

            this.audio.src = resolvedUrl;
            this.audio.playbackRate = this.state.playbackSpeed;
            this.updateState({
                activeUrl: audioWbwUrl,
                activeVerseId: null,
                activeWordId: wordId,
            });

            this.audio.play().catch(() => {
                handleEnded();
            });
        });
    }

    /**
     * پخش صوت تشویقی شخصیت میزبان در پایان مرحله («احسنت»، «طیب‌الله انفاسکم»)
     * همراه با شبیه‌ساز موج صوتی در صورت نبودن فایل فیزیکی در محیط تست
     */
    async playHostVoiceClip(clip: VoiceClip, cityId: string = "global"): Promise<void> {
        this.stop();
        this.initWebAudioAnalyser();
        if (this.audioCtx?.state === "suspended") {
            await this.audioCtx.resume().catch(() => { });
        }

        const resolvedUrl = await audioCacheService.resolvePlayableUrl(clip.audioUrl, cityId);

        try {
            this.audio.src = resolvedUrl;
            this.audio.playbackRate = 1.0;
            this.updateState({
                activeUrl: clip.audioUrl,
                activeVerseId: null,
                activeWordId: null,
            });
            await this.audio.play();
        } catch {
            // اگر فایل صوتی در محیط توسعه هنوز قرار نگرفته باشد، هاله صوتی را به مدت durationMs فعال نگه می‌دارد
            const duration = clip.durationMs || 2600;
            const start = performance.now();
            this.updateState({ isPlaying: true, activeUrl: clip.audioUrl });

            const simulate = (now: number) => {
                const elapsed = now - start;
                if (elapsed >= duration) {
                    this.updateState({ isPlaying: false, audioEnergy: 0, activeUrl: null });
                    return;
                }
                const energy = this.computeCurrentEnergy(elapsed);
                this.updateState({ currentTimeMs: elapsed, audioEnergy: energy });
                this.rafId = requestAnimationFrame(simulate);
            };
            this.rafId = requestAnimationFrame(simulate);
        }
    }
}

export const audioService = new QuranAudioController();

/**
 * هوک React برای اتصال کامپوننت‌ها به موتور صوتی قرآن و میزبان
 */
export function useQuranAudio(cityId: string = "global") {
    const [playbackState, setPlaybackState] = useState<AudioPlaybackState>(
        audioService.getState()
    );
    const cityIdRef = useRef(cityId);
    cityIdRef.current = cityId;

    useEffect(() => {
        const unsubscribe = audioService.subscribe(setPlaybackState);
        return () => {
            unsubscribe();
        };
    }, []);

    const playVerse = useCallback(async (verse: VerseData) => {
        await audioService.playVerse(verse, cityIdRef.current);
    }, []);

    const playWord = useCallback(async (wordId: string) => {
        await audioService.playSingleWord(wordId, cityIdRef.current);
    }, []);

    const playHostClip = useCallback(async (clip: VoiceClip) => {
        await audioService.playHostVoiceClip(clip, cityIdRef.current);
    }, []);

    const toggleSpeed = useCallback(() => {
        const nextSpeed: PlaybackSpeed =
            playbackState.playbackSpeed === 1.0 ? 0.75 : 1.0;
        audioService.setPlaybackSpeed(nextSpeed);
    }, [playbackState.playbackSpeed]);

    const stopAudio = useCallback(() => {
        audioService.stop();
    }, []);

    return {
        ...playbackState,
        playVerse,
        playWord,
        playHostClip,
        toggleSpeed,
        stopAudio,
    };
}