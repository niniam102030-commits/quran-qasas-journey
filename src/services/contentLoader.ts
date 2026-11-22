// src/services/contentLoader.ts
// همگام‌سازی محتوای public/content/manifest.json → IndexedDB (بدون پاک‌کردن cards/attempts).
// متن قرآن فقط از فایل‌های JSON محتوا خوانده می‌شود، نه از کد.
import { ldb, type QuestionRow, type LexiconRow, type ChunkRow } from "../db/learningDb";

interface ManifestUnit { id: string; order: number; verses: string[]; files: { file: string; part: string; hash: string }[] }
interface Manifest {
  schema: string;
  contentHash: string;
  base: { file: string; hash: string };
  units: ManifestUnit[];
}

const baseUrl = () => `${import.meta.env.BASE_URL || "/"}content/`;

async function getJson<T>(rel: string): Promise<T> {
  const r = await fetch(baseUrl() + rel);
  if (!r.ok) throw new Error(`خطا در بارگذاری ${rel}: ${r.status}`);
  return (await r.json()) as T;
}

export interface SyncResult { updated: boolean; contentHash: string; units: number }
const CONTENT_SYNC_VERSION = 4;

export async function syncContent(onProgress?: (done: number, total: number) => void): Promise<SyncResult> {
  const manifest = await getJson<Manifest>("manifest.json");
  const stored = await ldb.meta.get("contentHash");
  const storedVersion = await ldb.meta.get("contentSyncVersion");
  if (stored?.value === manifest.contentHash && storedVersion?.value === CONTENT_SYNC_VERSION) return { updated: false, contentHash: manifest.contentHash, units: manifest.units.length };

  const hashes = ((await ldb.meta.get("fileHashes"))?.value ?? {}) as Record<string, string>;
  const nextHashes: Record<string, string> = { ...hashes };
  const questionRows: QuestionRow[] = [];
  const lexiconRows: LexiconRow[] = [];
  const chunkRows: ChunkRow[] = [];

  const base = await getJson<unknown>(manifest.base.file);
  const verses = (Array.isArray(base) ? base : (base as { verses: unknown[] }).verses) as { n: number }[];
  nextHashes[manifest.base.file] = manifest.base.hash;

  const total = manifest.units.reduce((a, u) => a + u.files.length, 0);
  let done = 0;
  for (const u of manifest.units) {
    for (const f of u.files) {
      const data = await getJson<{ unitId: string; lexicon?: Record<string, unknown>[]; chunks?: Record<string, unknown>[]; questions?: Record<string, unknown>[] }>(f.file);
      questionRows.push(...((data.questions ?? []).map((q) => ({ ...q, unitId: data.unitId })) as unknown as QuestionRow[]));
      lexiconRows.push(...((data.lexicon ?? []).map((l) => ({ ...l, unitId: data.unitId })) as unknown as LexiconRow[]));
      chunkRows.push(...((data.chunks ?? []).map((c) => ({ ...c, id: `${data.unitId}:${(c as { verse: number }).verse}`, unitId: data.unitId })) as unknown as ChunkRow[]));
      nextHashes[f.file] = f.hash;
      onProgress?.(++done, total);
    }
  }
  await ldb.transaction("rw", [ldb.questions, ldb.lexicon, ldb.chunks, ldb.baseVerses, ldb.unitProgress, ldb.meta], async () => {
    await ldb.questions.clear();
    await ldb.lexicon.clear();
    await ldb.chunks.clear();
    await ldb.baseVerses.clear();
    if (questionRows.length) await ldb.questions.bulkPut(questionRows);
    if (lexiconRows.length) await ldb.lexicon.bulkPut(lexiconRows);
    if (chunkRows.length) await ldb.chunks.bulkPut(chunkRows);
    if (verses.length) await ldb.baseVerses.bulkPut(verses);
    for (const unit of manifest.units) {
      const existing = await ldb.unitProgress.get(unit.id);
      if (!existing) await ldb.unitProgress.put({ unitId: unit.id, unlocked: unit.order === 1, stagePassed: {}, currentStage: 1, mastered: false, updatedAt: Date.now() });
    }
    await ldb.meta.bulkPut([
      { key: "fileHashes", value: nextHashes },
      { key: "contentHash", value: manifest.contentHash },
      { key: "contentSyncVersion", value: CONTENT_SYNC_VERSION },
    ]);
  });
  return { updated: true, contentHash: manifest.contentHash, units: manifest.units.length };
}
