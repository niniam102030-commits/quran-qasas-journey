// src/learning/heatmap.ts
// ساخت نقشه حرارتی مرور روزانه (Review Activity Heatmap - 84 روز / ۱۲ هفته) الهام‌گرفته از Murajah

export interface HeatmapCell {
  /** YYYY-MM-DD (محلی) */
  date: string;
  count: number;
  correctCount: number;
  accuracy: number;
  /** شدت فعالیت از ۰ (بی‌فعالیت) تا ۴ (پرفعالیت) */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ReviewHeatmapSummary {
  cells: HeatmapCell[];
  activeDays: number;
  totalAttempts: number;
  currentStreak: number;
  longestStreak: number;
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function intensityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

export function buildReviewHeatmap(
  attempts: readonly { at: number; correct: boolean }[],
  days = 84,
  now: Date = new Date(),
): ReviewHeatmapSummary {
  const dayBuckets = new Map<string, { count: number; correct: number }>();

  for (const a of attempts) {
    if (!Number.isFinite(a.at)) continue;
    const key = toLocalYmd(new Date(a.at));
    const cur = dayBuckets.get(key) ?? { count: 0, correct: 0 };
    cur.count += 1;
    if (a.correct) cur.correct += 1;
    dayBuckets.set(key, cur);
  }

  const endDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cells: HeatmapCell[] = [];
  let activeDays = 0;
  let totalAttempts = 0;
  let longestStreak = 0;
  let runStreak = 0;

  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(endDay);
    d.setDate(endDay.getDate() - offset);
    const key = toLocalYmd(d);
    const bucket = dayBuckets.get(key);
    const count = bucket?.count ?? 0;
    const correctCount = bucket?.correct ?? 0;
    const accuracy = count > 0 ? Math.round((correctCount / count) * 100) : 0;

    if (count > 0) {
      activeDays++;
      totalAttempts += count;
      runStreak++;
      if (runStreak > longestStreak) longestStreak = runStreak;
    } else {
      runStreak = 0;
    }

    cells.push({
      date: key,
      count,
      correctCount,
      accuracy,
      level: intensityLevel(count),
    });
  }

  // استریک فعلی (اگر امروز هنوز تمرین نشده، از دیروز می‌شمارد)
  let currentStreak = 0;
  let idx = cells.length - 1;
  if (idx >= 0 && cells[idx].count === 0) idx--;
  while (idx >= 0 && cells[idx].count > 0) {
    currentStreak++;
    idx--;
  }

  return {
    cells,
    activeDays,
    totalAttempts,
    currentStreak,
    longestStreak,
  };
}
