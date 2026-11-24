// src/store/usePreferencesStore.ts
// منبع واحد تنظیمات کاربر: حالت تاریک، افکت‌های صوتی، لرزش لمسی، اندازه قلم عربی و حالت سرعت مرور
import { create } from "zustand";
import { isPaceMode, type PaceMode } from "../learning/pace";

export type MushafTheme = "default" | "gold" | "night";
export type SoundPack = "default" | "soft";

interface PreferencesState {
  darkMode: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  arabicFontSize: number;
  paceMode: PaceMode;
  mushafTheme: MushafTheme;
  soundPack: SoundPack;
  reminderEnabled: boolean;
  reminderHourOverride: number | null;
  initPreferences: () => void;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSoundEnabled: () => void;
  setHapticsEnabled: (enabled: boolean) => void;
  toggleHapticsEnabled: () => void;
  setArabicFontSize: (size: number) => void;
  setPaceMode: (mode: PaceMode) => void;
  setMushafTheme: (theme: MushafTheme) => void;
  setSoundPack: (pack: SoundPack) => void;
  setReminderEnabled: (enabled: boolean) => void;
  setReminderHourOverride: (hour: number | null) => void;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const val = localStorage.getItem(key);
  if (val === null) return fallback;
  return val === "true";
}

function readInitialReminderHour(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("reminder_hour");
  if (raw === null || raw === "auto" || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
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

function readInitialMushafTheme(): MushafTheme {
  if (typeof window === "undefined") return "default";
  const saved = localStorage.getItem("mushaf_theme");
  return saved === "gold" || saved === "night" ? saved : "default";
}

function readInitialSoundPack(): SoundPack {
  if (typeof window === "undefined") return "default";
  const saved = localStorage.getItem("sound_pack");
  return saved === "soft" ? "soft" : "default";
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
  mushafTheme: readInitialMushafTheme(),
  soundPack: readInitialSoundPack(),
  reminderEnabled: readBool("reminder_enabled", false),
  reminderHourOverride: readInitialReminderHour(),

  initPreferences: () => {
    const dark = readInitialDark();
    applyDarkClass(dark);
    set({
      darkMode: dark,
      soundEnabled: readBool("sound_enabled", true),
      hapticsEnabled: readBool("haptics_enabled", true),
      arabicFontSize: readInitialFontSize(),
      paceMode: readInitialPaceMode(),
      mushafTheme: readInitialMushafTheme(),
      soundPack: readInitialSoundPack(),
      reminderEnabled: readBool("reminder_enabled", false),
      reminderHourOverride: readInitialReminderHour(),
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

  setMushafTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mushaf_theme", theme);
    }
    set({ mushafTheme: theme });
  },

  setSoundPack: (pack) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sound_pack", pack);
    }
    set({ soundPack: pack });
  },

  setReminderEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reminder_enabled", String(enabled));
    }
    set({ reminderEnabled: enabled });
  },

  setReminderHourOverride: (hour) => {
    if (typeof window !== "undefined") {
      if (hour === null) {
        localStorage.removeItem("reminder_hour");
      } else {
        localStorage.setItem("reminder_hour", String(hour));
      }
    }
    set({ reminderHourOverride: hour });
  },
}));
