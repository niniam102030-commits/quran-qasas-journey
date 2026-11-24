// scripts/sync-tajweed-data.mjs
// همگام‌سازی احکام تجوید کلمه‌به‌کلمه سوره از منبع رسمی QUL / Quran.com API v4
// خروجی پیش‌فرض برای سوره ۲۸: public/content/base/qasas.tajweed.json (schema: qasas.tajweed.v1)
//
// نگاشت قانون‌های QUL به ۸ قانون استاندارد برنامه:
//   ghunnah -> ghunnah
//   ikhafa, ikhafa_shafawi -> ikhfa
//   idgham_ghunnah, idgham_wo_ghunnah, idgham_mutaqaribayn, idgham_shafawi, idgham_mutajanisayn -> idgham
//   iqlab -> iqlab
//   madda_normal, madda_permissible, madda_obligatory, madda_obligatory_monfasel, madda_obligatory_mottasel, madda_necessary -> madd
//   qalaqah, qalqalah -> qalqalah
//   برچسب‌های غیرحکمی (ham_wasl, slnt, laam_shamsiyah, custom-alef-maksora) حذف می‌شوند.
//
// اجرا: node scripts/sync-tajweed-data.mjs [--surah=28] [--out=path]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

function parseArg(name, fallback) {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const SURAH = Number(parseArg("surah", "28")) || 28;
const SURAH_SLUG = SURAH === 28 ? "qasas" : `s${String(SURAH).padStart(3, "0")}`;
const OUT_PATH = parseArg(
  "out",
  path.join(ROOT_DIR, "public", "content", "base", `${SURAH_SLUG}.tajweed.json`),
);
const BASE_PATH = parseArg(
  "base",
  path.join(ROOT_DIR, "public", "content", "base", `${SURAH_SLUG}.base.json`),
);

const QUL_RULE_MAP = {
  ghunnah: "ghunnah",
  ikhafa: "ikhfa",
  ikhafa_shafawi: "ikhfa",
  idgham_ghunnah: "idgham",
  idgham_wo_ghunnah: "idgham",
  idgham_mutaqaribayn: "idgham",
  idgham_mutajanisayn: "idgham",
  idgham_shafawi: "idgham",
  iqlab: "iqlab",
  madda_normal: "madd",
  madda_permissible: "madd",
  madda_obligatory: "madd",
  madda_obligatory_monfasel: "madd",
  madda_obligatory_mottasel: "madd",
  madda_necessary: "madd",
  qalaqah: "qalqalah",
  qalqalah: "qalqalah",
};

const IGNORED_QUL_TAGS = new Set([
  "ham_wasl",
  "slnt",
  "laam_shamsiyah",
  "custom-alef-maksora",
]);

export async function fetchQulTajweedVerses(surah) {
  const verses = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `https://api.quran.com/api/v4/verses/by_chapter/${surah}?words=true&word_fields=text_uthmani,text_uthmani_tajweed&per_page=50&page=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "quran-qasas-journey/3.0" } });
    if (!res.ok) {
      throw new Error(`Quran.com QUL Tajweed fetch failed (surah=${surah}, page=${page}): HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.verses)) {
      throw new Error(`Invalid QUL response payload on page ${page}`);
    }
    totalPages = data.pagination?.total_pages ?? 1;
    verses.push(...data.verses);
    page++;
  }

  return verses;
}

export function extractRulesFromWordHtml(tajweedHtml) {
  const rules = [];
  const seen = new Set();
  const unknownTags = [];
  const raw = String(tajweedHtml ?? "");
  for (const match of raw.matchAll(/<rule\s+class=([a-zA-Z0-9_-]+)>/g)) {
    const cls = match[1];
    const mapped = QUL_RULE_MAP[cls];
    if (mapped) {
      if (!seen.has(mapped)) {
        seen.add(mapped);
        rules.push(mapped);
      }
    } else if (!IGNORED_QUL_TAGS.has(cls)) {
      unknownTags.push(cls);
    }
  }
  return { rules, unknownTags };
}

async function main() {
  const baseRaw = JSON.parse(await fs.readFile(BASE_PATH, "utf8"));
  const baseVerses = Array.isArray(baseRaw) ? baseRaw : baseRaw.verses;
  if (!Array.isArray(baseVerses) || baseVerses.length === 0) {
    throw new Error(`Base verses missing or empty at ${BASE_PATH}`);
  }

  console.log(`🔄 Fetching QUL word-level Tajweed for Surah ${SURAH} (${baseVerses.length} verses)...`);
  const qulVerses = await fetchQulTajweedVerses(SURAH);
  if (qulVerses.length !== baseVerses.length) {
    throw new Error(`Verse count mismatch: expected ${baseVerses.length}, got ${qulVerses.length}`);
  }

  const byVerseNum = new Map(qulVerses.map((v) => [v.verse_number, v]));
  const versesOut = {};
  const unknownFound = new Set();
  let taggedWordsTotal = 0;
  const ruleCounts = {};

  for (const bv of baseVerses) {
    const qv = byVerseNum.get(bv.n);
    if (!qv) {
      throw new Error(`Missing verse ${bv.n} in QUL Tajweed response`);
    }
    const qulWords = (qv.words ?? []).filter((w) => w.char_type_name === "word");
    if (qulWords.length !== bv.words.length) {
      throw new Error(
        `Word count mismatch in verse ${bv.n}: base has ${bv.words.length}, QUL has ${qulWords.length}`,
      );
    }

    const verseEntries = [];
    for (let wIdx = 0; wIdx < qulWords.length; wIdx++) {
      const { rules, unknownTags } = extractRulesFromWordHtml(qulWords[wIdx].text_uthmani_tajweed);
      for (const u of unknownTags) unknownFound.add(u);
      if (rules.length > 0) {
        verseEntries.push({ w: wIdx, rules });
        taggedWordsTotal++;
        for (const r of rules) ruleCounts[r] = (ruleCounts[r] ?? 0) + 1;
      }
    }

    if (verseEntries.length > 0) {
      versesOut[String(bv.n)] = verseEntries;
    }
  }

  if (unknownFound.size > 0) {
    console.warn(`⚠️ Unmapped QUL tags skipped: ${[...unknownFound].join(", ")}`);
  }

  const output = {
    schema: "qasas.tajweed.v1",
    surah: SURAH,
    source: "Quran.com API v4 / QUL (word_fields=text_uthmani_tajweed)",
    verses: versesOut,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Saved ${OUT_PATH}`);
  console.log(
    `📊 Coverage: ${baseVerses.length}/${baseVerses.length} verses validated, ${Object.keys(versesOut).length} verses with tagged words, ${taggedWordsTotal} tagged words.`,
  );
  console.log("📊 Rule distribution:", ruleCounts);
}

main().catch((err) => {
  console.error("❌ sync-tajweed-data failed:", err);
  process.exit(1);
});
