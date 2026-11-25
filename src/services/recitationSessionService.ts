// src/services/recitationSessionService.ts
// ساخت «آیتم‌های تلاوت» برای فرایند یادگیری از داده‌های موجود (آیات واحد، لاگ داور، کارت‌های مرور).
// هیچ محتوای تازه‌ای تولید نمی‌شود؛ آیتم‌ها زمان اجرا از همان ۸۸ آیه ساخته می‌شوند.
import { ldb, verseKey } from "../db/learningDb";
import { getActiveSurahNumber } from "../config/surahConfig";
import { getMeta, setMeta } from "./metaStore";
import { getSherpaModelStatus, sherpaAsr } from "./sherpaAsr";
import { isNoAudioToday } from "./noAudioService";
import { loadAttemptLog } from "./recitationJudgeService";
import { isDueForDailyReview, newCard, review } from "../learning/cardScheduler";
import { targetAllowedByGoals } from "../learning/tracks";
import {
  VOICE_REVIEW_DAILY_CAP,
  fadeLevelForCleanStreak,
  stageRecitePlan,
  type ReciteItemResult,
  type ReciteItemSpec,
} from "../learning/recitationItems";
import type { ExpectedReciteWord } from "./recitationVerifier";
import { usePreferencesStore } from "../store/usePreferencesStore";

export interface ReciteSessionItem {
  spec: ReciteItemSpec;
  words: ExpectedReciteWord[];
  linkWords?: ExpectedReciteWord[];
}

/** تلاوت در فرایند فقط وقتی ساخته می‌شود که موتور آفلاین آماده باشد و حالت «بدون صدا» فعال نباشد؛ وگرنه معادل لمسی سرو می‌شود. */
export async function recitationAvailable(): Promise<boolean> {
  if (isNoAudioToday()) return false;
  if (!usePreferencesStore.getState().offlineAsrEnabled) return false;
  const [avail, status] = await Promise.all([sherpaAsr.isAvailable(), getSherpaModelStatus()]);
  return avail && status.installed;
}

type VerseRef = { verse?: number; stem?: { verse?: number } };
const verseOf = (q: VerseRef): number | undefined => {
  const n = q.verse ?? q.stem?.verse;
  return typeof n === "number" && n > 0 ? n : undefined;
};

export async function unitVerseNumbers(unitId: string): Promise<number[]> {
  const qs = await ldb.questions.where("unitId").equals(unitId).toArray();
  return [...new Set(qs.map((q) => verseOf(q as VerseRef)).filter((n): n is number => n !== undefined))].sort(
    (a, b) => a - b,
  );
}

export async function loadVerseWords(n: number): Promise<ExpectedReciteWord[]> {
  const row = await ldb.baseVerses.get(verseKey(getActiveSurahNumber(), n));
  const words = (row as { words?: { id: string; ar: string }[] } | undefined)?.words ?? [];
  return words.filter((w) => w && typeof w.ar === "string").map((w) => ({ id: w.id, ar: w.ar }));
}

async function toItem(spec: ReciteItemSpec): Promise<ReciteSessionItem | null> {
  const words = await loadVerseWords(spec.verse);
  if (words.length === 0) return null;
  const linkWords =
    spec.mode === "link" && spec.linkFromVerse !== undefined
      ? await loadVerseWords(spec.linkFromVerse)
      : undefined;
  return { spec: { ...spec, unitId: spec.unitId }, words, ...(linkWords && linkWords.length ? { linkWords } : {}) };
}

const FADE_META_KEY = "recitationFadeStreaks";

async function loadFadeLevels(): Promise<Map<number, number>> {
  const raw = await getMeta<Record<string, number>>(FADE_META_KEY, {});
  const m = new Map<number, number>();
  for (const [k, v] of Object.entries(raw)) m.set(Number(k), fadeLevelForCleanStreak(v));
  return m;
}

/** پس از هر آیتم تلاوت، رگهٔ تلاوت تمیز آن آیه به‌روز می‌شود تا سطح محو جلو برود یا برگردد. */
export async function recordReciteFadeOutcome(result: ReciteItemResult): Promise<void> {
  if (result.status === "skipped") return;
  const raw = await getMeta<Record<string, number>>(FADE_META_KEY, {});
  const clean = result.status === "passed" && result.confirmedErrors === 0;
  raw[String(result.verse)] = clean ? (raw[String(result.verse)] ?? 0) + 1 : 0;
  await setMeta(FADE_META_KEY, raw);
}

/** آیتم‌های تلاوت یک درس مرحله‌ای (قالب بر اساس شمارهٔ مرحله) */
export async function buildStageReciteItems(unitId: string, stage: number): Promise<ReciteSessionItem[]> {
  const verses = await unitVerseNumbers(unitId);
  if (verses.length === 0) return [];
  const fadeLevels = await loadFadeLevels();
  const plan = stageRecitePlan(stage, verses, Date.now() & 0xffff, fadeLevels);
  const items: ReciteSessionItem[] = [];
  for (const spec of plan) {
    const item = await toItem({ ...spec, unitId });
    if (item) items.push(item);
  }
  return items;
}

/** شکار خطا: آیاتی که در لاگ داور لغزش قطعی (missed/substituted) داشته‌اند، تازه‌ترین‌ها اول */
export async function buildHuntItems(limit = 5): Promise<ReciteSessionItem[]> {
  const log = await loadAttemptLog();
  const badVerses: number[] = [];
  for (let i = log.length - 1; i >= 0 && badVerses.length < limit; i--) {
    const e = log[i];
    if ((e.missed > 0 || e.substituted > 0) && !badVerses.includes(e.verse)) badVerses.push(e.verse);
  }
  const items: ReciteSessionItem[] = [];
  for (const verse of badVerses) {
    const item = await toItem({ id: `recite_hunt_${verse}`, verse, mode: "hunt" });
    if (item) items.push(item);
  }
  return items;
}

/** آزمون تلاوت: سه آیه از واحدهای پاس‌شده — همراهی، اتصال، نابینا */
export async function buildExamItems(): Promise<ReciteSessionItem[]> {
  const prog = await ldb.unitProgress.toArray();
  const passedUnits = prog.filter((p) => p.stagePassed[8]).map((p) => p.unitId);
  const anyUnits = prog.filter((p) => (p.currentStage ?? 1) > 1 || p.stagePassed[1]).map((p) => p.unitId);
  const unitPool = passedUnits.length > 0 ? passedUnits : anyUnits;
  const verses: number[] = [];
  for (const u of unitPool) {
    verses.push(...(await unitVerseNumbers(u)));
    if (verses.length >= 6) break;
  }
  const uniq = [...new Set(verses)].sort((a, b) => a - b);
  if (uniq.length === 0) return [];
  const seed = Date.now() & 0xffff;
  const pick = (salt: number) => uniq[Math.abs(Math.floor(Math.sin((seed + salt) * 9973 + 17) * 10000)) % uniq.length];
  const specs: ReciteItemSpec[] = [
    { id: "recite_exam_follow", verse: pick(3), mode: "follow" },
    { id: "recite_exam_blind", verse: pick(11), mode: "blind" },
  ];
  const consecutive = uniq.findIndex((v, i) => i > 0 && v === uniq[i - 1] + 1);
  if (consecutive > 0) {
    specs.splice(1, 0, {
      id: "recite_exam_link",
      verse: uniq[consecutive],
      mode: "link",
      linkFromVerse: uniq[consecutive - 1],
    });
  }
  const items: ReciteSessionItem[] = [];
  for (const spec of specs) {
    const item = await toItem(spec);
    if (item) items.push(item);
  }
  return items;
}

/** همراهی بدون قضاوت: چند آیه از نخستین واحدِ در حال مطالعه، بدون ثبت خطا */
export async function buildWitnessItems(): Promise<ReciteSessionItem[]> {
  const prog = await ldb.unitProgress.toArray();
  const started = prog
    .filter((p) => p.unlocked)
    .sort((a, b) => a.unitId.localeCompare(b.unitId))[0];
  const unitId = started?.unitId ?? prog[0]?.unitId;
  if (!unitId) return [];
  const verses = (await unitVerseNumbers(unitId)).slice(0, 3);
  const items: ReciteSessionItem[] = [];
  for (const verse of verses) {
    const item = await toItem({ id: `recite_witness_${verse}`, verse, mode: "witness", unitId });
    if (item) items.push(item);
  }
  return items;
}

const VOICE_DAY_KEY = "voiceReviewDay";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** کارت‌های «یادآوری آیه» سررسیدشده برای مرور صوتی، با سقف روزانه */
export async function buildVoiceReviewItems(): Promise<ReciteSessionItem[]> {
  const day = await getMeta<{ date: string; count: number }>(VOICE_DAY_KEY, { date: todayKey(), count: 0 });
  const usedToday = day.date === todayKey() ? day.count : 0;
  const remaining = VOICE_REVIEW_DAILY_CAP - usedToday;
  if (remaining <= 0) return [];
  const goals = usePreferencesStore.getState().goals;
  const now = new Date();
  const cards = await ldb.cards.toArray();
  const dueVr = cards
    .filter((c) => c.key.startsWith("vr:") && isDueForDailyReview(c, now) && targetAllowedByGoals(c.key, goals))
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, remaining);
  const items: ReciteSessionItem[] = [];
  for (const c of dueVr) {
    const verse = Number(c.key.slice(3));
    if (!Number.isFinite(verse) || verse <= 0) continue;
    const item = await toItem({ id: `recite_voice_${c.key}`, verse, mode: "voice", cardKey: c.key });
    if (item) items.push(item);
  }
  return items;
}

/** اعمال نمره‌های صوتی روی کارت‌های FSRS و ثبت شمارندهٔ روزانه */
export async function applyVoiceReviewResults(results: ReciteItemResult[]): Promise<void> {
  const voice = results.filter((r) => r.cardKey && r.grade && r.status !== "skipped");
  if (voice.length === 0) return;
  const now = new Date();
  const updated = [];
  for (const r of voice) {
    const existing = await ldb.cards.get(r.cardKey!);
    updated.push(review(existing ?? newCard(r.cardKey!, now), r.grade!, now));
  }
  if (updated.length > 0) await ldb.cards.bulkPut(updated);
  const day = await getMeta<{ date: string; count: number }>(VOICE_DAY_KEY, { date: todayKey(), count: 0 });
  const usedToday = day.date === todayKey() ? day.count : 0;
  await setMeta(VOICE_DAY_KEY, { date: todayKey(), count: usedToday + voice.length });
}
