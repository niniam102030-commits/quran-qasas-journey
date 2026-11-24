// src/learning/__tests__/examEngine.test.ts
import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ldb, type QuestionRow } from "../../db/learningDb";
import { newCard } from "../cardScheduler";
import {
  appendExamLog,
  assembleExamQueue,
  CHAPTER_BOSS_GEMS,
  classifyExamQuestion,
  EXAM_LOG_LIMIT,
  remedialTagsForExam,
  scoreExam,
  type ExamLogEntry,
} from "../examEngine";
import { getMeta, setMeta } from "../../services/metaStore";
import { getUserProfile } from "../../services/profileService";
import { useLearningStore } from "../../store/useLearningStore";
import type { BaseVerse, UnitPlan } from "../../types/learning";

const basePath = path.resolve(process.cwd(), "public/content/base/qasas.base.json");
const planPath = path.resolve(process.cwd(), "public/content/base/units-plan.json");
const qasasVerses = JSON.parse(fs.readFileSync(basePath, "utf8")) as BaseVerse[];
const unitsPlan = JSON.parse(fs.readFileSync(planPath, "utf8")) as UnitPlan[];

function makeDummyBank(units: UnitPlan[]): QuestionRow[] {
  const qs: QuestionRow[] = [];
  for (const u of units) {
    for (let i = 0; i < 6; i++) {
      const stage = [3, 5, 6, 2, 4, 5][i];
      qs.push({
        id: `bank_${u.id}_${i}`,
        unitId: u.id,
        stage,
        skill: stage === 5 ? "sequence" : "word",
        type: i === 5 ? "MUTASHABIH_SPOT" : "WORD_AR_TO_FA",
        shape: "choice",
        difficulty: 3,
        targets: [`vr:${u.verseFrom}`],
        options: [{ id: "o1", fa: "صحیح" }, { id: "o2", fa: "غلط" }],
        answer: "o1",
      });
    }
  }
  return qs;
}

describe("examEngine & EXAM session (A2)", () => {
  beforeEach(async () => {
    await ldb.delete();
    await ldb.open();
    useLearningStore.setState({
      status: "idle",
      sessionType: "STAGE",
      unitId: null,
      stage: 1,
      queue: [],
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      seen: new Set(),
      lastResult: null,
      summary: null,
      examState: null,
    });
  });

  it("scoreExam calculates exact penalties, levels, and floor at 0 on manual scenario", () => {
    // ۱ خطای حرف عطف (-3) + ۱ خطای اعراب (-2) => نمره ۹۵ (ممتاز)
    const ممتاز = scoreExam([
      { errorType: "conj", correct: false },
      { errorType: "irab_waqf", correct: false },
      { errorType: "mutashabih", correct: true },
      { errorType: "connection", correct: true },
      { errorType: "lafz_mana", correct: true },
    ]);
    expect(ممتاز.score).toBe(95);
    expect(ممتاز.level).toBe("ممتاز");
    expect(ممتاز.xpEarned).toBe(95);

    // کسر ۱+۱+۱+۱+۱ از همه دسته‌ها = 3 + 2 + 3 + 3 + 2 = 13 => نمره ۸۷ (قبول)
    const قبول = scoreExam([
      { errorType: "conj", correct: false },
      { errorType: "irab_waqf", correct: false },
      { errorType: "mutashabih", correct: false },
      { errorType: "connection", correct: false },
      { errorType: "lafz_mana", correct: false },
    ]);
    expect(قبول.score).toBe(87);
    expect(قبول.level).toBe("قبول");

    // ۱۸ خطا با کسر حداقل ۲ امتیاز => کف ۰ و سطح «نیاز به تمرین»
    const کف = scoreExam(
      Array.from({ length: 40 }, () => ({ errorType: "conj" as const, correct: false })),
    );
    expect(کف.score).toBe(0);
    expect(کف.level).toBe("نیاز به تمرین");
    expect(کف.xpEarned).toBe(0);
  });

  it("classifyExamQuestion maps conj, irab/waqf, mutashabih, connection, and bank questions accurately", () => {
    expect(classifyExamQuestion({ id: "exam:conj:28:3:6", type: "CLOZE_AR", kind: "conj" })).toBe("conj");
    expect(classifyExamQuestion({ id: "exam:irab:28:3:2", type: "ENDING_CHOICE", kind: "irab" })).toBe("irab_waqf");
    expect(classifyExamQuestion({ id: "exam:waqf:28:3", type: "ENDING_CHOICE", kind: "waqf" })).toBe("irab_waqf");
    expect(classifyExamQuestion({ id: "exam:link:28:u1:u2", type: "NEXT_VERSE_CHOICE", kind: "link" })).toBe("connection");
    expect(classifyExamQuestion({ id: "exam:midstart:28:4:3", type: "CLOZE_COMPLETE_REST", kind: "midstart" })).toBe("connection");
    expect(classifyExamQuestion({ id: "q1", type: "MUTASHABIH_SPOT" })).toBe("mutashabih");
    expect(classifyExamQuestion({ id: "q2", type: "WORD_AR_TO_FA", distractorTags: { o2: "similar_verse" } })).toBe("mutashabih");
    expect(classifyExamQuestion({ id: "q3", type: "WORD_AR_TO_FA" })).toBe("lafz_mana");
  });

  it("assembles 20/30/40 questions with 30/20/50 split and discloses shortfall when bank or pool is small", () => {
    const bank = makeDummyBank(unitsPlan);
    const unitRes = assembleExamQueue({
      scope: { type: "unit", id: "u_p386a" },
      units: unitsPlan,
      verses: qasasVerses,
      bankQuestions: bank,
      seed: 7,
    });
    expect(unitRes.queue.length).toBeLessThanOrEqual(20);
    expect(unitRes.counts.a1).toBeGreaterThan(0);
    expect(unitRes.counts.a3).toBeGreaterThan(0);

    const chapterRes = assembleExamQueue({
      scope: { type: "chapter", id: "ch2" },
      units: unitsPlan,
      verses: qasasVerses,
      bankQuestions: bank,
      seed: 7,
    });
    expect(chapterRes.queue).toHaveLength(30);

    const surahRes = assembleExamQueue({
      scope: { type: "surah", id: "surah_28" },
      units: unitsPlan,
      verses: qasasVerses,
      bankQuestions: bank,
      seed: 7,
    });
    expect(surahRes.queue).toHaveLength(40);
    expect(surahRes.counts.a1).toBe(12); // ۳۰٪ از ۴۰ = ۱۲
    expect(surahRes.counts.a3).toBe(8);  // ۲۰٪ از ۴۰ = ۸
    expect(surahRes.counts.bank).toBe(20); // ۵۰٪ از ۴۰ = ۲۰

    // کسری A1/A3 در واحد بسیار کوچک (u_p385b آیات ۱ تا ۵): با بانک جبران و در کارنامه ذکر می‌شود
    const smallUnitRes = assembleExamQueue({
      scope: { type: "unit", id: "u_p385b" },
      units: unitsPlan,
      verses: qasasVerses,
      bankQuestions: bank,
      seed: 1,
    });
    expect(smallUnitRes.shortfallNotes.length).toBeGreaterThan(0);
  });

  it("appendExamLog evicts oldest entries past 50 records", () => {
    let log: ExamLogEntry[] = [];
    for (let i = 1; i <= 55; i++) {
      log = appendExamLog(log, {
        id: `ex_${i}`,
        at: i * 1000,
        scope: { type: "unit", id: "u_p385b" },
        total: 20,
        score: 90,
        level: "قبول",
        byType: {
          conj: { asked: 4, wrong: 0 },
          irab_waqf: { asked: 4, wrong: 0 },
          mutashabih: { asked: 2, wrong: 0 },
          connection: { asked: 4, wrong: 0 },
          lafz_mana: { asked: 6, wrong: 5 },
        },
      });
    }
    expect(log).toHaveLength(EXAM_LOG_LIMIT);
    expect(log[0].id).toBe("ex_6");
    expect(log[49].id).toBe("ex_55");
  });

  it("EXAM store session: no requeue, no FSRS mutation, records examLog, awards chapter boss medal & 25 gems ONCE for score >= 85", async () => {
    const baseCard = newCard("vr:1");
    await ldb.cards.put(baseCard);

    const makeExamQ = (i: number): QuestionRow => ({
      id: `exam:conj:28:${i}:1`,
      unitId: "u_p385b",
      stage: 8,
      skill: "recall",
      type: "CLOZE_AR",
      shape: "choice",
      difficulty: 4,
      targets: ["vr:1"],
      options: [{ id: "و", ar: "و" }, { id: "ف", ar: "ف" }],
      answer: "و",
    });

    // آزمون ۱ فصل ch1: نمره ۹۷ (قبول ≥۸۵) ⇒ مدال + ۲۵ عقیق + ثبت کارنامه + ثبت attempts با sessionType='EXAM'
    useLearningStore.setState({
      status: "running",
      sessionType: "EXAM",
      unitId: null,
      stage: -6,
      queue: [makeExamQ(1), makeExamQ(2)],
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      seen: new Set(),
      examState: {
        scope: { type: "chapter", id: "ch1", labelFa: "فصل ۱" },
        startedAt: Date.now() - 5000,
        shortfallNotes: [],
        answers: [],
        result: null,
        logEntry: null,
        bossAwarded: false,
        bossGemsAwarded: 0,
      },
    });

    // پاسخ غلط روی سؤال اول: نباید requeue شود
    await useLearningStore.getState().submit("ف", { responseMs: 1200 });
    expect(useLearningStore.getState().queue).toHaveLength(2);
    await useLearningStore.getState().next();
    await useLearningStore.getState().submit("و", { responseMs: 1200 });
    await useLearningStore.getState().next();

    const exam1 = useLearningStore.getState().examState!;
    expect(exam1.result?.score).toBe(97); // ۱۰۰ - ۳
    expect(exam1.bossAwarded).toBe(true);
    expect(exam1.bossGemsAwarded).toBe(CHAPTER_BOSS_GEMS);

    // کارت FSRS نباید تغییر کرده باشد
    expect(await ldb.cards.get("vr:1")).toEqual(baseCard);

    // تلاش‌ها با sessionType='EXAM' ثبت شده‌اند
    const attempts = await ldb.attempts.toArray();
    expect(attempts).toHaveLength(2);
    expect(attempts.every((a) => a.sessionType === "EXAM")).toBe(true);

    // مدال و پروفایل
    expect(await getMeta<string[]>("chapterMedals", [])).toEqual(["ch1"]);
    let prof = await getUserProfile();
    expect(prof.aqeeqGems).toBe(25);
    expect(prof.noorXp).toBe(97);

    // آزمون ۲ مجدد همان فصل با نمره ۱۰۰ ⇒ مدال حفظ می‌شود اما ۲۵ عقیق تکراری داده نمی‌شود!
    useLearningStore.setState({
      status: "running",
      sessionType: "EXAM",
      unitId: null,
      stage: -6,
      queue: [makeExamQ(3)],
      index: 0,
      wrongCounts: {},
      firstAttempts: [],
      seen: new Set(),
      examState: {
        scope: { type: "chapter", id: "ch1", labelFa: "فصل ۱" },
        startedAt: Date.now() - 1000,
        shortfallNotes: [],
        answers: [],
        result: null,
        logEntry: null,
        bossAwarded: false,
        bossGemsAwarded: 0,
      },
    });
    await useLearningStore.getState().submit("و", { responseMs: 1000 });
    await useLearningStore.getState().next();

    expect(useLearningStore.getState().examState?.bossAwarded).toBe(false);
    prof = await getUserProfile();
    expect(prof.aqeeqGems).toBe(25); // همچنان ۲۵ (فقط یک بار)

    // ساخت بسته ترمیمی از روی کارنامهٔ آزمون اول
    const log = await getMeta<ExamLogEntry[]>("examLog", []);
    expect(log).toHaveLength(2);
    const remedialTags = remedialTagsForExam(log[0]);
    expect(remedialTags).toEqual(["exam_conj"]);

    // درج یک سؤال واقعی در بانک با هدف vr:1 و تست startRemedial با برچسب آزمون
    await ldb.questions.put({
      id: "bank_vr1",
      unitId: "u_p385b",
      stage: 3,
      skill: "recall",
      type: "BUILD_FROM_NUMBER",
      shape: "choice",
      difficulty: 2,
      targets: ["vr:1"],
      options: [{ id: "o1", ar: "طسٓمٓ" }, { id: "o2", ar: "حمٓ" }],
      answer: "o1",
    });
    await setMeta("examLog", log);
    await useLearningStore.getState().startRemedial(remedialTags.join(","));
    expect(useLearningStore.getState().sessionType).toBe("REMEDIAL");
    expect(useLearningStore.getState().queue.map((q) => q.id)).toEqual(["bank_vr1"]);
  });
});
