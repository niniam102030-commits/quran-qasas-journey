// موقت: پوشش هدف‌ها با شماره‌ی آیه (vr:N)
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/content/merged");
const baseDir = path.resolve("public/content/base");
const plan = JSON.parse(fs.readFileSync(path.join(baseDir, "units-plan.json"), "utf8"));
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const units = new Map();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (!units.has(j.unitId)) units.set(j.unitId, { targets: new Map(), lex: new Map() });
  const rec = units.get(j.unitId);
  for (const q of j.questions ?? []) for (const t of q.targets ?? []) rec.targets.set(t, (rec.targets.get(t) ?? 0) + 1);
  for (const l of j.lexicon ?? []) rec.lex.set(l.wordId, l);
}

let totalMissing = 0;
console.log("unit        verses  missing verse-skills                     pg  hard  hardW");
for (const p of plan) {
  const rec = units.get(p.id);
  const miss = [];
  for (let n = p.verseFrom; n <= p.verseTo; n++) {
    for (const k of ["vr", "vt", "vn", "sq"]) if (!rec.targets.has(`${k}:${n}`)) miss.push(`${k}:${n}`);
  }
  totalMissing += miss.length;
  const hard = [...rec.lex.values()].filter((l) => l.hard);
  console.log(
    `${p.id.padEnd(11)} ${String(p.verseTo - p.verseFrom + 1).padStart(3)}     ${String(miss.length).padStart(3)} ${miss.slice(0, 6).join(",").padEnd(40)} ${rec.targets.has("pg:" + p.id) || rec.targets.has("pg:" + String(p.order)) ? "yes" : "NO "}  ${String(hard.length).padStart(3)}   ${String(hard.filter((l) => rec.targets.has("w:" + l.wordId)).length).padStart(3)}`,
  );
}
console.log(`\ntotal missing verse-skill targets = ${totalMissing}`);

// کدام شماره‌ها هدف sq ندارند
const all = new Map();
for (const rec of units.values()) for (const [t, c] of rec.targets) all.set(t, (all.get(t) ?? 0) + 1);
const noSq = [];
const noVr = [];
for (let n = 1; n <= 88; n++) {
  if (!all.has(`sq:${n}`)) noSq.push(n);
  if (!all.has(`vr:${n}`)) noVr.push(n);
}
console.log(`verses without sq: ${noSq.join(",") || "-"}`);
console.log(`verses without vr: ${noVr.join(",") || "-"}`);
console.log(`pg targets: ${[...all.keys()].filter((k) => k.startsWith("pg:")).sort().join(" ")}`);

// حداقل/حداکثر تعداد سوال برای هر هدف
const counts = [...all.entries()].filter(([k]) => !k.startsWith("pg:"));
counts.sort((a, b) => a[1] - b[1]);
console.log(`\nfewest-question targets: ${counts.slice(0, 12).map(([k, c]) => `${k}=${c}`).join("  ")}`);
const wCounts = counts.filter(([k]) => k.startsWith("w:"));
console.log(`word targets with <6 questions: ${wCounts.filter(([, c]) => c < 6).length} / ${wCounts.length}`);
