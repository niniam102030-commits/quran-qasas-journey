// src/services/fsrsTuningService.ts
// اتصال لایه‌های بهینه‌سازی شخصی FSRS به جدول meta و cardScheduler
import { ldb } from "../db/learningDb";
import { configureFsrsTuning, type CardKind } from "../learning/cardScheduler";
import {
  buildReviewLogFromAttempts,
  computeTunedRetention,
  fitWeights,
  isPersonalizedFsrs,
  isValidFsrs6Weights,
  shouldRunDailyTuning,
} from "../learning/fsrsTuning";
import { getMeta, setMeta } from "./metaStore";
import { getLocalDateIso } from "./profileService";

export const META_FSRS_RETENTION = "fsrsRetention";
export const META_FSRS_WEIGHTS = "fsrsWeights";
export const META_FSRS_LAST_TUNED = "fsrsLastTunedDate";

export async function loadFsrsTuningFromMeta(): Promise<{
  retention: Partial<Record<CardKind, number>> | null;
  weights: number[] | null;
  personalized: boolean;
}> {
  const [retention, weights] = await Promise.all([
    getMeta<Partial<Record<CardKind, number>> | null>(META_FSRS_RETENTION, null),
    getMeta<number[] | null>(META_FSRS_WEIGHTS, null),
  ]);
  const validWeights = isValidFsrs6Weights(weights) ? weights : null;
  configureFsrsTuning({ retention, weights: validWeights });
  return {
    retention,
    weights: validWeights,
    personalized: isPersonalizedFsrs(retention, validWeights),
  };
}

export async function runDailyFsrsTuningIfNeeded(now: Date = new Date()): Promise<{ ran: boolean; personalized: boolean }> {
  const todayIso = getLocalDateIso(now);
  const lastTuned = await getMeta<string | null>(META_FSRS_LAST_TUNED, null);
  if (!shouldRunDailyTuning(lastTuned, todayIso)) {
    const loaded = await loadFsrsTuningFromMeta();
    return { ran: false, personalized: loaded.personalized };
  }

  const [attempts, cards, currentRetention, currentWeights] = await Promise.all([
    ldb.attempts.toArray(),
    ldb.cards.toArray(),
    getMeta<Partial<Record<CardKind, number>> | null>(META_FSRS_RETENTION, null),
    getMeta<number[] | null>(META_FSRS_WEIGHTS, null),
  ]);

  const retentionRes = computeTunedRetention({
    attempts,
    cards,
    currentRetention: currentRetention ?? undefined,
    now,
  });

  const hasAnyRetentionChange = Object.values(retentionRes.counts).some((c) => c.changed);
  let nextRetention = currentRetention;
  if (hasAnyRetentionChange) {
    nextRetention = retentionRes.retention;
    await setMeta(META_FSRS_RETENTION, nextRetention);
  }

  const reviewLog = buildReviewLogFromAttempts(attempts);
  const fitRes = fitWeights(reviewLog);
  let nextWeights = isValidFsrs6Weights(currentWeights) ? currentWeights : null;
  if (fitRes.improved && fitRes.weights) {
    nextWeights = fitRes.weights;
    await setMeta(META_FSRS_WEIGHTS, nextWeights);
  }

  await setMeta(META_FSRS_LAST_TUNED, todayIso);
  configureFsrsTuning({ retention: nextRetention, weights: nextWeights });

  return {
    ran: true,
    personalized: isPersonalizedFsrs(nextRetention, nextWeights),
  };
}

export async function resetFsrsTuning(): Promise<void> {
  await ldb.meta.bulkDelete([META_FSRS_RETENTION, META_FSRS_WEIGHTS, META_FSRS_LAST_TUNED]);
  configureFsrsTuning({ retention: null, weights: null });
}
