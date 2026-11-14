// scripts/merge-parts.mjs
// ادغام قطعه‌های تولیدشده (partA, partA2, ... partC13) در سه فایل واحد برای هر واحد.
// غیرمخرب است: فایل‌های اصلی دست نمی‌خورند؛ خروجی در public/content/merged/ نوشته می‌شود.
//
// اجرا:  node scripts/merge-parts.mjs
// خروجی: public/content/merged/<unitId>.part{A,B,C}.json  و  docs/merge-report.md
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UNITS_DIR = path.join(ROOT, "public", "content", "units");
const OUT_DIR = path.join(ROOT, "public", "content", "merged");
const PLAN_PATH = path.join(ROOT, "public", "content", "base", "units-plan.json");
const BASE_PATH = path.join(ROOT, "public", "content", "base", "qasas.base.json");
const REPORT_PATH = path.join(ROOT, "docs", "merge-report.md");

const FILE_RE = /^(u_p\d+[ab])\.part([ABC])(\d*)\.json$/;

function signature(q) {
  // سوال تکراری = همان نوع، همان صورت و همان پاسخ
  return JSON.stringify([q.type, q.verse ?? null, q.stem, q.answer ?? q.pairs ?? null, q.targets]);
}

async function main() {
  const plan = JSON.parse(await fs.readFile(PLAN_PATH, "utf8"));
  const base = JSON.parse(await fs.readFile(BASE_PATH, "utf8"));
  const baseVerses = Array.isArray(base) ? base : base.verses;
  const verseByN = new Map(baseVerses.map((v) => [v.n, v]));

  const names = (await fs.readdir(UNITS_DIR)).filter((f) => FILE_RE.test(f));
  const groups = new Map(); // key = unit|letter -> [{file, seq}]
  for (const f of names) {
    const m = f.match(FILE_RE);
    const key = `${m[1]}|${m[2]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ file: f, seq: m[3] === "" ? 1 : Number(m[3]) });
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const report = [];
  const problems = [];
  const summary = [];

  for (const unit of plan) {
    const V = unit.verses.length;
    const unitWordIds = new Set();
    for (const vid of unit.verses) {
      const v = verseByN.get(Number(vid.slice(4)));
      if (v) v.words.forEach((w) => unitWordIds.add(w.id));
    }

    const stageCounts = {};
    let hardCount = 0;
    let lexCount = 0;
    let chunkCount = 0;

    for (const letter of ["A", "B", "C"]) {
      const files = (groups.get(`${unit.id}|${letter}`) || []).sort((a, b) => a.seq - b.seq);
      if (files.length === 0) {
        problems.push(`${unit.id} part ${letter}: هیچ فایلی یافت نشد`);
        continue;
      }
      const merged = {
        schema: "qasas.content.v1",
        unitId: unit.id,
        part: letter,
        generatedBy: new Set(),
        lexicon: [],
        chunks: [],
        questions: [],
        issues: [],
        sourceFiles: [],
      };
      const seenIds = new Set();
      const seenSig = new Set();
      const seenWords = new Set();
      const seenChunkVerses = new Set();
      let droppedDupId = 0;
      let droppedDupSig = 0;

      for (const { file } of files) {
        let data;
        try {
          data = JSON.parse(await fs.readFile(path.join(UNITS_DIR, file), "utf8"));
        } catch (e) {
          problems.push(`${file}: JSON نامعتبر (${e.message})`);
          continue;
        }
        merged.sourceFiles.push(file);
        if (data.generatedBy) merged.generatedBy.add(data.generatedBy);
        for (const l of data.lexicon || []) {
          if (!seenWords.has(l.wordId)) {
            seenWords.add(l.wordId);
            merged.lexicon.push(l);
          }
        }
        for (const c of data.chunks || []) {
          if (!seenChunkVerses.has(c.verse)) {
            seenChunkVerses.add(c.verse);
            merged.chunks.push(c);
          }
        }
        for (const q of data.questions || []) {
          if (q.id && seenIds.has(q.id)) {
            droppedDupId++;
            continue;
          }
          const sig = signature(q);
          if (seenSig.has(sig)) {
            droppedDupSig++;
            continue;
          }
          if (q.id) seenIds.add(q.id);
          seenSig.add(sig);
          merged.questions.push({ ...q, unitId: unit.id, part: letter });
          stageCounts[q.stage] = (stageCounts[q.stage] || 0) + 1;
        }
        for (const i of data.issues || []) merged.issues.push(`[${file}] ${i}`);
      }
      merged.generatedBy = Array.from(merged.generatedBy).join(",");
      merged.mergeInfo = { droppedDupId, droppedDupSig, files: merged.sourceFiles.length };

      if (letter === "A") {
        lexCount = merged.lexicon.length;
        hardCount = merged.lexicon.filter((l) => l.hard).length;
        chunkCount = merged.chunks.length;
        const missingWords = [...unitWordIds].filter((id) => !seenWords.has(id));
        if (missingWords.length) problems.push(`${unit.id}: ${missingWords.length} کلمه در lexicon نیست (نمونه: ${missingWords.slice(0, 3).join(", ")})`);
        if (chunkCount !== V) problems.push(`${unit.id}: chunks برای ${chunkCount} آیه از ${V} آیه`);
      } else {
        delete merged.lexicon;
        delete merged.chunks;
      }
      if (droppedDupId || droppedDupSig) {
        report.push(`- ${unit.id} ${letter}: ${droppedDupId} سوال با id تکراری و ${droppedDupSig} سوال هم‌امضا حذف شد`);
      }
      await fs.writeFile(path.join(OUT_DIR, `${unit.id}.part${letter}.json`), JSON.stringify(merged, null, 1), "utf8");
    }

    // سهمیه‌ها (بخش ۷ پرامپت)
    const need8 = Math.max(30, 8 * V);
    if ((stageCounts[8] || 0) < need8) problems.push(`${unit.id}: stage 8 فقط ${stageCounts[8] || 0} سوال دارد (حداقل ${need8})`);
    for (const s of [1, 2, 3, 4, 5, 6, 7]) {
      if (!stageCounts[s]) problems.push(`${unit.id}: stage ${s} سوال ندارد`);
    }
    summary.push({ id: unit.id, V, lexCount, hardCount, chunkCount, stageCounts, total: Object.values(stageCounts).reduce((a, b) => a + b, 0) });
  }

  const lines = [];
  lines.push("# گزارش ادغام قطعه‌ها", "", `تاریخ: ${new Date().toISOString()}`, "");
  lines.push("| واحد | آیه | کلمه (lexicon) | سخت | chunks | s1 | s2 | s3 | s4 | s5 | s6 | s7 | s8 | کل |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summary) {
    lines.push(`| ${s.id} | ${s.V} | ${s.lexCount} | ${s.hardCount} | ${s.chunkCount} | ${[1, 2, 3, 4, 5, 6, 7, 8].map((k) => s.stageCounts[k] || 0).join(" | ")} | ${s.total} |`);
  }
  lines.push("", "## مشکل‌ها", "", ...(problems.length ? problems.map((p) => `- ${p}`) : ["- ندارد"]));
  lines.push("", "## حذف‌شده‌ها هنگام ادغام", "", ...(report.length ? report : ["- ندارد"]));
  await fs.writeFile(REPORT_PATH, lines.join("\n"), "utf8");

  console.log(`✅ ادغام شد: ${summary.length} واحد → public/content/merged/`);
  console.log(`📄 گزارش: docs/merge-report.md  (${problems.length} مشکل)`);
  if (problems.length && process.argv.includes("--strict")) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
