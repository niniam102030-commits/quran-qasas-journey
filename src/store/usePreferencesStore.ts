// src/store/usePreferencesStore.ts
// منبع واحد تنظیمات کاربر: حالت تاریک، افکت‌های صوتی، لرزش لمسی، اندازه قلم عربی و حالت سرعت مرور
import { create } from "zustand";
import { isPaceMode, type PaceMode } from "../learning/pace";

interface PreferencesState {
  darkMode: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  arabicFontSize: number;
  paceMode: PaceMode;
  initPreferences: () => void;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSoundEnabled: () => void;
  setHapticsEnabled: (enabled: boolean) => void;
  toggleHapticsEnabled: () => void;
  setArabicFontSize: (size: number) => void;
  setPaceMode: (mode: PaceMode) => void;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const val = localStorage.getItem(key);
  if (val === null) return fallback;
  return val === "true";
}

function readInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return document.documentElement.classList.contains("dark");
}

function readInitialFontSize(): number {
  if (typeof window === "undefined") return 28;
  const raw = Number(localStorage.getItem("quran_font_size") || 28);
  return Number.isFinite(raw) ? Math.min(40, Math.max(22, raw)) : 28;
}

function readInitialPaceMode(): PaceMode {
  if (typeof window === "undefined") return "standard";
  const saved = localStorage.getItem("pace_mode");
  return isPaceMode(saved) ? saved : "standard";
}

function applyDarkClass(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  darkMode: readInitialDark(),
  soundEnabled: readBool("sound_enabled", true),
  hapticsEnabled: readBool("haptics_enabled", true),
  arabicFontSize: readInitialFontSize(),
  paceMode: readInitialPaceMode(),

  initPreferences: () => {
    const dark = readInitialDark();
    applyDarkClass(dark);
    set({
      darkMode: dark,
      soundEnabled: readBool("sound_enabled", true),
      hapticsEnabled: readBool("haptics_enabled", true),
      arabicFontSize: readInitialFontSize(),
      paceMode: readInitialPaceMode(),
    });
  },

  setDarkMode: (dark) => {
    applyDarkClass(dark);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", dark ? "dark" : "light");
    }
    set({ darkMode: dark });
  },

  toggleDarkMode: () => {
    get().setDarkMode(!get().darkMode);
  },

  setSoundEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sound_enabled", String(enabled));
    }
    set({ soundEnabled: enabled });
  },

  toggleSoundEnabled: () => {
    get().setSoundEnabled(!get().soundEnabled);
  },

  setHapticsEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("haptics_enabled", String(enabled));
    }
    set({ hapticsEnabled: enabled });
  },

  toggleHapticsEnabled: () => {
    get().setHapticsEnabled(!get().hapticsEnabled);
  },

  setArabicFontSize: (size) => {
    const clamped = Math.min(40, Math.max(22, Math.round(size)));
    if (typeof window !== "undefined") {
      localStorage.setItem("quran_font_size", String(clamped));
    }
    set({ arabicFontSize: clamped });
  },

  setPaceMode: (mode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("pace_mode", mode);
    }
    set({ paceMode: mode });
  },
}));
