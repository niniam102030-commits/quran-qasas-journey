// src/store/usePreferencesStore.ts
// منبع واحد تنظیمات کاربر: حالت تاریک، افکت‌های صوتی، لرزش لمسی، اندازه قلم عربی و حالت سرعت مرور
import { create } from "zustand";
import { isPaceMode, type PaceMode } from "../learning/pace";
import { isLearningTrack, type LearningTrack } from "../learning/tracks";

export type AppTheme = "default" | "rose";
export type MushafTheme = "default" | "gold" | "night";
export type SoundPack = "default" | "soft";

interface PreferencesState {
  darkMode: boolean;
  appTheme: AppTheme;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  arabicFontSize: number;
  paceMode: PaceMode;
  learningTrack: LearningTrack;
  mushafTheme: MushafTheme;
  soundPack: SoundPack;
  reminderEnabled: boolean;
  reminderHourOverride: number | null;
  autoFollowMushaf: boolean;
  tajweedColorsEnabled: boolean;
  offlineAsrEnabled: boolean;
  activeSurah: number;
  devMode: boolean;
  initPreferences: () => void;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
  setAppTheme: (theme: AppTheme) => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSoundEnabled: () => void;
  setHapticsEnabled: (enabled: boolean) => void;
  toggleHapticsEnabled: () => void;
  setArabicFontSize: (size: number) => void;
  setPaceMode: (mode: PaceMode) => void;
  setLearningTrack: (track: LearningTrack) => void;
  setMushafTheme: (theme: MushafTheme) => void;
  setSoundPack: (pack: SoundPack) => void;
  setReminderEnabled: (enabled: boolean) => void;
  setReminderHourOverride: (hour: number | null) => void;
  setAutoFollowMushaf: (enabled: boolean) => void;
  toggleAutoFollowMushaf: () => void;
  setTajweedColorsEnabled: (enabled: boolean) => void;
  toggleTajweedColorsEnabled: () => void;
  setOfflineAsrEnabled: (enabled: boolean) => void;
  toggleOfflineAsrEnabled: () => void;
  setActiveSurah: (surah: number) => void;
  setDevMode: (enabled: boolean) => void;
  toggleDevMode: () => void;
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

function readInitialLearningTrack(): LearningTrack {
  if (typeof window === "undefined") return "full";
  const saved = localStorage.getItem("learning_track");
  return isLearningTrack(saved) ? saved : "full";
}

function readInitialAppTheme(): AppTheme {
  if (typeof window === "undefined") return "default";
  const saved = localStorage.getItem("app_theme");
  return saved === "rose" ? "rose" : "default";
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

function readInitialActiveSurah(): number {
  if (typeof window === "undefined") return 28;
  const raw = Number(localStorage.getItem("active_surah") || 28);
  return Number.isInteger(raw) && raw >= 1 && raw <= 114 ? raw : 28;
}

function applyDarkClass(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
}

function applyAppTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  if (theme === "rose") {
    document.documentElement.setAttribute("data-app-theme", "rose");
  } else {
    document.documentElement.removeAttribute("data-app-theme");
  }
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  darkMode: readInitialDark(),
  appTheme: readInitialAppTheme(),
  soundEnabled: readBool("sound_enabled", true),
  hapticsEnabled: readBool("haptics_enabled", true),
  arabicFontSize: readInitialFontSize(),
  paceMode: readInitialPaceMode(),
  learningTrack: readInitialLearningTrack(),
  mushafTheme: readInitialMushafTheme(),
  soundPack: readInitialSoundPack(),
  reminderEnabled: readBool("reminder_enabled", false),
  reminderHourOverride: readInitialReminderHour(),
  autoFollowMushaf: readBool("auto_follow_mushaf", true),
  tajweedColorsEnabled: readBool("tajweed_colors_enabled", false),
  offlineAsrEnabled: readBool("offline_asr_enabled", true),
  activeSurah: readInitialActiveSurah(),
  devMode: readBool("dev_mode", false),

  initPreferences: () => {
    const dark = readInitialDark();
    const appTheme = readInitialAppTheme();
    applyDarkClass(dark);
    applyAppTheme(appTheme);
    set({
      darkMode: dark,
      appTheme,
      soundEnabled: readBool("sound_enabled", true),
      hapticsEnabled: readBool("haptics_enabled", true),
      arabicFontSize: readInitialFontSize(),
      paceMode: readInitialPaceMode(),
      learningTrack: readInitialLearningTrack(),
      mushafTheme: readInitialMushafTheme(),
      soundPack: readInitialSoundPack(),
      reminderEnabled: readBool("reminder_enabled", false),
      reminderHourOverride: readInitialReminderHour(),
      autoFollowMushaf: readBool("auto_follow_mushaf", true),
      tajweedColorsEnabled: readBool("tajweed_colors_enabled", false),
      offlineAsrEnabled: readBool("offline_asr_enabled", true),
      activeSurah: readInitialActiveSurah(),
      devMode: readBool("dev_mode", false),
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

  setAppTheme: (theme) => {
    applyAppTheme(theme);
    if (typeof window !== "undefined") {
      localStorage.setItem("app_theme", theme);
    }
    set({ appTheme: theme });
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

  setLearningTrack: (track) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("learning_track", track);
    }
    set({ learningTrack: track });
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

  setAutoFollowMushaf: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("auto_follow_mushaf", String(enabled));
    }
    set({ autoFollowMushaf: enabled });
  },

  toggleAutoFollowMushaf: () => {
    get().setAutoFollowMushaf(!get().autoFollowMushaf);
  },

  setTajweedColorsEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tajweed_colors_enabled", String(enabled));
    }
    set({ tajweedColorsEnabled: enabled });
  },

  toggleTajweedColorsEnabled: () => {
    get().setTajweedColorsEnabled(!get().tajweedColorsEnabled);
  },

  setOfflineAsrEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("offline_asr_enabled", String(enabled));
    }
    set({ offlineAsrEnabled: enabled });
  },

  toggleOfflineAsrEnabled: () => {
    get().setOfflineAsrEnabled(!get().offlineAsrEnabled);
  },

  setActiveSurah: (surah) => {
    const valid = Number.isInteger(surah) && surah >= 1 && surah <= 114 ? surah : 28;
    if (typeof window !== "undefined") {
      localStorage.setItem("active_surah", String(valid));
    }
    set({ activeSurah: valid });
  },

  setDevMode: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dev_mode", String(enabled));
    }
    set({ devMode: enabled });
  },

  toggleDevMode: () => {
    get().setDevMode(!get().devMode);
  },
}));
