// src/components/learning/questionShuffle.ts
// برهم‌زدن پایدار و تضمینی گزینه‌ها برای سوالات چیدنی، تطبیقی، جای‌خالی و چندگزینه‌ای
import { rng, shuffle } from "../../learning/sessionPlanner";

export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffleItems<T>(items: readonly T[], seedKey: string): T[] {
  if (items.length <= 1) return items.slice();
  return shuffle(items.slice(), rng(hashSeed(seedKey)));
}

/**
 * برهم‌زدن بانک سوالات چیدنی (order) با تضمین اینکه ترتیب نمایش‌داده‌شده
 * با پاسخ درست (یا پیشوند آن در صورت وجود گزینه‌های انحرافی) یکی نباشد.
 */
export function shuffleOrderBank<T extends { id: string }>(
  bank: readonly T[],
  answer: readonly string[] | undefined,
  seedKey: string,
): T[] {
  if (bank.length <= 1) return bank.slice();
  const ans = Array.isArray(answer) ? answer : [];

  const isSameAsAnswerPrefix = (arr: T[]) =>
    ans.length > 1 && ans.every((id, idx) => arr[idx]?.id === id);

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = shuffle(bank.slice(), rng(hashSeed(`${seedKey}:${attempt}`)));
    if (!isSameAsAnswerPrefix(candidate)) return candidate;
  }

  // Fallback قطعی: جابه‌جایی دو عنصر اول برای جلوگیری از نمایش مرتب
  const fallback = bank.slice();
  [fallback[0], fallback[1]] = [fallback[1], fallback[0]];
  return fallback;
}

/**
 * برهم‌زدن ستون راست در سوالات تطبیقی (match) به‌طوری که تا حد امکان
 * تمام جفت‌های درست دقیقاً روبه‌روی هم قرار نگیرند.
 */
export function shuffleMatchRight<T extends { id: string }>(
  left: readonly { id: string }[],
  right: readonly T[],
  pairs: readonly [string, string][] | undefined,
  seedKey: string,
): T[] {
  if (right.length <= 1) return right.slice();
  const pairMap = new Map(pairs ?? []);

  const isIdentityAligned = (arr: T[]) =>
    left.length > 1 &&
    left.every((l, idx) => {
      const expectedRight = pairMap.get(l.id);
      return !expectedRight || arr[idx]?.id === expectedRight;
    });

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = shuffle(right.slice(), rng(hashSeed(`${seedKey}:${attempt}`)));
    if (!isIdentityAligned(candidate)) return candidate;
  }

  const fallback = right.slice();
  [fallback[0], fallback[1]] = [fallback[1], fallback[0]];
  return fallback;
}
