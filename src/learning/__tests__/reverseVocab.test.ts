import { describe, expect, it } from "vitest";
import type { QuestionRow } from "../../db/learningDb";
import { gradeQuestion } from "../../services/grading";
import type { Question } from "../../types/learning";
import {
  buildReverseVocabQuestions,
  mergeReverseIntoStage2Queue,
  MAX_REVERSE_PER_LESSON,
} from "../reverseVocab";

const SAMPLE_LEX = [
  { wordId: "w28_002_001", unitId: "u_p385b", ar: "تِلْكَ", meaningFa: "آن", rootAr: "-" },
  { wordId: "w28_002_002", unitId: "u_p385b", ar: "ءَايَـٰتُ", meaningFa: "آیات باعظمت", rootAr: "أ ي ي" },
  { wordId: "w28_002_003", unitId: "u_p385b", ar: "ٱلْكِتَـٰبِ", meaningFa: "کتاب روشنگر", rootAr: "ك ت ب" },
  { wordId: "w28_002_004", unitId: "u_p385b", ar: "ٱلْمُبِينِ", meaningFa: "آشکارکننده", rootAr: "ب ي ن" },
  { wordId: "w28_003_001", unitId: "u_p385b", ar: "نَتْلُوا۟", meaningFa: "تلاوت می‌کنیم", rootAr: "ت ل و" },
];

describe("reverseVocab (L6)", () => {
  it("returns empty when unit has fewer than 4 distinct words", () => {
    expect(buildReverseVocabQuestions(SAMPLE_LEX.slice(0, 3), "u_p385b", 3, 42)).toEqual([]);
  });

  it("builds deterministic REVERSE_MEANING choice questions with exact ar answer and 3 distinct distractors", () => {
    const q1 = buildReverseVocabQuestions(SAMPLE_LEX, "u_p385b", 3, 123);
    const q2 = buildReverseVocabQuestions(SAMPLE_LEX, "u_p385b", 3, 123);
    expect(q1).toEqual(q2);
    expect(q1).toHaveLength(3);

    for (const q of q1) {
      expect(q.id.startsWith("rev:")).toBe(true);
      expect(q.stage).toBe(2);
      expect(q.type).toBe("REVERSE_MEANING");
      expect(q.shape).toBe("choice");
      expect(q.options).toHaveLength(4);
      const arSet = new Set(q.options.map((o) => o.ar));
      expect(arSet.size).toBe(4);

      const lexEntry = SAMPLE_LEX.find((l) => `rev:${l.wordId}` === q.id)!;
      const ansOpt = q.options.find((o) => o.id === q.answer)!;
      expect(ansOpt.ar).toBe(lexEntry.ar);
      expect(q.targets).toEqual([`w:${lexEntry.wordId}`]);

      // Compatible with gradeQuestion
      const grade = gradeQuestion(q as unknown as Question, "o1");
      expect(grade.correct).toBe(true);
      expect(grade.perTarget[`w:${lexEntry.wordId}`]).toBe(true);
    }
  });

  it("enforces max 3 reverse questions when merging into stage 2 queue", () => {
    const rev = buildReverseVocabQuestions(SAMPLE_LEX, "u_p385b", 5, 7);
    const shortQueue: QuestionRow[] = [
      { id: "q1", unitId: "u_p385b", stage: 2, skill: "translation", type: "VERSE_TO_TRANSLATION", shape: "choice", difficulty: 2, targets: ["vt:2"] },
      { id: "q2", unitId: "u_p385b", stage: 2, skill: "translation", type: "VERSE_TO_TRANSLATION", shape: "choice", difficulty: 2, targets: ["vt:3"] },
    ];
    const mergedShort = mergeReverseIntoStage2Queue(shortQueue, rev, 10);
    const revInShort = mergedShort.filter((q) => q.type === "REVERSE_MEANING");
    expect(revInShort.length).toBeLessThanOrEqual(MAX_REVERSE_PER_LESSON);
    expect(revInShort.length).toBe(3);

    const fullQueue: QuestionRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `qf_${i}`,
      unitId: "u_p385b",
      stage: 2,
      skill: "translation",
      type: "VERSE_TO_TRANSLATION",
      shape: "choice",
      difficulty: 2,
      targets: [`vt:${i + 1}`],
    }));
    const mergedFull = mergeReverseIntoStage2Queue(fullQueue, rev, 10);
    expect(mergedFull).toHaveLength(10);
    expect(mergedFull.filter((q) => q.type === "REVERSE_MEANING").length).toBeLessThanOrEqual(MAX_REVERSE_PER_LESSON);
  });
});
