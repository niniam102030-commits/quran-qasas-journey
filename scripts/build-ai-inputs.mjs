// scripts/build-ai-inputs.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

async function main() {
  const baseDir = path.join(ROOT_DIR, "public", "content", "base");
  const inputDir = path.join(ROOT_DIR, "input");
  await fs.mkdir(inputDir, { recursive: true });

  const baseVerses = JSON.parse(
    await fs.readFile(path.join(baseDir, "qasas.base.json"), "utf8")
  );
  const unitsPlan = JSON.parse(
    await fs.readFile(path.join(baseDir, "units-plan.json"), "utf8")
  );
  const similarityMap = JSON.parse(
    await fs.readFile(path.join(baseDir, "similarity.json"), "utf8")
  );

  const verseMap = new Map(baseVerses.map((v) => [v.id, v]));

  // Build a surah-wide word pool of diverse words (length >= 3)
  const poolSet = new Set();
  for (const v of baseVerses) {
    for (const w of v.words) {
      if (w.ar.length >= 3) {
        poolSet.add(w.ar);
      }
    }
  }
  const surahWordPool = Array.from(poolSet).slice(0, 160);

  for (let i = 0; i < unitsPlan.length; i++) {
    const u = unitsPlan[i];
    const unitVerses = u.verses.map((vid) => verseMap.get(vid));

    // contextBefore: up to 2 verses of previous unit
    let contextBefore = [];
    if (i > 0) {
      const prevU = unitsPlan[i - 1];
      const prevVerses = prevU.verses.map((vid) => verseMap.get(vid));
      contextBefore = prevVerses.slice(-2);
    }

    // contextAfter: 1st verse of next unit
    let contextAfter = [];
    if (i < unitsPlan.length - 1) {
      const nextU = unitsPlan[i + 1];
      const nextVerses = nextU.verses.map((vid) => verseMap.get(vid));
      contextAfter = nextVerses.slice(0, 1);
    }

    // Filter similarity to verses in this unit
    const unitSimilarity = {};
    for (const vid of u.verses) {
      if (similarityMap[vid]) {
        unitSimilarity[vid] = similarityMap[vid];
      }
    }

    const payload = {
      unit: {
        id: u.id,
        page: u.page,
        half: u.half,
        verseFrom: u.verseFrom,
        verseTo: u.verseTo,
      },
      verses: unitVerses,
      contextBefore,
      contextAfter,
      similarity: unitSimilarity,
      earlierHardWords: [],
      surahWordPool,
    };

    const outPath = path.join(inputDir, `${u.id}.input.json`);
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  }

  console.log(`🎉 Successfully created 22 AI input files in ${inputDir}/`);
}

main().catch(console.error);
