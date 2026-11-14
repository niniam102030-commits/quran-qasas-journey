// موقت: پوشش هدف‌ها (آیه/کلمه) در محتوای ادغام‌شده
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/content/merged");
const baseDir = path.resolve("public/content/base");
const base = JSON.parse(fs.readFileSync(path.join(baseDir, "qasas.base.json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(baseDir, "units-plan.json"), "utf8"));
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const units = new Map();
const allTargets = new Set();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (!units.has(j.unitId)) units.set(j.unitId, { targets: new Map(), lex: new Map() });
  const rec = units.get(j.unitId);
  for (const q of j.questions ?? []) {
    for (const t of q.targets ?? []) {
      allTargets.add(t);
      if (!rec.targets.has(t)) rec.targets.set(t, new Set());
      rec.targets.get(t).add(q.type);
    }
  }
  for (const l of j.lexicon ?? []) rec.lex.set(l.wordId, l);
}

console.log("unit        verses  missing-vr/vt/vn/sq   hardWords  hardWithW  verse-targetsCovered");
for (const u of plan.map((p) => p.id)) {
  const rec = units.get(u);
  const planU = plan.find((p) => p.id === u);
  const miss = [];
  for (const v of planU.verses) {
    const prefix = "v" + v.replace("v28_", "28_");
    for (const k of ["vr", "vt", "vn", "sq"]) {
      if (!rec.targets.has(`${k}:${v}`)) miss.push(`${v}:${k}`);
    }
  }
  // کلمات سخت
  const hard = [...rec.lex.values()].filter((l) => l.hard);
  const hardWithW = hard.filter((l) => rec.targets.has(`w:${l.wordId}`)).length;
  const verseTargets = new Set([...rec.targets.keys()].filter((t) => !t.startsWith("w:")));
  console.log(
    `${u.padEnd(11)} ${String(planU.verses.length).padStart(3)}     ${String(miss.length).padStart(3)}  ${miss.slice(0, 4).join(",").padEnd(24)} ${String(hard.length).padStart(4)}      ${String(hardWithW).padStart(3)}       ${verseTargets.size}`,
  );
}

// کارت‌های بی‌هدف/هدف‌های بی‌سوال در کل
const prefixes = new Map();
for (const t of allTargets) {
  const p = t.split(":")[0];
  prefixes.set(p, (prefixes.get(p) ?? 0) + 1);
}
console.log("\ntarget prefixes:", [...prefixes.entries()].map(([k, v]) => `${k}:${v}`).join("  "));

// کلمات سخت کل و پوشش
let hardAll = 0,
  hardCovered = 0;
for (const rec of units.values()) {
  for (const l of rec.lex.values()) {
    if (l.hard) {
      hardAll++;
      if (rec.targets.has(`w:${l.wordId}`)) hardCovered++;
    }
  }
}
console.log(`hard words total=${hardAll} with w: target=${hardCovered}`);

// آیات پایه بدون هیچ سوال
const coveredVerses = new Set();
for (const t of allTargets) {
  const m = t.match(/^(vr|vt|vn|sq):(v28_\d+)$/);
  if (m) coveredVerses.add(m[2]);
}
const missingVerses = base.map((v) => v.id).filter((id) => !coveredVerses.has(id));
console.log(`base verses=${base.length} covered=${coveredVerses.size} missing=${missingVerses.length}`, missingVerses.slice(0, 10));
