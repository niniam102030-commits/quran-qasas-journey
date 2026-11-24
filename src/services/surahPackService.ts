// src/services/surahPackService.ts
// مدیریت دانلود، بررسی امضای SHA-256، نصب و حذف پک‌های چندسوره‌ای (بخش D)
import {
  ldb,
  verseKey,
  type BaseVerseRow,
  type ChunkRow,
  type LexiconRow,
  type QuestionRow,
  type SurahPackRow,
} from "../db/learningDb";
import { clearQulReferenceCache, type QulMorphologyEntry, type WordAudioSegment } from "./qulReferenceService";
import { sha256Hex } from "./sherpaAsr";
import { usePreferencesStore } from "../store/usePreferencesStore";
import type { BaseVerse, UnitPlan } from "../types/learning";

export const PACKS_CATALOG_URL =
  "https://github.com/niniam102030-commits/quran-qasas-journey/releases/latest/download/packs-catalog.json";

export const SURAH_PACK_SCHEMA = "qasas.surah-pack.v1" as const;

export interface SurahPackMergedPart {
  unitId: string;
  questions?: Record<string, unknown>[];
  lexicon?: Record<string, unknown>[];
  chunks?: Record<string, unknown>[];
}

export interface SurahPackFile {
  schema: typeof SURAH_PACK_SCHEMA;
  surah: number;
  slug?: string;
  nameAr: string;
  nameFa: string;
  verses: number;
  contentHash: string;
  base: {
    verses: BaseVerse[];
    unitsPlan: UnitPlan[];
    similarity?: Record<string, unknown>;
  };
  morphology: Record<string, QulMorphologyEntry>;
  timings: Record<string, WordAudioSegment[]>;
  mergedParts: SurahPackMergedPart[];
}

export interface PacksCatalogEntry {
  surah: number;
  slug?: string;
  nameAr: string;
  nameFa: string;
  verses: number;
  sizeKb: number;
  url: string;
  contentHash: string;
  hasMergedContent?: boolean;
}

export interface SurahPackMeta {
  surah: number;
  slug: string;
  nameAr: string;
  nameFa: string;
  verses: number;
  contentHash: string;
  units: UnitPlan[];
  questionCount: number;
  hasMergedContent: boolean;
}

export interface InstalledSurahInfo {
  surahNumber: number;
  slug: string;
  nameAr: string;
  nameFa: string;
  verses: number;
  unitCount: number;
  questionCount: number;
  hasMergedContent: boolean;
  builtIn: boolean;
  contentHash?: string;
  updatedAt: number;
}

/** تبدیل قطعی و بازگشتی به رشته JSON با کلیدهای مرتب‌شده برای همخوانی دقیق SHA-256 بین Node و مرورگر */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** محاسبهٔ هش SHA-256 روی بار قطعی پک سوره (بدون فیلدهای متا/امضا) */
export async function computePackContentHash(
  pack: Omit<SurahPackFile, "contentHash" | "slug"> & { contentHash?: string; slug?: string },
): Promise<string> {
  const payload = {
    schema: pack.schema,
    surah: pack.surah,
    nameAr: pack.nameAr,
    nameFa: pack.nameFa,
    verses: pack.verses,
    base: {
      verses: pack.base?.verses ?? [],
      unitsPlan: pack.base?.unitsPlan ?? [],
      ...(pack.base?.similarity !== undefined ? { similarity: pack.base.similarity } : {}),
    },
    morphology: pack.morphology ?? {},
    timings: pack.timings ?? {},
    mergedParts: pack.mergedParts ?? [],
  };
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  return sha256Hex(bytes);
}

/** دریافت کاتالوگ آنلاین پک‌های سوره از GitHub Releases (در حالت آفلاین بدون خطا [] برمی‌گرداند) */
export async function fetchPacksCatalog(
  catalogUrl: string = PACKS_CATALOG_URL,
  signal?: AbortSignal,
): Promise<PacksCatalogEntry[]> {
  try {
    const res = await fetch(catalogUrl, { signal, cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data)
      ? data
      : typeof data === "object" && data !== null && Array.isArray((data as { packs?: unknown }).packs)
      ? (data as { packs: unknown[] }).packs
      : [];
    return list.filter(
      (item): item is PacksCatalogEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PacksCatalogEntry).surah === "number" &&
        typeof (item as PacksCatalogEntry).url === "string" &&
        typeof (item as PacksCatalogEntry).contentHash === "string",
    );
  } catch {
    return [];
  }
}

/** دانلود پک سوره با گزارش پیشرفت بایتی/درصدی */
export async function downloadSurahPackWithProgress(
  url: string,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<SurahPackFile> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`خطا در دانلود پک سوره (${res.status})`);
  }

  const totalBytes = Number(res.headers.get("content-length") || 0);
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.(loaded, totalBytes);
      }
    }
    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8").decode(merged);
    return JSON.parse(text) as SurahPackFile;
  }

  const text = await res.text();
  onProgress?.(text.length, totalBytes || text.length);
  return JSON.parse(text) as SurahPackFile;
}

/**
 * اعتبارسنجی ساختار و امضای SHA-256 پک سوره و نصب ایزوله در دیتابیس.
 * در صورت عدم تطابق هش، پیش از هرگونه نوشتن در دیتابیس خطا می‌دهد.
 */
export async function validateAndInstallSurahPack(pack: SurahPackFile): Promise<SurahPackMeta> {
  if (!pack || pack.schema !== SURAH_PACK_SCHEMA) {
    throw new Error("قالب فایل پک سوره نامعتبر است.");
  }
  if (!Number.isInteger(pack.surah) || pack.surah < 1 || pack.surah > 114) {
    throw new Error("شماره سوره در پک معتبر نیست.");
  }
  if (pack.surah === 28) {
    throw new Error("سوره قصص به‌صورت پیش‌فرض در برنامه نصب است.");
  }
  if (!Array.isArray(pack.base?.verses) || pack.base.verses.length === 0) {
    throw new Error("پک سوره فاقد متن آیات است.");
  }
  if (typeof pack.contentHash !== "string" || !/^[0-9a-f]{64}$/i.test(pack.contentHash.trim())) {
    throw new Error("فیلد امضای SHA-256 پک نامعتبر یا مفقود است.");
  }

  const actualHash = await computePackContentHash(pack);
  if (actualHash.toLowerCase() !== pack.contentHash.trim().toLowerCase()) {
    throw new Error("عدم تطابق امضای SHA-256؛ فایل پک معتبر نیست یا دستکاری شده است.");
  }

  const slug = pack.slug || `s${String(pack.surah).padStart(3, "0")}`;
  const now = Date.now();
  const unitPrefix = `s${pack.surah}_`;

  const rawUnits: UnitPlan[] = Array.isArray(pack.base.unitsPlan) && pack.base.unitsPlan.length > 0
    ? pack.base.unitsPlan.map((u, idx) => ({
        ...u,
        id: u.id.startsWith(unitPrefix) ? u.id : `${unitPrefix}${u.id}`,
        order: Number.isFinite(u.order) ? u.order : idx + 1,
      }))
    : [
        {
          id: `${unitPrefix}u_all`,
          page: Number(pack.base.verses[0]?.page || 1),
          half: "a",
          verseFrom: Number(pack.base.verses[0]?.n || 1),
          verseTo: Number(pack.base.verses[pack.base.verses.length - 1]?.n || pack.verses),
          verses: pack.base.verses.map((v) => `v${pack.surah}_${v.n}`),
          lines: { from: 1, to: 15 },
          order: 1,
        },
      ];

  const baseVerseRows: BaseVerseRow[] = pack.base.verses.map((v) => {
    const n = Number(v.n);
    const prevId = typeof v.id === "string" ? v.id : undefined;
    return {
      ...(v as unknown as Record<string, unknown>),
      n,
      surah: pack.surah,
      ...(prevId ? { verseId: prevId } : {}),
      id: verseKey(pack.surah, n),
    };
  });

  const questionRows: QuestionRow[] = [];
  const lexiconRows: LexiconRow[] = [];
  const chunkRows: ChunkRow[] = [];

  for (const part of pack.mergedParts ?? []) {
    const partUnitId = part.unitId.startsWith(unitPrefix) ? part.unitId : `${unitPrefix}${part.unitId}`;
    for (const q of part.questions ?? []) {
      const qId = String(q.id ?? "");
      questionRows.push({
        ...q,
        id: qId.startsWith(unitPrefix) ? qId : `${unitPrefix}${qId}`,
        unitId: partUnitId,
      } as unknown as QuestionRow);
    }
    for (const l of part.lexicon ?? []) {
      const wordId = String(l.wordId ?? "");
      lexiconRows.push({
        ...l,
        wordId: wordId.startsWith(unitPrefix) ? wordId : `${unitPrefix}${wordId}`,
        unitId: partUnitId,
      } as unknown as LexiconRow);
    }
    for (const c of part.chunks ?? []) {
      const verse = Number((c as { verse?: number }).verse ?? 0);
      chunkRows.push({
        ...c,
        id: `${partUnitId}:${verse}`,
        unitId: partUnitId,
        verse,
      } as unknown as ChunkRow);
    }
  }

  const packMeta: SurahPackMeta = {
    surah: pack.surah,
    slug,
    nameAr: pack.nameAr,
    nameFa: pack.nameFa,
    verses: pack.verses || baseVerseRows.length,
    contentHash: actualHash,
    units: rawUnits,
    questionCount: questionRows.length,
    hasMergedContent: questionRows.length > 0,
  };

  await ldb.transaction(
    "rw",
    [ldb.baseVerses, ldb.unitProgress, ldb.questions, ldb.lexicon, ldb.chunks, ldb.meta, ldb.surahPacks],
    async () => {
      const prevMeta = (await ldb.meta.get(`surahPackMeta:${pack.surah}`))?.value as SurahPackMeta | undefined;
      const oldUnitIds = new Set<string>((prevMeta?.units ?? []).map((u) => u.id));
      const newUnitIds = new Set<string>(rawUnits.map((u) => u.id));
      const unitMatches = (uid: string) => uid.startsWith(unitPrefix) || oldUnitIds.has(uid) || newUnitIds.has(uid);

      await ldb.baseVerses.where("surah").equals(pack.surah).delete();
      await ldb.questions.filter((q) => unitMatches(q.unitId)).delete();
      await ldb.lexicon.filter((l) => unitMatches(l.unitId)).delete();
      await ldb.chunks.filter((c) => unitMatches(c.unitId)).delete();

      await ldb.baseVerses.bulkPut(baseVerseRows);
      if (questionRows.length) await ldb.questions.bulkPut(questionRows);
      if (lexiconRows.length) await ldb.lexicon.bulkPut(lexiconRows);
      if (chunkRows.length) await ldb.chunks.bulkPut(chunkRows);

      for (const u of rawUnits) {
        const existing = await ldb.unitProgress.get(u.id);
        if (!existing) {
          await ldb.unitProgress.put({
            unitId: u.id,
            unlocked: true,
            stagePassed: {},
            stageLessons: {},
            currentStage: 1,
            mastered: false,
            updatedAt: now,
          });
        }
      }

      const metaRows: { key: string; value: unknown }[] = [
        { key: `surahPackMeta:${pack.surah}`, value: packMeta },
        { key: `surahTimings:${pack.surah}`, value: pack.timings ?? {} },
        { key: `surahMorph:${pack.surah}`, value: pack.morphology ?? {} },
      ];
      if (pack.base.similarity !== undefined) {
        metaRows.push({ key: `surahSimilarity:${pack.surah}`, value: pack.base.similarity });
      }
      await ldb.meta.bulkPut(metaRows);

      const packRow: SurahPackRow = {
        surahNumber: pack.surah,
        slug,
        nameFa: pack.nameFa,
        installed: true,
        contentHash: actualHash,
        updatedAt: now,
      };
      await ldb.surahPacks.put(packRow);
    },
  );

  clearQulReferenceCache();
  return packMeta;
}

/** حذف کامل داده‌های یک پک سورهٔ نصب‌شده بدون دست‌زدن به سورهٔ قصص یا سایر سوره‌ها */
export async function uninstallSurahPack(surahNumber: number): Promise<void> {
  if (surahNumber === 28) {
    throw new Error("سوره قصص سورهٔ پایهٔ برنامه است و قابل حذف نیست.");
  }

  const unitPrefix = `s${surahNumber}_`;
  await ldb.transaction(
    "rw",
    [ldb.baseVerses, ldb.unitProgress, ldb.questions, ldb.lexicon, ldb.chunks, ldb.meta, ldb.surahPacks],
    async () => {
      const prevMeta = (await ldb.meta.get(`surahPackMeta:${surahNumber}`))?.value as SurahPackMeta | undefined;
      const metaUnitIds = new Set<string>((prevMeta?.units ?? []).map((u) => u.id));
      const unitMatches = (uid: string) => uid.startsWith(unitPrefix) || metaUnitIds.has(uid);

      await ldb.baseVerses.where("surah").equals(surahNumber).delete();
      await ldb.questions.filter((q) => unitMatches(q.unitId)).delete();
      await ldb.lexicon.filter((l) => unitMatches(l.unitId)).delete();
      await ldb.chunks.filter((c) => unitMatches(c.unitId)).delete();
      await ldb.unitProgress.filter((p) => unitMatches(p.unitId)).delete();
      await ldb.meta.bulkDelete([
        `surahPackMeta:${surahNumber}`,
        `surahTimings:${surahNumber}`,
        `surahMorph:${surahNumber}`,
        `surahSimilarity:${surahNumber}`,
      ]);
      await ldb.surahPacks.delete(surahNumber);
    },
  );

  clearQulReferenceCache();

  if (usePreferencesStore.getState().activeSurah === surahNumber) {
    usePreferencesStore.getState().setActiveSurah(28);
  } else {
    try {
      if (typeof localStorage !== "undefined" && Number(localStorage.getItem("active_surah")) === surahNumber) {
        localStorage.setItem("active_surah", "28");
      }
    } catch {
      // ignore
    }
  }
}

/** فهرست سوره‌های نصب‌شده روی پروفایل فعال (سوره قصص همیشه به‌عنوان سورهٔ پایه حاضر است) */
export async function listInstalledSurahs(): Promise<InstalledSurahInfo[]> {
  const [packRows, qasasMetaRow] = await Promise.all([
    ldb.surahPacks.toArray(),
    ldb.meta.get("contentHash"),
  ]);

  const result: InstalledSurahInfo[] = [];
  const qasasRow = packRows.find((p) => p.surahNumber === 28);
  result.push({
    surahNumber: 28,
    slug: "qasas",
    nameAr: "القصص",
    nameFa: "سوره قصص",
    verses: 88,
    unitCount: 22,
    questionCount: 1,
    hasMergedContent: true,
    builtIn: true,
    contentHash: qasasRow?.contentHash ?? (typeof qasasMetaRow?.value === "string" ? qasasMetaRow.value : undefined),
    updatedAt: qasasRow?.updatedAt ?? 0,
  });

  const others = packRows.filter((p) => p.surahNumber !== 28 && p.installed);
  for (const row of others) {
    const meta = (await ldb.meta.get(`surahPackMeta:${row.surahNumber}`))?.value as SurahPackMeta | undefined;
    result.push({
      surahNumber: row.surahNumber,
      slug: row.slug,
      nameAr: meta?.nameAr ?? "",
      nameFa: meta?.nameFa ?? row.nameFa,
      verses: meta?.verses ?? 0,
      unitCount: meta?.units?.length ?? 0,
      questionCount: meta?.questionCount ?? 0,
      hasMergedContent: meta?.hasMergedContent ?? false,
      builtIn: false,
      contentHash: row.contentHash ?? meta?.contentHash,
      updatedAt: row.updatedAt,
    });
  }

  return result.sort((a, b) => (a.surahNumber === 28 ? -1 : b.surahNumber === 28 ? 1 : a.surahNumber - b.surahNumber));
}
