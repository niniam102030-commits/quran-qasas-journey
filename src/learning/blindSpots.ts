// src/learning/blindSpots.ts
// منطق خالص بستهٔ هفتگی «نقاط کور من» (L3) — پنجرهٔ ۳۰ روزه + امتیاز ۲×confusion + ۱×غلط + هفتهٔ محلی از شنبه

export interface BlindSpotPack {
  weekIso: string;
  questionIds: string[];
  topTargets: string[];
}

const THIRTY_DAYS_MS = 30 * 86400_000;
export const MIN_BLINDSPOT_QUESTIONS = 5;

/**
 * محاسبهٔ برچسب هفته به قالب YYYY-Www بر اساس هفتهٔ محلی از شنبه:
 * - روز هفته با مبنای شنبه: satDow = (dayOfWeek + 1) % 7 (شنبه=۰، یکشنبه=۱، ...، جمعه=۶)
 * - ابتدای هفتهٔ جاری = تاریخ محلی منهای satDow روز
 * - شماره هفته = Math.floor(روز از ابتدای سالِ weekStart / 7) + 1
 */
export function getLocalSaturdayWeekIso(now: Date): string {
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const satDow = (localMidnight.getDay() + 1) % 7;
  const weekStart = new Date(
    localMidnight.getFullYear(),
    localMidnight.getMonth(),
    localMidnight.getDate() - satDow,
  );
  const year = weekStart.getFullYear();
  const jan1Utc = Date.UTC(year, 0, 1);
  const startUtc = Date.UTC(year, weekStart.getMonth(), weekStart.getDate());
  const dayOfYear = Math.floor((startUtc - jan1Utc) / 86400_000);
  const weekNum = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

export function buildBlindSpotPack(input: {
  confusions: { qid: string; target: string; at: number }[];
  attempts: { qid: string; correct: boolean; at: number }[];
  now: Date;
  size?: number;
}): BlindSpotPack {
  const size = input.size ?? 15;
  const weekIso = getLocalSaturdayWeekIso(input.now);
  const cutoff = input.now.getTime() - THIRTY_DAYS_MS;

  const qStats = new Map<string, { score: number; latestAt: number }>();
  const targetStats = new Map<string, { count: number; latestAt: number }>();

  for (const c of input.confusions) {
    if (!Number.isFinite(c.at) || c.at < cutoff) continue;
    if (c.qid) {
      const prev = qStats.get(c.qid) ?? { score: 0, latestAt: 0 };
      prev.score += 2;
      if (c.at > prev.latestAt) prev.latestAt = c.at;
      qStats.set(c.qid, prev);
    }
    if (c.target) {
      const tPrev = targetStats.get(c.target) ?? { count: 0, latestAt: 0 };
      tPrev.count += 1;
      if (c.at > tPrev.latestAt) tPrev.latestAt = c.at;
      targetStats.set(c.target, tPrev);
    }
  }

  for (const a of input.attempts) {
    if (a.correct || !Number.isFinite(a.at) || a.at < cutoff) continue;
    if (!a.qid) continue;
    const prev = qStats.get(a.qid) ?? { score: 0, latestAt: 0 };
    prev.score += 1;
    if (a.at > prev.latestAt) prev.latestAt = a.at;
    qStats.set(a.qid, prev);
  }

  const topTargets = [...targetStats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].latestAt - a[1].latestAt)
    .slice(0, 3)
    .map(([target]) => target);

  if (qStats.size < MIN_BLINDSPOT_QUESTIONS) {
    return {
      weekIso,
      questionIds: [],
      topTargets,
    };
  }

  const questionIds = [...qStats.entries()]
    .sort((a, b) => b[1].score - a[1].score || b[1].latestAt - a[1].latestAt)
    .slice(0, Math.max(0, size))
    .map(([qid]) => qid);

  return {
    weekIso,
    questionIds,
    topTargets,
  };
}
