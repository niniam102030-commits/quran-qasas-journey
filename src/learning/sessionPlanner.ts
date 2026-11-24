// src/learning/sessionPlanner.ts
// چیدن صف سوال‌های جلسه — تابع‌های خالص و تست‌پذیر. بدون وابستگی به UI/DB.
import { isDue, stabilityLevel, type StoredCard } from "./cardScheduler";

export interface PlannerQuestion {
  id: string;
  unitId: string;
  stage: number;
  difficulty: number; // 1..5
  type: string;
  targets: string[];
}

export type SessionType = "STAGE" | "REVIEW" | "REMEDIAL" | "CUMULATIVE" | "TESTOUT" | "DRILL" | "EXAM";

export interface PlanOptions {
  size?: number; // پیش‌فرض ۲۰ برای مرحله
  interleaveRatio?: number; // پیش‌فرض ۰.۲
  now?: Date;
  seed?: number;
  /** سوال‌هایی که اخیراً دیده شده‌اند و نباید دوباره بیایند */
  recentIds?: Set<string>;
}

/** PRNG قطعی (mulberry32) تا تست‌ها پایدار باشند */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** سطح ثبات مؤثر یک سوال = کمینه‌ی ثبات هدف‌هایش (ضعیف‌ترین حلقه تعیین‌کننده است) */
export function questionLevel(q: PlannerQuestion, cards: Map<string, StoredCard>): number {
  if (q.targets.length === 0) return 1;
  return Math.min(...q.targets.map((t) => stabilityLevel(cards.get(t))));
}

/** نردبان سختی: هرچه کارت پایدارتر، سوال سخت‌تر. فاصله‌ی سختی تا سطح ≤ ۱ مجاز است. */
export function ladderScore(q: PlannerQuestion, cards: Map<string, StoredCard>): number {
  const lvl = questionLevel(q, cards);
  return Math.abs(q.difficulty - lvl);
}

/** سوال‌های سررسیدِ مرور (حداقل یک هدف سررسید) */
export function dueQuestions(pool: PlannerQuestion[], cards: Map<string, StoredCard>, now: Date): PlannerQuestion[] {
  return pool.filter((q) => q.targets.some((t) => {
    const c = cards.get(t);
    return c && c.state !== 0 && isDue(c, now);
  }));
}

/**
 * صف یک جلسه‌ی مرحله‌ای:
 *  - سوال‌های همان مرحله از واحد، به ترتیب سختی صعودی (آسان→سخت) با کمی درهم‌ریختگی داخل هر سطح؛
 *  - ۲۰٪ سوال از مرور واحدهای قبلی (سررسید) به‌صورت پراکنده درج می‌شود؛
 *  - از چیدن دو سوال هم‌نوع پشت سر هم تا حد امکان پرهیز می‌شود.
 */
export function planStage(
  stageQuestions: PlannerQuestion[],
  reviewPool: PlannerQuestion[],
  cards: Map<string, StoredCard>,
  opts: PlanOptions = {},
): PlannerQuestion[] {
  const size = opts.size ?? 20;
  const ratio = opts.interleaveRatio ?? 0.2;
  const now = opts.now ?? new Date();
  const rand = rng(opts.seed ?? 1);
  const recent = opts.recentIds ?? new Set<string>();
  if (stageQuestions.length === 0) return [];

  // Recent questions are a preference, not a hard exclusion: small stages must remain playable.
  const fresh = stageQuestions.filter((q) => !recent.has(q.id));
  const candidates = fresh.length > 0 ? fresh : stageQuestions;
  const reviewN = Math.min(Math.round(size * ratio), reviewPool.length);
  const mainN = Math.min(size - reviewN, candidates.length);

  let main: PlannerQuestion[];

  // برنامه‌ریزی ویژه مرحله ۱: مواجهه ۳باره با هر واژه در شکاف‌های ۱، ۴ و ۹
  const isStage1 = candidates.length > 0 && candidates[0].stage === 1;
  if (isStage1) {
    const wordGroups = new Map<string, PlannerQuestion[]>();
    for (const q of shuffle(candidates, rand)) {
      const wTarget = q.targets.find((t) => t.startsWith("w:")) || q.targets[0] || "w:default";
      if (!wordGroups.has(wTarget)) wordGroups.set(wTarget, []);
      wordGroups.get(wTarget)!.push(q);
    }

    const scheduled = new Array<PlannerQuestion | null>(mainN).fill(null);
    let wordIdx = 0;

    for (const [, qs] of wordGroups.entries()) {
      // ۳ شکل متفاوت برای این واژه
      const distinctTypeQs: PlannerQuestion[] = [];
      const seenTypes = new Set<string>();
      for (const q of qs) {
        if (!seenTypes.has(q.type)) {
          seenTypes.add(q.type);
          distinctTypeQs.push(q);
        }
        if (distinctTypeQs.length === 3) break;
      }
      // اگر کمتر از ۳ نوع متفاوت بود، با بقیه پر کن
      for (const q of qs) {
        if (distinctTypeQs.length >= 3) break;
        if (!distinctTypeQs.includes(q)) distinctTypeQs.push(q);
      }

      // جای‌گذاری در فاصله‌های مواجهه (حدود سوال‌های ۱، ۴ و ۹)
      for (let exp = 0; exp < distinctTypeQs.length; exp++) {
        const baseSlot = EXPOSURE_SLOTS[exp] - 1; // 0, 3, 8
        const targetPos = Math.min(mainN - 1, baseSlot + wordIdx);
        // اگر خانه پر است، اولین خانه خالی بعد از آن
        let placed = false;
        for (let p = targetPos; p < mainN; p++) {
          if (!scheduled[p]) {
            scheduled[p] = distinctTypeQs[exp];
            placed = true;
            break;
          }
        }
        if (!placed) {
          for (let p = targetPos - 1; p >= 0; p--) {
            if (!scheduled[p]) {
              scheduled[p] = distinctTypeQs[exp];
              break;
            }
          }
        }
      }
      wordIdx++;
    }

    // پرکردن خانه‌های خالی احتمالی با بقیه سوال‌ها
    const remaining = shuffle(candidates.filter((q) => !scheduled.includes(q)), rand);
    for (let i = 0; i < mainN; i++) {
      if (!scheduled[i]) {
        scheduled[i] = remaining.pop() || candidates[i % candidates.length];
      }
    }
    main = spreadByType(scheduled.filter(Boolean) as PlannerQuestion[]);
  } else {
    // نردبان: ابتدا ساده‌ترها (کمترین فاصله از سطح)، داخل هر سطح مرتب‌سازی تصادفی
    const byDifficulty = shuffle(candidates, rand).sort((a, b) => a.difficulty - b.difficulty);
    main = spreadByType(byDifficulty.slice(0, mainN));
  }

  const rev = shuffle(dueQuestions(reviewPool, cards, now).length ? dueQuestions(reviewPool, cards, now) : reviewPool, rand).slice(0, Math.min(reviewN, size - main.length));

  // درج مرور در موقعیت‌های تقریباً هم‌فاصله، نه در ابتدا
  const out = main.slice();
  rev.forEach((q, i) => {
    const pos = Math.min(out.length, Math.floor(((i + 1) * (out.length + 1)) / (rev.length + 1)) + i);
    out.splice(pos, 0, q);
  });
  return out;
}

/** جلوگیری از دو نوع سوال یکسان پشت‌سرهم با جابه‌جایی‌های ساده */
export function spreadByType(list: PlannerQuestion[]): PlannerQuestion[] {
  const a = list.slice();
  for (let i = 1; i < a.length; i++) {
    if (a[i].type === a[i - 1].type) {
      const j = a.findIndex((q, k) => k > i && q.type !== a[i - 1].type && (k + 1 >= a.length || q.type !== a[k + 1]?.type || true));
      if (j > 0) [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return a;
}

/** بازگرداندن سوال غلط به صف: یک‌بار پس از ۳ سوال و در صورت تکرار غلط پس از ۷ سوال. */
export function requeue<T>(queue: T[], currentIndex: number, item: T, wrongCount: number): T[] {
  const offset = wrongCount <= 1 ? 3 : 7;
  const out = queue.slice();
  const at = Math.min(out.length, currentIndex + 1 + offset);
  out.splice(at, 0, item);
  return out;
}

/** زمان‌های مواجهه با یک کلمه‌ی جدید در جلسه‌ی مرحله‌ی ۱: حدود سوال‌های ۱، ۴ و ۹ */
export const EXPOSURE_SLOTS = [1, 4, 9] as const;

export function sessionTypeFor(opts: { hasDebt: boolean; hasWeak: boolean; unitDone: boolean }): SessionType {
  if (opts.hasDebt) return "REVIEW";
  if (opts.hasWeak) return "REMEDIAL";
  if (opts.unitDone) return "CUMULATIVE";
  return "STAGE";
}

/**
 * سختی تطبیقی داخل جلسه (مورد ۱۵): بر اساس سه نتیجهٔ اخیر تلاش اول،
 * ترتیب سؤال‌های باقی‌مانده را تنظیم می‌کند. تابع خالص است و آرایهٔ ورودی را تغییر نمی‌دهد.
 */
export function adaptRemainingQueue<T extends { difficulty: number }>(remaining: T[], recent: boolean[]): T[] {
  if (remaining.length < 2 || recent.length === 0) return remaining;
  const lastTwoWrong = recent.length >= 2 && recent[recent.length - 1] === false && recent[recent.length - 2] === false;
  const lastThreeRight = recent.length >= 3 && recent.slice(-3).every(Boolean);
  if (!lastTwoWrong && !lastThreeRight) return remaining;
  let idx = 0;
  for (let i = 1; i < remaining.length; i++) {
    if (lastTwoWrong ? remaining[i].difficulty < remaining[idx].difficulty : remaining[i].difficulty > remaining[idx].difficulty) {
      idx = i;
    }
  }
  if (idx === 0) return remaining;
  const copy = [...remaining];
  const [picked] = copy.splice(idx, 1);
  copy.unshift(picked);
  return copy;
}
