// scripts/validate-deep.mjs
// اعتبارسنج عمیق (فاز ۲ مشخصات): صحت پاسخ‌ها با داده‌ی پایه، نه فقط ساختار.
//
// اجرا:
//   node scripts/validate-deep.mjs            (ورودی: public/content/merged)
//   node scripts/validate-deep.mjs --units    (ورودی: public/content/units — شامل قطعه‌ها)
//   node scripts/validate-deep.mjs --strict   (با هر خطا کد خروج ۱)
// خروجی: docs/validation-report.md
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE_PATH = path.join(ROOT, "public", "content", "base", "qasas.base.json");
const PLAN_PATH = path.join(ROOT, "public", "content", "base", "units-plan.json");
const REPORT = path.join(ROOT, "docs", "validation-report.md");
const dir = path.join(ROOT, "public", "content", process.argv.includes("--units") ? "units" : "merged");

const TAGS = new Set([
  "false_friend",
  "neighbor_word",
  "neighbor_verse",
  "neighbor_phrase",
  "near_miss",
  "adjacent_number",
  "similar_verse",
  "same_root",
  "random",
]);
const FULL_VERSE_BUILDS = new Set(["BUILD_FROM_NUMBER", "BUILD_NEXT_VERSE", "BUILD_PREV_VERSE"]);
const TARGET_RE = /^(w:w28_\d{3}_\d{3}|(vr|vt|vn|sq):\d{1,2}|pg:u_p\d{3}[ab])$/;

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toAsciiNum(str) {
  return Number(String(str).replace(/[۰-۹]/g, (d) => farsiDigits.indexOf(d)));
}

/** نرمال‌سازی ملایم برای مقایسه‌ی متن عربی (یونیکد NFC، حذف تطویل، علائم وقف و نشانه‌های قرآنی) */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .replace(/[ۖۗۚۛۜ۝۞ۘـ\u200c\u200d\u200e\u200f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const stripBrackets = (s) => norm(s).replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
const cleanFa = (s) => stripBrackets(s).replace(/[,،؛\.\?!؟\(\)]/g, "").replace(/\s+/g, " ").trim();

const base = JSON.parse(await fs.readFile(BASE_PATH, "utf8"));
const verses = Array.isArray(base) ? base : base.verses;
const V = new Map(verses.map((v) => [v.n, v]));
const wordIds = new Set(verses.flatMap((v) => v.words.map((w) => w.id)));
const plan = JSON.parse(await fs.readFile(PLAN_PATH, "utf8"));
const unitById = new Map(plan.map((u) => [u.id, u]));

const wordsText = (n, from, to) => {
  const v = V.get(n);
  if (!v) return "";
  return v.words.filter((w) => w.i >= from && w.i <= to).map((w) => w.ar).join(" ");
};

const errorsByCode = new Map(); // code -> {count, samples[]}
const perUnit = new Map();
const allErrors = [];
function err(file, qid, code, msg) {
  if (!errorsByCode.has(code)) errorsByCode.set(code, { count: 0, samples: [] });
  const e = errorsByCode.get(code);
  e.count++;
  if (e.samples.length < 6) e.samples.push(`${file} :: ${qid} :: ${msg}`);
  perUnit.set(file, (perUnit.get(file) || 0) + 1);
  allErrors.push({ file, qid, code, msg });
}

function targetVerseOf(q) {
  const s = q.stem || {};
  if (s.targetVerse) return s.targetVerse;
  // If targets has vr:X, vr is the verse being recalled/built
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

function checkQuestion(file, q) {
  const id = q.id || "no-id";
  const E = (code, msg) => err(file, id, code, msg);

  // ----- targets -----
  for (const t of q.targets || []) {
    if (!TARGET_RE.test(t)) E("TARGET_FORMAT", t);
    else if (t.startsWith("w:") && !wordIds.has(t.slice(2))) E("TARGET_WORD_UNKNOWN", t);
    else if (/^(vr|vt|vn):/.test(t)) {
      const n = Number(t.split(":")[1]);
      if (n < 1 || n > 88) E("TARGET_RANGE", t);
    } else if (t.startsWith("sq:")) {
      const n = Number(t.split(":")[1]);
      if (n < 1 || n > 87) E("TARGET_SQ_ILLEGAL", t);
    } else if (t.startsWith("pg:") && !unitById.has(t.slice(3))) E("TARGET_UNIT_UNKNOWN", t);
  }
  if (q.type === "PREV_VERSE_CHOICE" || q.type === "BUILD_PREV_VERSE") {
    if ((q.stem?.verse ?? q.verse) === 1) E("PREV_FOR_VERSE1", "آیه‌ی ۱ پیشین ندارد");
  }
  if (q.type === "NEXT_VERSE_CHOICE" || q.type === "BUILD_NEXT_VERSE") {
    if ((q.stem?.verse ?? q.verse) === 88) E("NEXT_FOR_VERSE88", "آیه‌ی ۸۸ بعدی ندارد");
  }

  // ----- choice -----
  if (q.shape === "choice") {
    const opts = q.options || [];
    const ans = opts.find((o) => o.id === q.answer);
    if (!ans) return E("ANSWER_NOT_IN_OPTIONS", q.answer);
    const keyOf = (o) =>
      JSON.stringify([
        o.num ?? null,
        norm(o.ar),
        norm(o.fa),
        o.wordRange ? JSON.stringify(o.wordRange) : null,
        o.words ? o.words.join(",") : null,
        o.wordsAr ? o.wordsAr.join(",") : null,
      ]);
    const seen = new Set();
    for (const o of opts) {
      const k = keyOf(o);
      if (seen.has(k)) E("DUP_OPTION", `${o.id}`);
      seen.add(k);
    }
    for (const o of opts) {
      if (o.id === q.answer) continue;
      const tag = q.distractorTags?.[o.id];
      if (!tag) E("DISTRACTOR_TAG_MISSING", o.id);
      else if (!TAGS.has(tag)) E("DISTRACTOR_TAG_INVALID", `${o.id}:${tag}`);
    }
    if (q.type === "VERSE_TO_NUMBER") {
      const n = targetVerseOf(q) ?? q.stem?.verse ?? q.verse;
      if (typeof ans.num === "number" && ans.num !== n) E("NUMBER_WRONG", `پاسخ ${ans.num}، آیه ${n}`);
      if (q.stem?.ar && norm(q.stem.ar) !== norm(V.get(n)?.arText)) E("AR_MISMATCH", `stem.ar آیه ${n}`);
    }
    if (q.type === "NUMBER_TO_VERSE_START") {
      const n = targetVerseOf(q) ?? q.stem?.num ?? q.stem?.verse ?? q.verse;
      const full = norm(V.get(n)?.arText);
      const cleanAns = norm(ans.ar)
        .split(/[\.…]/)[0]
        .replace(/(\s*[\.…]+\s*|\s*\([۰-۹0-9]+\)\s*)+$/g, "")
        .trim();
      if (cleanAns && !full.startsWith(cleanAns) && !full.includes(cleanAns)) {
        E("OPENING_WRONG", `گزینه‌ی درست ابتدای آیه ${n} نیست`);
      }
      for (const o of opts) {
        if (o.id !== q.answer && o.ar) {
          const t = norm(o.ar)
            .split(/[\.…]/)[0]
            .replace(/(\s*[\.…]+\s*|\s*\([۰-۹0-9]+\)\s*)+$/g, "")
            .trim();
          for (const m of [n]) if (t && norm(V.get(m)?.arText).startsWith(t)) E("DISTRACTOR_IS_CORRECT", `${o.id} ابتدای آیه‌ی هدف است`);
        }
      }
    }
    if (q.type === "NEXT_VERSE_CHOICE" || q.type === "PREV_VERSE_CHOICE") {
      const n = q.stem?.verse ?? q.verse;
      const t = q.type === "NEXT_VERSE_CHOICE" ? n + 1 : n - 1;
      const tv = V.get(t);
      if (tv && ans.ar) {
        const a = norm(ans.ar)
          .replace(/(\s*[\.…]+\s*|\s*\([۰-۹0-9]+\)\s*)+$/g, "")
          .trim();
        const full = norm(tv.arText);
        if (!(full.startsWith(a) || full.endsWith(a) || full.includes(a))) E("NEXT_PREV_WRONG", `گزینه‌ی درست با آیه‌ی ${t} نمی‌خواند`);
      }
    }
    if (q.type === "VERSE_TO_TRANSLATION" || q.type === "TRANSLATION_TO_VERSE") {
      const n = targetVerseOf(q);
      const vFa = norm(V.get(n)?.fa);
      const aFa = norm(ans.fa)
        .replace(/^(\s*[\.…]+\s*)+/, "")
        .replace(/(\s*[\.…]+\s*)+$/, "")
        .trim();
      if (q.type === "VERSE_TO_TRANSLATION" && ans.fa && vFa) {
        const cA = cleanFa(aFa);
        const cV = cleanFa(vFa);
        const match =
          vFa.startsWith(aFa) ||
          vFa.includes(aFa) ||
          cV.startsWith(cA) ||
          cV.includes(cA) ||
          cV === cA;
        if (!match) E("TRANSLATION_NOT_SOURCE", `آیه ${n}`);
      }
    }
  }

  // ----- order -----
  if (q.shape === "order") {
    const bank = new Map((q.bank || []).map((b) => [b.id, b]));
    const ans = q.answer || [];
    if (new Set(ans).size !== ans.length) E("ORDER_DUP_ANSWER", "شناسه‌ی تکراری در answer");
    for (const a of ans) if (!bank.has(a)) E("ORDER_ANSWER_NOT_IN_BANK", a);
    for (const b of q.bank || []) if (b.decoy && ans.includes(b.id)) E("DECOY_IN_ANSWER", b.id);

    if (q.type === "ORDER_VERSES") {
      const getVerseNum = (b) => {
        let v = b?.verse ?? b?.num ?? b?.n;
        if (typeof v === "number") return v;
        const text = b?.ar || b?.fa || "";
        if (text) {
          const m1 = text.match(/\((?:آیه\s*)?([۰-۹0-9]+)\)/);
          if (m1) return toAsciiNum(m1[1]);
          const m2 = text.match(/^([۰-۹0-9]+)[\.:\s]/);
          if (m2) return toAsciiNum(m2[1]);
        }
        return undefined;
      };
      const nums = ans.map((a) => getVerseNum(bank.get(a)));
      if (nums.some((n) => typeof n !== "number")) E("ORDER_VERSES_NO_VERSE", "آیتم بدون verse");
      else {
        for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) E("ORDER_VERSES_SEQ", `${nums.join(",")}`);
        for (const a of ans) {
          const b = bank.get(a);
          const vNum = getVerseNum(b);
          const bRaw = b?.ar || b?.fa;
          if (bRaw && V.get(vNum)) {
            const vFull = norm(V.get(vNum).arText);
            const bText = norm(bRaw)
              .replace(/^[۰-۹0-9]+[\.:\s]+/, "")
              .replace(/(\s*[\.…]+\s*|\s*\([^)]*\)\s*)+$/g, "")
              .trim();
            if (b.wordIdx?.length) {
              const from = Math.min(...b.wordIdx);
              const to = Math.max(...b.wordIdx);
              if (norm(wordsText(vNum, from, to)) !== bText && !vFull.startsWith(bText) && !vFull.includes(bText)) {
                E("AR_MISMATCH", `آیه ${vNum} در بانک`);
              }
            } else if (!vFull.startsWith(bText) && !vFull.includes(bText)) {
              E("AR_MISMATCH", `آیه ${vNum} در بانک`);
            }
          }
        }
      }
      if (q.stage === 7) {
        const u = unitById.get(q.unitId);
        if (u && nums.length < u.verses.length) E("STAGE7_NOT_ALL_VERSES", `${nums.length} از ${u.verses.length}`);
      }
    } else if (q.type === "ORDER_TRANSLATION_CHUNKS") {
      const n = targetVerseOf(q);
      const joined = cleanFa(ans.map((a) => norm(bank.get(a)?.fa)).join(" "));
      if (V.get(n)) {
        const fullFa = cleanFa(V.get(n).fa);
        const match = fullFa.startsWith(joined) || fullFa.includes(joined) || fullFa === joined;
        if (!match) {
          const allChunksInVerse = ans.every((a) => {
            const b = bank.get(a);
            return b?.fa && fullFa.includes(cleanFa(b.fa));
          });
          if (!allChunksInVerse) E("TRANSLATION_ORDER_MISMATCH", `آیه ${n}`);
        }
      }
    } else if (Array.isArray(q.bank) && q.bank.length > 0 && q.bank.some((b) => Array.isArray(b.wordIdx) && b.wordIdx.length > 0)) {
      const n = targetVerseOf(q);
      const verse = V.get(n);
      if (!verse) return E("VERSE_UNKNOWN", `آیه ${n}`);
      const flat = ans.flatMap((a) => bank.get(a)?.wordIdx || []);
      if (q.type !== "BUILD_FROM_TRANSLATION") {
        let ok = flat.length > 0;
        for (let i = 1; i < flat.length; i++) if (flat[i] !== flat[i - 1] + 1) ok = false;
        if (!ok) E("ORDER_WORDIDX_NOT_CONSECUTIVE", `${flat.join(",")}`);
      }
      if (q.stage === 7 && FULL_VERSE_BUILDS.has(q.type) && !(flat[0] === 1 && flat[flat.length - 1] === verse.words.length)) {
        E("BUILD_NOT_FULL_VERSE", `${flat[0]}..${flat[flat.length - 1]} از ${verse.words.length}`);
      }
      for (const a of ans) {
        const b = bank.get(a);
        if (!b || !Array.isArray(b.wordIdx) || b.wordIdx.length === 0 || b.decoy) continue;
        const from = Math.min(...b.wordIdx);
        const to = Math.max(...b.wordIdx);
        if (b.ar && norm(b.ar) !== norm(wordsText(n, from, to))) E("AR_MISMATCH", `${b.id} (${from}-${to}) آیه ${n}`);
      }
    }
  }

  // ----- cloze -----
  if (q.shape === "cloze") {
    const bank = new Map((q.bank || []).map((b) => [b.id, b]));
    if (q.type === "CLOZE_FA") {
      const n = targetVerseOf(q);
      const fa = V.get(n)?.fa || "";
      for (const h of q.stem?.faHidden || []) {
        if (!fa.includes(h.text)) E("CLOZE_FA_NOT_SUBSTRING", h.text);
      }
    } else {
      const n = targetVerseOf(q);
      const verse = V.get(n);
      if (!verse) return E("VERSE_UNKNOWN", `آیه ${n}`);
      const hidden = (q.stem?.hiddenIdx || []).map(Number).sort((a, b) => a - b);
      const covered = Object.entries(q.answer || {})
        .flatMap(([k, bid]) => {
          const b = bank.get(bid);
          return b?.wordIdx?.length ? b.wordIdx : [Number(k)];
        })
        .sort((a, b) => a - b);

      if (hidden.length > 0 && covered.length > 0 && hidden.join() !== covered.join()) {
        const keys = Object.keys(q.answer || {}).map(Number).sort((a, b) => a - b);
        if (hidden.join() !== keys.join()) {
          E("CLOZE_KEYS_MISMATCH", `hidden=${hidden} answer=${covered}`);
        }
      }
      for (const [k, bid] of Object.entries(q.answer || {})) {
        const b = bank.get(bid);
        if (!b) continue;
        const idx = b.wordIdx || [Number(k)];
        if (!idx.includes(Number(k))) E("CLOZE_WORDIDX_WRONG", `gap ${k} ← ${bid} با wordIdx ${idx}`);
        const from = Math.min(...idx);
        const to = Math.max(...idx);
        const text = norm(wordsText(n, from, to));
        if (b.ar && norm(b.ar) !== text) {
          // Check if phrase extends from 'from'
          let matched = false;
          for (let end = from; end <= verse.words.length; end++) {
            if (norm(wordsText(n, from, end)) === norm(b.ar)) {
              matched = true;
              break;
            }
          }
          if (!matched) E("AR_MISMATCH", `gap ${k} آیه ${n}`);
        }
        if (Number(k) < 1 || to > verse.words.length) E("CLOZE_OUT_OF_RANGE", `${k}`);
      }
      if (q.type === "CLOZE_COMPLETE_REST") {
        const given = q.stem?.givenCount;
        if (typeof given === "number" && given >= verse.words.length) E("CLOZE_REST_GIVEN_TOO_BIG", `${given}`);
      }
      const answerTexts = new Set(Object.values(q.answer || {}).map((bid) => norm(bank.get(bid)?.ar)));
      for (const b of q.bank || []) if (b.decoy && answerTexts.has(norm(b.ar))) E("DECOY_EQUALS_ANSWER", b.id);
    }
  }

  // ----- match -----
  if (q.shape === "match") {
    const lefts = new Set(), rights = new Set();
    for (const [l, r] of q.pairs || []) {
      if (lefts.has(l)) E("MATCH_LEFT_REUSED", l);
      if (rights.has(r)) E("MATCH_RIGHT_REUSED", r);
      lefts.add(l);
      rights.add(r);
    }
    if ((q.pairs || []).length < 2) E("MATCH_TOO_FEW_PAIRS", `${(q.pairs || []).length}`);
    if (q.type === "MATCH_NUMBER_OPENING") {
      const leftMap = new Map((q.left || []).map((l) => [l.id, l]));
      const rightMap = new Map((q.right || []).map((r) => [r.id, r]));
      for (const [l, r] of q.pairs || []) {
        const n = leftMap.get(l)?.num ?? leftMap.get(l)?.n;
        const txt = norm(rightMap.get(r)?.ar)
          .replace(/(\s*[\.…]+\s*|\s*\([۰-۹0-9]+\)\s*)+$/g, "")
          .trim();
        if (n && txt) {
          const full = norm(V.get(n)?.arText);
          if (!full.includes(txt) && !full.startsWith(txt) && !full.endsWith(txt)) {
            E("MATCH_OPENING_WRONG", `آیه ${n}`);
          }
        }
      }
    }
  }
}

async function main() {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const statsByFile = [];
  const idsGlobal = new Map();
  let total = 0;
  for (const f of files) {
    const data = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
    const unitId = data.unitId;
    const before = perUnit.get(f) || 0;
    // chunks / faSegments
    for (const c of data.chunks || []) {
      const fa = V.get(c.verse)?.fa;
      if (fa !== undefined && norm((c.faSegments || []).join(" ")) !== norm(fa)) {
        err(f, `chunks:${c.verse}`, "FASEGMENTS_JOIN", `آیه ${c.verse}`);
      }
      const coveredWords = new Set();
      for (const ch of c.chunks || []) {
        for (let w = ch.from; w <= ch.to; w++) {
          coveredWords.add(w);
        }
      }
      const n = V.get(c.verse)?.words.length;
      if (n && coveredWords.size !== n) {
        err(f, `chunks:${c.verse}`, "CHUNK_INCOMPLETE", `پوشش ${coveredWords.size} از ${n}`);
      }
    }
    for (const q of data.questions || []) {
      total++;
      q.unitId = q.unitId || unitId;
      if (idsGlobal.has(q.id)) err(f, q.id, "ID_DUP_GLOBAL", `در ${idsGlobal.get(q.id)} هم هست`);
      idsGlobal.set(q.id, f);
      checkQuestion(f, q);
    }
    statsByFile.push([f, (data.questions || []).length, (perUnit.get(f) || 0) - before]);
  }

  const lines = ["# گزارش اعتبارسنجی عمیق", "", `ورودی: \`${path.relative(ROOT, dir)}\` — ${files.length} فایل، ${total} سوال`, ""];
  const totalErrors = [...errorsByCode.values()].reduce((a, b) => a + b.count, 0);
  lines.push(`**مجموع خطا: ${totalErrors}**`, "", "## خطا به تفکیک نوع", "", "| کد | تعداد | نمونه‌ها |", "|---|---|---|");
  for (const [code, e] of [...errorsByCode.entries()].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${code} | ${e.count} | ${e.samples.map((s) => s.replace(/\|/g, "/")).join("<br>")} |`);
  }
  lines.push("", "## خطا به تفکیک فایل", "", "| فایل | سوال | خطا |", "|---|---|---|");
  for (const [f, n, e] of statsByFile.filter((x) => x[2] > 0)) lines.push(`| ${f} | ${n} | ${e} |`);
  if (allErrors.length > 0) {
    lines.push("", "## فهرست کامل خطاها", "", "| فایل | سوال | کد | پیام |", "|---|---|---|---|");
    for (const er of allErrors) {
      lines.push(`| ${er.file} | ${er.qid} | ${er.code} | ${er.msg.replace(/\|/g, "/")} |`);
    }
  }
  await fs.writeFile(REPORT, lines.join("\n"), "utf8");

  console.log(`${totalErrors === 0 ? "✅" : "❌"} ${total} سوال بررسی شد؛ ${totalErrors} خطا. گزارش: docs/validation-report.md`);
  if (totalErrors && process.argv.includes("--strict")) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
