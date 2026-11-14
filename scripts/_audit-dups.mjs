// موقت: بررسی گزینه‌های تکراری و آیتم‌های تکراری بانک
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/content/merged");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
let dupOpts = [];
let dupBank = [];
let emptyMeaning = [];
let clozeBankDup = [];

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const q of j.questions ?? []) {
    const opts = q.options ?? [];
    const seen = new Map();
    for (const o of opts) {
      const key = (o.ar ?? o.fa ?? "").trim();
      if (!key) continue;
      if (seen.has(key)) dupOpts.push(`${f} ${q.id} ${q.type} dup="${key}"`);
      seen.set(key, o.id);
    }
    const bank = q.bank ?? [];
    const bseen = new Map();
    for (const b of bank) {
      const key = (b.ar ?? b.fa ?? "").trim();
      if (!key) continue;
      if (bseen.has(key)) dupBank.push(`${f} ${q.id} ${q.type} dup="${key}"`);
      bseen.set(key, b.id);
    }
  }
  for (const l of j.lexicon ?? []) {
    if (!l.meaningFa || !String(l.meaningFa).trim()) emptyMeaning.push(`${f} ${l.wordId}`);
  }
}

console.log(`duplicate options: ${dupOpts.length}`);
dupOpts.slice(0, 12).forEach((x) => console.log("  " + x));
console.log(`duplicate bank items: ${dupBank.length}`);
dupBank.slice(0, 12).forEach((x) => console.log("  " + x));
console.log(`lexicon empty meaningFa: ${emptyMeaning.length}`);
emptyMeaning.slice(0, 10).forEach((x) => console.log("  " + x));
