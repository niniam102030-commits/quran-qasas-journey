// موقت: توزیع تعداد سوال‌های «خواهر» به تفکیک نوع هدف
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/content/merged");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const all = new Map();
const perUnit = new Map();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (!perUnit.has(j.unitId)) perUnit.set(j.unitId, new Map());
  for (const q of j.questions ?? []) {
    for (const t of new Set(q.targets ?? [])) {
      all.set(t, (all.get(t) ?? 0) + 1);
      perUnit.get(j.unitId).set(t, (perUnit.get(j.unitId).get(t) ?? 0) + 1);
    }
  }
}

function stat(label, filter, min) {
  const arr = [...all.entries()].filter(([k]) => filter(k)).map(([, c]) => c);
  const below = arr.filter((c) => c < min).length;
  arr.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(14)} targets=${String(arr.length).padStart(3)}  min=${arr[0]}  p10=${arr[Math.floor(arr.length * 0.1)]}  median=${arr[Math.floor(arr.length / 2)]}  max=${arr[arr.length - 1]}  below${min}=${below}`,
  );
}
stat("words w:", (k) => k.startsWith("w:"), 6);
stat("verse vr:", (k) => k.startsWith("vr:"), 8);
stat("verse vt:", (k) => k.startsWith("vt:"), 8);
stat("verse vn:", (k) => k.startsWith("vn:"), 8);
stat("verse sq:", (k) => k.startsWith("sq:"), 8);
stat("page pg:", (k) => k.startsWith("pg:"), 8);

// شمارش سراسری هدف‌های کم‌پوشش
const weak = [...all.entries()].filter(([k, c]) => (k.startsWith("w:") ? c < 6 : k.startsWith("pg:") ? c < 8 : c < 8));
console.log(`\ntargets below quota (total) = ${weak.length} of ${all.size}`);
const byPrefix = new Map();
for (const [k] of weak) byPrefix.set(k.split(":")[0], (byPrefix.get(k.split(":")[0]) ?? 0) + 1);
console.log("by prefix:", [...byPrefix.entries()].map(([k, v]) => `${k}=${v}`).join("  "));
console.log("sample:", weak.slice(0, 10).map(([k, c]) => `${k}=${c}`).join("  "));
