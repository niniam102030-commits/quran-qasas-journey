// src/learning/examEngine.ts
// موتور شبیه‌ساز آزمون رسمی حفظ + باس فصل (A2) — ماژول کاملاً خالص TypeScript
import type { QuestionRow } from "../db/learningDb";
import type { BaseVerse, UnitPlan } from "../types/learning";
import { STORY_CHAPTERS } from "./chapters";
import { buildConnectionDrillQueue, genMidStartQuestion, genUnitLinkQuestions } from "./connectionDrills";
import {
  buildStandaloneWordSet,
  genConjunctionQuestion,
  genIrabQuestion,
  genWaqfQuestion,
  type RuntimeQuestion,
} from "./precisionGen";
import { rng, shuffle } from "./sessionPlanner";

export type ExamScopeType = "unit" | "chapter" | "surah";

export interface ExamScope {
  type: ExamScopeType;
  id: string;
  labelFa?: string;
}

export type ExamErrorType =
  | "conj"
  | "irab_waqf"
  | "mutashabih"
  | "connection"
  | "lafz_mana";

export type ExamLevel = "ممتاز" | "قبول" | "نیاز به تمرین";

export const EXAM_QUESTION_COUNTS: Record<ExamScopeType, number> = {
  unit: 20,
  chapter: 30,
  surah: 40,
};

export const EXAM_PENALTIES: Record<ExamErrorType, number> = {
  conj: 3,
  irab_waqf: 2,
  mutashabih: 3,
  connection: 3,
  lafz_mana: 2,
};

export const EXAM_ERROR_LABELS: Record<ExamErrorType, string> = {
  conj: "حرف عطف",
  irab_waqf: "اعراب و وقف",
  mutashabih: "متشابهات",
  connection: "اتصال و ترتیب",
  lafz_mana: "لفظ و معنا",
};

export const EXAM_LOG_LIMIT = 50;
export const CHAPTER_BOSS_PASS_SCORE = 85;
export const CHAPTER_BOSS_GEMS = 25;

export interface ExamTypeStat {
  asked: number;
  wrong: number;
}

export interface ExamLogEntry {
  id: string;
  at: number;
  scope: { type: ExamScopeType; id: string; label?: string };
  total: number;
  score: number;
  level: ExamLevel;
  byType: Record<ExamErrorType, ExamTypeStat>;
  shortfallNotes?: string[];
}

export function classifyExamQuestion(q: Pick<QuestionRow, "id" | "type"> & { kind?: string; distractorTags?: Record<string, string> }): ExamErrorType {
  if (q.kind === "conj" || q.id.startsWith("exam:conj:")) return "conj";
  if (q.kind === "irab" || q.kind === "waqf" || q.id.startsWith("exam:irab:") || q.id.startsWith("exam:waqf:")) {
    return "irab_waqf";
  }
  if (q.kind === "link" || q.kind === "midstart" || q.id.startsWith("exam:link:") || q.id.startsWith("exam:midstart:")) {
    return "connection";
  }
  const tags = Object.values(q.distractorTags ?? {});
  if (q.type === "MUTASHABIH_SPOT" || tags.includes("similar_verse")) {
    return "mutashabih";
  }
  return "lafz_mana";
}

export function examConfusionTagFor(errorType: ExamErrorType): string {
  switch (errorType) {
    case "conj":
      return "exam_conj";
    case "irab_waqf":
      return "exam_irab_waqf";
    case "mutashabih":
      return "similar_verse";
    case "connection":
      return "neighbor_verse";
    case "lafz_mana":
      return "exam_lafz_mana";
  }
}

export function remedialTagsForExam(entry: ExamLogEntry): string[] {
  const tags: string[] = [];
  for (const [errType, stat] of Object.entries(entry.byType) as [ExamErrorType, ExamTypeStat][]) {
    if (stat.wrong > 0) {
      tags.push(examConfusionTagFor(errType));
    }
  }
  return [...new Set(tags)];
}

export function resolveScopeUnitsAndVerses(
  scope: ExamScope,
  units: readonly UnitPlan[],
  verses: readonly BaseVerse[],
): { scopeUnits: UnitPlan[]; scopeVerses: BaseVerse[]; unitIds: Set<string>; verseNums: Set<number> } {
  const sortedUnits = units.slice().sort((a, b) => a.order - b.order);
  if (scope.type === "unit") {
    const u = sortedUnits.find((x) => x.id === scope.id);
    const scopeUnits = u ? [u] : [];
    const verseNums = new Set<number>();
    if (u) {
      for (let n = u.verseFrom; n <= u.verseTo; n++) verseNums.add(n);
    }
    const scopeVerses = verses.filter((v) => verseNums.has(v.n));
    return { scopeUnits, scopeVerses, unitIds: new Set(scopeUnits.map((x) => x.id)), verseNums };
  }
  if (scope.type === "chapter") {
    const ch = STORY_CHAPTERS.find((c) => c.id === scope.id);
    if (!ch) return { scopeUnits: [], scopeVerses: [], unitIds: new Set(), verseNums: new Set() };
    const scopeUnits = sortedUnits.filter((u) => u.verseFrom >= ch.verseFrom && u.verseFrom <= ch.verseTo);
    const verseNums = new Set<number>();
    for (let n = ch.verseFrom; n <= ch.verseTo; n++) verseNums.add(n);
    const scopeVerses = verses.filter((v) => verseNums.has(v.n));
    return { scopeUnits, scopeVerses, unitIds: new Set(scopeUnits.map((x) => x.id)), verseNums };
  }

  const verseNums = new Set(verses.map((v) => v.n));
  return {
    scopeUnits: sortedUnits,
    scopeVerses: verses.slice(),
    unitIds: new Set(sortedUnits.map((x) => x.id)),
    verseNums,
  };
}

export interface ExamAssemblyResult {
  queue: QuestionRow[];
  targetTotal: number;
  counts: { a1: number; a3: number; bank: number };
  shortfallNotes: string[];
}

export function assembleExamQueue(input: {
  scope: ExamScope;
  units: readonly UnitPlan[];
  verses: readonly BaseVerse[];
  bankQuestions: readonly QuestionRow[];
  lexiconSet?: Set<string>;
  morphologyMap?: Record<string, { segments?: { text: string; type: string; pos: string }[] }>;
  seed?: number;
  surah?: number;
}): ExamAssemblyResult {
  const targetTotal = EXAM_QUESTION_COUNTS[input.scope.type];
  const seed = input.seed ?? Date.now() & 0xffff;
  const surah = input.surah ?? 28;
  const rand = rng(seed);

  const { scopeUnits, scopeVerses, unitIds } = resolveScopeUnitsAndVerses(input.scope, input.units, input.verses);
  const standaloneSet = buildStandaloneWordSet(input.verses);
  const versesByNum = new Map(input.verses.map((v) => [v.n, v]));

  // سهمیه‌های استاندارد: ۳۰٪ A1، ۲۰٪ A3، ۵۰٪ بانک
  const targetA1 = Math.round(targetTotal * 0.3);
  const targetA3 = Math.round(targetTotal * 0.2);
  const targetBank = targetTotal - targetA1 - targetA3;

  // ۱) تولید استخر A1 متوازن میان conj / irab / waqf
  const conjPool: RuntimeQuestion[] = [];
  const irabPool: RuntimeQuestion[] = [];
  const waqfPool: RuntimeQuestion[] = [];
  for (const v of shuffle(scopeVerses, rand)) {
    const qc = genConjunctionQuestion(v, {
      surah,
      standaloneSet,
      lexiconSet: input.lexiconSet,
      morphologyMap: input.morphologyMap,
      seed: seed + v.n * 11,
      unitId: scopeUnits[0]?.id ?? `surah_${surah}`,
    });
    if (qc) conjPool.push(qc);
    const qi = genIrabQuestion(v, { surah, seed: seed + v.n * 17, unitId: scopeUnits[0]?.id ?? `surah_${surah}` });
    if (qi) irabPool.push(qi);
    const qw = genWaqfQuestion(v, { surah, seed: seed + v.n * 23, unitId: scopeUnits[0]?.id ?? `surah_${surah}` });
    if (qw) waqfPool.push(qw);
  }

  const pickedA1: RuntimeQuestion[] = [];
  let ci = 0;
  let ii = 0;
  let wi = 0;
  while (pickedA1.length < targetA1 && (ci < conjPool.length || ii < irabPool.length || wi < waqfPool.length)) {
    if (ci < conjPool.length && pickedA1.length < targetA1) pickedA1.push(conjPool[ci++]);
    if (ii < irabPool.length && pickedA1.length < targetA1) pickedA1.push(irabPool[ii++]);
    if (wi < waqfPool.length && pickedA1.length < targetA1) pickedA1.push(waqfPool[wi++]);
  }
  const remainingA1 = [...conjPool.slice(ci), ...irabPool.slice(ii), ...waqfPool.slice(wi)];

  // ۲) تولید استخر A3 (اتصال و شروع از وسط)
  const linkAll = genUnitLinkQuestions(input.units, versesByNum, { seed, surah });
  const scopedLinks = linkAll.filter(
    (q) => unitIds.has(String(q.stem.fromUnitId ?? "")) || unitIds.has(String(q.stem.toUnitId ?? "")),
  );
  const midAll: RuntimeQuestion[] = [];
  for (const v of shuffle(scopeVerses, rand)) {
    const qm = genMidStartQuestion(v, { seed: seed + v.n * 29, surah, unitId: scopeUnits[0]?.id });
    if (qm) midAll.push(qm);
  }
  const pickedA3: RuntimeQuestion[] = [];
  const sLinks = shuffle(scopedLinks, rand);
  const sMids = shuffle(midAll, rand);
  let li = 0;
  let mi = 0;
  while (pickedA3.length < targetA3 && (li < sLinks.length || mi < sMids.length)) {
    if (li < sLinks.length && pickedA3.length < targetA3) pickedA3.push(sLinks[li++]);
    if (mi < sMids.length && pickedA3.length < targetA3) pickedA3.push(sMids[mi++]);
  }
  const remainingA3 = [...sLinks.slice(li), ...sMids.slice(mi)];

  // ۳) استخر بانک سؤال با اولویت مراحل ۳، ۵، ۶ و متشابهات
  const scopedBank = input.bankQuestions.filter((q) => unitIds.has(q.unitId));
  const priorityBank = shuffle(
    scopedBank.filter((q) => {
      const tags = Object.values((q.distractorTags as Record<string, string> | undefined) ?? {});
      return q.stage === 3 || q.stage === 5 || q.stage === 6 || q.type === "MUTASHABIH_SPOT" || tags.includes("similar_verse");
    }),
    rand,
  );
  const otherBank = shuffle(
    scopedBank.filter((q) => !priorityBank.some((p) => p.id === q.id)),
    rand,
  );
  const orderedBank = [...priorityBank, ...otherBank];
  const pickedBank = orderedBank.slice(0, targetBank);
  let bankCursor = pickedBank.length;

  const shortfallNotes: string[] = [];
  if (pickedA1.length < targetA1) {
    shortfallNotes.push(`موجودی سؤال‌های دقیق (عطف/اعراب/وقف) ${pickedA1.length} از ${targetA1} بود و کسری از بانک جبران شد.`);
  }
  if (pickedA3.length < targetA3) {
    shortfallNotes.push(`موجودی سؤال‌های اتصال و شروع از وسط ${pickedA3.length} از ${targetA3} بود و کسری از بانک جبران شد.`);
  }

  // جبران کسری A1/A3 از بانک (طبق مشخصات)
  const combined: QuestionRow[] = [
    ...(pickedA1 as unknown as QuestionRow[]),
    ...(pickedA3 as unknown as QuestionRow[]),
    ...pickedBank,
  ];
  while (combined.length < targetTotal && bankCursor < orderedBank.length) {
    combined.push(orderedBank[bankCursor++]);
  }

  // در پک سوره بدون سؤال (که بانک خالی است)، کسری از سایر سؤال‌های A1/A3 همان دامنه پر می‌شود
  if (combined.length < targetTotal) {
    if (orderedBank.length === 0) {
      shortfallNotes.push("این دامنه هنوز بانک سؤال تمرینی ندارد؛ کسری سؤال‌ها از مولّدهای متنی تکمیل شد.");
    } else if (pickedBank.length < targetBank) {
      shortfallNotes.push(`موجودی بانک سؤال ${pickedBank.length} از ${targetBank} بود.`);
    }
    const extraRuntime = [
      ...remainingA1,
      ...remainingA3,
      ...buildConnectionDrillQueue({
        units: input.units,
        verses: scopeVerses,
        scopeUnitId: input.scope.type === "unit" ? input.scope.id : null,
        seed: seed + 777,
        surah,
        size: targetTotal,
      }),
    ];
    const usedIds = new Set(combined.map((q) => q.id));
    for (const eq of extraRuntime) {
      if (combined.length >= targetTotal) break;
      if (!usedIds.has(eq.id)) {
        usedIds.add(eq.id);
        combined.push(eq as unknown as QuestionRow);
      }
    }
  }

  const finalQueue = shuffle(combined, rand).slice(0, targetTotal);
  const counts = {
    a1: finalQueue.filter((q) => q.id.startsWith("exam:conj:") || q.id.startsWith("exam:irab:") || q.id.startsWith("exam:waqf:")).length,
    a3: finalQueue.filter((q) => q.id.startsWith("exam:link:") || q.id.startsWith("exam:midstart:")).length,
    bank: finalQueue.filter((q) => !q.id.startsWith("exam:")).length,
  };

  return {
    queue: finalQueue,
    targetTotal,
    counts,
    shortfallNotes,
  };
}

export interface ExamScoreResult {
  score: number;
  level: ExamLevel;
  xpEarned: number;
  byType: Record<ExamErrorType, ExamTypeStat>;
  total: number;
  correctCount: number;
  wrongCount: number;
}

export function scoreExam(answers: readonly { errorType: ExamErrorType; correct: boolean }[]): ExamScoreResult {
  const byType: Record<ExamErrorType, ExamTypeStat> = {
    conj: { asked: 0, wrong: 0 },
    irab_waqf: { asked: 0, wrong: 0 },
    mutashabih: { asked: 0, wrong: 0 },
    connection: { asked: 0, wrong: 0 },
    lafz_mana: { asked: 0, wrong: 0 },
  };

  let penalty = 0;
  let correctCount = 0;
  let wrongCount = 0;

  for (const a of answers) {
    byType[a.errorType].asked += 1;
    if (a.correct) {
      correctCount += 1;
    } else {
      wrongCount += 1;
      byType[a.errorType].wrong += 1;
      penalty += EXAM_PENALTIES[a.errorType];
    }
  }

  const score = Math.max(0, 100 - penalty);
  const level: ExamLevel =
    score >= 95 ? "ممتاز" : score >= 85 ? "قبول" : "نیاز به تمرین";
  const xpEarned = Math.min(100, Math.floor(score));

  return {
    score,
    level,
    xpEarned,
    byType,
    total: answers.length,
    correctCount,
    wrongCount,
  };
}

export function appendExamLog(prev: readonly ExamLogEntry[], entry: ExamLogEntry): ExamLogEntry[] {
  const next = [...prev, entry];
  if (next.length <= EXAM_LOG_LIMIT) return next;
  return next.slice(next.length - EXAM_LOG_LIMIT);
}
