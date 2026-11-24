// src/learning/precisionGen.ts
// مولّدهای قالبی سؤال دقیق در سطح آزمون رسمی حفظ (A1) — ۱۰۰٪ قطعی، بدون LLM و بدون ذخیره در بانک سؤال
import type { BaseVerse, ChoiceQuestion, Option } from "../types/learning";
import { rng, shuffle } from "./sessionPlanner";

export type RuntimeQuestionKind = "conj" | "irab" | "waqf" | "link" | "midstart";

export interface RuntimeQuestion extends ChoiceQuestion {
  kind: RuntimeQuestionKind;
  surah?: number;
}

export interface PrecisionGenContext {
  surah?: number;
  standaloneSet?: Set<string>;
  lexiconSet?: Set<string>;
  morphologyMap?: Record<string, { segments?: { text: string; type: string; pos: string }[] }>;
}

const PAUSE_AND_SYM_RE = /[\u06D6-\u06ED\u06DE\s]+/g;
const TRAILING_PAUSE_RE = /[\u06D6-\u06ED\u06DE\s]+$/;
const LEADING_SYM_RE = /^[\u06DE\u06E9\s]+/;
const ALL_DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED\u06DE\s]/g;
const FINAL_DIACRITIC_RE = /^([\s\S]*?)([\u064B-\u0650\u0652])$/;

export const CONJUNCTION_POOL = ["و", "ف", "ثم", "أو", "بل", "لٰكن"] as const;
export type ConjunctionChoice = (typeof CONJUNCTION_POOL)[number];

export const IRAB_POOL = [
  "\u064F", // ُ
  "\u0650", // ِ
  "\u064E", // َ
  "\u0652", // ْ
  "\u064B", // ً
  "\u064D", // ٍ
  "\u064C", // ٌ
] as const;

const IRAB_LABEL_FA: Record<string, string> = {
  "\u064F": "ضمه (ـُ)",
  "\u0650": "کسره (ـِ)",
  "\u064E": "فتحه (ـَ)",
  "\u0652": "سکون (ـْ)",
  "\u064B": "تنوین فتح (ـً)",
  "\u064D": "تنوین کسر (ـٍ)",
  "\u064C": "تنوین ضم (ـٌ)",
};

const DISALLOWED_IRAB_LAST_LETTERS = new Set(["ا", "ى", "ة", "ء", "ٱ"]);

/** حذف علامت‌های وقف/رأس‌آیه انتهایی برای پردازش دقیق واژه */
export function cleanWordToken(word: string): string {
  return String(word ?? "")
    .replace(LEADING_SYM_RE, "")
    .replace(TRAILING_PAUSE_RE, "")
    .trim();
}

/** حذف اعراب‌ها برای مقایسه حروف پایه */
export function stripAllDiacritics(word: string): string {
  return String(word ?? "").replace(ALL_DIACRITICS_RE, "");
}

/**
 * استخراج و حذف اعراب پایانی (فتحه/ضمه/کسره/تنوین‌ها/سکون)؛
 * شدّه پیش از اعراب پایانی روی stem باقی می‌ماند.
 */
export function stripFinalDiacritic(word: string): { stem: string; diacritic: string | null } {
  const cleaned = cleanWordToken(word);
  if (!cleaned) return { stem: "", diacritic: null };
  const m = FINAL_DIACRITIC_RE.exec(cleaned);
  if (!m) return { stem: cleaned, diacritic: null };
  return { stem: m[1], diacritic: m[2] };
}

export interface ConjunctionMatch {
  conj: ConjunctionChoice;
  standalone: boolean;
  remainder: string;
  bareRemainder: string;
  prefixLen: number;
}

/**
 * تشخیص حرف عطف آغازین:
 * - چسبیده: «وَ»، «فَ» (با فتحه/ضمه/کسره و بدون شدّه پس از آن) و باقی‌مانده ≥ ۲ نویسه
 * - مستقل: «ثُمَّ»، «أَوْ»، «بَلْ»
 */
export function initialConjunction(word: string): ConjunctionMatch | null {
  const cleaned = cleanWordToken(word);
  if (!cleaned) return null;

  const bare = stripAllDiacritics(cleaned);
  if (bare === "ثم") {
    return { conj: "ثم", standalone: true, remainder: "", bareRemainder: "", prefixLen: cleaned.length };
  }
  if (bare === "أو" || bare === "او") {
    return { conj: "أو", standalone: true, remainder: "", bareRemainder: "", prefixLen: cleaned.length };
  }
  if (bare === "بل") {
    return { conj: "بل", standalone: true, remainder: "", bareRemainder: "", prefixLen: cleaned.length };
  }

  // فقط «و» یا «ف» با حرکت کوتاه (بدون شدّه \u0651 بعد از حرف عطف)
  const m = /^([وف])([\u064E\u064F\u0650])(?!\u0651)(.+)$/.exec(cleaned);
  if (!m) return null;

  const remainder = m[3];
  const bareRemainder = stripAllDiacritics(remainder);
  if (bareRemainder.length < 2) return null;

  return {
    conj: m[1] as "و" | "ف",
    standalone: false,
    remainder,
    bareRemainder,
    prefixLen: m[1].length + m[2].length,
  };
}

/**
 * شکل وقف استاندارد یک کلمه قرآنی:
 * - «ة» (با هر اعرابی) → «هْ»
 * - تنوین فتح «ً» (با الف یا مقصوره یا بدون آن) → مدّ عوض («َا» یا «َى»)
 * - تنوین ضم/کسر «ٌ/ٍ» → حذف تنوین و سکون حرف قبل («ْ»)
 * - اعراب پایانی «َ/ُ/ِ» → تبدیل به سکون «ْ»
 */
export function stoppedForm(word: string): string {
  const cleaned = cleanWordToken(word);
  if (!cleaned) return "";

  // ۱) تاء مربوطه در پایان کلمه (با هر حرکت یا تنوین یا سکون پس از آن)
  if (/ة[\u064B-\u0652]*$/.test(cleaned)) {
    return cleaned.replace(/ة[\u064B-\u0652]*$/, "ه\u0652");
  }

  // ۲) تنوین فتح به صورت رسم‌الخط عثمانی: ً + ا  یا  ً + ى
  if (/\u064B\u0627$/.test(cleaned)) {
    return cleaned.replace(/\u064B\u0627$/, "\u064E\u0627");
  }
  if (/\u064B\u0649$/.test(cleaned)) {
    return cleaned.replace(/\u064B\u0649$/, "\u064E\u0649");
  }
  // تنوین فتح پس از الف یا الف مقصوره (املائی): اً / ىً
  if (/\u0627\u064B$/.test(cleaned)) {
    return cleaned.replace(/\u0627\u064B$/, "\u0627");
  }
  if (/\u0649\u064B$/.test(cleaned)) {
    return cleaned.replace(/\u0649\u064B$/, "\u0649");
  }
  // تنوین فتح بدون الف (مثلاً پس از همزه روی سطر مثل مَاءً)
  if (/\u064B$/.test(cleaned)) {
    return cleaned.replace(/\u064B$/, "\u064E\u0627");
  }

  // ۳) تنوین ضم یا تنوین کسر → حذف تنوین و سکون
  if (/[\u064C\u064D]$/.test(cleaned)) {
    return cleaned.replace(/[\u064C\u064D]$/, "\u0652");
  }

  // ۴) فتحه/ضمه/کسره پایانی → سکون (شدّهٔ قبلی حفظ می‌شود)
  if (/[\u064E\u064F\u0650]$/.test(cleaned)) {
    return cleaned.replace(/[\u064E\u064F\u0650]$/, "\u0652");
  }

  return cleaned;
}

/** ساخت مجموعهٔ واژگان مستقل موجود در متن سوره برای غربال حروف عطف چسبیده */
export function buildStandaloneWordSet(verses: readonly Pick<BaseVerse, "words">[]): Set<string> {
  const set = new Set<string>();
  for (const v of verses) {
    for (const w of v.words ?? []) {
      const bare = stripAllDiacritics(cleanWordToken(w.ar));
      if (bare) set.add(bare);
    }
  }
  return set;
}

function verseConjunctionsSet(verse: BaseVerse): Set<ConjunctionChoice> {
  const present = new Set<ConjunctionChoice>();
  for (const w of verse.words ?? []) {
    const cleaned = cleanWordToken(w.ar);
    const bare = stripAllDiacritics(cleaned);
    if (bare === "لكن" || bare === "ولكن") {
      present.add("لٰكن");
    }
    const m = initialConjunction(cleaned);
    if (m) present.add(m.conj);
  }
  return present;
}

function isConjunctionCandidate(
  word: { id: string; ar: string },
  ctx?: PrecisionGenContext,
): ConjunctionMatch | null {
  const match = initialConjunction(word.ar);
  if (!match) return null;
  if (match.standalone) return match;

  if (!ctx?.standaloneSet && !ctx?.lexiconSet && !ctx?.morphologyMap) {
    return match;
  }

  const inStandalone = ctx.standaloneSet?.has(match.bareRemainder) ?? false;
  const inLexicon = ctx.lexiconSet?.has(match.bareRemainder) ?? false;
  const morphPref = ctx.morphologyMap?.[word.id]?.segments?.[0];
  const isMorphConj = Boolean(
    morphPref &&
      morphPref.type === "prefix" &&
      morphPref.pos === "P" &&
      stripAllDiacritics(morphPref.text) === match.conj,
  );

  return inStandalone || inLexicon || isMorphConj ? match : null;
}

/**
 * A1-1: مولّد سؤال جای‌خالی حرف عطف (kind: "conj")
 */
export function genConjunctionQuestion(
  verse: BaseVerse,
  ctx?: PrecisionGenContext & { seed?: number; unitId?: string },
): RuntimeQuestion | null {
  if (!verse.words?.length) return null;

  const candidates: { idx: number; match: ConjunctionMatch }[] = [];
  for (let idx = 0; idx < verse.words.length; idx++) {
    const match = isConjunctionCandidate(verse.words[idx], ctx);
    if (match) candidates.push({ idx, match });
  }
  if (candidates.length === 0) return null;

  const rand = rng((ctx?.seed ?? verse.n * 131) >>> 0);
  const chosen = candidates[Math.floor(rand() * candidates.length)];
  const targetWord = verse.words[chosen.idx];

  const arTokens = verse.words.map((w, idx) => {
    if (idx !== chosen.idx) return w.ar;
    if (chosen.match.standalone) {
      const pauseSuffix = /\s+[\u06D6-\u06ED]$/.exec(w.ar)?.[0] ?? "";
      return `ـٰـ${pauseSuffix}`;
    }
    const leadingSym = LEADING_SYM_RE.exec(w.ar)?.[0] ?? "";
    const cleaned = w.ar.slice(leadingSym.length);
    return `${leadingSym}ـٰـ${cleaned.slice(chosen.match.prefixLen)}`;
  });

  const correct = chosen.match.conj;
  const presentInVerse = verseConjunctionsSet(verse);
  const unused = CONJUNCTION_POOL.filter((c) => c !== correct && !presentInVerse.has(c));
  const fallbackOthers = CONJUNCTION_POOL.filter((c) => c !== correct && !unused.includes(c));
  const distractors = [...shuffle(unused, rand), ...shuffle(fallbackOthers, rand)].slice(0, 3);
  const allChoices = shuffle([correct, ...distractors], rand);

  const options: Option[] = allChoices.map((c) => ({ id: c, ar: c }));
  const surah = ctx?.surah ?? 28;

  return {
    id: `exam:conj:${surah}:${verse.n}:${targetWord.i}`,
    unitId: ctx?.unitId ?? `surah_${surah}`,
    part: "exam",
    kind: "conj",
    surah,
    type: "CLOZE_AR",
    shape: "choice",
    stage: 8,
    difficulty: 4,
    skill: "recall",
    verse: verse.n,
    targets: [surah === 28 ? `vr:${verse.n}` : `vr:${surah}:${verse.n}`],
    promptFa: "حرف عطفِ حذف‌شده در جای خالی «ـٰـ» کدام است؟",
    stem: {
      ar: arTokens.join(" "),
      verse: verse.n,
      targetWordIndex: targetWord.i,
      targetWordOriginal: targetWord.ar,
    },
    options,
    answer: correct,
    explanationFa: `در متن آیه ${verse.n}، حرف عطف صحیح «${correct}» است (${cleanWordToken(targetWord.ar)}).`,
  };
}

function lastBaseLetterBeforeDiacritic(stem: string): string {
  const withoutShadda = stem.replace(/\u0651+$/, "");
  if (!withoutShadda) return "";
  return withoutShadda[withoutShadda.length - 1];
}

function isIrabCandidate(word: string): { stem: string; diacritic: string } | null {
  const cleaned = cleanWordToken(word);
  if (!cleaned) return null;
  const { stem, diacritic } = stripFinalDiacritic(cleaned);
  if (!diacritic || !stem) return null;
  if (!(IRAB_POOL as readonly string[]).includes(diacritic)) return null;

  const bareStem = stripAllDiacritics(stem);
  if (bareStem.length < 2) return null;

  const lastChar = lastBaseLetterBeforeDiacritic(stem);
  if (!lastChar || DISALLOWED_IRAB_LAST_LETTERS.has(lastChar) || /[\u064B-\u0670\u0653]/.test(lastChar)) {
    return null;
  }

  return { stem, diacritic };
}

/**
 * A1-2: مولّد سؤال اعراب پایانی در حالت وصل (kind: "irab")
 */
export function genIrabQuestion(
  verse: BaseVerse,
  opts?: { seed?: number; surah?: number; unitId?: string },
): RuntimeQuestion | null {
  if (!verse.words || verse.words.length < 2) return null;

  const candidates: { idx: number; stem: string; diacritic: string }[] = [];
  // توکن آخر آیه حذف می‌شود تا وصلِ میان آیه سنجیده شود
  for (let idx = 0; idx < verse.words.length - 1; idx++) {
    const res = isIrabCandidate(verse.words[idx].ar);
    if (res) candidates.push({ idx, ...res });
  }
  if (candidates.length === 0) return null;

  const rand = rng((opts?.seed ?? verse.n * 257) >>> 0);
  const chosen = candidates[Math.floor(rand() * candidates.length)];
  const targetWord = verse.words[chosen.idx];

  const arTokens = verse.words.map((w, idx) => {
    if (idx !== chosen.idx) return w.ar;
    const pauseMatch = /(\s+[\u06D6-\u06ED]+)$/.exec(w.ar);
    const pauseSuffix = pauseMatch ? pauseMatch[1] : "";
    return `«${chosen.stem}»${pauseSuffix}`;
  });

  // اولویت با سه‌گانهٔ پرتکرار (ضمه، کسره، فتحه) + بقیه
  const distractorPriority = ["\u064F", "\u0650", "\u064E", "\u0652", "\u064B", "\u064D", "\u064C"];
  const distractors = distractorPriority.filter((d) => d !== chosen.diacritic).slice(0, 3);
  const allMarks = shuffle([chosen.diacritic, ...distractors], rand);
  const options: Option[] = allMarks.map((mark) => ({
    id: mark,
    ar: `\u0640${mark}`,
    fa: IRAB_LABEL_FA[mark] ?? mark,
  }));

  const surah = opts?.surah ?? 28;
  return {
    id: `exam:irab:${surah}:${verse.n}:${targetWord.i}`,
    unitId: opts?.unitId ?? `surah_${surah}`,
    part: "exam",
    kind: "irab",
    surah,
    type: "ENDING_CHOICE",
    shape: "choice",
    stage: 8,
    difficulty: 5,
    skill: "recall",
    verse: verse.n,
    targets: [surah === 28 ? `vr:${verse.n}` : `vr:${surah}:${verse.n}`],
    promptFa: `اعراب پایانی واژهٔ مشخص‌شده در آیه ${verse.n} هنگام وصل کدام است؟`,
    stem: {
      ar: arTokens.join(" "),
      verse: verse.n,
      targetWordIndex: targetWord.i,
      targetWordOriginal: targetWord.ar,
      targetWordStripped: chosen.stem,
    },
    options,
    answer: chosen.diacritic,
    explanationFa: `در متن آیه ${verse.n}، اعراب پایانی درست «${IRAB_LABEL_FA[chosen.diacritic] ?? chosen.diacritic}» است (${cleanWordToken(targetWord.ar)}).`,
  };
}

function buildWrongWaqfForms(cleanedOriginal: string, correctStopped: string): [string, string] {
  const candidates: string[] = [];

  if (/ة[\u064B-\u0652]*$/.test(cleanedOriginal)) {
    // خطای ۱: ة بدون تبدیل به هـ
    candidates.push(cleanedOriginal.replace(/ة[\u064B-\u0652]*$/, "ة\u0652"));
    // خطای ۲: حذف ة یا تبدیل اشتباه به تْ
    candidates.push(cleanedOriginal.replace(/ة[\u064B-\u0652]*$/, "ت\u0652"));
    candidates.push(cleanedOriginal.replace(/ة[\u064B-\u0652]*$/, "ه\u064F"));
  } else if (/\u064B[\u0627\u0649]?$/.test(cleanedOriginal) || /\u0627\u064B$/.test(cleanedOriginal)) {
    // خطای ۱: تنوین فتح بدون الف (حذف الف و سکون یا فقط فتحه)
    const noAlif = cleanedOriginal.replace(/(\u064B[\u0627\u0649]?|\u0627\u064B)$/, "\u0652");
    candidates.push(noAlif);
    // خطای ۲: تنوین فتح بدون الف با فتحه تنها
    candidates.push(cleanedOriginal.replace(/(\u064B[\u0627\u0649]?|\u0627\u064B)$/, "\u064E"));
    candidates.push(cleanedOriginal.replace(/(\u064B[\u0627\u0649]?|\u0627\u064B)$/, "\u064F"));
  } else if (/[\u064C\u064D]$/.test(cleanedOriginal)) {
    // خطای ۱: تبدیل نادرست تنوین ضم/کسر به مد عوض با الف
    candidates.push(cleanedOriginal.replace(/[\u064C\u064D]$/, "\u064E\u0627"));
    // خطای ۲: باقی ماندن حرکت بدون سکون
    const replacementMark = /\u064C$/.test(cleanedOriginal) ? "\u064F" : "\u0650";
    candidates.push(cleanedOriginal.replace(/[\u064C\u064D]$/, replacementMark));
  } else {
    const { stem, diacritic } = stripFinalDiacritic(cleanedOriginal);
    // خطای ۱: نگه‌داشتن حرکت غیرسکون
    const altMark = diacritic === "\u064E" ? "\u064F" : "\u064E";
    candidates.push(`${stem}${altMark}`);
    // خطای ۲: افزودن الف عوض اشتباه یا حرکت سوم
    candidates.push(`${stem}\u064E\u0627`);
    candidates.push(`${stem}\u0650`);
  }

  const unique: string[] = [];
  for (const c of candidates) {
    if (c && c !== correctStopped && c !== cleanedOriginal && !unique.includes(c)) {
      unique.push(c);
    }
    if (unique.length === 2) break;
  }

  // تضمین قطعی ۲ گزینه غلط متمایز
  const fallbacks = [`${correctStopped}\u064E`, `${cleanedOriginal}ـ`, `${stripAllDiacritics(cleanedOriginal)}\u064F`, `${stripAllDiacritics(cleanedOriginal)}\u0650`];
  for (const fb of fallbacks) {
    if (unique.length >= 2) break;
    if (fb && fb !== correctStopped && fb !== cleanedOriginal && !unique.includes(fb)) {
      unique.push(fb);
    }
  }

  return [unique[0], unique[1]];
}

/**
 * A1-3: مولّد سؤال وقف روی آخرین کلمه آیه (kind: "waqf")
 */
export function genWaqfQuestion(
  verse: BaseVerse,
  opts?: { seed?: number; surah?: number; unitId?: string },
): RuntimeQuestion | null {
  if (!verse.words?.length) return null;
  const lastWord = verse.words[verse.words.length - 1];
  const cleaned = cleanWordToken(lastWord.ar);
  const stopped = stoppedForm(cleaned);
  if (!cleaned || !stopped || stopped === cleaned) return null;

  const [wrong1, wrong2] = buildWrongWaqfForms(cleaned, stopped);
  const rawChoices = [stopped, cleaned, wrong1, wrong2];
  const deduped: string[] = [];
  for (const item of rawChoices) {
    if (item && !deduped.includes(item)) deduped.push(item);
  }
  if (deduped.length < 4) return null;

  const rand = rng((opts?.seed ?? verse.n * 521) >>> 0);
  const shuffled = shuffle(deduped, rand);
  const options: Option[] = shuffled.map((text) => ({ id: text, ar: text }));
  const surah = opts?.surah ?? 28;

  return {
    id: `exam:waqf:${surah}:${verse.n}`,
    unitId: opts?.unitId ?? `surah_${surah}`,
    part: "exam",
    kind: "waqf",
    surah,
    type: "ENDING_CHOICE",
    shape: "choice",
    stage: 8,
    difficulty: 4,
    skill: "recall",
    verse: verse.n,
    targets: [surah === 28 ? `vr:${verse.n}` : `vr:${surah}:${verse.n}`],
    promptFa: "عند الوقف على آخر هذه الآية، كيف تُنطق الكلمة الأخيرة؟",
    stem: {
      ar: verse.arText || verse.words.map((w) => w.ar).join(" ").replace(PAUSE_AND_SYM_RE, " ").trim(),
      verse: verse.n,
      targetWordIndex: lastWord.i,
      targetWordOriginal: cleaned,
    },
    options,
    answer: stopped,
    explanationFa: `در وقف بر «${cleaned}»، صورت صحیح وقف «${stopped}» است.`,
  };
}
