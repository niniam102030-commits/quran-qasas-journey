// src/hooks/useHapticsAndSfx.ts
import { useCallback } from "react";
import { useAppStore } from "../store/useAppStore";

export type SfxType =
    | "snap-click"
    | "correct-chime"
    | "trap-shield"
    | "error-thud"
    | "stage-fanfare";

const SFX_PATHS: Record<SfxType, string> = {
    "snap-click": "/sfx/snap-click.mp3",
    "correct-chime": "/sfx/correct-chime.mp3",
    "trap-shield": "/sfx/trap-shield.mp3",
    "error-thud": "/sfx/error-thud.mp3",
    "stage-fanfare": "/sfx/stage-fanfare.mp3",
};

const sfxAudioPool: Partial<Record<SfxType, HTMLAudioElement>> = {};

export function useHapticsAndSfx() {
    const soundEnabled = useAppStore(
        (s) => s.userStats?.soundEffectsEnabled ?? true
    );

    const triggerHaptic = useCallback(
        (pattern: "light" | "success" | "warning" | "error") => {
            if (typeof navigator === "undefined" || !navigator.vibrate) return;
            try {
                switch (pattern) {
                    case "light":
                        navigator.vibrate(12);
                        break;
                    case "success":
                        navigator.vibrate([15, 40, 25]);
                        break;
                    case "warning":
                        navigator.vibrate([30, 50, 30]);
                        break;
                    case "error":
                        navigator.vibrate([60, 40, 80]);
                        break;
                }
            } catch {
                // در مرورگرهای دسکتاپ بدون پشتیبانی ویبره نادیده گرفته می‌شود
            }
        },
        []
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
                let audio = sfxAudioPool[type];
                if (!audio) {
                    audio = new Audio(SFX_PATHS[type]);
                    audio.volume = 0.65;
                    sfxAudioPool[type] = audio;
                }
                audio.currentTime = 0;
                audio.play().catch(() => { });
            } catch {
                // نادیده گرفتن خطا در صورت نبود فایل SFX
            }
        },
        [soundEnabled, triggerHaptic]
    );

    return {
        playSfx,
        triggerHaptic,
    };
}