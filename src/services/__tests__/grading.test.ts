// src/services/__tests__/grading.test.ts
import { describe, expect, it } from "vitest";
import { gradeQuestion } from "../grading";
import type { ChoiceQuestion, MatchQuestion, OrderQuestion, ClozeQuestion } from "../../types/learning";

describe("gradeQuestion - 4 shapes and partial responses", () => {
  it("choice: correct answer gives full score and true perTarget", () => {
    const q: ChoiceQuestion = {
      id: "q1",
      unitId: "u_p385a",
      part: "A",
      type: "WORD_AR_TO_FA",
      shape: "choice",
      stage: 1,
      difficulty: 1,
      skill: "word",
      targets: ["w:w28_001_001"],
      promptFa: "معنای کلمه",
      stem: {},
      options: [{ id: "o1", fa: "معنا ۱" }, { id: "o2", fa: "معنا ۲" }],
      answer: "o1",
      explanationFa: "توضیح",
    };

    const res = gradeQuestion(q, "o1");
    expect(res.correct).toBe(true);
    expect(res.score).toBe(1);
    expect(res.perTarget["w:w28_001_001"]).toBe(true);
    expect(res.wrongOptionIds).toEqual([]);
  });

  it("choice: wrong answer gives 0 score, false perTarget, and identifies wrongOptionIds", () => {
    const q: ChoiceQuestion = {
      id: "q1",
      unitId: "u_p385a",
      part: "A",
      type: "WORD_AR_TO_FA",
      shape: "choice",
      stage: 1,
      difficulty: 1,
      skill: "word",
      targets: ["w:w28_001_001"],
      promptFa: "معنای کلمه",
      stem: {},
      options: [{ id: "o1", fa: "معنا ۱" }, { id: "o2", fa: "معنا ۲" }],
      answer: "o1",
      explanationFa: "توضیح",
    };

    const res = gradeQuestion(q, "o2");
    expect(res.correct).toBe(false);
    expect(res.score).toBe(0);
    expect(res.perTarget["w:w28_001_001"]).toBe(false);
    expect(res.wrongOptionIds).toEqual(["o2"]);
  });

  it("match: complete match gives true, partial response gives perTarget ALL false", () => {
    const q: MatchQuestion = {
      id: "q2",
      unitId: "u_p385a",
      part: "B",
      type: "MATCH_WORDS",
      shape: "match",
      stage: 3,
      difficulty: 2,
      skill: "word",
      targets: ["w:w28_001_001", "w:w28_001_002"],
      promptFa: "جفت‌ها را وصل کنید",
      stem: {},
      left: [{ id: "l1", ar: "طسم" }, { id: "l2", ar: "تِلْكَ" }],
      right: [{ id: "r1", fa: "طا سین میم" }, { id: "r2", fa: "این" }],
      pairs: [["l1", "r1"], ["l2", "r2"]],
      explanationFa: "توضیح جفت‌ها",
    };

    // Full match
    const fullRes = gradeQuestion(q, [["l1", "r1"], ["l2", "r2"]]);
    expect(fullRes.correct).toBe(true);
    expect(fullRes.score).toBe(1);
    expect(fullRes.perTarget["w:w28_001_001"]).toBe(true);
    expect(fullRes.perTarget["w:w28_001_002"]).toBe(true);

    // Partial response: 1 of 2 right -> score 0.5, but perTarget MUST BE ALL FALSE
    const partialRes = gradeQuestion(q, [["l1", "r1"], ["l2", "r1"]]);
    expect(partialRes.correct).toBe(false);
    expect(partialRes.score).toBe(0.5);
    expect(partialRes.perTarget["w:w28_001_001"]).toBe(false);
    expect(partialRes.perTarget["w:w28_001_002"]).toBe(false);
  });

  it("order: exact order gives true, partial order gives perTarget ALL false", () => {
    const q: OrderQuestion = {
      id: "q3",
      unitId: "u_p385a",
      part: "C",
      type: "ORDER_VERSES",
      shape: "order",
      stage: 5,
      difficulty: 3,
      skill: "page",
      targets: ["pg:u_p385a"],
      promptFa: "آیات را مرتب کنید",
      stem: {},
      bank: [{ id: "b1", ar: "آیه ۱" }, { id: "b2", ar: "آیه ۲" }, { id: "b3", ar: "آیه ۳" }],
      answer: ["b1", "b2", "b3"],
      explanationFa: "ترتیب",
    };

    // Full match
    const fullRes = gradeQuestion(q, ["b1", "b2", "b3"]);
    expect(fullRes.correct).toBe(true);
    expect(fullRes.score).toBe(1);
    expect(fullRes.perTarget["pg:u_p385a"]).toBe(true);

    // Partial match (e.g. b1, b3, b2) -> perTarget MUST BE FALSE
    const partialRes = gradeQuestion(q, ["b1", "b3", "b2"]);
    expect(partialRes.correct).toBe(false);
    expect(partialRes.score).toBeCloseTo(1 / 3);
    expect(partialRes.perTarget["pg:u_p385a"]).toBe(false);
  });

  it("cloze: all gaps right gives true, partial gaps gives perTarget ALL false", () => {
    const q: ClozeQuestion = {
      id: "q4",
      unitId: "u_p385a",
      part: "C",
      type: "CLOZE_AR",
      shape: "cloze",
      stage: 4,
      difficulty: 3,
      skill: "recall",
      targets: ["vr:3"],
      promptFa: "جای خالی را پر کنید",
      stem: {},
      bank: [{ id: "b1", ar: "نَتْلُوا۟" }, { id: "b2", ar: "عَلَيْكَ" }],
      answer: { "1": "b1", "2": "b2" },
      explanationFa: "توضیح کلوز",
    };

    // Full match
    const fullRes = gradeQuestion(q, { "1": "b1", "2": "b2" });
    expect(fullRes.correct).toBe(true);
    expect(fullRes.score).toBe(1);
    expect(fullRes.perTarget["vr:3"]).toBe(true);

    // Partial match (gap 1 right, gap 2 wrong or empty)
    const partialRes = gradeQuestion(q, { "1": "b1", "2": "wrong" });
    expect(partialRes.correct).toBe(false);
    expect(partialRes.score).toBe(0.5);
    expect(partialRes.perTarget["vr:3"]).toBe(false);
  });
});
