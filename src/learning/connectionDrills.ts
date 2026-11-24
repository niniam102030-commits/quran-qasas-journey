// src/learning/connectionDrills.ts
// دریل‌های اتصال واحدبه‌واحد و شروع از وسط آیه (A3) — ماژول خالص TypeScript
import type { BaseVerse, Option, UnitPlan } from "../types/learning";
import { cleanWordToken, stripAllDiacritics, type RuntimeQuestion } from "./precisionGen";
import { rng, shuffle } from "./sessionPlanner";

/** تولید seed قطعی روزانه بر اساس تاریخ محلی (YYYYMMDD) */
export function dailyDrillSeed(now: Date = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return y * 10000 + m * 100 + d;
}

export interface UnitLinkInput {
  id: string;
  order: number;
  verseFrom: number;
  verseTo: number;
}

/**
 * تولید سؤال‌های اتصال واحدبه‌واحد برای همه جفت واحدهای متوالی:
 * نمایش آخرین آیه واحد قبلی و پرسش از آیه آغازین واحد بعد
 */
export function genUnitLinkQuestions(
  units: readonly Pick<UnitPlan, "id" | "order" | "verseFrom" | "verseTo">[],
  versesByNum: Map<number, BaseVerse>,
  opts?: { seed?: number; surah?: number },
): RuntimeQuestion[] {
  const sorted = units.slice().sort((a, b) => a.order - b.order || a.verseFrom - b.verseFrom);
  if (sorted.length < 2) return [];

  const seed = opts?.seed ?? dailyDrillSeed();
  const surah = opts?.surah ?? 28;
  const out: RuntimeQuestion[] = [];

  const allFirstVerses = sorted
    .map((u) => ({ unitId: u.id, verse: versesByNum.get(u.verseFrom) }))
    .filter((entry): entry is { unitId: string; verse: BaseVerse } => Boolean(entry.verse?.arText));

  const allSurahVerses = [...versesByNum.values()];

  for (let i = 0; i < sorted.length - 1; i++) {
    const prevUnit = sorted[i];
    const nextUnit = sorted[i + 1];
    const lastVerse = versesByNum.get(prevUnit.verseTo);
    const nextFirst = versesByNum.get(nextUnit.verseFrom);
    if (!lastVerse || !nextFirst) continue;

    const rand = rng((seed + i * 97 + surah * 13) >>> 0);
    const correctText = nextFirst.arText;

    const distractorCandidates = allFirstVerses
      .filter((x) => x.unitId !== nextUnit.id && x.verse.n !== lastVerse.n && x.verse.arText !== correctText)
      .map((x) => x.verse);

    // در سوره‌های کوچک با کمتر از ۴ واحد، از سایر آیات سوره تکمیل می‌شود
    const extraFallback =
      distractorCandidates.length < 3
        ? allSurahVerses.filter(
            (v) =>
              v.n !== nextFirst.n &&
              v.n !== lastVerse.n &&
              v.arText !== correctText &&
              !distractorCandidates.some((d) => d.n === v.n),
          )
        : [];

    const uniquePool: BaseVerse[] = [];
    const seenText = new Set<string>([correctText]);
    for (const v of [...shuffle(distractorCandidates, rand), ...shuffle(extraFallback, rand)]) {
      if (!seenText.has(v.arText)) {
        seenText.add(v.arText);
        uniquePool.push(v);
      }
      if (uniquePool.length === 3) break;
    }

    if (uniquePool.length === 0) continue;

    const optionsList = shuffle([nextFirst, ...uniquePool], rand);
    const options: Option[] = optionsList.map((v) => ({
      id: `v:${v.n}`,
      ar: v.arText,
    }));

    out.push({
      id: `exam:link:${surah}:${prevUnit.id}:${nextUnit.id}`,
      unitId: nextUnit.id,
      part: "drill",
      kind: "link",
      surah,
      type: "NEXT_VERSE_CHOICE",
      shape: "choice",
      stage: 5,
      difficulty: 4,
      skill: "sequence",
      verse: lastVerse.n,
      targets: [surah === 28 ? `sq:${lastVerse.n}` : `sq:${surah}:${lastVerse.n}`],
      promptFa: "آیهٔ آغازین واحد بعد کدام است؟",
      stem: {
        ar: lastVerse.arText,
        verse: lastVerse.n,
        fromUnitId: prevUnit.id,
        toUnitId: nextUnit.id,
      },
      options,
      answer: `v:${nextFirst.n}`,
      explanationFa: `پس از آخرین آیهٔ واحد قبل (آیه ${lastVerse.n})، واحد بعد با آیهٔ ${nextFirst.n} آغاز می‌شود.`,
    });
  }

  return out;
}

/**
 * تولید سؤال شروع از وسط آیه:
 * آیه با ≥ ۶ کلمه، نقطهٔ برش بین کلمه ۳ تا یکی‌مانده‌به‌آخر،
 * نمایش بخش اول و پرسش از کلمهٔ بعد با ۳ گزینهٔ دور از نقطهٔ برش از همان آیه
 */
export function genMidStartQuestion(
  verse: BaseVerse,
  opts?: { seed?: number; surah?: number; unitId?: string },
): RuntimeQuestion | null {
  if (!verse.words || verse.words.length < 6) return null;

  const minCut = 3; // حداقل ۳ کلمه نخست نمایش داده می‌شوند (سؤال از کلمه ۴ به بعد)
  const maxCut = verse.words.length - 2; // حداکثر کلمه یکی‌مانده‌به‌آخر پرسیده می‌شود
  if (maxCut < minCut) return null;

  const surah = opts?.surah ?? 28;
  const seed = opts?.seed ?? dailyDrillSeed();
  const rand = rng((seed + verse.n * 193 + surah * 31) >>> 0);
  const cut = minCut + Math.floor(rand() * (maxCut - minCut + 1));

  const targetWord = verse.words[cut];
  const targetClean = cleanWordToken(targetWord.ar);
  const targetBare = stripAllDiacritics(targetClean);
  if (!targetClean) return null;

  // انتخاب ۳ کلمه متمایز از همان آیه با اولویت بیشترین فاصله از نقطه برش
  const sameVerseCandidates = verse.words
    .map((w, idx) => ({ w, idx, dist: Math.abs(idx - cut), clean: cleanWordToken(w.ar), bare: stripAllDiacritics(w.ar) }))
    .filter((entry) => entry.idx !== cut && entry.clean && entry.clean !== targetClean && entry.bare !== targetBare);

  // مرتب‌سازی نزولی بر اساس فاصله از نقطه برش با کمی تنوع قطعی
  const farFirst = sameVerseCandidates.sort((a, b) => {
    const aFar = a.dist >= 2 ? 1 : 0;
    const bFar = b.dist >= 2 ? 1 : 0;
    if (aFar !== bFar) return bFar - aFar;
    return b.dist - a.dist;
  });

  const distractors: string[] = [];
  const seenBare = new Set<string>([targetBare]);
  for (const cand of farFirst) {
    if (!seenBare.has(cand.bare)) {
      seenBare.add(cand.bare);
      distractors.push(cand.clean);
    }
    if (distractors.length === 3) break;
  }

  if (distractors.length < 3) return null;

  const optionsText = shuffle([targetClean, ...distractors], rand);
  const options: Option[] = optionsText.map((txt, idx) => ({
    id: txt === targetClean ? `w_${cut}` : `d_${idx}_${cut}`,
    ar: txt,
  }));

  const shownText = verse.words.slice(0, cut).map((w) => w.ar).join(" ");

  return {
    id: `exam:midstart:${surah}:${verse.n}:${cut}`,
    unitId: opts?.unitId ?? `surah_${surah}`,
    part: "drill",
    kind: "midstart",
    surah,
    type: "CLOZE_COMPLETE_REST",
    shape: "choice",
    stage: 7,
    difficulty: 4,
    skill: "recall",
    verse: verse.n,
    targets: [surah === 28 ? `vr:${verse.n}` : `vr:${surah}:${verse.n}`],
    promptFa: "کلمهٔ بعد چیست؟",
    stem: {
      ar: `${shownText} …`,
      verse: verse.n,
      cut,
    },
    options,
    answer: `w_${cut}`,
    explanationFa: `در آیه ${verse.n}، کلمهٔ پس از «${cleanWordToken(verse.words[cut - 1].ar)}»، واژهٔ «${targetClean}» است.`,
  };
}

/**
 * ساخت صف دریل ترکیبی (اتصال واحدبه‌واحد + شروع از وسط)
 */
export function buildConnectionDrillQueue(input: {
  units: readonly Pick<UnitPlan, "id" | "order" | "verseFrom" | "verseTo">[];
  verses: readonly BaseVerse[];
  scopeUnitId?: string | null;
  seed?: number;
  surah?: number;
  size?: number;
}): RuntimeQuestion[] {
  const seed = input.seed ?? dailyDrillSeed();
  const surah = input.surah ?? 28;
  const size = input.size ?? 12;
  const rand = rng(seed);
  const versesByNum = new Map(input.verses.map((v) => [v.n, v]));

  const linkQs = genUnitLinkQuestions(input.units, versesByNum, { seed, surah });
  const scopedLinkQs = input.scopeUnitId
    ? linkQs.filter(
        (q) => q.stem.fromUnitId === input.scopeUnitId || q.stem.toUnitId === input.scopeUnitId,
      )
    : linkQs;

  const unitMap = new Map(input.units.map((u) => [u.id, u]));
  const scopedUnit = input.scopeUnitId ? unitMap.get(input.scopeUnitId) : undefined;
  const candidateVerses = scopedUnit
    ? input.verses.filter((v) => v.n >= scopedUnit.verseFrom && v.n <= scopedUnit.verseTo)
    : input.verses;

  const midStartQs: RuntimeQuestion[] = [];
  for (const v of candidateVerses) {
    const q = genMidStartQuestion(v, { seed, surah, unitId: scopedUnit?.id });
    if (q) midStartQs.push(q);
  }

  const pickedLinks = shuffle(scopedLinkQs.length > 0 ? scopedLinkQs : linkQs, rand);
  const pickedMids = shuffle(midStartQs, rand);

  // ترکیب متوازن دریل اتصال و شروع از وسط
  const combined: RuntimeQuestion[] = [];
  const maxLen = Math.max(pickedLinks.length, pickedMids.length);
  for (let i = 0; i < maxLen && combined.length < size; i++) {
    if (i < pickedLinks.length && combined.length < size) combined.push(pickedLinks[i]);
    if (i < pickedMids.length && combined.length < size) combined.push(pickedMids[i]);
  }
  return combined;
}
