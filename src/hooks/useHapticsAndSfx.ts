// src/hooks/useHapticsAndSfx.ts
import { useCallback } from "react";
import { usePreferencesStore } from "../store/usePreferencesStore";

export type SfxType =
    | "snap-click"
    | "correct-chime"
    | "trap-shield"
    | "error-thud"
    | "stage-fanfare";

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
        sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === "suspended") {
        void sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
}

function playTone(
    ctx: AudioContext,
    opts: {
        freq: number;
        endFreq?: number;
        startOffset?: number;
        duration: number;
        volume: number;
        type?: OscillatorType;
    }
) {
    const start = ctx.currentTime + (opts.startOffset ?? 0);
    const end = start + opts.duration;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(opts.endFreq, end);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(opts.volume, start + Math.min(0.015, opts.duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.01);
}

function playSynthesizedSfx(type: SfxType, soft = false) {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (soft) {
        switch (type) {
            case "snap-click":
                playTone(ctx, { freq: 380, endFreq: 260, duration: 0.045, volume: 0.05, type: "sine" });
                break;
            case "correct-chime":
                playTone(ctx, { freq: 392.0, duration: 0.16, volume: 0.12, type: "sine" }); // G4
                playTone(ctx, { freq: 493.88, startOffset: 0.09, duration: 0.22, volume: 0.13, type: "sine" }); // B4
                break;
            case "error-thud":
                playTone(ctx, { freq: 185, endFreq: 155, duration: 0.16, volume: 0.11, type: "sine" });
                break;
            case "trap-shield":
                playTone(ctx, { freq: 587.33, duration: 0.14, volume: 0.11, type: "sine" });
                break;
            case "stage-fanfare":
                playTone(ctx, { freq: 392.0, duration: 0.15, volume: 0.13, type: "sine" });
                playTone(ctx, { freq: 493.88, startOffset: 0.12, duration: 0.16, volume: 0.13, type: "sine" });
                playTone(ctx, { freq: 587.33, startOffset: 0.24, duration: 0.28, volume: 0.14, type: "sine" });
                break;
        }
        return;
    }

    switch (type) {
        case "snap-click":
            playTone(ctx, { freq: 540, endFreq: 280, duration: 0.04, volume: 0.09, type: "triangle" });
            break;
        case "correct-chime":
            playTone(ctx, { freq: 523.25, duration: 0.14, volume: 0.22, type: "sine" }); // C5
            playTone(ctx, { freq: 659.25, startOffset: 0.075, duration: 0.16, volume: 0.22, type: "sine" }); // E5
            playTone(ctx, { freq: 783.99, startOffset: 0.15, duration: 0.24, volume: 0.24, type: "sine" }); // G5
            break;
        case "error-thud":
            playTone(ctx, { freq: 220, endFreq: 175, duration: 0.13, volume: 0.2, type: "triangle" });
            playTone(ctx, { freq: 165, endFreq: 130, startOffset: 0.11, duration: 0.18, volume: 0.22, type: "triangle" });
            break;
        case "trap-shield":
            playTone(ctx, { freq: 880, duration: 0.12, volume: 0.16, type: "sine" });
            playTone(ctx, { freq: 1174.66, startOffset: 0.08, duration: 0.18, volume: 0.18, type: "sine" });
            break;
        case "stage-fanfare":
            playTone(ctx, { freq: 523.25, duration: 0.13, volume: 0.2, type: "sine" }); // C5
            playTone(ctx, { freq: 659.25, startOffset: 0.1, duration: 0.13, volume: 0.2, type: "sine" }); // E5
            playTone(ctx, { freq: 783.99, startOffset: 0.2, duration: 0.15, volume: 0.22, type: "sine" }); // G5
            playTone(ctx, { freq: 1046.5, startOffset: 0.31, duration: 0.32, volume: 0.24, type: "sine" }); // C6
            break;
    }
}

export function useHapticsAndSfx() {
    const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
    const soundPack = usePreferencesStore((s) => s.soundPack);
    const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);

    const triggerHaptic = useCallback(
        (pattern: "light" | "success" | "warning" | "error") => {
            if (!hapticsEnabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
            try {
                switch (pattern) {
                    case "light":
                        navigator.vibrate(18);
                        break;
                    case "success":
                        navigator.vibrate([22, 35, 32]);
                        break;
                    case "warning":
                        navigator.vibrate([35, 45, 35]);
                        break;
                    case "error":
                        navigator.vibrate([70, 45, 90]);
                        break;
                }
            } catch {
                // در مرورگرهای دسکتاپ بدون پشتیبانی ویبره نادیده گرفته می‌شود
            }
        },
        [hapticsEnabled]
    );

    const playSfx = useCallback(
        (type: SfxType) => {
            if (type === "snap-click") triggerHaptic("light");
            else if (type === "correct-chime" || type === "stage-fanfare")
                triggerHaptic("success");
            else if (type === "trap-shield") triggerHaptic("warning");
            else if (type === "error-thud") triggerHaptic("error");

            if (!soundEnabled || typeof window === "undefined") return;

            try {
                playSynthesizedSfx(type, soundPack === "soft");
            } catch {
                // نادیده گرفتن خطا در محیط‌های بدون Web Audio (مثل تست)
            }
        },
        [soundEnabled, soundPack, triggerHaptic]
    );

    return {
        playSfx,
        triggerHaptic,
    };
}