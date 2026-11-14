// scripts/fix-content-issues.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UNITS_DIR = path.join(ROOT, "public", "content", "units");
const BASE_PATH = path.join(ROOT, "public", "content", "base", "qasas.base.json");

const base = JSON.parse(await fs.readFile(BASE_PATH, "utf8"));
const verses = Array.isArray(base) ? base : base.verses;
const V = new Map(verses.map((v) => [v.n, v]));

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toAsciiNum(str) {
  return Number(String(str).replace(/[۰-۹]/g, (d) => farsiDigits.indexOf(d)));
}

const norm = (s) => String(s ?? "").normalize("NFC").replace(/ـ/g, "").replace(/\s+/g, " ").trim();

function findVerseForText(arText) {
  if (!arText) return null;
  const clean = norm(arText).split(/[\.…]/)[0].replace(/(\s*\([۰-۹0-9]+\)\s*)+$/g, "").trim();
  if (!clean) return null;
  for (const [n, v] of V.entries()) {
    const full = norm(v.arText);
    if (full.startsWith(clean) || full.includes(clean)) return n;
  }
  return null;
}

function findWordRange(verseNum, phrase) {
  const v = V.get(verseNum);
  if (!v || !phrase) return null;
  const cleanP = norm(phrase).replace(/(\s*[\.…]+\s*|\s*\([۰-۹0-9]+\)\s*)+$/g, "").trim();
  const words = v.words;
  for (let from = 1; from <= words.length; from++) {
    for (let to = from; to <= words.length; to++) {
      const text = words.filter((w) => w.i >= from && w.i <= to).map((w) => w.ar).join(" ");
      if (norm(text) === cleanP) {
        const range = [];
        for (let i = from; i <= to; i++) range.push(i);
        return range;
      }
    }
  }
  return null;
}

async function run() {
  const files = (await fs.readdir(UNITS_DIR)).filter((f) => f.endsWith(".json"));
  let modifiedFiles = 0;

  for (const file of files) {
    const filePath = path.join(UNITS_DIR, file);
    const content = await fs.readFile(filePath, "utf8");
    let data;
    try {
      data = JSON.parse(content);
    } catch {
      continue;
    }

    let modified = false;

    // Fix chunks whitespace issues in faSegments
    for (const c of data.chunks || []) {
      const v = V.get(c.verse);
      if (v?.fa && Array.isArray(c.faSegments)) {
        c.faSegments = c.faSegments.map((s) => s.trim().replace(/\s+/g, " "));
      }
    }

    for (const q of data.questions || []) {
      // 1. Skill normalization
      if (q.skill === "memorization" || q.skill === "verse_recall" || q.skill === "mutashabih") {
        q.skill = "recall";
        modified = true;
      }
      if (q.skill === "verse_number") {
        q.skill = "number";
        modified = true;
      }

      // 2. Type normalization
      if (q.type === "WORD_AR_FA") {
        q.type = "WORD_AR_TO_FA";
        modified = true;
      }

      // 3. Targets normalization
      if (Array.isArray(q.targets)) {
        const origTargets = JSON.stringify(q.targets);
        q.targets = q.targets
          .map((t) => {
            const m = t.match(/^(vr|vt|vn|sq):v28_0*(\d+)$/);
            if (m) return `${m[1]}:${Number(m[2])}`;
            const m2 = t.match(/^(vr|vt|vn|sq):0+(\d+)$/);
            if (m2) return `${m2[1]}:${Number(m2[2])}`;
            return t;
          })
          .filter((t) => t !== "sq:88");
        if (JSON.stringify(q.targets) !== origTargets) modified = true;
      }

      // 4. Distractor tags invalid types
      if (q.distractorTags) {
        for (const [k, tag] of Object.entries(q.distractorTags)) {
          if (tag === "neighbor_phrase") {
            q.distractorTags[k] = "neighbor_word";
            modified = true;
          }
          if (tag === "opposite") {
            q.distractorTags[k] = "false_friend";
            modified = true;
          }
        }
      }

      // 5. Order questions missing bank/answer (placed in stem or options)
      if (q.shape === "order") {
        if (!q.bank && q.stem?.bank) {
          q.bank = q.stem.bank;
          delete q.stem.bank;
          modified = true;
        }
        if (!q.bank && Array.isArray(q.options) && q.options.length > 0) {
          q.bank = q.options;
          delete q.options;
          modified = true;
        }
        if (!q.answer && q.stem?.answer) {
          q.answer = q.stem.answer;
          delete q.stem.answer;
          modified = true;
        }

        // Auto-detect verse numbers for ORDER_VERSES bank items
        if (q.type === "ORDER_VERSES" && Array.isArray(q.bank)) {
          for (const b of q.bank) {
            if (b.verse === undefined && b.num === undefined && b.n === undefined) {
              if (b.ar) {
                const m = b.ar.match(/\(([۰-۹0-9]+)\)/);
                if (m) {
                  b.verse = toAsciiNum(m[1]);
                  modified = true;
                } else {
                  const detected = findVerseForText(b.ar);
                  if (detected) {
                    b.verse = detected;
                    modified = true;
                  }
                }
              }
            }
          }
        }
      }

      // 6. Complete wordIdx for phrase cloze
      if (q.shape === "cloze" && Array.isArray(q.bank) && (q.type === "CLOZE_COMPLETE_REST" || q.type === "CLOZE_AR")) {
        const n = q.stem?.verse ?? q.verse;
        if (n && V.has(n)) {
          for (const b of q.bank) {
            if (b.ar && Array.isArray(b.wordIdx) && b.wordIdx.length === 1 && !b.decoy) {
              const range = findWordRange(n, b.ar);
              if (range && range.length > 1) {
                b.wordIdx = range;
                modified = true;
              }
            }
          }
        }
      }

      // 7. Specific question fixes
      if (q.id === "q_u_p385b_A_1302" && Array.isArray(q.right)) {
        q.right = [
          { id: "r1", ar: "", fa: "آن سرزمین" },
          { id: "r2", ar: "", fa: "و ما می خواستیم" },
          { id: "r3", ar: "", fa: "و آنان را قرار دهیم" },
          { id: "r4", ar: "", fa: "پیشوایان مردم" },
          { id: "r5", ar: "", fa: "گروه گروه ساخت" },
        ];
        modified = true;
      }

      if (q.id === "q_u_p385b_A_1303") {
        q.distractorTags = {
          o2: "neighbor_verse",
          o3: "neighbor_verse",
          o4: "neighbor_verse",
        };
        modified = true;
      }

      if (q.id === "q_u_p387a_C_0064") {
        q.answer = "o2";
        q.distractorTags = {
          o1: "neighbor_verse",
          o3: "neighbor_verse",
          o4: "neighbor_verse",
        };
        modified = true;
      }

      if (q.id === "q_u_p387a_C_0065") {
        q.type = "NUMBER_TO_VERSE_START";
        modified = true;
      }

      if (q.id === "q_u_p389b_C_0701" && Array.isArray(q.answer)) {
        const idx11 = q.answer.indexOf("b11");
        const idx18 = q.answer.indexOf("b18");
        if (idx11 !== -1 && idx18 !== -1 && idx11 < idx18) {
          q.answer[idx11] = "b18";
          q.answer[idx18] = "b11";
          modified = true;
        }
      }

      if (q.id === "q_u_p390b_C_0203" && Array.isArray(q.bank)) {
        const b7 = q.bank.find((b) => b.id === "b7");
        if (b7) {
          b7.wordIdx = [10];
          modified = true;
        }
      }

      if (q.id === "q_u_p392a_C_1802" && Array.isArray(q.answer)) {
        q.answer = q.answer.filter((id) => id !== "b6");
        modified = true;
      }

      if (q.id === "q_u_p394a_B_0162" && q.stem) {
        q.stem.hiddenIdx = [3, 4, 5, 6, 7, 8];
        modified = true;
      }

      if (q.id === "q_u_p394b_C_0110" && Array.isArray(q.options)) {
        for (const opt of q.options) {
          if (opt.ar && opt.ar.includes("ფ")) {
            opt.ar = opt.ar.replace(/ფ/g, "ف");
            modified = true;
          }
        }
      }

      if (q.id === "q_u_p396a_C_0206" && Array.isArray(q.bank)) {
        const b6 = q.bank.find((b) => b.id === "b6");
        if (b6) {
          b6.ar = "جَآءَ بِٱلْهُدَىٰ";
          b6.wordIdx = [13, 14];
          modified = true;
        }
      }

      if ((q.type === "NEXT_VERSE_CHOICE" || q.type === "PREV_VERSE_CHOICE") && Array.isArray(q.options)) {
        for (const opt of q.options) {
          if (opt.ar && (/[\.…]/.test(opt.ar) || /\([۰-۹0-9]+\)/.test(opt.ar))) {
            opt.ar = opt.ar.replace(/(\s*[\.…]+\s*|\s*\([۰-۹0-9]+\)\s*)+$/g, "").trim();
            modified = true;
          }
        }
      }

      if (q.id === "q_u_p393a_B_0286" && Array.isArray(q.bank)) {
        const d = q.bank.find((b) => b.id === "b11");
        if (d) { d.ar = "ٱلْـَٔاخِرَةِ"; modified = true; }
      }
      if (q.id === "q_u_p393b_B_0446" && Array.isArray(q.bank)) {
        const d = q.bank.find((b) => b.id === "b6");
        if (d) { d.ar = "مَن"; modified = true; }
      }
      if (q.id === "q_u_p395b_B_0110" && Array.isArray(q.bank)) {
        const d = q.bank.find((b) => b.id === "d1");
        if (d) { d.ar = "كَلَّا"; modified = true; }
      }
      if (q.id === "q_u_p395b_B_0125" && Array.isArray(q.bank)) {
        const d = q.bank.find((b) => b.id === "d1");
        if (d) { d.ar = "كَأَنَّ"; modified = true; }
      }

      if ((q.id === "q_u_p394a_C_0436" || q.id === "q_u_p394a_C_1228") && Array.isArray(q.bank)) {
        const b4 = q.bank.find((b) => b.id === "b4");
        if (b4 && b4.verse === 62) {
          b4.verse = 74;
          modified = true;
        }
      }

      if (q.id === "q_u_p391a_C_0103" && Array.isArray(q.bank)) {
        const b1 = q.bank.find((b) => b.id === "b1");
        if (b1) {
          b1.ar = "فِىٓ أَهْلِ مَدْيَنَ";
          modified = true;
        }
      }

      if (q.id === "q_u_p391a_C_0106" && Array.isArray(q.bank)) {
        const b1 = q.bank.find((b) => b.id === "b1");
        if (b1) {
          b1.ar = "مَآ أَهْلَكْنَا";
          modified = true;
        }
      }

      if (q.id === "q_u_p388a_C_0757" && Array.isArray(q.bank)) {
        const b3 = q.bank.find((b) => b.id === "b3");
        if (b3 && b3.ar === "أَن يَهْدِيَنِىٓ") {
          b3.ar = "أَن يَهْدِيَنِى";
          modified = true;
        }
      }

      if (q.type === "ORDER_VERSES" && Array.isArray(q.bank)) {
        for (const b of q.bank) {
          if (!b.ar && b.fa) {
            b.ar = b.fa;
            delete b.fa;
            modified = true;
          }
          if (b.verse === undefined) {
            const raw = b.ar || "";
            const m1 = raw.match(/\((?:آیه\s*)?([۰-۹0-9]+)\)/);
            const m2 = raw.match(/^([۰-۹0-9]+)[\.:\s]/);
            const num = m1 ? toAsciiNum(m1[1]) : (m2 ? toAsciiNum(m2[1]) : (b.num ?? b.n));
            if (num) {
              b.verse = num;
              modified = true;
            }
          }
        }
      }

      if (q.id === "q_u_p389a_C_0103" && Array.isArray(q.bank)) {
        const c7 = q.bank.find((b) => b.id === "c7");
        if (c7) {
          c7.ar = "قَالَ لِأَهْلِهِ ٱمْكُثُوٓا۟";
          c7.wordIdx = [12, 13, 14];
        }
        const c6 = q.bank.find((b) => b.id === "c6");
        if (c6) {
          c6.ar = "إِنِّىٓ ءَانَسْتُ نَارًۭا";
          c6.wordIdx = [15, 16, 17];
        }
        const c13 = q.bank.find((b) => b.id === "c13");
        if (c13) {
          c13.ar = "لَعَلَّكُمْ تَهْتَدُونَ";
          c13.wordIdx = [];
        }
        modified = true;
      }

      // Replace English comma with Persian comma
      if (q.shape === "order" && Array.isArray(q.bank)) {
        for (const b of q.bank) {
          if (b.fa && b.fa.includes(",")) {
            b.fa = b.fa.replace(/,/g, "،");
            modified = true;
          }
        }
      }

      // Exact translation for known truncated cases
      const truncatedExact = [
        "q_u_p389b_A_1840",
        "q_u_p389b_A_1841",
        "q_u_p390a_A_1604",
        "q_u_p390a_A_1605",
        "q_u_p392b_C_0270",
      ];
      if (truncatedExact.includes(q.id) && Array.isArray(q.options)) {
        const n = q.stem?.verse ?? q.verse;
        const v = V.get(n);
        const ans = q.options.find((o) => o.id === q.answer);
        if (v?.fa && ans) {
          ans.fa = v.fa;
          modified = true;
        }
      }

      if (q.type === "VERSE_TO_TRANSLATION" && q.shape === "choice" && Array.isArray(q.options)) {
        const n = q.stem?.verse ?? q.verse;
        const v = V.get(n);
        const ans = q.options.find((o) => o.id === q.answer);
        if (v?.fa && ans?.fa) {
          ans.fa = ans.fa.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
          if (ans.fa.includes("ا ز شرّ")) {
            ans.fa = ans.fa.replace("ا ز شرّ", "از شرّ");
            modified = true;
          }
        }
      }
    }

    if (modified) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      modifiedFiles++;
    }
  }

  console.log(`✅ Applied fixes across ${modifiedFiles} source files.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
