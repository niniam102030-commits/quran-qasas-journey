// src/components/mushaf/MushafHalfPage.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Eye, EyeOff, BookOpen, Sparkles, ChevronRight, Maximize2, Minimize2, Footprints, Flame, AlertCircle, VolumeX, Mic, Play, Pause, X, Loader2, Palette } from "lucide-react";
import { ldb, verseKey, type LexiconRow, type StoredCard } from "../../db/learningDb";
import { newCard, review } from "../../learning/cardScheduler";
import { skillLevel } from "../../learning/mastery";
import { planMutedSession } from "../../learning/mutedAudio";
import { TAJWEED_RULES, getWordTajweedStyle, type SurahTajweedData, type TajweedRuleId } from "../../learning/tajweed";
import { getMeta, setMeta } from "../../services/metaStore";
import { usePreferencesStore } from "../../store/usePreferencesStore";
import { useContinuousPlay } from "../../hooks/useContinuousPlay";
import {
  findActiveWordAtMs,
  loadQulAudioTimings,
  loadQulMorphology,
  loadTajweedData,
  type QulMorphologyEntry,
  type WordAudioSegment,
} from "../../services/qulReferenceService";
import VerseAudioPlayer from "../audio/VerseAudioPlayer";
import SelfReciteRecorder from "../audio/SelfReciteRecorder";
import MutedAudioQuiz from "../audio/MutedAudioQuiz";
import TasmiModal from "./TasmiModal";

interface Word {
  id: string;
  i: number;
  ar: string;
}

interface Verse {
  n: number;
  arText: string;
  fa: string;
  words: Word[];
}

interface Props {
  unitId: string;
  onClose?: () => void;
  onStartPractice?: () => void;
  onOpenTajweedLessons?: () => void;
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

export default function MushafHalfPage({ unitId, onClose, onStartPractice, onOpenTajweedLessons }: Props) {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"reading" | "partial" | "hidden" | "step">("reading");
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
  const [stepCursor, setStepCursor] = useState<number>(0);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [activeAudioVerse, setActiveAudioVerse] = useState<number | null>(null);
  const [activeAudioWord, setActiveAudioWord] = useState<{ verse: number; wordIndex: number } | null>(null);
  const [audioTimings, setAudioTimings] = useState<Record<string, WordAudioSegment[]>>({});
  const [qulMorphMap, setQulMorphMap] = useState<Record<string, QulMorphologyEntry>>({});
  const [tajweedData, setTajweedData] = useState<SurahTajweedData | null>(null);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [cardsMap, setCardsMap] = useState<Map<string, StoredCard>>(new Map());
  const [lexiconMap, setLexiconMap] = useState<Map<string, LexiconRow>>(new Map());
  const [pinnedMistakes, setPinnedMistakes] = useState<Set<string>>(new Set());
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [showMutedQuiz, setShowMutedQuiz] = useState<boolean>(false);
  const [showTasmi, setShowTasmi] = useState<boolean>(false);
  const [surahNameFa, setSurahNameFa] = useState<string>("سوره قصص");
  const activeSurah = usePreferencesStore((s) => s.activeSurah);
  const fontSize = usePreferencesStore((s) => s.arabicFontSize);
  const mushafTheme = usePreferencesStore((s) => s.mushafTheme);
  const autoFollowMushaf = usePreferencesStore((s) => s.autoFollowMushaf);
  const toggleAutoFollowMushaf = usePreferencesStore((s) => s.toggleAutoFollowMushaf);
  const tajweedColorsEnabled = usePreferencesStore((s) => s.tajweedColorsEnabled);
  const toggleTajweedColorsEnabled = usePreferencesStore((s) => s.toggleTajweedColorsEnabled);
  const verseSpanRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  const allWordIds = useMemo(() => verses.flatMap((v) => v.words.map((w) => w.id)), [verses]);
  const verseNumsList = useMemo(() => verses.map((v) => v.n), [verses]);
  const continuous = useContinuousPlay({
    verses: verseNumsList,
    surahNumber: activeSurah,
    audioTimings,
    autoFollow: autoFollowMushaf,
    onScrollToVerse: (verseNum) => {
      const el = verseSpanRefs.current.get(verseNum);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },
  });
  const effectiveActiveVerse = continuous.status !== "idle" ? continuous.activeVerse : activeAudioVerse;
  const effectiveActiveWord = continuous.status !== "idle" ? continuous.activeWord : activeAudioWord;
  const mutedWordsInput = useMemo(
    () => verses.map((v) => ({ n: v.n, words: v.words.map((w) => w.ar) })),
    [verses],
  );
  const hasMutedTiming = useMemo(
    () => planMutedSession(mutedWordsInput, audioTimings, { count: 1 }).length > 0,
    [mutedWordsInput, audioTimings],
  );

  const handleSavePrecisionLog = useCallback(async (entry: { at: number; verse: number; accuracy: number }) => {
    try {
      const prev = await getMeta<{ at: number; verse: number; accuracy: number }[]>("precisionLog", []);
      await setMeta("precisionLog", [...prev, entry].slice(-100));
    } catch {
      // ignore
    }
  }, []);

  const loadStudyOverlay = useCallback(async () => {
    try {
      const [allCards, unitLex, allConfusions] = await Promise.all([
        ldb.cards.toArray(),
        ldb.lexicon.where("unitId").equals(unitId).toArray(),
        ldb.confusions.toArray(),
      ]);
      setCardsMap(new Map(allCards.map((c) => [c.key, c])));
      setLexiconMap(new Map(unitLex.map((l) => [l.wordId, l])));
      setPinnedMistakes(
        new Set(allConfusions.filter((c) => c.target.startsWith("w:")).map((c) => c.target.slice(2))),
      );
    } catch {
      // ignore overlay load error
    }
  }, [unitId]);

  useEffect(() => {
    void loadStudyOverlay();
  }, [loadStudyOverlay]);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadQulAudioTimings("qasas", activeSurah),
      loadQulMorphology("qasas", activeSurah),
      activeSurah === 28 ? loadTajweedData("qasas") : Promise.resolve(null),
    ]).then(([timings, morph, tajweed]) => {
      if (!active) return;
      setAudioTimings(timings);
      setQulMorphMap(morph);
      setTajweedData(tajweed);
    });
    return () => {
      active = false;
    };
  }, [activeSurah]);

  const tajweedByVerseWord = useMemo(() => {
    const map = new Map<string, TajweedRuleId[]>();
    if (!tajweedData?.verses) return map;
    for (const [vKey, list] of Object.entries(tajweedData.verses)) {
      for (const entry of list) {
        map.set(`${vKey}:${entry.w}`, entry.rules);
      }
    }
    return map;
  }, [tajweedData]);

  const handlePlaybackProgress = useCallback(
    (verse: number, currentTimeMs: number) => {
      const segs = audioTimings[String(verse)];
      const wordIdx = findActiveWordAtMs(segs, currentTimeMs);
      setActiveAudioWord((prev) => {
        if (wordIdx === null) return prev === null ? null : null;
        if (prev && prev.verse === verse && prev.wordIndex === wordIdx) return prev;
        return { verse, wordIndex: wordIdx };
      });
    },
    [audioTimings],
  );

  const handleActiveVerseChange = useCallback((verse: number | null) => {
    setActiveAudioVerse(verse);
    if (verse === null) setActiveAudioWord(null);
  }, []);

  const handleWordsRecitedCorrectly = useCallback((wordIds: string[]) => {
    setRevealedWords((prev) => {
      const next = new Set(prev);
      for (const id of wordIds) next.add(id);
      return next;
    });
  }, []);

  const handlePinRecitationMistake = async (wordId: string, verseNum: number) => {
    try {
      const now = new Date();
      const wKey = `w:${wordId}`;
      const vrKey = `vr:${verseNum}`;
      const [wCard, vrCard] = await Promise.all([ldb.cards.get(wKey), ldb.cards.get(vrKey)]);
      await ldb.transaction("rw", [ldb.cards, ldb.confusions], async () => {
        await ldb.cards.bulkPut([
          review(wCard ?? newCard(wKey, now), "again", now),
          review(vrCard ?? newCard(vrKey, now), "again", now),
        ]);
        await ldb.confusions.add({
          qid: `mushaf_pin:${wordId}`,
          target: wKey,
          chosenTag: "neighbor_word",
          at: now.getTime(),
        });
      });
      setPinnedMistakes((prev) => new Set(prev).add(wordId));
      await loadStudyOverlay();
      setPinNotice("نقطه خطای تلاوت ثبت شد و به صف مرور هوشمند اضافه گردید.");
      setTimeout(() => setPinNotice(null), 3000);
    } catch {
      setPinNotice("خطا در ثبت نقطه خطا.");
    }
  };

  const getWordHeatClass = (wordId: string): string => {
    if (!showHeatmap) return "";
    const card = cardsMap.get(`w:${wordId}`);
    if (pinnedMistakes.has(wordId) || (card && card.state > 0 && (card.lapses > 0 || card.stability < 2))) {
      return "underline decoration-rose-500 decoration-2 underline-offset-8";
    }
    if (card && skillLevel(card) >= 3) {
      return "underline decoration-emerald-500/70 decoration-2 underline-offset-8";
    }
    if (card && card.state > 0) {
      return "underline decoration-amber-400/80 decoration-2 underline-offset-8";
    }
    return "";
  };

  useEffect(() => {
    async function loadVerses() {
      setLoading(true);
      try {
        let unit: { id: string; verses?: string[]; verseFrom?: number; verseTo?: number } | undefined;
        if (activeSurah === 28) {
          setSurahNameFa("سوره قصص");
          const base = import.meta.env.BASE_URL || "/";
          const planRes = await fetch(`${base}content/base/units-plan.json`);
          const plan = await planRes.json();
          unit = plan.find((u: { id: string }) => u.id === unitId);
        } else {
          const packMeta = await getMeta<{
            nameFa?: string;
            units?: { id: string; verses?: string[]; verseFrom?: number; verseTo?: number }[];
          } | null>(`surahPackMeta:${activeSurah}`, null);
          if (packMeta?.nameFa) setSurahNameFa(packMeta.nameFa);
          unit = packMeta?.units?.find((u) => u.id === unitId);
        }
        if (unit) {
          const verseNums: number[] = unit.verses?.length
            ? unit.verses
                .map((v: string) => {
                  const m = /(\d+)$/.exec(v);
                  return m ? Number(m[1]) : Number(v.slice(4));
                })
                .filter((n) => Number.isFinite(n) && n > 0)
            : unit.verseFrom && unit.verseTo
            ? Array.from({ length: unit.verseTo - unit.verseFrom + 1 }, (_, i) => unit!.verseFrom! + i)
            : [];
          const rawRows = await ldb.baseVerses.bulkGet(verseNums.map((n) => verseKey(activeSurah, n)));
          const baseRows = rawRows.filter((r): r is NonNullable<typeof r> => !!r);
          baseRows.sort((a, b) => a.n - b.n);
          setVerses(baseRows as unknown as Verse[]);
        }
      } catch (e) {
        console.error("Failed to load unit verses for mushaf page:", e);
      } finally {
        setLoading(false);
      }
    }
    loadVerses();
  }, [unitId, activeSurah]);

  const toggleRevealWord = (wordId: string) => {
    setRevealedWords((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  };

  const handleChangeMode = (nextMode: "reading" | "partial" | "hidden" | "step") => {
    setMode(nextMode);
    setRevealedWords(new Set());
    setStepCursor(0);
  };

  const revealAllWords = () => {
    setRevealedWords(new Set(allWordIds));
    setStepCursor(allWordIds.length);
  };

  const hideAllWords = () => {
    setRevealedWords(new Set());
    setStepCursor(0);
  };

  const revealNextStepWord = () => {
    if (stepCursor >= allWordIds.length) return;
    const nextId = allWordIds[stepCursor];
    setRevealedWords((prev) => new Set(prev).add(nextId));
    setStepCursor((c) => c + 1);
  };

  const isWordHidden = (word: Word): boolean => {
    if (mode === "reading") return false;
    if (revealedWords.has(word.id)) return false;
    if (mode === "step") return true;
    if (mode === "hidden") {
      // In hidden mode, hide every 2nd and 3rd word
      return word.i % 2 === 0 || word.i % 3 === 0;
    }
    if (mode === "partial") {
      // In partial mode, show only first 2 words of the verse, hide the rest
      return word.i > 2;
    }
    return false;
  };

  const rootThemeClass =
    mushafTheme === "gold"
      ? "bg-gradient-to-b from-amber-50 via-[#fbf2db] to-amber-100/80 text-slate-900"
      : mushafTheme === "night"
      ? "bg-slate-900 text-[#f5ebd6]"
      : "bg-[#fcf9f2] dark:bg-[#151c28] text-slate-900 dark:text-slate-100";

  return (
    <div dir="rtl" className={`flex flex-col min-h-screen ${rootThemeClass} select-none overflow-y-auto ${focusMode ? "fixed inset-0 z-50" : ""}`}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#f7f2e4]/95 dark:bg-[#1a2332]/95 backdrop-blur border-b border-[#e6dbc5] dark:border-slate-800">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform"
              title="بازگشت"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <div>
            <h1 className="text-sm sm:text-base font-bold text-[#8a5b29] dark:text-amber-400">
              نیم‌صفحه مصحف
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              سوره قصص (آیات {verses[0] ? toFarsiNum(verses[0].n) : "..."} تا {verses.length ? toFarsiNum(verses[verses.length - 1].n) : "..."})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {!loading && verseNumsList.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (continuous.status === "idle") {
                  continuous.start(0);
                } else {
                  void continuous.togglePause();
                }
              }}
              title={continuous.status === "idle" ? "پخش پیوستهٔ واحد" : "توقف/ادامه پخش پیوسته"}
              className={`py-1.5 px-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all ${
                continuous.status !== "idle"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              }`}
            >
              {continuous.status === "loading" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : continuous.status === "playing" ? (
                <Pause className="w-3.5 h-3.5 fill-white" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-white" />
              )}
              <span className="hidden sm:inline">پخش پیوسته</span>
            </button>
          )}

          {/* Practice Mode Selector */}
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-black/5 dark:border-white/5">
            {(
              [
                { id: "reading", label: "روخوانی" },
                { id: "partial", label: "شروع آیه" },
                { id: "hidden", label: "حفظ" },
                { id: "step", label: "کلمه‌به‌کلمه" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleChangeMode(tab.id)}
                className={`px-2 py-1 text-[11px] sm:text-xs font-semibold rounded-xl transition-all ${
                  mode === tab.id
                    ? "bg-white dark:bg-slate-700 text-[#8a5b29] dark:text-amber-300 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleTajweedColorsEnabled}
            title={tajweedColorsEnabled ? "خاموش‌کردن رنگ‌های تجوید" : "نمایش رنگ‌های تجوید"}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 transition-colors ${
              tajweedColorsEnabled
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300"
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">رنگ‌های تجوید</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHeatmap((h) => !h)}
            title={showHeatmap ? "مخفی‌کردن نقشه حرارتی تسلط" : "نمایش نقشه حرارتی تسلط (سبز/زرد/قرمز)"}
            className={`p-2 rounded-xl transition-colors ${
              showHeatmap
                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                : "bg-black/5 dark:bg-white/5 text-slate-500"
            }`}
          >
            <Flame className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setFocusMode((f) => !f)}
            title={focusMode ? "خروج از حالت تمرکز" : "حالت تمرکز تمام‌صفحه"}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-black/10 transition-colors"
          >
            {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Quran Mushaf Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 pb-28 space-y-4">
        {!loading && verseNumsList.length > 0 && (
          <div className="space-y-2">
            <VerseAudioPlayer
              verses={verseNumsList}
              onActiveVerseChange={handleActiveVerseChange}
              onPlaybackProgress={handlePlaybackProgress}
            />
            <SelfReciteRecorder
              verses={verses}
              onWordsRecitedCorrectly={handleWordsRecitedCorrectly}
              onFinalPrecision={(entry) => void handleSavePrecisionLog(entry)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTasmi(true)}
                className="py-2 px-3.5 rounded-2xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs font-extrabold flex items-center gap-1.5 transition-all"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>تسمیع نیم‌صفحه</span>
              </button>
              <button
                type="button"
                disabled={!hasMutedTiming}
                onClick={() => setShowMutedQuiz(true)}
                title={
                  hasMutedTiming
                    ? "پخش تلاوت با سکوت روی کلمهٔ هدف"
                    : "دادهٔ زمان‌بندی این نیم‌صفحه موجود نیست"
                }
                className="py-2 px-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 transition-all disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <VolumeX className="w-3.5 h-3.5" />
                <span>تمرین صوت ناقص</span>
              </button>
            </div>
          </div>
        )}

        {!loading && mode !== "reading" && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={revealAllWords}
                className="py-1.5 px-3 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 hover:bg-amber-200 transition-colors flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>نمایش همه</span>
              </button>
              <button
                type="button"
                onClick={hideAllWords}
                className="py-1.5 px-3 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>پنهان همه</span>
              </button>
            </div>

            {mode === "step" && (
              <button
                type="button"
                onClick={revealNextStepWord}
                disabled={stepCursor >= allWordIds.length}
                className="py-1.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
              >
                <Footprints className="w-3.5 h-3.5" />
                <span>
                  کلمه بعدی ({toFarsiNum(stepCursor)} / {toFarsiNum(allWordIds.length)})
                </span>
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <BookOpen className="w-8 h-8 animate-pulse text-amber-500" />
            <span className="text-sm">در حال بارگذاری نیم‌صفحه مصحف...</span>
          </div>
        ) : (
          <div className="bg-[#fffdf7] dark:bg-[#162032] border-2 border-[#d4af37]/65 dark:border-teal-700/70 rounded-3xl p-5 sm:p-8 tazhib-frame">
            {/* Mushaf Decorative Iranian-Islamic Tazhib Banner Top */}
            <div className="text-center pb-3.5 mb-5 border-b-2 border-[#d4af37]/40 dark:border-teal-800/60 flex items-center justify-center gap-2 text-xs font-extrabold text-[#028090] dark:text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>مصحف شریف {surahNameFa} — رسم‌الخط عثمانی</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>

            {/* Verses Flow (Continuous Quranic Layout) */}
            <div
              className="text-right leading-[2.6] sm:leading-[3.0] tracking-wide text-slate-800 dark:text-slate-100"
              style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif", fontFeatureSettings: "normal", fontSize: `${fontSize}px` }}
            >
              {verses.map((v) => (
                <span
                  key={v.n}
                  ref={(el) => {
                    if (el) verseSpanRefs.current.set(v.n, el);
                    else verseSpanRefs.current.delete(v.n);
                  }}
                  className={`inline rounded-xl transition-colors ${
                    effectiveActiveVerse === v.n ? "bg-amber-200/45 dark:bg-amber-900/35" : ""
                  }`}
                >
                  {v.words.map((w, wIdx) => {
                    const hidden = isWordHidden(w);
                    const isAudioHighlighted =
                      effectiveActiveWord !== null &&
                      effectiveActiveWord.verse === v.n &&
                      effectiveActiveWord.wordIndex === w.i;
                    const tajweedRules = tajweedColorsEnabled ? tajweedByVerseWord.get(`${v.n}:${wIdx}`) : undefined;
                    const tajweedStyle = tajweedRules ? getWordTajweedStyle(tajweedRules) : null;
                    const wordColorOrHeat = tajweedStyle?.className
                      ? `${tajweedStyle.className} ${tajweedStyle.hasMultiple ? "" : getWordHeatClass(w.id)}`
                      : getWordHeatClass(w.id);
                    return (
                      <span
                        key={w.id}
                        onClick={() => {
                          if (mode !== "reading") toggleRevealWord(w.id);
                          setSelectedWord(selectedWord === w.id ? null : w.id);
                        }}
                        className={`inline-block mx-1 px-1 rounded-lg transition-all cursor-pointer ${
                          hidden && !isAudioHighlighted
                            ? "bg-[#e2d5bd] dark:bg-slate-700 text-transparent min-w-[3rem] text-center border-b-2 border-dashed border-[#bfa57a] dark:border-slate-500"
                            : isAudioHighlighted
                            ? "bg-emerald-400/35 dark:bg-emerald-500/35 ring-2 ring-emerald-500/70 text-emerald-950 dark:text-emerald-100 scale-[1.04]"
                            : selectedWord === w.id
                            ? `bg-amber-200/70 dark:bg-amber-900/40 ${wordColorOrHeat}`
                            : `hover:bg-amber-100/50 dark:hover:bg-white/5 ${wordColorOrHeat}`
                        }`}
                      >
                        {w.ar}
                      </span>
                    );
                  })}
                  {/* Ayah End Mark with Verse Number */}
                  <span
                    className="inline-flex items-center justify-center text-amber-700 dark:text-amber-400 mx-1.5 font-bold text-xl sm:text-2xl select-none"
                    title={`آیه ${v.n}`}
                  >
                    ۝{toFarsiNum(v.n)}
                  </span>
                </span>
              ))}
            </div>

            {/* Hint Notice */}
            {mode !== "reading" && (
              <div className="mt-6 pt-4 border-t border-[#e9dfcb] dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>برای نمایش یا پنهان‌سازی هر کلمه، روی آن ضربه بزنید.</span>
              </div>
            )}

            {/* راهنمای رنگ‌های تجوید (B2) */}
            {tajweedColorsEnabled && (
              <div className="mt-6 pt-4 border-t border-[#e9dfcb] dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    راهنمای رنگ‌های تجوید (خط چین = چند حکم هم‌زمان)
                  </span>
                  {onOpenTajweedLessons && (
                    <button
                      type="button"
                      onClick={onOpenTajweedLessons}
                      className="px-3 py-1 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-[#028090] dark:text-teal-300 font-bold text-[11px]"
                    >
                      مینی‌درس‌های تجوید
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {TAJWEED_RULES.map((rule) => (
                    <span
                      key={rule.id}
                      title={rule.shortDescFa}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-[11px]"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${rule.swatchClass}`} />
                      <span className={`font-bold ${rule.colorClass}`}>{rule.nameFa}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Translation + Word Lexicon + Mistake Pin Drawer */}
        {selectedWord && (
          <div className="mt-4 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-[#e6dbc5] dark:border-slate-700 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-[#028090] dark:text-amber-400">
              <span>جزئیات واژه و ترجمه دقیق</span>
              <button
                onClick={() => setSelectedWord(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                بستن
              </button>
            </div>
            {(() => {
              const currentV = verses.find((v) => v.words.some((w) => w.id === selectedWord));
              const currentW = currentV?.words.find((w) => w.id === selectedWord);
              const lex = lexiconMap.get(selectedWord);
              const qulMorph = qulMorphMap[selectedWord];
              const meaningFa = (lex?.fa || lex?.meaningFa || lex?.gloss || lex?.glossFa) as string | undefined;
              return currentV && currentW ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50/70 dark:bg-slate-900/70 border border-amber-200/60 dark:border-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        style={{ fontFamily: "'KFGQPC-Hafs', 'UthmanTaha', serif", fontSize: "1.4rem" }}
                        className="text-slate-900 dark:text-white"
                      >
                        {currentW.ar}
                      </span>
                      {meaningFa && (
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                          ← {meaningFa}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handlePinRecitationMistake(currentW.id, currentV.n)}
                      className="py-1 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-bold flex items-center gap-1 transition-colors"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>ثبت خطا در تلاوت (مرور هوشمند)</span>
                    </button>
                  </div>

                  {qulMorph && (qulMorph.posFa || (qulMorph.rootAr && qulMorph.rootAr !== "-") || qulMorph.lemmaAr) && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/60 text-teal-900 dark:text-teal-200">
                      <span className="font-extrabold">تحلیل صرفی خودکار (QUL — آزمایشی):</span>
                      {qulMorph.posFa && (
                        <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 font-bold">
                          نقش: {qulMorph.posFa}
                        </span>
                      )}
                      {qulMorph.rootAr && qulMorph.rootAr !== "-" && (
                        <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 font-bold">
                          ریشه: {qulMorph.rootAr}
                        </span>
                      )}
                      {qulMorph.lemmaAr && (
                        <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 font-bold">
                          لِما: {qulMorph.lemmaAr}
                        </span>
                      )}
                    </div>
                  )}

                  {pinNotice && (
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      {pinNotice}
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      آیه {toFarsiNum(currentV.n)}:
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {currentV.fa}
                    </p>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </main>

      {showMutedQuiz && (
        <MutedAudioQuiz
          unitId={unitId}
          verses={mutedWordsInput}
          timings={audioTimings}
          onClose={() => {
            setShowMutedQuiz(false);
            void loadStudyOverlay();
          }}
        />
      )}

      {showTasmi && (
        <TasmiModal
          unitId={unitId}
          verseFrom={verses[0]?.n}
          verseTo={verses[verses.length - 1]?.n}
          onClose={() => {
            setShowTasmi(false);
            void loadStudyOverlay();
          }}
          onStartReview={() => {
            setShowTasmi(false);
            onStartPractice?.();
          }}
        />
      )}

      {/* Floating Continuous Play Control Pill (B3) */}
      {continuous.status !== "idle" && (
        <div className="fixed bottom-20 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white shadow-xl border border-amber-400/50 text-xs">
            <button
              type="button"
              onClick={() => void continuous.togglePause()}
              className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center shrink-0"
              aria-label={continuous.status === "playing" ? "توقف پخش پیوسته" : "ادامه پخش پیوسته"}
            >
              {continuous.status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : continuous.status === "playing" ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white" />
              )}
            </button>
            <span className="font-bold">
              {continuous.activeVerse ? `آیه ${toFarsiNum(continuous.activeVerse)}` : "در حال پخش..."}
            </span>
            <button
              type="button"
              onClick={toggleAutoFollowMushaf}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                autoFollowMushaf
                  ? "bg-teal-600 border-teal-400 text-white"
                  : "bg-slate-700 border-slate-600 text-slate-300"
              }`}
            >
              دنبال‌کردن {autoFollowMushaf ? "روشن" : "خاموش"}
            </button>
            <button
              type="button"
              onClick={continuous.stop}
              aria-label="بستن پخش پیوسته"
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      {onStartPractice && (
        <div className="fixed bottom-0 inset-x-0 p-3 sm:p-4 bg-white/95 dark:bg-[#1a2332]/95 backdrop-blur border-t border-[#e6dbc5] dark:border-slate-800 flex items-center justify-center">
          <button
            onClick={onStartPractice}
            className="w-full max-w-md py-3.5 px-6 rounded-2xl font-bold text-white bg-[#b37e3d] hover:bg-[#9d6b2f] active:scale-[0.98] shadow-lg shadow-amber-800/20 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            <span>شروع آزمون و تمرین این واحد</span>
          </button>
        </div>
      )}
    </div>
  );
}
