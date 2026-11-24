// scripts/fetch-base-data.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const SURAH_NAMES_FA = {
  1: "سوره حمد (فاتحه)",
  18: "سوره کهف",
  28: "سوره قصص",
  36: "سوره یس",
  55: "سوره الرحمن",
  56: "سوره واقعه",
  67: "سوره ملک",
  78: "سوره نبأ",
  112: "سوره اخلاص",
  113: "سوره فلق",
  114: "سوره ناس",
};

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

async function fetchChapterMeta(surah) {
  const res = await fetch(`https://api.quran.com/api/v4/chapters/${surah}?language=fa`);
  if (!res.ok) throw new Error(`Failed to fetch chapter ${surah} metadata: ${res.statusText}`);
  const data = await res.json();
  const ch = data.chapter || {};
  const versesCount = Number(ch.verses_count || (surah === 28 ? 88 : 0));
  const nameAr = String(ch.name_arabic || "");
  const nameFa = SURAH_NAMES_FA[surah] || (ch.translated_name?.name ? `سوره ${ch.translated_name.name}` : `سوره ${nameAr}`);
  return { versesCount, nameAr, nameFa };
}

async function fetchQuranComVerses(surah, expectedCount) {
  console.log(`⏳ Fetching Surah ${surah} verses from Quran.com API v4...`);
  const verses = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = `https://api.quran.com/api/v4/verses/by_chapter/${surah}?words=true&word_fields=text_uthmani,page_number,line_number&per_page=50&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch page ${page}: ${res.statusText}`);
    const data = await res.json();
    totalPages = Number(data.pagination?.total_pages ?? 1);
    verses.push(...(data.verses ?? []));
    page++;
  }
  if (expectedCount > 0 && verses.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} verses for Surah ${surah}, got ${verses.length}`);
  }
  console.log(`✅ Successfully fetched ${verses.length} verses with words & line metadata.`);
  return verses;
}

async function fetchAnsarianTranslation(surah, expectedCount) {
  console.log(`⏳ Fetching Ansarian translation for Surah ${surah} from Tanzil...`);
  const res = await fetch("https://tanzil.net/trans/fa.ansarian");
  if (!res.ok) throw new Error(`Failed to fetch Tanzil Ansarian: ${res.statusText}`);
  const text = await res.text();
  const lines = text.split("\n");
  const translationMap = new Map();
  const surahStr = String(surah);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [s, a, fa] = trimmed.split("|");
    if (s === surahStr) {
      translationMap.set(Number(a), fa.trim());
    }
  }

  if (expectedCount > 0 && translationMap.size !== expectedCount) {
    throw new Error(`Expected ${expectedCount} Ansarian verses for Surah ${surah}, found ${translationMap.size}`);
  }
  console.log(`✅ Successfully parsed ${translationMap.size} verses of Ansarian translation.`);
  return translationMap;
}

function normalizeForComparison(text) {
  return text
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // remove tashkeel/diacritics
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

function buildSimilarityMap(baseVerses) {
  console.log("⏳ Computing intra-surah similarity map...");
  const similarity = {};

  for (const v of baseVerses) {
    similarity[v.id] = {
      sameStart: [],
      sameEnd: [],
      sharedPhrases: [],
    };
  }

  // 1. Same start (first 3 words)
  const normWordsMap = new Map();
  for (const v of baseVerses) {
    const cleanWords = v.words.map((w) => normalizeForComparison(w.ar));
    normWordsMap.set(v.id, cleanWords);
  }

  for (let i = 0; i < baseVerses.length; i++) {
    const v1 = baseVerses[i];
    const w1 = normWordsMap.get(v1.id);
    const start1 = w1.slice(0, 3).join(" ");
    const end1 = w1.slice(-3).join(" ");

    for (let j = i + 1; j < baseVerses.length; j++) {
      const v2 = baseVerses[j];
      const w2 = normWordsMap.get(v2.id);

      if (w1.length >= 3 && w2.length >= 3) {
        const start2 = w2.slice(0, 3).join(" ");
        if (start1 === start2) {
          similarity[v1.id].sameStart.push(v2.id);
          similarity[v2.id].sameStart.push(v1.id);
        }

        const end2 = w2.slice(-3).join(" ");
        if (end1 === end2) {
          similarity[v1.id].sameEnd.push(v2.id);
          similarity[v2.id].sameEnd.push(v1.id);
        }
      }

      // Shared 4+ words phrases
      if (w1.length >= 4 && w2.length >= 4) {
        for (let s1 = 0; s1 <= w1.length - 4; s1++) {
          const phrase1 = w1.slice(s1, s1 + 4).join(" ");
          for (let s2 = 0; s2 <= w2.length - 4; s2++) {
            const phrase2 = w2.slice(s2, s2 + 4).join(" ");
            if (phrase1 === phrase2) {
              const arOrigPhrase = v1.words.slice(s1, s1 + 4).map((w) => w.ar).join(" ");
              similarity[v1.id].sharedPhrases.push({
                ar: arOrigPhrase,
                verses: [v1.id, v2.id],
              });
              similarity[v2.id].sharedPhrases.push({
                ar: arOrigPhrase,
                verses: [v2.id, v1.id],
              });
            }
          }
        }
      }
    }
  }

  console.log(`✅ Intra-surah similarity map generated.`);
  return similarity;
}

function buildUnitsPlan(baseVerses, surah = 28) {
  console.log(`⏳ Building half-page units plan for Surah ${surah}...`);
  const rawUnits = [];
  let currentUnit = null;

  for (const v of baseVerses) {
    const page = v.endPage;
    let half = v.endLine <= 8 ? "a" : "b";
    if (surah === 28 && page === 385) {
      half = "b";
    }

    const baseId = `u_p${page}${half}`;
    const unitId = surah === 28 ? baseId : `s${surah}_${baseId}`;

    if (!currentUnit || currentUnit.id !== unitId) {
      currentUnit = {
        id: unitId,
        page,
        half,
        verseFrom: v.n,
        verseTo: v.n,
        verses: [v.id],
        lines: { from: v.words[0].line, to: v.endLine },
      };
      rawUnits.push(currentUnit);
    } else {
      currentUnit.verseTo = v.n;
      currentUnit.verses.push(v.id);
      currentUnit.lines.to = v.endLine;
    }
  }

  // Assign sequential order
  rawUnits.forEach((u, idx) => {
    u.order = idx + 1;
  });

  console.log(`✅ Generated ${rawUnits.length} half-page units for Surah ${surah}.`);
  return rawUnits;
}

export async function fetchBaseDataForSurah({ surah = 28, outDir } = {}) {
  const slug = surah === 28 ? "qasas" : `s${String(surah).padStart(3, "0")}`;
  const meta = await fetchChapterMeta(surah);
  const rawVerses = await fetchQuranComVerses(surah, meta.versesCount);
  const ansarianMap = await fetchAnsarianTranslation(surah, meta.versesCount);
  const wordPrefix = surah === 28 ? "28" : String(surah).padStart(2, "0");

  const baseVerses = rawVerses.map((v) => {
    const n = v.verse_number;
    const id = `v${surah}_${String(n).padStart(3, "0")}`;

    // Filter out ayah-marker word if present at the end
    const actualWords = v.words
      .filter((w) => w.char_type_name === "word")
      .map((w, idx) => ({
        id: `w${wordPrefix}_${String(n).padStart(3, "0")}_${String(idx + 1).padStart(3, "0")}`,
        i: idx + 1,
        ar: w.text_uthmani,
        page: w.page_number,
        line: w.line_number,
      }));

    const arText = actualWords.map((w) => w.ar).join(" ");
    const fa = ansarianMap.get(n) || "";
    const startWord = actualWords[0] || { page: v.page_number, line: 1 };
    const endWord = actualWords[actualWords.length - 1] || startWord;

    return {
      id,
      n,
      page: startWord.page,
      words: actualWords,
      arText,
      fa,
      endPage: endWord.page,
      endLine: endWord.line,
    };
  });

  const similarity = buildSimilarityMap(baseVerses);
  const unitsPlan = buildUnitsPlan(baseVerses, surah);

  const baseDir =
    outDir ||
    (surah === 28
      ? path.join(ROOT_DIR, "public", "content", "base")
      : path.join(ROOT_DIR, "release", "packs", "work", slug));
  await fs.mkdir(baseDir, { recursive: true });

  const baseFile = path.join(baseDir, `${slug}.base.json`);
  const unitsFile = path.join(baseDir, "units-plan.json");
  const simFile = path.join(baseDir, "similarity.json");

  await fs.writeFile(baseFile, JSON.stringify(baseVerses, null, 2), "utf8");
  console.log(`💾 Saved ${baseFile}`);

  await fs.writeFile(unitsFile, JSON.stringify(unitsPlan, null, 2), "utf8");
  console.log(`💾 Saved ${unitsFile}`);

  await fs.writeFile(simFile, JSON.stringify(similarity, null, 2), "utf8");
  console.log(`💾 Saved ${simFile}`);

  return {
    surah,
    slug,
    nameAr: meta.nameAr,
    nameFa: meta.nameFa,
    verses: baseVerses.length,
    baseVerses,
    unitsPlan,
    similarity,
    outDir: baseDir,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { surah, outDir } = parseCliArgs(process.argv.slice(2));
  fetchBaseDataForSurah({ surah, outDir }).then(
    () => console.log("\n🎉 Phase 1 Base Data generation completed successfully!"),
    (err) => {
      console.error("❌ Error in fetch-base-data:", err);
      process.exit(1);
    },
  );
}
