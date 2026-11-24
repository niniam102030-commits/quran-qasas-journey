// scripts/sync-qul-data.mjs
// همگام‌سازی داده‌های مرجع قرآنی (QUL / Quran.com API v4 + Quranic Arabic Corpus):
// ۱) تایم‌استمپ کلمه‌به‌کلمه تلاوت استاد منشاوی (دقیقاً هم‌تراز با MP3های Minshawi/Murattal)
// ۲) صرف، ریشه (ROOT)، لِما (LEM) و نقش دستوری هر کلمه + گزارش تطبیق با واژه‌نامه فعلی
//
// اجرا: node scripts/sync-qul-data.mjs [--surah=28] [--out-dir=...]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = process.cwd();
const MERGED_DIR = path.join(ROOT_DIR, "public", "content", "merged");
const DOCS_DIR = path.join(ROOT_DIR, "docs");

function parseCliArgs(argv) {
  let surah = 28;
  let outDir = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--surah=")) surah = Number(a.slice("--surah=".length)) || 28;
    else if (a === "--surah" && argv[i + 1]) surah = Number(argv[++i]) || 28;
    else if (a.startsWith("--out-dir=")) outDir = a.slice("--out-dir=".length);
    else if (a === "--out-dir" && argv[i + 1]) outDir = argv[++i];
  }
  return { surah, outDir };
}

const POS_FA = {
  N: "اسم",
  V: "فعل",
  P: "حرف",
};

function formatRootSpaced(root) {
  if (!root) return "-";
  return [...root.trim()].join(" ");
}

function normalizeRootForCompare(r) {
  if (!r || r === "-") return "";
  return r
    .replace(/\s+/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
}

async function fetchAudioTimings(surah) {
  const verses = {};
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `https://api.quran.com/api/v4/recitations/9/by_chapter/${surah}?per_page=100&page=${page}&fields=segments`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Quran.com audio timing fetch failed: HTTP ${res.status}`);
    const data = await res.json();
    totalPages = data.pagination?.total_pages ?? 1;

    for (const af of data.audio_files ?? []) {
      const [, verseStr] = String(af.verse_key ?? "").split(":");
      const verseNum = Number(verseStr);
      if (!verseNum || !Array.isArray(af.segments)) continue;

      // فرمت ورودی: [wordStartIdx0, wordEndIdx0, startMs, endMs]
      // تبدیل به فرمت فشرده: [wordIndex1Based, startMs, endMs]
      const clean = [];
      for (const seg of af.segments) {
        if (!Array.isArray(seg) || seg.length < 4) continue;
        const word1 = Number(seg[1]); // 1-based word position
        const startMs = Math.round(Number(seg[2]));
        const endMs = Math.round(Number(seg[3]));
        if (word1 >= 1 && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
          clean.push([word1, startMs, endMs]);
        }
      }
      if (clean.length > 0) {
        verses[String(verseNum)] = clean;
      }
    }
    page++;
  }

  return {
    schema: "qul.audio-timing.v1",
    source: "Quran.com API v4 / QUL (Recitation 9: Minshawi Murattal)",
    surah,
    syncedAt: new Date().toISOString(),
    verseCount: Object.keys(verses).length,
    verses,
  };
}

async function fetchMorphology(surah) {
  const url = "https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quranic morphology corpus fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  const prefix = `${surah}:`;

  // Map wordId -> aggregated morphology
  const words = {};
  const pad2 = String(surah).padStart(2, "0");

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.startsWith(prefix)) continue;
    const [loc, form, pos, features] = rawLine.split("\t");
    if (!loc || !form) continue;
    const parts = loc.split(":");
    if (parts.length < 4) continue;
    const verseNum = Number(parts[1]);
    const wordNum = Number(parts[2]);
    if (!verseNum || !wordNum) continue;

    const wordId = `w${pad2}_${String(verseNum).padStart(3, "0")}_${String(wordNum).padStart(3, "0")}`;
    if (!words[wordId]) {
      words[wordId] = {
        wordId,
        verse: verseNum,
        wordIndex: wordNum,
        rootAr: "-",
        lemmaAr: "",
        pos: pos || "",
        posFa: POS_FA[pos] || "",
        segments: [],
      };
    }

    const entry = words[wordId];
    const featStr = features || "";
    const rootMatch = featStr.match(/ROOT:([^|]+)/);
    const lemMatch = featStr.match(/LEM:([^|]+)/);
    const isPref = featStr.includes("PREF");
    const isSuff = featStr.includes("SUFF");

    if (rootMatch && rootMatch[1]) {
      entry.rootAr = formatRootSpaced(rootMatch[1]);
    }
    if (lemMatch && lemMatch[1] && !isPref && !isSuff) {
      entry.lemmaAr = lemMatch[1];
    } else if (lemMatch && lemMatch[1] && !entry.lemmaAr) {
      entry.lemmaAr = lemMatch[1];
    }

    if (!isPref && !isSuff && pos && POS_FA[pos]) {
      entry.pos = pos;
      entry.posFa = POS_FA[pos];
    }

    entry.segments.push({
      text: form,
      type: isPref ? "prefix" : isSuff ? "pronoun" : "root",
      pos: pos || "",
    });
  }

  return {
    schema: "qul.morphology.v1",
    source: "Quranic Arabic Corpus / QUL Morphology",
    surah,
    syncedAt: new Date().toISOString(),
    wordCount: Object.keys(words).length,
    words,
  };
}

async function crossCheckWithMergedLexicon(morphology) {
  let files = [];
  try {
    files = (await fs.readdir(MERGED_DIR)).filter((f) => f.endsWith(".partA.json")).sort();
  } catch {
    return null;
  }

  let totalLex = 0;
  let matchedRoots = 0;
  let missingInLex = 0;
  const mismatches = [];

  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(path.join(MERGED_DIR, file), "utf8"));
    for (const item of raw.lexicon ?? []) {
      totalLex++;
      const ref = morphology.words[item.wordId];
      if (!ref) continue;
      const refRoot = normalizeRootForCompare(ref.rootAr);
      const lexRoot = normalizeRootForCompare(item.rootAr);
      if (!refRoot && !lexRoot) {
        matchedRoots++;
      } else if (refRoot === lexRoot) {
        matchedRoots++;
      } else if (!lexRoot && refRoot) {
        missingInLex++;
      } else {
        mismatches.push({
          wordId: item.wordId,
          unitId: raw.unitId,
          gloss: item.gloss || "",
          lexRoot: item.rootAr || "-",
          qulRoot: ref.rootAr || "-",
          lemmaAr: ref.lemmaAr || "",
        });
      }
    }
  }

  const lines = [
    "# گزارش تطبیق ریشه‌شناسی واژه‌نامه با داده مرجع قرآنی (QUL / Quranic Corpus)",
    "",
    `- تاریخ همگام‌سازی: \`${new Date().toISOString()}\``,
    `- کل واژگان بررسی‌شده در واژه‌نامه: **${totalLex}**`,
    `- تعداد واژگان در پیکره مرجع سوره: **${morphology.wordCount}**`,
    `- تطابق کامل ریشه: **${matchedRoots}**`,
    `- فاقد ریشه در واژه‌نامه (دارای ریشه در مرجع): **${missingInLex}**`,
    `- موارد نیازمند بازبینی ریشه (اختلاف بین LLM و پیکره مرجع): **${mismatches.length}**`,
    "",
    "## نمونه موارد دارای اختلاف ریشه (حداکثر ۶۰ مورد اول)",
    "",
    "| شناسه واژه | واحد | معنا (gloss) | ریشه فعلی | ریشه مرجع (QUL) | لِما |",
    "|---|---|---|---|---|---|",
    ...mismatches.slice(0, 60).map(
      (m) => `| \`${m.wordId}\` | ${m.unitId} | ${m.gloss} | ${m.lexRoot} | ${m.qulRoot} | ${m.lemmaAr} |`,
    ),
    "",
  ];

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(path.join(DOCS_DIR, "qul-cross-check.md"), lines.join("\n"), "utf8");
  return { totalLex, matchedRoots, missingInLex, mismatchCount: mismatches.length };
}

export async function syncQulForSurah({ surah = 28, outDir } = {}) {
  const slug = surah === 28 ? "qasas" : `s${String(surah).padStart(3, "0")}`;
  const baseDir =
    outDir ||
    (surah === 28
      ? path.join(ROOT_DIR, "public", "content", "base")
      : path.join(ROOT_DIR, "release", "packs", "work", slug));

  console.log(`🔄 Syncing QUL/Quran.com reference data for Surah ${surah}...`);
  await fs.mkdir(baseDir, { recursive: true });

  const [audioTiming, morphology] = await Promise.all([
    fetchAudioTimings(surah),
    fetchMorphology(surah),
  ]);

  const timingPath = path.join(baseDir, `${slug}.audio-timing.json`);
  const morphPath = path.join(baseDir, `${slug}.morphology.json`);

  await fs.writeFile(timingPath, JSON.stringify(audioTiming), "utf8");
  await fs.writeFile(morphPath, JSON.stringify(morphology), "utf8");

  console.log(`✅ Audio timings saved: ${timingPath} (${audioTiming.verseCount} verses)`);
  console.log(`✅ Morphology saved: ${morphPath} (${morphology.wordCount} words)`);

  if (surah === 28 && !outDir) {
    const report = await crossCheckWithMergedLexicon(morphology);
    if (report) {
      console.log(
        `📊 Cross-check report: ${report.matchedRoots}/${report.totalLex} matched, ${report.mismatchCount} root differences → docs/qul-cross-check.md`,
      );
    }
  }

  return { audioTiming, morphology, timingPath, morphPath, outDir: baseDir };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { surah, outDir } = parseCliArgs(process.argv.slice(2));
  syncQulForSurah({ surah, outDir }).catch((err) => {
    console.error("❌ sync-qul-data failed:", err);
    process.exit(1);
  });
}
