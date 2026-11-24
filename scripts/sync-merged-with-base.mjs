// scripts/sync-merged-with-base.mjs
// همگام‌سازی خودکار و قطعی فایل‌های public/content/merged/ با متن به‌روزشدهٔ public/content/base/qasas.base.json
// بدون نیاز به LLM: رفع تمام اختلاف‌های AR_MISMATCH، FASEGMENTS_JOIN، TRANSLATION_ORDER_MISMATCH و CLOZE_FA_NOT_SUBSTRING
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE_PATH = path.join(ROOT, "public", "content", "base", "qasas.base.json");
const MERGED_DIR = path.join(ROOT, "public", "content", "merged");

const baseRaw = JSON.parse(await fs.readFile(BASE_PATH, "utf8"));
const verses = Array.isArray(baseRaw) ? baseRaw : baseRaw.verses;
const V = new Map(verses.map((v) => [v.n, v]));

const norm = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .replace(/[ۖۗۚۛۜ۝۞ۘـ\u200c\u200d\u200e\u200f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const stripBrackets = (s) => norm(s).replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
const cleanFa = (s) => stripBrackets(s).replace(/[,،؛.?!؟()]/g, "").replace(/\s+/g, " ").trim();

const wordsText = (n, from, to) => {
  const v = V.get(n);
  if (!v) return "";
  return v.words.filter((w) => w.i >= from && w.i <= to).map((w) => w.ar).join(" ");
};

function targetVerseOf(q) {
  const s = q.stem || {};
  if (s.targetVerse) return s.targetVerse;
  for (const t of q.targets || []) {
    const m = t.match(/^vr:(\d+)/);
    if (m) return Number(m[1]);
  }
  const rawV = s.verse ?? q.verse ?? s.num ?? s.verseNum;
  if (rawV !== undefined && rawV !== null) {
    if (q.type === "BUILD_NEXT_VERSE") return rawV + 1;
    if (q.type === "BUILD_PREV_VERSE") return rawV - 1;
    return rawV;
  }
  for (const t of q.targets || []) {
    const m = t.match(/^(vt|vn|sq):(\d+)/);
    if (m) {
      const v = Number(m[2]);
      if (q.type === "BUILD_NEXT_VERSE") return v + 1;
      if (q.type === "BUILD_PREV_VERSE") return v - 1;
      return v;
    }
  }
  return undefined;
}

/**
 * تقسیم ترجمه فارسی یک آیه به count قطعه متوالی و طبیعی که اتصالشان دقیقاً برابر متن آیه است
 */
function splitFaIntoChunks(faText, desiredCount) {
  const clean = String(faText ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const words = clean.split(" ");
  const count = Math.max(1, Math.min(desiredCount, words.length));
  if (count === 1) return [clean];

  // اگر تعداد قطعات با تقسیم روی ویرگول/نقطه‌ویرگول هم‌خوان است، از آن استفاده کن
  const punctParts = clean
    .split(/(?<=[،؛:.])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (punctParts.length === count) return punctParts;

  // تقسیم متوازن بر اساس تعداد کلمات
  const result = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const remainingWords = words.length - cursor;
    const remainingParts = count - i;
    const take = Math.ceil(remainingWords / remainingParts);
    result.push(words.slice(cursor, cursor + take).join(" "));
    cursor += take;
  }
  return result;
}

/**
 * یافتن بهترین زیررشته واقعی در ترجمه جدید آیه برای جای‌خالی CLOZE_FA
 */
function findBestFaSubstring(faText, oldText, usedRanges) {
  const isOverlapping = (start, end) =>
    usedRanges.some(([uStart, uEnd]) => start < uEnd && end > uStart);

  // ۱) تلاش برای یافتن متن بدون براکت یا کلمات کلیدی آن در متن جدید
  const stripped = stripBrackets(oldText).replace(/[.،؛؟!]+$/g, "").trim();
  const candidates = [];
  if (stripped.length >= 2) candidates.push(stripped);

  const oldWords = stripped.split(/\s+/).filter((w) => w.length >= 3);
  for (let len = Math.min(3, oldWords.length); len >= 1; len--) {
    for (let i = 0; i <= oldWords.length - len; i++) {
      candidates.push(oldWords.slice(i, i + len).join(" "));
    }
  }

  for (const cand of candidates) {
    let searchFrom = 0;
    while (searchFrom < faText.length) {
      const idx = faText.indexOf(cand, searchFrom);
      if (idx === -1) break;
      const end = idx + cand.length;
      if (!isOverlapping(idx, end)) {
        return { start: idx, text: cand };
      }
      searchFrom = idx + 1;
    }
  }

  // ۲) اگر عبارت قبلی در ترجمه جدید با واژگان متفاوتی بازنویسی شده، یک عبارت ۱ تا ۲ کلمه‌ای معنادار غیرهم‌پوشان انتخاب کن
  const tokens = [];
  const regex = /\S+/g;
  let m;
  while ((m = regex.exec(faText)) !== null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }

  const STOP = new Set(["و", "از", "به", "در", "که", "را", "با", "بر", "تا", "آن", "این", "او", "ما", "تو", "برای"]);
  for (const tok of tokens) {
    const bare = tok.text.replace(/[،؛.؟!()]/g, "");
    if (bare.length >= 4 && !STOP.has(bare) && !isOverlapping(tok.start, tok.end)) {
      return { start: tok.start, text: tok.text };
    }
  }
  for (const tok of tokens) {
    if (!isOverlapping(tok.start, tok.end)) {
      return { start: tok.start, text: tok.text };
    }
  }
  return { start: 0, text: tokens[0]?.text ?? faText };
}

const files = (await fs.readdir(MERGED_DIR)).filter((f) => f.endsWith(".json")).sort();
let stats = {
  filesUpdated: 0,
  chunksFixed: 0,
  orderTrFixed: 0,
  clozeFaFixed: 0,
  arFixed: 0,
};

for (const file of files) {
  const filePath = path.join(MERGED_DIR, file);
  const data = JSON.parse(await fs.readFile(filePath, "utf8"));
  let modified = false;

  // 1. Fix chunks.faSegments (FASEGMENTS_JOIN)
  for (const c of data.chunks || []) {
    const v = V.get(c.verse);
    if (!v?.fa || !Array.isArray(c.faSegments)) continue;
    if (norm(c.faSegments.join(" ")) !== norm(v.fa)) {
      c.faSegments = splitFaIntoChunks(v.fa, c.faSegments.length || 2);
      stats.chunksFixed++;
      modified = true;
    }
  }

  // 2. Fix questions
  for (const q of data.questions || []) {
    const n = targetVerseOf(q);
    const verse = V.get(n);

    // 2a. ORDER_TRANSLATION_CHUNKS (TRANSLATION_ORDER_MISMATCH)
    if (q.shape === "order" && q.type === "ORDER_TRANSLATION_CHUNKS" && verse?.fa) {
      const bank = new Map((q.bank || []).map((b) => [b.id, b]));
      const ans = q.answer || [];
      const fullFa = cleanFa(verse.fa);
      const joined = cleanFa(ans.map((a) => norm(bank.get(a)?.fa)).join(" "));
      const match = fullFa.startsWith(joined) || fullFa.includes(joined) || fullFa === joined;
      const allChunksInVerse = ans.every((a) => {
        const b = bank.get(a);
        return b?.fa && fullFa.includes(cleanFa(b.fa));
      });
      if (!match && !allChunksInVerse && ans.length > 0) {
        const newParts = splitFaIntoChunks(verse.fa, ans.length);
        // اگر تعداد کلمات ترجمه کمتر از تعداد آیتم‌های پاسخ باشد، answer را به اندازه قطعات تنظیم می‌کنیم
        if (newParts.length === ans.length) {
          ans.forEach((id, idx) => {
            const b = bank.get(id);
            if (b) b.fa = newParts[idx];
          });
        } else {
          const kept = ans.slice(0, newParts.length);
          kept.forEach((id, idx) => {
            const b = bank.get(id);
            if (b) b.fa = newParts[idx];
          });
          q.answer = kept;
          const keptSet = new Set(kept);
          q.bank = (q.bank || []).filter((b) => keptSet.has(b.id) || b.decoy);
        }
        stats.orderTrFixed++;
        modified = true;
      }
    }

    // 2b. CLOZE_FA (CLOZE_FA_NOT_SUBSTRING)
    if (q.shape === "cloze" && q.type === "CLOZE_FA" && verse?.fa) {
      const fa = verse.fa;
      const hiddenArr = q.stem?.faHidden || [];
      const bank = new Map((q.bank || []).map((b) => [b.id, b]));
      const usedRanges = [];

      // ابتدا بازه‌هایی که همین الان هم درستند را رزرو کن
      for (const h of hiddenArr) {
        if (h.text && fa.includes(h.text)) {
          const idx = fa.indexOf(h.text);
          h.start = idx;
          usedRanges.push([idx, idx + h.text.length]);
        }
      }

      for (let i = 0; i < hiddenArr.length; i++) {
        const h = hiddenArr[i];
        if (h.text && fa.includes(h.text)) continue;

        const oldText = h.text || "";
        const replacement = findBestFaSubstring(fa, oldText, usedRanges);
        usedRanges.push([replacement.start, replacement.start + replacement.text.length]);
        h.start = replacement.start;
        h.text = replacement.text;

        // همگام‌سازی متن آیتم پاسخ در bank
        const ansKey = q.answer?.[String(i)] ?? q.answer?.[String(i + 1)];
        const ansItem = ansKey ? bank.get(ansKey) : (q.bank || []).find((b) => !b.decoy && norm(b.fa) === norm(oldText));
        if (ansItem) {
          ansItem.fa = replacement.text;
        }

        stats.clozeFaFixed++;
        modified = true;
      }
    }

    // 2c. AR_MISMATCH on order/cloze bank items (e.g. verse 84 word 14 Arabic circle cleanup)
    if (verse && Array.isArray(q.bank) && (q.shape === "order" || q.shape === "cloze") && q.type !== "ORDER_VERSES" && q.type !== "ORDER_TRANSLATION_CHUNKS" && q.type !== "CLOZE_FA") {
      const bank = new Map(q.bank.map((b) => [b.id, b]));
      if (q.shape === "order") {
        for (const a of q.answer || []) {
          const b = bank.get(a);
          if (!b || !Array.isArray(b.wordIdx) || b.wordIdx.length === 0 || b.decoy) continue;
          const from = Math.min(...b.wordIdx);
          const to = Math.max(...b.wordIdx);
          const canonical = wordsText(n, from, to);
          if (canonical && b.ar && norm(b.ar) !== norm(canonical)) {
            b.ar = canonical;
            stats.arFixed++;
            modified = true;
          }
        }
      } else if (q.shape === "cloze") {
        for (const [k, bid] of Object.entries(q.answer || {})) {
          const b = bank.get(bid);
          if (!b) continue;
          const idx = b.wordIdx?.length ? b.wordIdx : [Number(k)];
          const from = Math.min(...idx);
          const to = Math.max(...idx);
          const canonical = wordsText(n, from, to);
          if (canonical && b.ar && norm(b.ar) !== norm(canonical)) {
            b.ar = canonical;
            stats.arFixed++;
            modified = true;
          }
        }
      }
    }
  }

  if (modified) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
    stats.filesUpdated++;
  }
}

console.log("✅ Sync completed:", stats);
