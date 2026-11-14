// موقت: پوشش فیلدهای نمایشی برای match/order/cloze
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/content/merged");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const stats = { match: 0, order: 0, cloze: 0 };
const bad = { match: [], order: [], cloze: [] };
const fieldSets = new Map();

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const q of j.questions ?? []) {
    const s = q.shape;
    const check = (items) => (items ?? []).filter((x) => !x.ar && !x.fa && x.num === undefined && !x.text);
    if (s === "match") {
      stats.match++;
      const badItems = [...check(q.left), ...check(q.right)];
      if (badItems.length) {
        bad.match.push(q.id);
        for (const it of badItems.slice(0, 1)) {
          const k = Object.keys(it).filter((x) => x !== "id").sort().join("+") || "id-only";
          fieldSets.set("match:" + k, (fieldSets.get("match:" + k) ?? 0) + 1);
        }
      }
    } else if (s === "order") {
      stats.order++;
      const badItems = check(q.bank);
      if (badItems.length) {
        bad.order.push(q.id);
        const k = Object.keys(badItems[0]).filter((x) => x !== "id").sort().join("+") || "id-only";
        fieldSets.set("order:" + k, (fieldSets.get("order:" + k) ?? 0) + 1);
      }
    } else if (s === "cloze") {
      stats.cloze++;
      const badItems = check(q.bank);
      if (badItems.length) {
        bad.cloze.push(q.id);
        const k = Object.keys(badItems[0]).filter((x) => x !== "id").sort().join("+") || "id-only";
        fieldSets.set("cloze:" + k, (fieldSets.get("cloze:" + k) ?? 0) + 1);
      }
    }
  }
}

for (const k of ["match", "order", "cloze"]) console.log(`${k}: total=${stats[k]} unrenderable=${bad[k].length} sample=${bad[k].slice(0, 3).join(",")}`);
console.log("field sets:", [...fieldSets.entries()].map(([k, v]) => `${k}=${v}`).join("  "));
