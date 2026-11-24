// src/learning/__tests__/fsrsTuning.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_FSRS6_WEIGHTS,
  DEFAULT_RETENTION,
  computeTunedRetention,
  fitWeights,
  fsrs6ForgettingCurve,
  isPersonalizedFsrs,
  type FsrsReviewLogItem,
} from "../fsrsTuning";
import {
  configureFsrsTuning,
  getActiveFsrsTuning,
  newCard,
  review,
  seedKnownCard,
  stabilityForInterval,
  type StoredCard,
} from "../cardScheduler";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** تولید لاگ ساختگی مرور از خود معادلات FSRS-6 با وزن‌های دلخواه */
function generateSyntheticLog(
  trueWeights: readonly number[],
  totalReviews: number,
  seed: number,
): FsrsReviewLogItem[] {
  const rand = mulberry32(seed);
  const numCards = 45;
  const states = Array.from({ length: numCards }, () => ({ s: 0, d: 0, lastDay: 0 }));
  const log: FsrsReviewLogItem[] = [];
  const baseMs = Date.UTC(2026, 0, 1);
  let day = 0;

  for (let i = 0; i < totalReviews; i++) {
    const idx = i % numCards;
    const st = states[idx];
    const cardKey = `vr:${idx + 1}`;
    if (st.s === 0) {
      day += 0.25;
      const rating: 1 | 2 | 3 | 4 = rand() < 0.7 ? 3 : 4;
      st.s = trueWeights[rating - 1];
      st.d = Math.max(1, Math.min(10, trueWeights[4] - Math.exp((rating - 1) * trueWeights[5]) + 1));
      st.lastDay = day;
      log.push({ cardKey, at: baseMs + Math.round(day * 86400_000), rating, elapsedDays: 0 });
      continue;
    }

    const deltaT = 2 + Math.floor(rand() * 25);
    const curDay = st.lastDay + deltaT;
    const pRecall = fsrs6ForgettingCurve(deltaT, st.s, trueWeights[20]);
    const remembered = rand() < pRecall;
    const rating: 1 | 2 | 3 | 4 = remembered ? (rand() < 0.8 ? 3 : 4) : 1;

    if (rating === 1) {
      st.s = Math.max(
        0.1,
        trueWeights[11] *
          Math.pow(st.d, -trueWeights[12]) *
          (Math.pow(st.s + 1, trueWeights[13]) - 1) *
          Math.exp((1 - pRecall) * trueWeights[14]),
      );
    } else {
      const easyBonus = rating === 4 ? trueWeights[16] : 1;
      st.s =
        st.s *
        (1 +
          Math.exp(trueWeights[8]) *
            (11 - st.d) *
            Math.pow(st.s, -trueWeights[9]) *
            (Math.exp((1 - pRecall) * trueWeights[10]) - 1) *
            easyBonus);
    }
    const deltaD = -trueWeights[6] * (rating - 3);
    const nextD = st.d + deltaD * ((10 - st.d) / 9);
    const dEasy = trueWeights[4] - Math.exp(3 * trueWeights[5]) + 1;
    st.d = Math.max(1, Math.min(10, trueWeights[7] * dEasy + (1 - trueWeights[7]) * nextD));
    st.lastDay = curDay;

    log.push({
      cardKey,
      at: baseMs + Math.round(i * 3600_000 + deltaT * 3600_000),
      rating,
      elapsedDays: deltaT,
    });
  }

  return log;
}

describe("FSRS personal tuning (C1)", () => {
  afterEach(() => {
    configureFsrsTuning({ retention: null, weights: null });
  });

  it("Layer 1: keeps retention unchanged when samples < 50 and ignores non-review or unreviewed cards", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const cards: StoredCard[] = [
      seedKnownCard("w:w28_002_001", { now, intervalDays: 5 }),
      newCard("vr:2", now), // state === 0, reps === 0 (بدون سابقه واقعی)
    ];

    const attempts = [
      ...Array.from({ length: 49 }, (_, i) => ({
        at: now.getTime() - (i + 1) * 3600_000,
        sessionType: "REVIEW",
        perTarget: { "w:w28_002_001": false },
      })),
      // تلاش‌های STAGE نباید در لایه ۱ شمرده شوند
      ...Array.from({ length: 80 }, (_, i) => ({
        at: now.getTime() - (i + 1) * 3600_000,
        sessionType: "STAGE",
        perTarget: { "w:w28_002_001": false },
      })),
      // کارت بدون سابقه واقعی نباید شمرده شود
      ...Array.from({ length: 60 }, (_, i) => ({
        at: now.getTime() - (i + 1) * 3600_000,
        sessionType: "REVIEW",
        perTarget: { "vr:2": false },
      })),
    ];

    const res = computeTunedRetention({ attempts, cards, now });
    expect(res.retention.w).toBe(DEFAULT_RETENTION.w);
    expect(res.retention.vr).toBe(DEFAULT_RETENTION.vr);
    expect(res.counts.w.total).toBe(49);
    expect(res.counts.w.changed).toBe(false);
    expect(res.counts.vr.total).toBe(0);
  });

  it("Layer 1: moves retention toward observed rate by at most ±0.03 within [0.85, 0.97]", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const cards: StoredCard[] = [
      seedKnownCard("w:w28_002_001", { now, intervalDays: 5 }),
      seedKnownCard("vr:3", { now, intervalDays: 5 }),
      seedKnownCard("vt:3", { now, intervalDays: 5 }),
    ];

    // w: 0% یادآوری => 0.90 -> باید دقیقاً 0.03 پایین بیاید (0.87)
    // vr: 100% یادآوری => 0.93 -> باید دقیقاً 0.03 بالا برود (0.96)
    // vt: با فرض مقدار فعلی 0.86 و نرخ 0% => به کف 0.85 می‌رسد (نه کمتر)
    const attempts = [
      ...Array.from({ length: 55 }, (_, i) => ({
        at: now.getTime() - (i + 1) * 3600_000,
        sessionType: "REVIEW",
        perTarget: { "w:w28_002_001": false, "vr:3": true },
      })),
      ...Array.from({ length: 55 }, (_, i) => ({
        at: now.getTime() - (i + 1) * 3600_000,
        sessionType: "REMEDIAL",
        perTarget: { "vt:3": false },
      })),
    ];

    const res = computeTunedRetention({
      attempts,
      cards,
      currentRetention: { vt: 0.86 },
      now,
    });
    expect(res.retention.w).toBe(0.87);
    expect(res.retention.vr).toBe(0.96);
    expect(res.retention.vt).toBe(0.85);

    const ceiling = computeTunedRetention({
      attempts: Array.from({ length: 60 }, (_, i) => ({
        at: now.getTime() - (i + 1) * 3600_000,
        sessionType: "REVIEW",
        perTarget: { "vr:3": true },
      })),
      cards,
      currentRetention: { vr: 0.96 },
      now,
    });
    expect(ceiling.retention.vr).toBe(0.97);
  });

  it("Layer 2: returns weights=null when reviewLog has fewer than 400 reviews", () => {
    const log = generateSyntheticLog(DEFAULT_FSRS6_WEIGHTS, 399, 101);
    const res = fitWeights(log);
    expect(res.improved).toBe(false);
    expect(res.weights).toBeNull();
    expect(res.sampleCount).toBe(399);
  });

  it("Layer 2: recovers improved parameters on synthetic FSRS-6 data and beats default on holdout", () => {
    // شبیه‌سازی کاربری با فراموشی تندتر و رشد پایداری متفاوت از پیش‌فرض
    const customWeights = [...DEFAULT_FSRS6_WEIGHTS];
    customWeights[2] = 0.6;
    customWeights[8] = 0.7;
    customWeights[20] = 0.45;

    const log = generateSyntheticLog(customWeights, 600, 42);
    const res = fitWeights(log);

    expect(res.sampleCount).toBe(600);
    expect(res.holdoutCount).toBeGreaterThan(0);
    expect(res.improved).toBe(true);
    expect(res.weights).not.toBeNull();
    expect(res.weights).toHaveLength(21);
    expect(res.fittedLoss).toBeLessThan(res.defaultLoss);

    // وزن‌های برازش‌شده باید داخل ts-fsrs بدون خطا کار کنند
    configureFsrsTuning({ retention: { vr: 0.91 }, weights: res.weights });
    const tuned = review(newCard("vr:5", new Date("2026-01-01T00:00:00Z")), "good", new Date("2026-01-01T00:00:00Z"));
    expect(Number.isFinite(tuned.stability)).toBe(true);
    expect(tuned.stability).toBeGreaterThan(0);
    expect(getActiveFsrsTuning().weights).toEqual(res.weights);
  });

  it("Layer 2: silently keeps default weights when holdout does not improve", () => {
    // در ۸۰٪ اول (train) نرخ یادآوری بسیار بالا (۹۸٪) است و در ۲۰٪ آخر (holdout روی کارت‌های مجزا در اولین مرور پس از یادگیری) نرخ بسیار پایین (۱۰٪):
    // وزن‌های برازش‌شده روی train احتمال یادآوری را بالا می‌برند و در holdout زیان بیشتری از پیش‌فرض می‌گیرند => باید رد شوند.
    const rand = mulberry32(999);
    const baseMs = Date.UTC(2026, 0, 1);
    const noisyLog: FsrsReviewLogItem[] = [];
    // ۳۶۰ مرور اول روی ۶۰ کارت (تکرار با موفقیت بالا)
    for (let i = 0; i < 360; i++) {
      noisyLog.push({
        cardKey: `vr:${(i % 60) + 1}`,
        at: baseMs + i * 86400_000,
        rating: i < 60 ? 3 : (rand() < 0.98 ? 3 : 1),
        elapsedDays: i < 60 ? 0 : 10,
      });
    }
    // ۹۰ مرور انتهایی روی ۴۵ کارت تازه (اولین ثبت با good، مرور بعدی با failed در فاصله کوتاه ۱ روزه)
    for (let j = 0; j < 45; j++) {
      noisyLog.push({
        cardKey: `vt:${j + 1}`,
        at: baseMs + (360 + j * 2) * 86400_000,
        rating: 3,
        elapsedDays: 0,
      });
      noisyLog.push({
        cardKey: `vt:${j + 1}`,
        at: baseMs + (361 + j * 2) * 86400_000,
        rating: 1,
        elapsedDays: 1,
      });
    }

    const res = fitWeights(noisyLog);
    expect(res.improved).toBe(false);
    expect(res.weights).toBeNull();
  });

  it("cardScheduler applies configured retention and resets cleanly", () => {
    const defaultStab = stabilityForInterval("w", 10);
    configureFsrsTuning({ retention: { w: 0.96 } });
    const higherRetentionStab = stabilityForInterval("w", 10);
    expect(higherRetentionStab).toBeGreaterThan(defaultStab);
    configureFsrsTuning({ retention: { w: 0.85 } });
    const lowerRetentionStab = stabilityForInterval("w", 10);
    expect(lowerRetentionStab).toBeLessThan(defaultStab);
    expect(isPersonalizedFsrs({ w: 0.85 }, null)).toBe(true);
    expect(isPersonalizedFsrs(null, null)).toBe(false);
  });
});
