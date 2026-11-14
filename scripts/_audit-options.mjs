// موقت: پوشش فیلدهای گزینه/بانک در برابر چیزی که QuestionRenderer می‌فهمد
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/content/merged");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const shapeStats = new Map();
const badOptions = [];
const optFieldSets = new Map();

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const q of j.questions ?? []) {
    const s = q.shape ?? "?";
    shapeStats.set(s, (shapeStats.get(s) ?? 0) + 1);
    if (s === "choice") {
      const bad = (q.options ?? []).filter((o) => !o.ar && !o.fa && o.num === undefined);
      if (bad.length) {
        for (const o of bad) {
          const key = Object.keys(o).filter((k) => k !== "id").sort().join("+");
          optFieldSets.set(key, (optFieldSets.get(key) ?? 0) + 1);
        }
        badOptions.push({ file: f, id: q.id, type: q.type, badCount: bad.length, total: (q.options ?? []).length, keys: Object.keys(bad[0] ?? {}) });
      }
    }
  }
}

console.log("shapes:", [...shapeStats.entries()].map(([k, v]) => `${k}=${v}`).join("  "));
console.log(`choice questions with unrenderable options: ${badOptions.length} of ${shapeStats.get("choice")}`);
const byType = new Map();
for (const b of badOptions) byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
console.log("by type:", [...byType.entries()].map(([k, v]) => `${k}=${v}`).join("  "));
console.log("option field sets:", [...optFieldSets.entries()].map(([k, v]) => `[${k}]=${v}`).join("  "));
console.log("samples:");
for (const b of badOptions.slice(0, 6)) console.log(`  ${b.file} ${b.id} ${b.type} bad=${b.badCount}/${b.total} keys=${b.keys.join(",")}`);
