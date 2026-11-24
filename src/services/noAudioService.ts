// src/services/noAudioService.ts
// حالت «بدون صوت» برای امروز + صف فعالیت‌های صوتی معوق (مورد ۴)
import { getMeta, setMeta } from "./metaStore";

const KEY = "no_audio_date";

function todayLocalIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isNoAudioToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === todayLocalIso();
  } catch {
    return false;
  }
}

export function setNoAudioToday(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.setItem(KEY, todayLocalIso());
    else localStorage.removeItem(KEY);
  } catch {
    // نادیده گرفتن خطای حافظه
  }
}

export type DeferredAudioKind = "audioQuiz";

export interface DeferredAudioEntry {
  kind: DeferredAudioKind;
  date: string;
}

const META_KEY = "deferredAudio";

export async function getDeferredAudio(): Promise<DeferredAudioEntry[]> {
  return getMeta<DeferredAudioEntry[]>(META_KEY, []);
}

export async function addDeferredAudio(kind: DeferredAudioKind): Promise<void> {
  const list = await getDeferredAudio();
  const today = todayLocalIso();
  if (list.some((e) => e.kind === kind && e.date === today)) return;
  await setMeta(META_KEY, [...list, { kind, date: today }]);
}

export async function clearDeferredAudio(kind: DeferredAudioKind): Promise<void> {
  const list = await getDeferredAudio();
  await setMeta(
    META_KEY,
    list.filter((e) => e.kind !== kind),
  );
}
