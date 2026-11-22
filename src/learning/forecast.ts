// src/learning/forecast.ts
// پیش‌بینی ۷ روز آینده مرورهای FSRS و شناسایی آیات نزدیک به طلایی شدن
import type { StoredCard } from "./cardScheduler";
import { isGoldenVerse, skillLevel } from "./mastery";

export interface ForecastDay {
  dayOffset: number; // 0 = امروز، 1 = فردا، ...
  label: string;
  dueCount: number;
}

export interface NearGoldenVerse {
  verse: number;
  level3Count: number; // 2 یا 3 از 4
  missingSkills: ("vr" | "vt" | "vn" | "sq")[];
}

const DAY_MS = 86400000;
const DAY_LABELS = ["امروز", "فردا", "۲ روز بعد", "۳ روز بعد", "۴ روز بعد", "۵ روز بعد", "۶ روز بعد"];

export function buildReviewForecast(cards: StoredCard[], now: Date = new Date()): ForecastDay[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const counts = new Array<number>(7).fill(0);

  for (const c of cards) {
    if (c.state === 0) continue;
    const dueMs = new Date(c.due).getTime();
    if (!Number.isFinite(dueMs)) continue;
    if (dueMs <= now.getTime()) {
      counts[0]++;
    } else {
      const offset = Math.floor((dueMs - startOfToday) / DAY_MS);
      if (offset >= 0 && offset < 7) {
        counts[offset]++;
      }
    }
  }

  return counts.map((dueCount, dayOffset) => ({
    dayOffset,
    label: DAY_LABELS[dayOffset],
    dueCount,
  }));
}

export function findNearGoldenVerses(cardsMap: Map<string, StoredCard>): NearGoldenVerse[] {
  const skills: ("vr" | "vt" | "vn" | "sq")[] = ["vr", "vt", "vn", "sq"];
  const result: NearGoldenVerse[] = [];

  for (let v = 1; v <= 88; v++) {
    if (isGoldenVerse(v, cardsMap)) continue;
    const missing = skills.filter((s) => skillLevel(cardsMap.get(`${s}:${v}`)) < 3);
    const level3Count = 4 - missing.length;
    if (level3Count >= 2) {
      result.push({ verse: v, level3Count, missingSkills: missing });
    }
  }

  return result.sort((a, b) => b.level3Count - a.level3Count || a.verse - b.verse);
}
