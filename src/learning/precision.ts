// src/learning/precision.ts
// منطق خالص شاخص دقت لفظی (L4): ترکیب وزن‌دار تسمیع (۰٫۵)، آزمون میانبر (۰٫۳) و بررسی تلاوت (۰٫۲)

export interface PrecisionIndex {
  score: number | null;
  tasmiAvg: number | null;
  testOutAvg: number | null;
  verifierAvg: number | null;
  examAvg?: number | null;
  trend: number[];
}

export interface PrecisionInput {
  tasmi: { slipped: number; total: number; at: number }[];
  testOutRatios: number[];
  verifier: { accuracy: number; at: number }[];
  examScores?: { score: number; at: number }[];
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

function weightedScore(
  tasmiAvg: number | null,
  testOutAvg: number | null,
  verifierAvg: number | null,
  examAvg: number | null = null,
): number | null {
  let num = 0;
  let den = 0;
  if (tasmiAvg !== null) {
    num += tasmiAvg * 0.5;
    den += 0.5;
  }
  if (testOutAvg !== null) {
    num += testOutAvg * 0.3;
    den += 0.3;
  }
  if (verifierAvg !== null) {
    num += verifierAvg * 0.2;
    den += 0.2;
  }
  if (examAvg !== null) {
    num += examAvg * 0.25;
    den += 0.25;
  }
  if (den === 0) return null;
  return num / den;
}

export function precisionIndex(input: PrecisionInput): PrecisionIndex {
  const validTasmi = input.tasmi
    .filter((t) => Number.isFinite(t.total) && t.total > 0)
    .slice()
    .sort((a, b) => a.at - b.at)
    .slice(-10)
    .map((t) => ({
      at: t.at,
      pct: clampPct(((t.total - Math.max(0, t.slipped)) / t.total) * 100),
    }));

  const validTestOut = input.testOutRatios
    .filter((r) => Number.isFinite(r))
    .slice(-5)
    .map((r) => clampPct(r <= 1 ? r * 100 : r));

  const validVerifier = input.verifier
    .filter((v) => Number.isFinite(v.accuracy))
    .slice()
    .sort((a, b) => a.at - b.at)
    .slice(-10)
    .map((v) => ({
      at: v.at,
      pct: clampPct(v.accuracy),
    }));

  const validExams = (input.examScores ?? [])
    .filter((e) => Number.isFinite(e.score))
    .slice()
    .sort((a, b) => a.at - b.at)
    .slice(-5)
    .map((e) => ({
      at: e.at,
      pct: clampPct(e.score),
    }));

  const tasmiRaw = avg(validTasmi.map((x) => x.pct));
  const testOutRaw = avg(validTestOut);
  const verifierRaw = avg(validVerifier.map((x) => x.pct));
  const examRaw = avg(validExams.map((x) => x.pct));
  const scoreRaw = weightedScore(tasmiRaw, testOutRaw, verifierRaw, examRaw);

  // ساخت روند تجمعی (حداکثر ۸ نقطهٔ آخر)
  type Event = { at: number; kind: "tasmi" | "testOut" | "verifier" | "exam"; pct: number; seq: number };
  const events: Event[] = [];
  let seq = 0;
  for (const t of validTasmi) {
    events.push({ at: t.at, kind: "tasmi", pct: t.pct, seq: seq++ });
  }
  for (const v of validVerifier) {
    events.push({ at: v.at, kind: "verifier", pct: v.pct, seq: seq++ });
  }
  for (const ex of validExams) {
    events.push({ at: ex.at, kind: "exam", pct: ex.pct, seq: seq++ });
  }
  const maxTimedAt = events.reduce((m, e) => Math.max(m, e.at), 0);
  validTestOut.forEach((pct, i) => {
    events.push({ at: maxTimedAt + i + 1, kind: "testOut", pct, seq: seq++ });
  });
  events.sort((a, b) => a.at - b.at || a.seq - b.seq);

  const runTasmi: number[] = [];
  const runTestOut: number[] = [];
  const runVerifier: number[] = [];
  const runExams: number[] = [];
  const trend: number[] = [];

  for (const ev of events) {
    if (ev.kind === "tasmi") runTasmi.push(ev.pct);
    else if (ev.kind === "testOut") runTestOut.push(ev.pct);
    else if (ev.kind === "exam") runExams.push(ev.pct);
    else runVerifier.push(ev.pct);

    const s = weightedScore(avg(runTasmi), avg(runTestOut), avg(runVerifier), avg(runExams));
    if (s !== null) {
      trend.push(Math.round(s));
    }
  }

  return {
    score: scoreRaw === null ? null : Math.round(scoreRaw),
    tasmiAvg: tasmiRaw === null ? null : Math.round(tasmiRaw),
    testOutAvg: testOutRaw === null ? null : Math.round(testOutRaw),
    verifierAvg: verifierRaw === null ? null : Math.round(verifierRaw),
    ...(examRaw !== null ? { examAvg: Math.round(examRaw) } : {}),
    trend: trend.slice(-8),
  };
}
