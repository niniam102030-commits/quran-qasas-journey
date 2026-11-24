// src/learning/storyOrder.ts
// منطق خالص بازی «ترتیب وقایع» داستان سوره قصص (L5)

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleEvents(events: string[], seed: number): string[] {
  const arr = events.slice();
  if (arr.length < 2) return arr;

  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // هرگز ترتیب اصلی را برنگردان
  const isIdentical = arr.every((item, idx) => item === events[idx]);
  if (isIdentical) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

export function scoreOrder(
  correct: string[],
  given: string[],
): { exact: number; fullyCorrect: boolean } {
  let exact = 0;
  for (let i = 0; i < correct.length; i++) {
    if (given[i] === correct[i]) {
      exact += 1;
    }
  }
  return {
    exact,
    fullyCorrect: correct.length > 0 && given.length === correct.length && exact === correct.length,
  };
}
