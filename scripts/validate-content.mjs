// scripts/validate-content.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const VALID_SHAPES = new Set(["choice", "match", "order", "cloze"]);
const VALID_SKILLS = new Set(["word", "translation", "recall", "number", "sequence", "page"]);
const VALID_TYPES = new Set([
  "WORD_AR_TO_FA",
  "WORD_FA_TO_AR",
  "VERSE_TO_TRANSLATION",
  "TRANSLATION_TO_VERSE",
  "VERSE_TO_NUMBER",
  "NUMBER_TO_VERSE_START",
  "NEXT_VERSE_CHOICE",
  "PREV_VERSE_CHOICE",
  "ENDING_CHOICE",
  "MUTASHABIH_SPOT",
  "MATCH_WORDS",
  "MATCH_PHRASES",
  "MATCH_NUMBER_OPENING",
  "BUILD_FROM_TRANSLATION",
  "BUILD_FROM_NUMBER",
  "BUILD_NEXT_VERSE",
  "BUILD_PREV_VERSE",
  "ORDER_TRANSLATION_CHUNKS",
  "ORDER_VERSES",
  "CLOZE_AR",
  "CLOZE_COMPLETE_REST",
  "CLOZE_FA",
]);

export async function validateContentFile(filePath, baseVersesMap) {
  const contentRaw = await fs.readFile(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(contentRaw);
  } catch (err) {
    return { valid: false, errors: [`JSON Parse Error: ${err.message}`], counts: {} };
  }

  const errors = [];
  const counts = {};

  if (data.schema !== "qasas.content.v1") {
    errors.push(`Invalid schema: expected 'qasas.content.v1', got '${data.schema}'`);
  }
  if (!data.unitId) errors.push("Missing unitId");
  if (!data.part) errors.push("Missing part");
  if (!Array.isArray(data.questions)) errors.push("Missing or invalid questions array");

  // Validate lexicon & chunks if Part A
  if (data.part === "A") {
    if (!Array.isArray(data.lexicon)) {
      errors.push("Part A must include a 'lexicon' array");
    }
    if (!Array.isArray(data.chunks)) {
      errors.push("Part A must include a 'chunks' array");
    }
  }

  const seenQIds = new Set();

  for (let idx = 0; idx < (data.questions || []).length; idx++) {
    const q = data.questions[idx];
    const prefix = `[Q#${idx + 1} (${q.id || "no-id"})]:`;

    if (!q.id) {
      errors.push(`${prefix} Missing id`);
    } else if (seenQIds.has(q.id)) {
      errors.push(`${prefix} Duplicate question id '${q.id}'`);
    } else {
      seenQIds.add(q.id);
    }

    if (!VALID_SHAPES.has(q.shape)) errors.push(`${prefix} Invalid shape '${q.shape}'`);
    if (!VALID_TYPES.has(q.type)) errors.push(`${prefix} Invalid type '${q.type}'`);
    if (!VALID_SKILLS.has(q.skill)) errors.push(`${prefix} Invalid skill '${q.skill}'`);
    if (!q.stage || q.stage < 1 || q.stage > 8) errors.push(`${prefix} Invalid stage '${q.stage}'`);
    if (!q.difficulty || q.difficulty < 1 || q.difficulty > 5) errors.push(`${prefix} Invalid difficulty`);
    if (!Array.isArray(q.targets) || q.targets.length === 0) errors.push(`${prefix} Missing targets`);
    if (!q.promptFa) errors.push(`${prefix} Missing promptFa`);

    // Shape-specific validation
    if (q.shape === "choice") {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`${prefix} Choice question must have at least 2 options`);
      } else {
        const optIds = new Set(q.options.map((o) => o.id));
        if (!optIds.has(q.answer)) {
          errors.push(`${prefix} Answer '${q.answer}' not in options [${Array.from(optIds)}]`);
        }
      }
    } else if (q.shape === "match") {
      if (!Array.isArray(q.left) || !Array.isArray(q.right) || !Array.isArray(q.pairs)) {
        errors.push(`${prefix} Match question missing left, right, or pairs`);
      } else {
        const leftIds = new Set(q.left.map((l) => l.id));
        const rightIds = new Set(q.right.map((r) => r.id));
        for (const [lid, rid] of q.pairs) {
          if (!leftIds.has(lid)) errors.push(`${prefix} Pair left '${lid}' not in left items`);
          if (!rightIds.has(rid)) errors.push(`${prefix} Pair right '${rid}' not in right items`);
        }
      }
    } else if (q.shape === "order") {
      if (!Array.isArray(q.bank) || !Array.isArray(q.answer)) {
        errors.push(`${prefix} Order question missing bank or answer array`);
      } else {
        const bankIds = new Set(q.bank.map((b) => b.id));
        for (const ansId of q.answer) {
          if (!bankIds.has(ansId)) {
            errors.push(`${prefix} Answer item '${ansId}' not found in bank`);
          }
        }
      }
    } else if (q.shape === "cloze") {
      if (!Array.isArray(q.bank) || typeof q.answer !== "object") {
        errors.push(`${prefix} Cloze question missing bank or answer object`);
      } else {
        const bankIds = new Set(q.bank.map((b) => b.id));
        for (const [gapIdx, bId] of Object.entries(q.answer)) {
          if (!bankIds.has(bId)) {
            errors.push(`${prefix} Gap '${gapIdx}' points to non-existent bank id '${bId}'`);
          }
        }
      }
    }

    // Counts aggregation
    counts[q.type] = (counts[q.type] || 0) + 1;
  }

  return {
    valid: errors.length === 0,
    errors,
    counts,
    totalQuestions: seenQIds.size,
  };
}

async function main() {
  // حالت تک‌فایل: node validate-content.mjs <file.json> [--strict]
  const fileArg = process.argv.slice(2).find((a) => a.endsWith(".json"));
  if (fileArg) {
    const res = await validateContentFile(path.resolve(fileArg));
    if (res.valid) {
      console.log(`✅ ${path.basename(fileArg)}: Valid (${res.totalQuestions} questions)`);
      return;
    }
    console.error(`❌ ${path.basename(fileArg)} has ${res.errors.length} errors:`);
    res.errors.slice(0, 15).forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }

  // --merged : اعتبارسنجی خروجی merge-parts.mjs (پیشنهادی)
  const unitsDir = process.argv.includes("--merged")
    ? path.join(ROOT_DIR, "public", "content", "merged")
    : path.join(ROOT_DIR, "public", "content", "units");
  let files = [];
  try {
    files = (await fs.readdir(unitsDir)).filter((f) => f.endsWith(".json"));
  } catch {
    console.log(`Directory ${unitsDir} is empty or does not exist yet.`);
    return;
  }

  if (files.length === 0) {
    console.log("ℹ️ No content unit files found to validate in public/content/units/.");
    return;
  }

  console.log(`🔍 Validating ${files.length} content files in public/content/units/...`);
  let hasErrors = false;

  for (const f of files) {
    const res = await validateContentFile(path.join(unitsDir, f));
    if (res.valid) {
      console.log(`✅ ${f}: Valid! (${res.totalQuestions} questions)`);
    } else {
      hasErrors = true;
      console.error(`❌ ${f} has ${res.errors.length} errors:`);
      res.errors.slice(0, 10).forEach((e) => console.error(`   - ${e}`));
      if (res.errors.length > 10) {
        console.error(`   ... and ${res.errors.length - 10} more errors.`);
      }
    }
  }

  if (hasErrors && process.argv.includes("--strict")) {
    process.exit(1);
  }
}

main().catch(console.error);
