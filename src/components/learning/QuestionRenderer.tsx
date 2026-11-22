// src/components/learning/QuestionRenderer.tsx
// نمایش و جمع‌آوری پاسخ برای چهار شکل سوال. پاسخ بر پایه‌ی شناسه‌هاست، نه متن عربی.
import { useMemo, useRef, useState, useEffect } from "react";
import { HelpCircle, Check, RotateCcw } from "lucide-react";
import { ldb, type QuestionRow } from "../../db/learningDb";
import { labelOption } from "./questionOptionLabel";

interface Item {
  id: string;
  ar?: string;
  fa?: string;
  num?: number;
  words?: string[];
  wordRange?: { verse: number; from: number; to: number };
}

export type RenderableQuestion = QuestionRow & {
  promptFa?: string;
  stem?: {
    ar?: string;
    fa?: string;
    verse?: number;
    num?: number;
    hiddenIdx?: number[];
    faHidden?: { text: string }[];
  };
  options?: Item[];
  left?: Item[];
  right?: Item[];
  bank?: Item[];
  answer?: unknown;
  explanationFa?: string;
};

interface Props {
  q: RenderableQuestion;
  locked: boolean;
  onSubmit: (response: unknown, meta: { usedHint: boolean; changedAnswer: boolean; responseMs: number }) => void;
}

const arStyle: React.CSSProperties = {
  fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif",
  direction: "rtl",
  fontSize: "1.75rem",
  lineHeight: 2.4,
};

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

const label = (o: Item, rangeLabels: Record<string, string>) => {
  const text = labelOption(o, rangeLabels);
  return o.ar ? (
    <span style={arStyle} className="text-slate-900 dark:text-slate-100">{text}</span>
  ) : (
    <span className="text-sm font-semibold">{text}</span>
  );
};

export default function QuestionRenderer({ q, locked, onSubmit }: Props) {
  const t0 = useRef(Date.now());
  const changed = useRef(false);
  const [hint, setHint] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [resolvedLabels, setResolvedLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const items = [...(q.options ?? []), ...(q.left ?? []), ...(q.right ?? []), ...(q.bank ?? [])];
    const verses = new Map<number, Promise<{ i: number; ar: string }[]>>();
    const getWords = (verseNumber: number) => {
      if (!verses.has(verseNumber)) {
        verses.set(verseNumber, ldb.baseVerses.get(verseNumber).then((verse) => (verse?.words as { i: number; ar: string }[] | undefined) ?? []));
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
          {q.promptFa}
        </h2>

        {/* Stem Arabic or Persian Text */}
        {q.stem?.ar && (
          <div className="p-4 sm:p-5 rounded-3xl bg-[#fcf9f2] dark:bg-[#1a2332] border border-[#e8dfcd] dark:border-slate-800 shadow-sm text-center">
            <p style={arStyle}>{q.stem.ar}</p>
          </div>
        )}
        {q.stem?.fa && !q.stem.ar && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
              «{q.stem.fa}»
            </p>
          </div>
        )}
      </div>

      {/* Shapes */}
      {q.shape === "choice" && (
        <div className="grid grid-cols-1 gap-2.5">
          {q.options?.map((o) => {
            const isSelected = selectedChoice === o.id;
            return (
              <button
                key={o.id}
                disabled={locked}
                onClick={() => handleChoiceSelect(o.id)}
                className={`w-full rounded-2xl p-4 text-right transition-all border-2 active:scale-[0.99] flex items-center justify-between min-h-[3.75rem] ${
                  isSelected
                    ? "bg-amber-100/70 border-amber-500 dark:bg-amber-950/40 dark:border-amber-500 shadow-sm"
                    : "bg-white dark:bg-[#1e2738] border-slate-200 dark:border-slate-700/80 hover:border-amber-400 hover:bg-amber-50/30"
                } ${locked ? "cursor-default" : "cursor-pointer"}`}
              >
                <div className="flex-1 min-w-0 pr-1">{label(o, resolvedLabels)}</div>
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
          rangeLabels={resolvedLabels}
          onDone={(p) => onSubmit(p, meta())}
          markChanged={() => (changed.current = true)}
        />
      )}

      {q.shape === "order" && (
        <OrderView
          q={q}
          locked={locked}
          rangeLabels={resolvedLabels}
          onDone={(a) => onSubmit(a, meta())}
          markChanged={() => (changed.current = true)}
        />
      )}

      {q.shape === "cloze" && (
        <ClozeView
          q={q}
          locked={locked}
          rangeLabels={resolvedLabels}
          onDone={(m) => onSubmit(m, meta())}
          markChanged={() => (changed.current = true)}
        />
      )}

      {!locked && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-end">
            <button
              onClick={() => setHint(true)}
              disabled={hint}
              aria-expanded={hint}
              className="text-xs flex items-center gap-1.5 py-1.5 px-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              <HelpCircle className="w-4 h-4" />
              <span>{hint ? "راهنما" : "نمایش راهنما"}</span>
            </button>
          </div>
          {hint && (
            <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {q.explanationFa || "به متن سؤال و نشانه‌های زبانی آن توجه کنید؛ پاسخ را خودتان انتخاب کنید."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchView({
  q,
  locked,
  onDone,
  markChanged,
  rangeLabels,
}: {
  q: RenderableQuestion;
  locked: boolean;
  rangeLabels: Record<string, string>;
  onDone: (p: [string, string][]) => void;
  markChanged: () => void;
}) {
  const [pairs, setPairs] = useState<[string, string][]>([]);
  const [leftSel, setLeftSel] = useState<string | null>(null);

  useEffect(() => {
    setPairs([]);
    setLeftSel(null);
  }, [q.id]);

  const usedL = new Set(pairs.map((p) => p[0]));
  const usedR = new Set(pairs.map((p) => p[1]));
  const need = q.left?.length ?? 0;

  const pickRight = (rid: string) => {
    if (!leftSel) return;
    const np: [string, string][] = [...pairs, [leftSel, rid]];
    setPairs(np);
    setLeftSel(null);
    if (np.length === need) onDone(np);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {/* Left column */}
        <div className="space-y-2">
          {q.left?.map((l) => {
            const isUsed = usedL.has(l.id);
            const isSelected = leftSel === l.id;
            return (
              <button
                key={l.id}
                disabled={locked || isUsed}
                onClick={() => setLeftSel(l.id)}
                className={`w-full p-3 rounded-2xl border-2 text-center transition-all ${
                  isUsed
                    ? "opacity-30 border-dashed border-slate-300 dark:border-slate-700 bg-transparent"
                    : isSelected
                    ? "border-amber-500 bg-amber-100/70 dark:bg-amber-950/40 text-amber-900 shadow-sm"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2738] hover:border-amber-300"
                }`}
              >
                {label(l, rangeLabels)}
              </button>
            );
          })}
        </div>

        {/* Right column */}
        <div className="space-y-2">
          {q.right?.map((r) => {
            const isUsed = usedR.has(r.id);
            return (
              <button
                key={r.id}
                disabled={locked || isUsed || !leftSel}
                onClick={() => pickRight(r.id)}
                className={`w-full p-3 rounded-2xl border-2 text-center transition-all ${
                  isUsed
                    ? "opacity-30 border-dashed border-slate-300 dark:border-slate-700 bg-transparent"
                    : leftSel
                    ? "border-amber-300 dark:border-amber-700/60 bg-white dark:bg-[#1e2738] hover:bg-amber-50/50 cursor-pointer"
                    : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-[#1e2738]/70"
                }`}
              >
                {label(r, rangeLabels)}
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
  onDone,
  markChanged,
  rangeLabels,
}: {
  q: RenderableQuestion;
  locked: boolean;
  rangeLabels: Record<string, string>;
  onDone: (a: string[]) => void;
  markChanged: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const bank = useMemo(() => q.bank ?? [], [q]);
  const byId = useMemo(() => new Map(bank.map((b) => [b.id, b])), [bank]);

  useEffect(() => {
    setPicked([]);
  }, [q.id]);

  const removePicked = (id: string) => {
    if (locked) return;
    setPicked(picked.filter((x) => x !== id));
    markChanged();
  };

  const addPicked = (id: string) => {
    if (locked) return;
    setPicked([...picked, id]);
  };

  return (
    <div className="space-y-4">
      {/* Answer Slots Box */}
      <div className="min-h-[5.5rem] p-3 rounded-3xl bg-[#f7f2e4]/70 dark:bg-slate-900/60 border-2 border-dashed border-[#d9ccb2] dark:border-slate-700 flex flex-wrap gap-2 items-center justify-start">
        {picked.length === 0 ? (
          <span className="text-xs text-slate-400 mx-auto">
            قطعات را به ترتیب درست از کادر پایین لمس کنید
          </span>
        ) : (
          picked.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <button
                key={id}
                disabled={locked}
                onClick={() => removePicked(id)}
                className="py-2 px-3 rounded-2xl bg-white dark:bg-slate-800 border-2 border-amber-300 dark:border-amber-700 shadow-sm active:scale-95 transition-transform"
              >
                {label(item, rangeLabels)}
              </button>
            );
          })
        )}
      </div>

      {/* Available Bank Items */}
      <div className="flex flex-wrap gap-2 justify-center pt-1">
        {bank
          .filter((b) => !picked.includes(b.id))
          .map((b) => (
            <button
              key={b.id}
              disabled={locked}
              onClick={() => addPicked(b.id)}
              className="py-2.5 px-3.5 rounded-2xl bg-white dark:bg-[#1e2738] border-2 border-slate-200 dark:border-slate-700 shadow-sm hover:border-amber-400 active:scale-95 transition-all"
            >
              {label(b, rangeLabels)}
            </button>
          ))}
      </div>

      {/* Action Check button for order */}
      <button
        disabled={locked || picked.length === 0}
        onClick={() => onDone(picked)}
        className="w-full py-3.5 px-6 rounded-2xl font-bold text-white bg-[#b37e3d] hover:bg-[#9d6b2f] disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-900/10 active:scale-[0.99] transition-all"
      >
        بررسی ترتیب
      </button>
    </div>
  );
}

function ClozeView({
  q,
  locked,
  onDone,
  markChanged,
  rangeLabels,
}: {
  q: RenderableQuestion;
  locked: boolean;
  rangeLabels: Record<string, string>;
  onDone: (m: Record<string, string>) => void;
  markChanged: () => void;
}) {
  const gaps = useMemo(() => Object.keys((q.answer as Record<string, string>) ?? {}), [q.answer]);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [activeGap, setActiveGap] = useState<string | null>(gaps[0] ?? null);
  const byId = useMemo(() => new Map((q.bank ?? []).map((b) => [b.id, b])), [q.bank]);

  useEffect(() => {
    setFilled({});
    setActiveGap(gaps[0] ?? null);
  }, [q.id, gaps]);

  const used = new Set(Object.values(filled));

  const place = (bid: string) => {
    if (!activeGap || locked) return;
    const nextFilled = { ...filled, [activeGap]: bid };
    setFilled(nextFilled);
    const nextGap = gaps.find((g) => !nextFilled[g]);
    setActiveGap(nextGap ?? null);
    if (!nextGap) {
      onDone(nextFilled);
    }
  };

  const clearGap = (g: string) => {
    if (locked) return;
    const nextFilled = { ...filled };
    delete nextFilled[g];
    setFilled(nextFilled);
    setActiveGap(g);
    markChanged();
  };

  return (
    <div className="space-y-4">
      {/* Gap Fillers View */}
      <div className="p-4 rounded-3xl bg-[#fcf9f2] dark:bg-slate-900 border border-[#e8dfcd] dark:border-slate-800 space-y-3">
        <div className="text-xs font-semibold text-slate-500">
          جاهای خالی آیه را با لمس گزینه‌های زیر پر کنید:
        </div>
        <div className="flex flex-wrap gap-2.5 items-center justify-center">
          {gaps.map((g, idx) => {
            const filledId = filled[g];
            const item = filledId ? byId.get(filledId) : null;
            const isActive = activeGap === g;

            return (
              <button
                key={g}
                disabled={locked}
                onClick={() => (filledId ? clearGap(g) : setActiveGap(g))}
                className={`min-w-[4.5rem] py-2 px-3 rounded-2xl border-2 transition-all flex items-center justify-center ${
                  item
                    ? "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200"
                    : isActive
                    ? "border-amber-500 bg-white dark:bg-slate-800 ring-2 ring-amber-300 dark:ring-amber-900"
                    : "border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50"
                }`}
              >
                {item ? (
                  label(item, rangeLabels)
                ) : (
                  <span className="text-xs text-slate-400">
                    جای خالی {toFarsiNum(idx + 1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Word Bank */}
      <div className="flex flex-wrap gap-2 justify-center pt-1">
        {(q.bank ?? [])
          .filter((b) => !used.has(b.id))
          .map((b) => (
            <button
              key={b.id}
              disabled={locked || !activeGap}
              onClick={() => place(b.id)}
              className="py-2.5 px-3.5 rounded-2xl bg-white dark:bg-[#1e2738] border-2 border-slate-200 dark:border-slate-700 shadow-sm hover:border-amber-400 active:scale-95 transition-all"
            >
              {label(b, rangeLabels)}
            </button>
          ))}
      </div>
    </div>
  );
}
