// موقت: تحلیل پوشش مرحله‌ها و نوع سوال در محتوای ادغام‌شده
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/content/merged");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const units = new Map();
const typeCount = new Map();
const ids = new Map();
let dupIds = 0;
let total = 0;

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const u = j.unitId;
  if (!units.has(u)) units.set(u, { questions: 0, stages: new Map(), types: new Map(), targets: new Set() });
  const rec = units.get(u);
  for (const q of j.questions ?? []) {
    total++;
    rec.questions++;
    rec.stages.set(q.stage, (rec.stages.get(q.stage) ?? 0) + 1);
    rec.types.set(q.type, (rec.types.get(q.type) ?? 0) + 1);
    typeCount.set(q.type, (typeCount.get(q.type) ?? 0) + 1);
    for (const t of q.targets ?? []) rec.targets.add(t);
    if (ids.has(q.id)) dupIds++;
    ids.set(q.id, true);
  }
}

const unitIds = [...units.keys()].sort();
console.log(`units=${unitIds.length} questions=${total} uniqueIds=${ids.size} dupIds=${dupIds}`);
console.log("\nunit        Q    s1  s2  s3  s4  s5  s6  s7  s8   targets  types");
for (const u of unitIds) {
  const r = units.get(u);
  const s = [];
  for (let i = 1; i <= 8; i++) s.push(String(r.stages.get(i) ?? 0).padStart(3));
  console.log(`${u.padEnd(11)} ${String(r.questions).padStart(4)} ${s.join(" ")}  ${String(r.targets.size).padStart(4)}   ${r.types.size}`);
}

console.log("\nquestion types:");
for (const [t, c] of [...typeCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(28)} ${c}`);

// واحدهایی که مرحله‌ای کمتر از ۸ سوال دارند
const thin = [];
for (const [u, r] of units) {
  for (let i = 1; i <= 8; i++) {
    const c = r.stages.get(i) ?? 0;
    if (c < 8) thin.push(`${u} stage${i}=${c}`);
  }
}
console.log(`\nthin stages (<8 q): ${thin.length}`);
console.log(thin.slice(0, 60).join("\n"));
