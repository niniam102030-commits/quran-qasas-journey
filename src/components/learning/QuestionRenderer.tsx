// src/components/learning/QuestionRenderer.tsx
// نمایش و جمع‌آوری پاسخ برای چهار شکل سوال. پاسخ بر پایه‌ی شناسه‌هاست، نه متن عربی.
import { useMemo, useRef, useState, useEffect } from "react";
import { HelpCircle, Check, RotateCcw, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { ldb, verseKey, type QuestionRow } from "../../db/learningDb";
import { buildFaClozeModel } from "../../learning/faCloze";
import { getActiveSurahNumber } from "../../config/surahConfig";
import { usePreferencesStore } from "../../store/usePreferencesStore";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";
import { labelOption } from "./questionOptionLabel";
import { shuffleItems, shuffleMatchRight, shuffleOrderBank } from "./questionShuffle";

interface Item {
  id: string;
  ar?: string;
  fa?: string;
  num?: number;
  n?: number;
  words?: string[];
  wordsAr?: string[];
  wordIdx?: number[];
  wordRange?: { verse: number; from: number; to: number };
}

export type RenderableQuestion = QuestionRow & {
  promptFa?: string;
  stem?: {
    ar?: string;
    arText?: string;
    fa?: string;
    faTemplate?: string;
    verse?: number;
    num?: number;
    hiddenIdx?: number[];
    faHidden?: { start: number; text: string }[];
    faSegments?: string[];
    showFa?: boolean;
    showVerse?: boolean;
    showAr?: boolean;
  };
  options?: Item[];
  left?: Item[];
  right?: Item[];
  pairs?: [string, string][];
  bank?: Item[];
  answer?: unknown;
  explanationFa?: string;
};

interface Props {
  q: RenderableQuestion;
  locked: boolean;
  disableHint?: boolean;
  noHintNoticeFa?: string;
  /** بازخورد پس از تصحیح: شناسه‌های گزینه‌های غلط کاربر و (در سؤال انتخابی) شناسهٔ پاسخ درست */
  feedback?: { wrongIds: string[]; correctId?: string } | null;
  onSubmit: (response: unknown, meta: { usedHint: boolean; changedAnswer: boolean; responseMs: number; matchMistakes?: number; matchWrongPairs?: string[] }) => void;
}

function makeArStyle(fontSizePx: number): React.CSSProperties {
  return {
    fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
    fontFeatureSettings: "normal",
    direction: "rtl",
    fontSize: `${fontSizePx}px`,
    lineHeight: 2.3,
  };
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

// تشخیص «عبارت قرآنی» برای فونت مصحف: صرفِ داشتن یک اعراب (مثل شدّه در «شرّ»)
// کافی نیست؛ عبارت فارسیِ داخل «...» اگر با فونت قرآنی رندر شود، حروف فارسیِ
// گ/چ/پ/ژ در آن فونت نیست و به‌صورت دایره (●) می‌افتد. عبارت قرآنیِ واقعی هم
// حرف فارسی ندارد و هم تقریباً همه‌ی حروفش اعراب دارند.
const hasQuranicMarks = (s: string) => {
  if (/[گچپژ]/.test(s)) return false;
  const letters = (s.match(/[\u0621-\u064A\u066E-\u06D3]/g) ?? []).length;
  if (letters === 0) return false;
  const marks = (s.match(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g) ?? []).length;
  return marks / letters >= 0.15;
};

// اگر متن کامل آیه هم داخل متن سؤال (داخل «...») آمده و هم در کادر ساقه
// نمایش داده می‌شود، نقل‌قولِ داخل متن سؤال حذف می‌شود تا آیه فقط یک بار و
// در کادر دیده شود. برابری بعد از نرمال‌سازی فاصله‌ها سنجیده می‌شود و
// نقل‌قول‌های جزئی (مثل سؤال‌های واژه که آیه را برای بافت می‌آورند ولی کادر
// فقط کلمه‌ی هدف است) دست نمی‌خورند.
function stripFramedDuplicate(prompt: string, framed: string | undefined): string {
  if (!prompt || !framed) return prompt;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const target = norm(framed);
  if (!target) return prompt;
  const stripped = prompt.replace(/«([^»]+)»/g, (m, inner: string) => (norm(inner) === target ? "" : m));
  return stripped.replace(/\s{2,}/g, " ").replace(/\s+([؟?،.:؛])/g, "$1").trim();
}

// در سؤال‌های «ترجمه → آیه»، ترجمه‌ی مورد سؤال هم داخل متن سؤال داخل «...»
// آمده و هم در کادر ساقه نمایش داده می‌شود (دو ترجمه‌ی متفاوت از یک آیه).
// وقتی کادر ساقه هست، نقل‌قولِ فارسی از متن سؤال حذف می‌شود تا ترجمه فقط
// یک بار و در کادر دیده شود؛ قطعه‌های قرآنی دست نمی‌خورند.
function stripAskedTranslation(prompt: string): string {
  const stripped = prompt.replace(/«([^»]+)»/g, (m, inner: string) => (hasQuranicMarks(inner) ? m : ""));
  return stripped.replace(/\s{2,}/g, " ").replace(/\s+([؟?،.:؛])/g, "$1").trim();
}

function renderRichFa(text: string | undefined) {
  if (!text) return null;
  const parts = text.split(/(«[^»]+»)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("«") && part.endsWith("»") && hasQuranicMarks(part)) {
      return (
        <span key={idx} className="quran-text font-normal text-[1.18em] mx-0.5">
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

const isArabicItem = (o: Item, rangeLabels: Record<string, string>) =>
  Boolean(o.ar?.trim() || o.wordsAr?.length || o.wordRange || (o.words?.length && rangeLabels[o.id]));

const label = (o: Item, rangeLabels: Record<string, string>, arStyle: React.CSSProperties) => {
  const text = labelOption(o, rangeLabels);
  return isArabicItem(o, rangeLabels) ? (
    <span style={arStyle} className="text-slate-900 dark:text-slate-100">{text}</span>
  ) : (
    <span className="text-sm font-semibold">{text}</span>
  );
};

export default function QuestionRenderer({ q, locked, disableHint = false, noHintNoticeFa, feedback = null, onSubmit }: Props) {
  const t0 = useRef(Date.now());
  const changed = useRef(false);
  const [hint, setHint] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [resolvedLabels, setResolvedLabels] = useState<Record<string, string>>({});
  const [resolvedStem, setResolvedStem] = useState<{ arText?: string; fa?: string }>({});
  const [shuffleSalt] = useState(() => Math.floor(Math.random() * 0xffff));
  const arabicFontSize = usePreferencesStore((s) => s.arabicFontSize);
  const { playSfx } = useHapticsAndSfx();
  const arStyle = useMemo(() => makeArStyle(arabicFontSize), [arabicFontSize]);
  const shuffledOptions = useMemo(
    () => shuffleItems(q.options ?? [], `choice:${q.id}:${shuffleSalt}`),
    [q.id, q.options, shuffleSalt],
  );
  const displayPrompt = useMemo(() => {
    let p = stripFramedDuplicate(q.promptFa ?? "", q.stem?.ar ?? q.stem?.arText);
    // ترجمه‌ی مورد سؤال در کادر ساقه هم نمایش داده می‌شود؛ نقل‌قولش در متن
    // سؤال تکرار است و حذف می‌شود (فقط وقتی کادر ساقه واقعاً هست).
    if (q.type === "TRANSLATION_TO_VERSE" && (q.stem?.fa || q.stem?.showFa)) {
      p = stripAskedTranslation(p);
    }
    return p;
  }, [q.promptFa, q.stem?.ar, q.stem?.arText, q.stem?.fa, q.stem?.showFa, q.type]);
  // راهنمای هوشمند بدون لو دادن پاسخ: در سوالات چهارگزینه‌ای یک گزینه نادرست حذف می‌شود
  const eliminatedChoiceId = useMemo(() => {
    if (!hint || q.shape !== "choice") return null;
    const wrong = shuffledOptions.find((o) => o.id !== q.answer);
    return wrong?.id ?? null;
  }, [hint, q.shape, q.answer, shuffledOptions]);

  useEffect(() => {
    let active = true;
    const items = [...(q.options ?? []), ...(q.left ?? []), ...(q.right ?? []), ...(q.bank ?? [])];
    const verses = new Map<number, Promise<{ i: number; ar: string }[]>>();
    const getWords = (verseNumber: number) => {
      if (!verses.has(verseNumber)) {
        verses.set(verseNumber, ldb.baseVerses.get(verseKey(getActiveSurahNumber(), verseNumber)).then((verse) => (verse?.words as { i: number; ar: string }[] | undefined) ?? []));
      }
      return verses.get(verseNumber)!;
    };
    Promise.all(items.map(async (item) => {
      if (item.wordRange) {
        const range = item.wordRange;
        const words = await getWords(range.verse);
        return [item.id, words.filter((word) => word.i >= range.from && word.i <= range.to).map((word) => word.ar).join(" ")] as const;
      }
      if (item.words?.length && item.words.every((id) => /^w\d+_\d+_\d+$/.test(id))) {
        const parsed = item.words.map((id) => {
          const match = /^w\d+_(\d+)_(\d+)$/.exec(id)!;
          return { id, verse: Number(match[1]), index: Number(match[2]) };
        });
        const verseWords = new Map(await Promise.all([...new Set(parsed.map((word) => word.verse))].map(async (n) => [n, await getWords(n)] as const)));
        const text = parsed.map((word) => verseWords.get(word.verse)?.find((entry) => entry.i === word.index)?.ar ?? "").filter(Boolean).join(" ");
        return [item.id, text] as const;
      }
      return [item.id, ""] as const;
    })).then((entries) => {
      if (active) setResolvedLabels(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setResolvedLabels({});
    });
    return () => { active = false; };
  }, [q.id, q.options, q.left, q.right, q.bank]);

  // بعضی سؤال‌ها متن ساقه را ندارند و فقط پرچم دارند (showFa/showVerse/showAr)؛
  // متن باید از ردیف پایه‌ی همان آیه خوانده شود، وگرنه مثلاً در «این ترجمه
  // مربوط به کدام آیه است؟» خودِ ترجمه هیچ‌جا نمایش داده نمی‌شود.
  useEffect(() => {
    let active = true;
    const stem = q.stem;
    const verseNum = stem?.verse ?? (typeof q.verse === "number" ? q.verse : undefined);
    const needFa = Boolean(stem?.showFa && !stem?.fa);
    // VERSE_TO_NUMBER استثناست: ساقه‌اش فقط شماره‌ی آیه را دارد و متن آیه
    // موضوع سؤال است (گزینه‌ها شماره‌اند)، پس متن باید از داده‌ی پایه بیاید.
    const needAr = Boolean((stem?.showVerse || stem?.showAr || q.type === "VERSE_TO_NUMBER") && !stem?.ar && !stem?.arText);
    if (!verseNum || (!needFa && !needAr)) {
      setResolvedStem({});
      return () => { active = false; };
    }
    ldb.baseVerses.get(verseKey(getActiveSurahNumber(), verseNum)).then((verse) => {
      if (!active) return;
      setResolvedStem({
        arText: needAr ? (verse?.arText as string | undefined) : undefined,
        fa: needFa ? (verse?.fa as string | undefined) : undefined,
      });
    }).catch(() => {
      if (active) setResolvedStem({});
    });
    return () => { active = false; };
  }, [q.id, q.stem]);

  useEffect(() => {
    t0.current = Date.now();
    changed.current = false;
    setHint(false);
    setSelectedChoice(null);
  }, [q.id]);

  const meta = () => ({
    usedHint: hint,
    changedAnswer: changed.current,
    responseMs: Date.now() - t0.current,
  });

  const handleChoiceSelect = (optionId: string) => {
    if (locked) return;
    if (selectedChoice && selectedChoice !== optionId) {
      changed.current = true;
    }
    setSelectedChoice(optionId);
    onSubmit(optionId, meta());
  };

  return (
    <div dir="rtl" className="w-full max-w-xl mx-auto space-y-5 px-3 py-2 select-none">
      {/* Prompt */}
      <div className="space-y-2">
        <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug">
          {renderRichFa(displayPrompt)}
        </h2>

        {/* Stem Arabic or Persian Text (Iranian-Islamic Tazhib Frame) */}
        {(q.stem?.ar || q.stem?.arText || resolvedStem.arText) && (
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-b from-[#fffdf7] to-[#f8f2e4] dark:from-[#162032] dark:to-[#1a2639] border-2 border-[#d4af37]/65 dark:border-teal-700/70 tazhib-frame text-center">
            <p style={arStyle}>{q.stem?.ar ?? q.stem?.arText ?? resolvedStem.arText}</p>
          </div>
        )}
        {q.type !== "CLOZE_FA" && ((q.stem?.fa && !q.stem.ar) || resolvedStem.fa) && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
              «{q.stem?.fa ?? resolvedStem.fa}»
            </p>
          </div>
        )}
      </div>

      {/* Shapes */}
      {q.shape === "choice" && (
        <div className="grid grid-cols-1 gap-2.5">
          {shuffledOptions.map((o) => {
            const isSelected = selectedChoice === o.id;
            const isEliminated = eliminatedChoiceId === o.id;
            return (
              <button
                key={o.id}
                disabled={locked || isEliminated}
                style={
                  locked && feedback?.wrongIds.includes(o.id)
                    ? { borderColor: "#f43f5e", boxShadow: "0 0 0 2px rgba(244,63,94,0.35)" }
                    : locked && feedback && feedback.wrongIds.length > 0 && feedback.correctId === o.id
                    ? { borderColor: "#10b981", boxShadow: "0 0 0 2px rgba(16,185,129,0.30)" }
                    : undefined
                }
                onClick={() => {
                  playSfx("snap-click");
                  handleChoiceSelect(o.id);
                }}
                className={`w-full rounded-2xl p-4 text-right transition-all border-2 border-b-4 active:border-b-2 active:translate-y-[2px] flex items-center justify-between min-h-[3.75rem] ${
                  isEliminated
                    ? "opacity-35 line-through border-dashed border-b-2 border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-900/40 cursor-not-allowed"
                    : isSelected
                    ? "bg-teal-50/90 border-[#00A896] border-b-[#028090] dark:bg-teal-950/40 dark:border-teal-500 shadow-sm"
                    : "bg-termeh-card dark:bg-lapis-card border-termeh-border dark:border-lapis-border hover:border-brand-primary hover:bg-brand-primary/5"
                } ${locked ? "cursor-default" : isEliminated ? "" : "cursor-pointer"}`}
              >
                <div className="flex-1 min-w-0 pr-1">{label(o, resolvedLabels, arStyle)}</div>
                <div
                  className={`w-5 h-5 rounded-full border-2 ml-2 flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "border-amber-600 bg-amber-600 text-white"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {q.shape === "match" && (
        <MatchView
          q={q}
          locked={locked}
          feedback={feedback}
          hintActive={hint}
          rangeLabels={resolvedLabels}
          arStyle={arStyle}
          shuffleSalt={shuffleSalt}
          onDone={(p, matchMistakes, matchWrongPairs) => onSubmit(p, { ...meta(), matchMistakes, matchWrongPairs })}
          markChanged={() => (changed.current = true)}
        />
      )}

      {q.shape === "order" && (
        <OrderView
          q={q}
          locked={locked}
          hintActive={hint}
          rangeLabels={resolvedLabels}
          arStyle={arStyle}
          shuffleSalt={shuffleSalt}
          onDone={(a) => onSubmit(a, meta())}
          markChanged={() => (changed.current = true)}
        />
      )}

      {q.shape === "cloze" && (
        <ClozeView
          q={q}
          locked={locked}
          hintActive={hint}
          rangeLabels={resolvedLabels}
          arStyle={arStyle}
          shuffleSalt={shuffleSalt}
          onDone={(m) => onSubmit(m, meta())}
          markChanged={() => (changed.current = true)}
        />
      )}

      {!locked && !disableHint && q.stage !== 8 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-end">
            <button
              onClick={() => {
                playSfx("snap-click");
                setHint(true);
              }}
              disabled={hint}
              aria-expanded={hint}
              className="text-xs flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-950/50 disabled:opacity-60 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>{hint ? "راهنما فعال شد" : "راهنمای هوشمند"}</span>
            </button>
          </div>
          {hint && (
            <div role="note" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs sm:text-sm leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {q.shape === "choice"
                  ? `یک گزینه نادرست حذف شد.${q.stem?.verse ? ` (مربوط به آیه ${toFarsiNum(q.stem.verse)} سوره قصص)` : ""}`
                  : q.shape === "order"
                  ? "قطعه بعدی صحیح در کادر پایین با حاشیه طلایی مشخص شد."
                  : q.shape === "match"
                  ? "همتای صحیح مورد انتخاب‌شده (یا اولین مورد) با حاشیه طلایی مشخص شد."
                  : "دو گزینه محتمل‌تر برای جای خالی فعال با حاشیه طلایی مشخص شدند."}
              </span>
            </div>
          )}
        </div>
      )}
      {!locked && (disableHint || q.stage === 8) && (
        <div className="pt-2 text-left">
          <span className="text-[11px] text-slate-400">
            {disableHint ? (noHintNoticeFa || "آزمون میانبر واحد (بدون راهنما)") : "آزمون تسلط مرحله ۸ (بدون راهنما)"}
          </span>
        </div>
      )}
    </div>
  );
}

function MatchView({
  q,
  locked,
  feedback = null,
  hintActive,
  onDone,
  markChanged,
  rangeLabels,
  arStyle,
  shuffleSalt,
}: {
  q: RenderableQuestion;
  locked: boolean;
  feedback?: { wrongIds: string[]; correctId?: string } | null;
  hintActive: boolean;
  rangeLabels: Record<string, string>;
  arStyle: React.CSSProperties;
  shuffleSalt: number;
  onDone: (p: [string, string][], matchMistakes: number, matchWrongPairs: string[]) => void;
  markChanged: () => void;
}) {
  const [pairs, setPairs] = useState<[string, string][]>([]);
  const [leftSel, setLeftSel] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState<{ leftId: string; rightId: string } | null>(null);
  const [rightFlash, setRightFlash] = useState<string | null>(null);
  const mistakesRef = useRef(0);
  const wrongPairsRef = useRef<string[]>([]);
  const flashTimerRef = useRef<number | null>(null);
  const { playSfx } = useHapticsAndSfx();

  const leftItems = useMemo(() => q.left ?? [], [q.left]);
  const rightItems = useMemo(
    () => shuffleMatchRight(leftItems, q.right ?? [], q.pairs, `match:${q.id}:${shuffleSalt}`),
    [leftItems, q.right, q.pairs, q.id, shuffleSalt],
  );

  useEffect(() => {
    setPairs([]);
    setLeftSel(null);
    setWrongFlash(null);
    setRightFlash(null);
    mistakesRef.current = 0;
    wrongPairsRef.current = [];
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, [q.id]);

  const usedL = useMemo(() => new Set(pairs.map((p) => p[0])), [pairs]);
  const usedR = useMemo(() => new Set(pairs.map((p) => p[1])), [pairs]);
  const need = leftItems.length;

  // راهنمای هوشمند تطبیق: مشخص کردن همتای یک موردِ هنوز جفت‌نشده
  const hintPair = useMemo(() => {
    if (!hintActive || !q.pairs?.length) return null;
    const focusLeft = leftSel && !usedL.has(leftSel)
      ? leftSel
      : leftItems.find((l) => !usedL.has(l.id))?.id;
    if (!focusLeft) return null;
    const match = q.pairs.find(([l]) => l === focusLeft);
    return match ? { leftId: match[0], rightId: match[1] } : null;
  }, [hintActive, q.pairs, leftSel, leftItems, usedL]);

  const pickRight = (rid: string) => {
    if (!leftSel || locked) return;
    const expected = q.pairs?.find(([l]) => l === leftSel)?.[1];
    if (expected !== undefined && expected !== rid) {
      // جفت غلط: بازخورد فوری، بدون ثبت جفت؛ کلمهٔ انتخاب‌شده فعال می‌ماند
      mistakesRef.current += 1;
      wrongPairsRef.current.push(`${leftSel}>${rid}`);
      markChanged();
      playSfx("error-thud");
      setWrongFlash({ leftId: leftSel, rightId: rid });
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setWrongFlash(null), 900);
      return;
    }
    playSfx("snap-click");
    const np: [string, string][] = [...pairs, [leftSel, rid]];
    setPairs(np);
    setLeftSel(null);
    setRightFlash(rid);
    window.setTimeout(() => setRightFlash(null), 450);
    if (np.length === need) onDone(np, mistakesRef.current, [...wrongPairsRef.current]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 items-stretch min-h-[44vh]">
        {/* Left column */}
        <div className="grid gap-2 h-full" style={{ gridTemplateRows: `repeat(${Math.max(need, 1)}, minmax(0, 1fr))` }}>
          {leftItems.map((l) => {
            const isUsed = usedL.has(l.id);
            const isSelected = leftSel === l.id;
            const isHinted = hintPair?.leftId === l.id;
            const myPair = pairs.find((p) => p[0] === l.id);
            const pairWrong = locked && !!feedback && !!myPair && feedback.wrongIds.includes(`${myPair[0]}>${myPair[1]}`);
            const pairRight = locked && !!feedback && !!myPair && !pairWrong;
            const isWrongFlashL = wrongFlash?.leftId === l.id;
            return (
              <button
                key={l.id}
                disabled={locked || isUsed}
                onClick={() => {
                  playSfx("snap-click");
                  setLeftSel(l.id);
                }}
                className={`w-full h-full flex items-center justify-center p-3 rounded-2xl border-2 text-center transition-all ${
                  isWrongFlashL
                    ? "border-rose-500 bg-rose-100 dark:bg-rose-950/50 ring-2 ring-rose-400 animate-pulse"
                    : isUsed && pairWrong
                    ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 ring-2 ring-rose-300 dark:ring-rose-800"
                    : isUsed && pairRight
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                    : isUsed
                    ? "opacity-30 border-dashed border-slate-300 dark:border-slate-700 bg-transparent"
                    : isSelected
                    ? "border-amber-500 bg-amber-100/70 dark:bg-amber-950/40 text-amber-900 shadow-sm"
                    : isHinted
                    ? "border-amber-400 ring-2 ring-amber-300 dark:ring-amber-700 bg-amber-50/70 dark:bg-amber-950/30"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2738] hover:border-amber-300"
                }`}
              >
                {label(l, rangeLabels, arStyle)}
              </button>
            );
          })}
        </div>

        {/* Right column */}
        <div className="grid gap-2 h-full" style={{ gridTemplateRows: `repeat(${Math.max(need, 1)}, minmax(0, 1fr))` }}>
          {rightItems.map((r) => {
            const isUsed = usedR.has(r.id);
            const isHinted = hintPair?.rightId === r.id;
            const myPairR = pairs.find((p) => p[1] === r.id);
            const pairWrongR = locked && !!feedback && !!myPairR && feedback.wrongIds.includes(`${myPairR[0]}>${myPairR[1]}`);
            const pairRightR = locked && !!feedback && !!myPairR && !pairWrongR;
            const isWrongFlashR = wrongFlash?.rightId === r.id;
            const isRightFlashR = rightFlash === r.id;
            return (
              <button
                key={r.id}
                disabled={locked || isUsed || !leftSel}
                onClick={() => pickRight(r.id)}
                className={`w-full h-full flex items-center justify-center p-3 rounded-2xl border-2 text-center transition-all ${
                  isWrongFlashR
                    ? "border-rose-500 bg-rose-100 dark:bg-rose-950/50 ring-2 ring-rose-400 animate-pulse"
                    : isRightFlashR
                    ? "border-emerald-500 bg-emerald-100 dark:bg-emerald-950/50"
                    : isUsed && pairWrongR
                    ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 ring-2 ring-rose-300 dark:ring-rose-800"
                    : isUsed && pairRightR
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                    : isUsed
                    ? "opacity-30 border-dashed border-slate-300 dark:border-slate-700 bg-transparent"
                    : isHinted
                    ? "border-amber-400 ring-2 ring-amber-300 dark:ring-amber-700 bg-amber-50/70 dark:bg-amber-950/30 cursor-pointer"
                    : leftSel
                    ? "border-amber-300 dark:border-amber-700/60 bg-white dark:bg-[#1e2738] hover:bg-amber-50/50 cursor-pointer"
                    : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-[#1e2738]/70"
                }`}
              >
                {label(r, rangeLabels, arStyle)}
              </button>
            );
          })}
        </div>
      </div>

      {pairs.length > 0 && !locked && (
        <div className="flex justify-center">
          <button
            onClick={() => {
              setPairs([]);
              setLeftSel(null);
              markChanged();
            }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 py-1 px-3 rounded-lg hover:bg-black/5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>پاک‌کردن جفت‌ها و چیدن دوباره</span>
          </button>
        </div>
      )}
    </div>
  );
}

function OrderView({
  q,
  locked,
  hintActive,
  onDone,
  markChanged,
  rangeLabels,
  arStyle,
  shuffleSalt,
}: {
  q: RenderableQuestion;
  locked: boolean;
  hintActive: boolean;
  rangeLabels: Record<string, string>;
  arStyle: React.CSSProperties;
  shuffleSalt: number;
  onDone: (a: string[]) => void;
  markChanged: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const { playSfx } = useHapticsAndSfx();
  const answerArr = useMemo(() => (Array.isArray(q.answer) ? (q.answer as string[]) : []), [q.answer]);
  const expectedCount = answerArr.length || (q.bank?.length ?? 0);
  const bank = useMemo(
    () => shuffleOrderBank(q.bank ?? [], answerArr.length ? answerArr : undefined, `order:${q.id}:${shuffleSalt}`),
    [q.bank, answerArr, q.id, shuffleSalt],
  );
  const byId = useMemo(() => new Map(bank.map((b) => [b.id, b])), [bank]);

  useEffect(() => {
    setPicked([]);
  }, [q.id]);

  // راهنمای هوشمند: فقط قطعه بعدی درست را (اگر در بانک باقی مانده باشد) هایلایت می‌کند
  const hintedNextId = useMemo(() => {
    if (!hintActive || !answerArr.length) return null;
    const nextId = answerArr[picked.length];
    if (!nextId || picked.includes(nextId)) return null;
    return nextId;
  }, [hintActive, answerArr, picked]);

  const removePicked = (id: string) => {
    if (locked) return;
    playSfx("snap-click");
    setPicked(picked.filter((x) => x !== id));
    markChanged();
  };

  const addPicked = (id: string) => {
    if (locked) return;
    playSfx("snap-click");
    setPicked([...picked, id]);
  };

  const movePicked = (index: number, delta: -1 | 1) => {
    if (locked) return;
    const target = index + delta;
    if (target < 0 || target >= picked.length) return;
    playSfx("snap-click");
    const next = picked.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setPicked(next);
    markChanged();
  };

  const canSubmit = !locked && picked.length > 0 && (expectedCount === 0 || picked.length >= expectedCount);

  return (
    <div className="space-y-4">
      {/* Answer Slots Box */}
      <div className="min-h-[5.5rem] p-3 rounded-3xl bg-[#f7f2e4]/70 dark:bg-slate-900/60 border-2 border-dashed border-[#d9ccb2] dark:border-slate-700 flex flex-wrap gap-2 items-center justify-start">
        {picked.length === 0 ? (
          <span className="text-xs text-slate-400 mx-auto">
            قطعات را به ترتیب درست از کادر پایین لمس کنید ({toFarsiNum(expectedCount)} قطعه)
          </span>
        ) : (
          picked.map((id, idx) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <div
                key={id}
                className="inline-flex items-center gap-1 py-1.5 px-2 rounded-2xl bg-white dark:bg-slate-800 border-2 border-amber-300 dark:border-amber-700 shadow-sm"
              >
                {!locked && idx > 0 && (
                  <button
                    type="button"
                    onClick={() => movePicked(idx, -1)}
                    title="جابه‌جایی به قبل"
                    className="p-0.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-slate-700"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => removePicked(id)}
                  title="حذف از ترتیب"
                  className="px-1 active:scale-95 transition-transform"
                >
                  {label(item, rangeLabels, arStyle)}
                </button>
                {!locked && idx < picked.length - 1 && (
                  <button
                    type="button"
                    onClick={() => movePicked(idx, 1)}
                    title="جابه‌جایی به بعد"
                    className="p-0.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Available Bank Items */}
      <div className="flex flex-wrap gap-2 justify-center pt-1">
        {bank
          .filter((b) => !picked.includes(b.id))
          .map((b) => {
            const isHinted = hintedNextId === b.id;
            return (
              <button
                key={b.id}
                disabled={locked}
                onClick={() => addPicked(b.id)}
                className={`py-2.5 px-3.5 rounded-2xl border-2 shadow-sm active:scale-95 transition-all ${
                  isHinted
                    ? "bg-amber-50 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-300 dark:ring-amber-700"
                    : "bg-white dark:bg-[#1e2738] border-slate-200 dark:border-slate-700 hover:border-amber-400"
                }`}
              >
                {label(b, rangeLabels, arStyle)}
              </button>
            );
          })}
      </div>

      {picked.length > 0 && !locked && (
        <div className="flex justify-center">
          <button
            onClick={() => {
              setPicked([]);
              markChanged();
            }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 py-1 px-3 rounded-lg hover:bg-black/5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>پاک‌کردن و چیدن دوباره</span>
          </button>
        </div>
      )}

      {/* Action Check button for order */}
      <button
        disabled={!canSubmit}
        onClick={() => onDone(picked)}
        className="w-full py-3.5 px-6 rounded-2xl font-bold text-white bg-[#b37e3d] hover:bg-[#9d6b2f] disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-900/10 active:scale-[0.99] transition-all"
      >
        {expectedCount > 0 && picked.length < expectedCount
          ? `بررسی ترتیب (${toFarsiNum(picked.length)} از ${toFarsiNum(expectedCount)} قطعه)`
          : "بررسی ترتیب"}
      </button>
    </div>
  );
}

function ClozeView({
  q,
  locked,
  hintActive,
  onDone,
  markChanged,
  rangeLabels,
  arStyle,
  shuffleSalt,
}: {
  q: RenderableQuestion;
  locked: boolean;
  hintActive: boolean;
  rangeLabels: Record<string, string>;
  arStyle: React.CSSProperties;
  shuffleSalt: number;
  onDone: (m: Record<string, string>) => void;
  markChanged: () => void;
}) {
  const answerMap = useMemo(() => (q.answer as Record<string, string>) ?? {}, [q.answer]);
  const gaps = useMemo(() => Object.keys(answerMap), [answerMap]);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [activeGap, setActiveGap] = useState<string | null>(gaps[0] ?? null);
  const [verseWords, setVerseWords] = useState<{ i: number; ar: string }[]>([]);
  const [baseFa, setBaseFa] = useState<string | null>(null);
  const { playSfx } = useHapticsAndSfx();
  const shuffledBank = useMemo(
    () => shuffleItems(q.bank ?? [], `cloze:${q.id}:${shuffleSalt}`),
    [q.bank, q.id, shuffleSalt],
  );
  const byId = useMemo(() => new Map((q.bank ?? []).map((b) => [b.id, b])), [q.bank]);

  // در داده‌های جاخالی، هر آیتم بانک می‌تواند یک «تکه»ی چندکلمه‌ای باشد
  // (wordIdx آن چند کلمه از آیه را پوشش می‌دهد) و کلید پاسخ برای هر کلمه از
  // تکه جدا ثبت شده، ولی مقدار همه‌شان همان یک آیتم است. پس جای خالی واقعی
  // «تکه» است، نه تک‌کلمه: کلمه‌های زیر پوشش تکه باید در متن آیه پنهان شوند
  // و پر/خالی‌کردن هم در سطح تکه انجام شود تا نگاشت پاسخ برای نمره‌دهی
  // (که کلیدبه‌کلید مقایسه می‌کند) دست‌نخورده بماند.
  const gapOfWord = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of gaps) {
      const item = byId.get(answerMap[g]);
      const idxs = item?.wordIdx?.length ? item.wordIdx : [Number(g)];
      const start = String(Math.min(...idxs));
      for (const wi of idxs) {
        const key = String(wi);
        if (!map.has(key)) map.set(key, start);
      }
    }
    return map;
  }, [gaps, byId, answerMap]);

  const canonicalGaps = useMemo(
    () => gaps.filter((g) => gapOfWord.get(g) === g),
    [gaps, gapOfWord],
  );

  useEffect(() => {
    setFilled({});
    setActiveGap(gaps[0] ?? null);
  }, [q.id, gaps]);

  useEffect(() => {
    let active = true;
    const verseNum = q.stem?.verse;
    if (!verseNum) {
      setVerseWords([]);
      setBaseFa(null);
      return () => { active = false; };
    }
    if (q.type === "CLOZE_FA") {
      // برای ساخت قالبِ جای‌خالی‌دارِ ترجمه، متن پایه‌ی آیه لازم است.
      ldb.baseVerses.get(verseKey(getActiveSurahNumber(), verseNum)).then((verse) => {
        if (active) setBaseFa((verse?.fa as string | undefined) ?? null);
      }).catch(() => {
        if (active) setBaseFa(null);
      });
      return () => { active = false; };
    }
    ldb.baseVerses.get(verseKey(getActiveSurahNumber(), verseNum)).then((verse) => {
      if (!active) return;
      const words = (verse?.words as { i: number; ar: string }[] | undefined) ?? [];
      setVerseWords(words);
    }).catch(() => {
      if (active) setVerseWords([]);
    });
    return () => { active = false; };
  }, [q.id, q.stem?.verse, q.type]);

  const used = useMemo(() => new Set(Object.values(filled)), [filled]);

  // راهنمای هوشمند جای‌خالی: دو کاندیدا (یکی درست + یکی غلط) برای جای خالی فعال هایلایت می‌شوند
  const hintedCandidateIds = useMemo(() => {
    const set = new Set<string>();
    if (!hintActive || !activeGap) return set;
    const correctId = answerMap[activeGap];
    if (correctId) set.add(correctId);
    const distractor = shuffledBank.find((b) => b.id !== correctId && !used.has(b.id));
    if (distractor) set.add(distractor.id);
    return set;
  }, [hintActive, activeGap, answerMap, shuffledBank, used]);

  const place = (bid: string) => {
    if (!activeGap || locked) return;
    playSfx("snap-click");
    // پر کردن در سطح تکه: همه‌ی کلیدهای زیر پوشش این تکه همان آیتم را می‌گیرند.
    const start = gapOfWord.get(activeGap) ?? activeGap;
    const nextFilled = { ...filled };
    for (const g of gaps) {
      if (gapOfWord.get(g) === start) nextFilled[g] = bid;
    }
    setFilled(nextFilled);
    const nextGap = gaps.find((g) => !nextFilled[g]);
    setActiveGap(nextGap ?? null);
    if (!nextGap) {
      onDone(nextFilled);
    }
  };

  const clearGap = (g: string) => {
    if (locked) return;
    playSfx("snap-click");
    const start = gapOfWord.get(g) ?? g;
    const nextFilled = { ...filled };
    for (const k of gaps) {
      if (gapOfWord.get(k) === start) delete nextFilled[k];
    }
    setFilled(nextFilled);
    setActiveGap(start);
    markChanged();
  };

  const renderGapButton = (g: string, idx: number, inline = false) => {
    const filledId = filled[g];
    const item = filledId ? byId.get(filledId) : null;
    const isActive = activeGap === g;
    return (
      <button
        key={g}
        disabled={locked}
        onClick={() => (filledId ? clearGap(g) : setActiveGap(g))}
        className={`${inline ? "inline-flex mx-1 align-middle" : "flex"} min-w-[4.5rem] py-1.5 px-3 rounded-2xl border-2 transition-all items-center justify-center ${
          item
            ? "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200"
            : isActive
            ? "border-amber-500 bg-white dark:bg-slate-800 ring-2 ring-amber-300 dark:ring-amber-900"
            : "border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50"
        }`}
      >
        {item ? (
          label(item, rangeLabels, arStyle)
        ) : (
          <span className="text-xs font-sans text-slate-400">
            جای خالی {toFarsiNum(idx + 1)}
          </span>
        )}
      </button>
    );
  };

  const canRenderInlineArabic =
    verseWords.length > 0 &&
    gaps.length > 0 &&
    gaps.every((g) => verseWords.some((w) => String(w.i) === g));

  const faModel = useMemo(() => buildFaClozeModel(q, baseFa), [q, baseFa]);
  const faParts = faModel?.parts ?? null;
  const faKeys = faModel?.keys ?? gaps;
  const canRenderInlineFa = Boolean(faModel);

  return (
    <div className="space-y-4">
      {/* Gap Fillers View */}
      <div className="p-4 rounded-3xl bg-[#fcf9f2] dark:bg-slate-900 border border-[#e8dfcd] dark:border-slate-800 space-y-3">
        <div className="text-xs font-semibold text-slate-500">
          جاهای خالی را با لمس گزینه‌های زیر پر کنید:
        </div>

        {canRenderInlineArabic ? (
          <div style={arStyle} className="text-right text-slate-900 dark:text-slate-100 leading-[2.6]">
            {verseWords.map((w) => {
              const key = String(w.i);
              const gapIdx = canonicalGaps.indexOf(key);
              if (gapIdx !== -1) {
                return renderGapButton(key, gapIdx, true);
              }
              // کلمه زیر پوشش یک تکه است و دکمه‌اش در ابتدای تکه رندر شده؛
              // خودش نباید دوباره در متن دیده شود (علت آیه‌های تکراری/ساختگی).
              if (gapOfWord.has(key)) {
                return null;
              }
              return (
                <span key={w.i} className="inline-block mx-1">
                  {w.ar}
                </span>
              );
            })}
          </div>
        ) : canRenderInlineFa && faParts ? (
          <div className="text-sm sm:text-base leading-loose text-slate-800 dark:text-slate-100 font-medium">
            {faParts.map((part, idx) => (
              <span key={idx}>
                {part}
                {idx < faKeys.length && renderGapButton(faKeys[idx], idx, true)}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5 items-center justify-center">
            {canonicalGaps.map((g, idx) => renderGapButton(g, idx, false))}
          </div>
        )}
      </div>

      {/* Word Bank */}
      <div className="flex flex-wrap gap-2 justify-center pt-1">
        {shuffledBank
          .filter((b) => !used.has(b.id))
          .map((b) => {
            const isHinted = hintedCandidateIds.has(b.id);
            return (
              <button
                key={b.id}
                disabled={locked || !activeGap}
                onClick={() => place(b.id)}
                className={`py-2.5 px-3.5 rounded-2xl border-2 shadow-sm active:scale-95 transition-all ${
                  isHinted
                    ? "bg-amber-50 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-300 dark:ring-amber-700"
                    : "bg-white dark:bg-[#1e2738] border-slate-200 dark:border-slate-700 hover:border-amber-400"
                }`}
              >
                {label(b, rangeLabels, arStyle)}
              </button>
            );
          })}
      </div>
    </div>
  );
}
