// scripts/build-manifest.mjs
// ساخت public/content/manifest.json از روی public/content/merged/*.json
// اجرا: node scripts/build-manifest.mjs
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "public", "content");
const MERGED = path.join(CONTENT, "merged");
const plan = JSON.parse(await fs.readFile(path.join(CONTENT, "base", "units-plan.json"), "utf8"));

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);

const units = [];
const all = crypto.createHash("sha256");
for (const u of plan) {
  const files = [];
  for (const letter of ["A", "B", "C"]) {
    const name = `${u.id}.part${letter}.json`;
    try {
      const buf = await fs.readFile(path.join(MERGED, name));
      files.push({ file: `merged/${name}`, part: letter, hash: sha(buf), bytes: buf.length });
      all.update(buf);
    } catch {
      console.warn(`⚠️ ${name} وجود ندارد`);
    }
  }
  units.push({ id: u.id, order: u.order, page: u.page, half: u.half, verseFrom: u.verseFrom, verseTo: u.verseTo, verses: u.verses, files });
}
const baseBuf = await fs.readFile(path.join(CONTENT, "base", "qasas.base.json"));
all.update(baseBuf);

const manifest = {
  schema: "qasas.manifest.v1",
  contentHash: all.digest("hex").slice(0, 16),
  generatedAt: new Date().toISOString(),
  base: { file: "base/qasas.base.json", hash: sha(baseBuf) },
  units,
};
await fs.writeFile(path.join(CONTENT, "manifest.json"), JSON.stringify(manifest, null, 1), "utf8");
console.log(`✅ manifest.json — ${units.length} واحد، hash=${manifest.contentHash}`);
