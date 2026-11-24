// scripts/build-surah-pack.mjs
// ساخت پک مستقل سوره (qasas.surah-pack.v1) همراه با امضای قطعی SHA-256 و به‌روزرسانی کاتالوگ پک‌ها
// اجرا: node scripts/build-surah-pack.mjs --surah=1 [--merged-dir=...] [--out-dir=release/packs]
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBaseDataForSurah } from "./fetch-base-data.mjs";
import { syncQulForSurah } from "./sync-qul-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULT_CATALOG_BASE_URL =
  "https://github.com/niniam102030-commits/quran-qasas-journey/releases/latest/download";

function parseArgs(argv) {
  let surah = 0;
  let mergedDir = "";
  let outDir = path.join(ROOT_DIR, "release", "packs");
  let catalogBaseUrl = DEFAULT_CATALOG_BASE_URL;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--surah=")) surah = Number(a.slice("--surah=".length));
    else if (a === "--surah" && argv[i + 1]) surah = Number(argv[++i]);
    else if (a.startsWith("--merged-dir=")) mergedDir = a.slice("--merged-dir=".length);
    else if (a === "--merged-dir" && argv[i + 1]) mergedDir = argv[++i];
    else if (a.startsWith("--out-dir=")) outDir = path.resolve(argv[i].slice("--out-dir=".length));
    else if (a === "--out-dir" && argv[i + 1]) outDir = path.resolve(argv[++i]);
    else if (a.startsWith("--catalog-base-url=")) catalogBaseUrl = a.slice("--catalog-base-url=".length);
  }
  return { surah, mergedDir, outDir, catalogBaseUrl };
}

/** تبدیل قطعی و بازگشتی JSON مطابق canonicalJson در src/services/surahPackService.ts */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  }
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function computePackHashSync(unsignedPack) {
  const payload = {
    schema: unsignedPack.schema,
    surah: unsignedPack.surah,
    nameAr: unsignedPack.nameAr,
    nameFa: unsignedPack.nameFa,
    verses: unsignedPack.verses,
    base: {
      verses: unsignedPack.base?.verses ?? [],
      unitsPlan: unsignedPack.base?.unitsPlan ?? [],
      ...(unsignedPack.base?.similarity !== undefined ? { similarity: unsignedPack.base.similarity } : {}),
    },
    morphology: unsignedPack.morphology ?? {},
    timings: unsignedPack.timings ?? {},
    mergedParts: unsignedPack.mergedParts ?? [],
  };
  return crypto.createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

async function loadMergedParts(mergedDir) {
  if (!mergedDir) return [];
  const entries = (await fs.readdir(mergedDir)).filter((f) => f.endsWith(".json")).sort();
  const byUnit = new Map();
  for (const file of entries) {
    const raw = JSON.parse(await fs.readFile(path.join(mergedDir, file), "utf8"));
    const unitId = String(raw.unitId || "");
    if (!unitId) continue;
    const acc = byUnit.get(unitId) ?? { unitId, questions: [], lexicon: [], chunks: [] };
    if (Array.isArray(raw.questions)) acc.questions.push(...raw.questions);
    if (Array.isArray(raw.lexicon)) acc.lexicon.push(...raw.lexicon);
    if (Array.isArray(raw.chunks)) acc.chunks.push(...raw.chunks);
    byUnit.set(unitId, acc);
  }
  return [...byUnit.values()];
}

export async function buildSurahPack({ surah, mergedDir = "", outDir, catalogBaseUrl = DEFAULT_CATALOG_BASE_URL }) {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    throw new Error(`Invalid surah number: ${surah}`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `qasas-pack-s${surah}-`));
  try {
    const [baseData, qulData, mergedParts] = await Promise.all([
      fetchBaseDataForSurah({ surah, outDir: workDir }),
      syncQulForSurah({ surah, outDir: workDir }),
      loadMergedParts(mergedDir),
    ]);

    const unsignedPack = {
      schema: "qasas.surah-pack.v1",
      surah,
      slug: baseData.slug,
      nameAr: baseData.nameAr,
      nameFa: baseData.nameFa,
      verses: baseData.verses,
      base: {
        verses: baseData.baseVerses,
        unitsPlan: baseData.unitsPlan,
        similarity: baseData.similarity,
      },
      morphology: qulData.morphology?.words ?? {},
      timings: qulData.audioTiming?.verses ?? {},
      mergedParts,
    };

    const contentHash = computePackHashSync(unsignedPack);
    const fullPack = {
      schema: unsignedPack.schema,
      surah: unsignedPack.surah,
      slug: unsignedPack.slug,
      nameAr: unsignedPack.nameAr,
      nameFa: unsignedPack.nameFa,
      verses: unsignedPack.verses,
      contentHash,
      base: unsignedPack.base,
      morphology: unsignedPack.morphology,
      timings: unsignedPack.timings,
      mergedParts: unsignedPack.mergedParts,
    };

    await fs.mkdir(outDir, { recursive: true });
    const packFileName = `surah-${surah}.pack.json`;
    const packPath = path.join(outDir, packFileName);
    const packJson = JSON.stringify(fullPack, null, 2);
    await fs.writeFile(packPath, packJson, "utf8");

    const catalogPath = path.join(outDir, "packs-catalog.json");
    let catalog = [];
    try {
      const existing = JSON.parse(await fs.readFile(catalogPath, "utf8"));
      if (Array.isArray(existing)) catalog = existing;
    } catch {
      // ignore missing/empty catalog
    }

    const totalQuestions = mergedParts.reduce((s, p) => s + (p.questions?.length ?? 0), 0);
    const nextEntry = {
      surah,
      slug: baseData.slug,
      nameAr: baseData.nameAr,
      nameFa: baseData.nameFa,
      verses: baseData.verses,
      sizeKb: Math.max(1, Math.round(Buffer.byteLength(packJson, "utf8") / 1024)),
      url: `${catalogBaseUrl}/${packFileName}`,
      contentHash,
      hasMergedContent: totalQuestions > 0,
    };

    catalog = catalog.filter((e) => e && e.surah !== surah);
    catalog.push(nextEntry);
    catalog.sort((a, b) => a.surah - b.surah);

    await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), "utf8");

    console.log(`\n🎉 Built surah pack: ${packPath}`);
    console.log(`🔐 SHA-256: ${contentHash}`);
    console.log(`📚 Updated catalog: ${catalogPath}`);

    return { packPath, catalogPath, contentHash, entry: nextEntry };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.surah) {
    console.error("Usage: node scripts/build-surah-pack.mjs --surah=<1..114> [--merged-dir=...] [--out-dir=release/packs]");
    process.exit(1);
  }
  buildSurahPack(args).catch((err) => {
    console.error("❌ build-surah-pack failed:", err);
    process.exit(1);
  });
}
