// scripts/fetch-base-data.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

async function fetchQuranComVerses() {
  console.log("⏳ Fetching Surah 28 verses from Quran.com API v4...");
  const verses = [];
  for (let page = 1; page <= 2; page++) {
    const url = `https://api.quran.com/api/v4/verses/by_chapter/28?words=true&word_fields=text_uthmani,page_number,line_number&per_page=50&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch page ${page}: ${res.statusText}`);
    const data = await res.json();
    verses.push(...data.verses);
  }
  if (verses.length !== 88) {
    throw new Error(`Expected 88 verses, got ${verses.length}`);
  }
  console.log(`✅ Successfully fetched 88 verses with words & line metadata.`);
  return verses;
}

async function fetchAnsarianTranslation() {
  console.log("⏳ Fetching Ansarian translation from Tanzil...");
  const res = await fetch("https://tanzil.net/trans/fa.ansarian");
  if (!res.ok) throw new Error(`Failed to fetch Tanzil Ansarian: ${res.statusText}`);
  const text = await res.text();
  const lines = text.split("\n");
  const translationMap = new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [s, a, fa] = trimmed.split("|");
    if (s === "28") {
      translationMap.set(Number(a), fa.trim());
    }
  }

  if (translationMap.size !== 88) {
    throw new Error(`Expected 88 Ansarian verses for Surah 28, found ${translationMap.size}`);
  }
  console.log(`✅ Successfully parsed 88 verses of Ansarian translation.`);
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

function buildUnitsPlan(baseVerses) {
  console.log("⏳ Building half-page units plan...");
  // Group verses by their ending page & half
  // Page 385 starts at line 10 -> u_p385b
  // Other pages: endLine <= 8 -> 'a', endLine >= 9 -> 'b'
  // Page 396 ends at line 7 -> u_p396a
  const rawUnits = [];
  let currentUnit = null;

  for (const v of baseVerses) {
    const page = v.endPage;
    let half = v.endLine <= 8 ? "a" : "b";
    if (page === 385) {
      // On page 385, Surah Al-Qasas starts at line 10, so all verses on p385 are on half 'b'
      // To keep standard unit naming, we can call it u_p385b
      half = "b";
    }

    const unitId = `u_p${page}${half}`;

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

  console.log(`✅ Generated ${rawUnits.length} half-page units across pages 385-396.`);
  return rawUnits;
}

async function main() {
  try {
    const rawVerses = await fetchQuranComVerses();
    const ansarianMap = await fetchAnsarianTranslation();

    const baseVerses = rawVerses.map((v) => {
      const n = v.verse_number;
      const id = `v28_${String(n).padStart(3, "0")}`;
      
      // Filter out ayah-marker word if present at the end
      const actualWords = v.words
        .filter((w) => w.char_type_name === "word")
        .map((w, idx) => ({
          id: `w28_${String(n).padStart(3, "0")}_${String(idx + 1).padStart(3, "0")}`,
          i: idx + 1,
          ar: w.text_uthmani,
          page: w.page_number,
          line: w.line_number,
        }));

      const arText = actualWords.map((w) => w.ar).join(" ");
      const fa = ansarianMap.get(n);
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
    const unitsPlan = buildUnitsPlan(baseVerses);

    // Save outputs
    const baseDir = path.join(ROOT_DIR, "public", "content", "base");
    await fs.mkdir(baseDir, { recursive: true });

    await fs.writeFile(
      path.join(baseDir, "qasas.base.json"),
      JSON.stringify(baseVerses, null, 2),
      "utf8"
    );
    console.log(`💾 Saved ${path.join(baseDir, "qasas.base.json")}`);

    await fs.writeFile(
      path.join(baseDir, "units-plan.json"),
      JSON.stringify(unitsPlan, null, 2),
      "utf8"
    );
    console.log(`💾 Saved ${path.join(baseDir, "units-plan.json")}`);

    await fs.writeFile(
      path.join(baseDir, "similarity.json"),
      JSON.stringify(similarity, null, 2),
      "utf8"
    );
    console.log(`💾 Saved ${path.join(baseDir, "similarity.json")}`);

    console.log("\n🎉 Phase 1 Base Data generation completed successfully!");
  } catch (err) {
    console.error("❌ Error in fetch-base-data:", err);
    process.exit(1);
  }
}

main();
