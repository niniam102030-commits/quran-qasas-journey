// src/learning/mutedAudio.ts
// منطق خالص «صوت ناقص» (تلاوت با سکوت راهنما — L1) + ثبت ایمن تلاش بدون دست‌زدن به کارت‌های دارای سابقه واقعی
import { ldb } from "../db/learningDb";
import type { WordAudioSegment } from "../services/qulReferenceService";
import { hasRealFsrsHistory, newCard, ratingFor, review } from "./cardScheduler";
import { rng, shuffle } from "./sessionPlanner";

export interface MutedTarget {
  verse: number;
  wordIndex: number;
  wordAr: string;
  options: string[];
  startMs: number;
  endMs: number;
}

function bareLength(ar: string): number {
  return ar.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/g, "").length;
}

export function planMutedSession(
  verses: { n: number; words: string[] }[],
  timings: Record<string, WordAudioSegment[]>,
  opts: { count?: number; seed?: number; hard?: boolean } = {},
): MutedTarget[] {
  const count = opts.count ?? 8;
  const seed = opts.seed ?? 1;
  const hard = Boolean(opts.hard);
  const rand = rng(seed);

  // فقط آیاتی که تایمینگ دارند و حداقل ۵ کلمه دارند
  const eligibleVerses = verses.filter((v) => {
    const segs = timings[String(v.n)];
    return Array.isArray(segs) && segs.length > 0 && v.words.length >= 5;
  });
  if (eligibleVerses.length === 0 || count <= 0) return [];

  interface Candidate {
    verse: number;
    vPos: number;
    wordIndex: number; // 1-based
    wordAr: string;
    startMs: number;
    endMs: number;
    longEnough: boolean;
  }

  const candidates: Candidate[] = [];
  eligibleVerses.forEach((v, vPos) => {
    const segMap = new Map<number, [number, number]>();
    for (const [wIdx, startMs, endMs] of timings[String(v.n)] ?? []) {
      if (!segMap.has(wIdx) && endMs > startMs) {
        segMap.set(wIdx, [startMs, endMs]);
      }
    }

    // هرگز کلمه اول (۱) یا کلمه آخر (words.length) هدف نباشد
    for (let wIdx = 2; wIdx <= v.words.length - 1; wIdx++) {
      const seg = segMap.get(wIdx);
      const wordAr = v.words[wIdx - 1];
      if (!seg || !wordAr) continue;
      candidates.push({
        verse: v.n,
        vPos,
        wordIndex: wIdx,
        wordAr,
        startMs: seg[0],
        endMs: seg[1],
        longEnough: bareLength(wordAr) >= 4,
      });
    }
  });

  if (candidates.length === 0) return [];

  // اولویت با کلمات میانی طولانی‌تر (≥۴ حرف) + درهم‌ریزی قطعی
  const prioritized = shuffle(candidates, rand).sort(
    (a, b) => Number(b.longEnough) - Number(a.longEnough),
  );
  const chosen = prioritized.slice(0, Math.min(count, prioritized.length));

  const allUnitWords = [...new Set(verses.flatMap((v) => v.words).filter(Boolean))];

  return chosen.map((c) => {
    if (hard) {
      return {
        verse: c.verse,
        wordIndex: c.wordIndex,
        wordAr: c.wordAr,
        options: [],
        startMs: c.startMs,
        endMs: c.endMs,
      };
    }

    // جمع‌آوری گزینه‌های انحرافی از همان آیه و آیات مجاور همان واحد
    const neighborWords: string[] = [];
    for (const v of verses) {
      if (Math.abs(v.n - c.verse) <= 1) {
        for (const w of v.words) {
          if (w && w !== c.wordAr && !neighborWords.includes(w)) {
            neighborWords.push(w);
          }
        }
      }
    }
    let distractors = shuffle(neighborWords, rand).slice(0, 3);
    if (distractors.length < 3) {
      const extra = shuffle(
        allUnitWords.filter((w) => w !== c.wordAr && !distractors.includes(w)),
        rand,
      );
      distractors = [...distractors, ...extra].slice(0, 3);
    }

    const options = shuffle([c.wordAr, ...distractors], rand);
    return {
      verse: c.verse,
      wordIndex: c.wordIndex,
      wordAr: c.wordAr,
      options,
      startMs: c.startMs,
      endMs: c.endMs,
    };
  });
}

/**
 * ثبت نتیجهٔ یک هدف در تمرین «صوت ناقص» (L1):
 * - همیشه در جدول attempts با sessionType: "MUTED" ثبت می‌شود.
 * - اگر کارت vr:<verse> دارای سابقهٔ واقعی FSRS است (hasRealFsrsHistory)، هرگز دست نمی‌خورد!
 * - اگر کارت ندارد یا تازه (state === 0) است، با review() و rating متناظر به‌روزرسانی می‌شود.
 */
export async function recordMutedTargetOutcome(opts: {
  unitId: string;
  verse: number;
  wordIndex: number;
  correct: boolean;
  responseMs: number;
  now?: Date;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const vrKey = `vr:${opts.verse}`;

  await ldb.transaction("rw", ldb.cards, ldb.attempts, async () => {
    await ldb.attempts.add({
      qid: `muted:${opts.verse}:${opts.wordIndex}`,
      unitId: opts.unitId,
      stage: 4,
      at: now.getTime(),
      correct: opts.correct,
      usedHint: false,
      responseMs: opts.responseMs,
      perTarget: { [vrKey]: opts.correct },
      sessionType: "MUTED",
    });

    const prev = await ldb.cards.get(vrKey);
    if (hasRealFsrsHistory(prev)) {
      return;
    }
    const base = prev ?? newCard(vrKey, now);
    const rating = ratingFor({
      correct: opts.correct,
      usedHint: false,
      responseMs: opts.responseMs,
    });
    await ldb.cards.put(review(base, rating, now));
  });
}
