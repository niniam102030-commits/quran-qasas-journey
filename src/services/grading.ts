// src/services/grading.ts
import type {
  Question,
  ChoiceQuestion,
  MatchQuestion,
  OrderQuestion,
  ClozeQuestion,
  QuestionBase,
  GradeResult,
  CardKey,
} from "../types/learning";

/**
 * تصحیح قطعی و کامپیوترپایه هر سوال بدون مقایسه رشته‌ای متن عربی
 */
export function gradeQuestion(q: Question, response: unknown): GradeResult {
  switch (q.shape) {
    case "choice":
      return gradeChoice(q as ChoiceQuestion, response as string);
    case "match":
      return gradeMatch(q as MatchQuestion, response as [string, string][]);
    case "order":
      return gradeOrder(q as OrderQuestion, response as string[]);
    case "cloze":
      return gradeCloze(q as ClozeQuestion, response as Record<string, string>);
    default: {
      const base = q as QuestionBase;
      return {
        correct: false,
        score: 0,
        perTarget: mapTargets(base.targets || [], false),
        wrongOptionIds: [],
      };
    }
  }
}

function mapTargets(targets: CardKey[], value: boolean): Record<CardKey, boolean> {
  const result: Record<CardKey, boolean> = {};
  for (const t of targets) {
    result[t] = value;
  }
  return result;
}

function gradeChoice(q: ChoiceQuestion, userOptionId: string): GradeResult {
  const isCorrect = userOptionId === q.answer;
  return {
    correct: isCorrect,
    score: isCorrect ? 1 : 0,
    perTarget: mapTargets(q.targets, isCorrect),
    wrongOptionIds: isCorrect || !userOptionId ? [] : [userOptionId],
  };
}

function gradeMatch(q: MatchQuestion, userPairs: [string, string][] = []): GradeResult {
  if (!Array.isArray(userPairs) || q.pairs.length === 0) {
    return {
      correct: false,
      score: 0,
      perTarget: mapTargets(q.targets, false),
      wrongOptionIds: [],
    };
  }

  const expectedMap = new Map<string, string>(q.pairs);
  let correctCount = 0;
  const wrongOptionIds: string[] = [];

  for (const [leftId, rightId] of userPairs) {
    if (expectedMap.get(leftId) === rightId) {
      correctCount++;
    } else {
      wrongOptionIds.push(`${leftId}>${rightId}`);
    }
  }

  const score = correctCount / q.pairs.length;
  const isCorrect = score === 1;

  return {
    correct: isCorrect,
    score,
    perTarget: mapTargets(q.targets, isCorrect),
    wrongOptionIds,
  };
}

function gradeOrder(q: OrderQuestion, userBankIds: string[] = []): GradeResult {
  if (!Array.isArray(userBankIds) || q.answer.length === 0) {
    return {
      correct: false,
      score: 0,
      perTarget: mapTargets(q.targets, false),
      wrongOptionIds: [],
    };
  }

  let matchCount = 0;
  const wrongOptionIds: string[] = [];

  for (let i = 0; i < q.answer.length; i++) {
    if (userBankIds[i] === q.answer[i]) {
      matchCount++;
    } else if (userBankIds[i]) {
      wrongOptionIds.push(userBankIds[i]);
    }
  }

  const isExact =
    userBankIds.length === q.answer.length &&
    userBankIds.every((id, idx) => id === q.answer[idx]);

  const score = isExact ? 1 : matchCount / q.answer.length;

  return {
    correct: isExact,
    score,
    // پاسخ ناقص برای هیچ کارتی «درست» ثبت نمی‌شود (score فقط برای بازخورد UI است)
    perTarget: mapTargets(q.targets, isExact),
    wrongOptionIds,
  };
}

function gradeCloze(
  q: ClozeQuestion,
  userMap: Record<string, string> = {}
): GradeResult {
  const keys = Object.keys(q.answer);
  if (keys.length === 0) {
    return {
      correct: false,
      score: 0,
      perTarget: mapTargets(q.targets, false),
      wrongOptionIds: [],
    };
  }

  let correctCount = 0;
  const wrongOptionIds: string[] = [];

  for (const k of keys) {
    if (userMap[k] === q.answer[k]) {
      correctCount++;
    } else if (userMap[k]) {
      wrongOptionIds.push(`${k}:${userMap[k]}`);
    }
  }

  const score = correctCount / keys.length;
  const isCorrect = score === 1;

  return {
    correct: isCorrect,
    score,
    perTarget: mapTargets(q.targets, isCorrect),
    wrongOptionIds,
  };
}
