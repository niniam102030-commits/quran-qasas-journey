// scripts/generate-stage8-fill.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UNITS_DIR = path.join(ROOT, "public", "content", "units");
const PLAN_PATH = path.join(ROOT, "public", "content", "base", "units-plan.json");
const BASE_PATH = path.join(ROOT, "public", "content", "base", "qasas.base.json");

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(n) {
  return String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);
}

async function main() {
  const plan = JSON.parse(await fs.readFile(PLAN_PATH, "utf8"));
  const base = JSON.parse(await fs.readFile(BASE_PATH, "utf8"));
  const verses = Array.isArray(base) ? base : base.verses;
  const V = new Map(verses.map((v) => [v.n, v]));

  // Shortfall per unit: { unitId: countNeeded }
  const shortfalls = {
    u_p385b: 4,
    u_p387b: 4,
    u_p388b: 6,
    u_p389a: 8,
    u_p389b: 20, // ensure >= 32
    u_p390b: 4,
    u_p391a: 8,
    u_p392a: 12,
    u_p392b: 8,
    u_p393a: 12,
    u_p394a: 14, // ensure >= 32
    u_p394b: 6,
    u_p395a: 8,
    u_p395b: 14, // ensure >= 32
  };

  const opening = (v) => v.words.slice(0, Math.min(5, v.words.length)).map((w) => w.ar).join(" ");

  for (const unit of plan) {
    const needed = shortfalls[unit.id];
    if (!needed) continue;

    const unitVerseNums = unit.verses.map((vid) => Number(vid.slice(4)));
    const questions = [];
    let qIdx = 1;

    for (let i = 0; i < needed; i++) {
      const vNum = unitVerseNums[i % unitVerseNums.length];
      const curV = V.get(vNum);
      const qTypeMod = i % 6;

      // Select answer slot (o1, o2, o3, o4) based on i
      const ansSlot = `o${(i % 4) + 1}`;

      function buildOptions(correctObj, decoyObjs, decoysTag = "neighbor_verse") {
        const rawOpts = [correctObj, ...decoyObjs];
        const opts = [];
        const distractorTags = {};
        let dIdx = 0;
        for (let s = 1; s <= 4; s++) {
          const slotId = `o${s}`;
          if (slotId === ansSlot) {
            opts.push({ id: slotId, ...correctObj });
          } else {
            opts.push({ id: slotId, ...decoyObjs[dIdx++] });
            distractorTags[slotId] = decoysTag;
          }
        }
        return { opts, distractorTags };
      }

      if (qTypeMod === 0) {
        // VERSE_TO_TRANSLATION
        const decoys = [vNum + 2, vNum + 3, vNum + 4]
          .map((n) => (n > 88 ? n - 88 : n))
          .filter((n) => n !== vNum)
          .slice(0, 3)
          .map((n) => V.get(n));

        const { opts, distractorTags } = buildOptions(
          { fa: curV.fa },
          decoys.map((d) => ({ fa: d.fa })),
          "neighbor_verse"
        );

        questions.push({
          id: `q_${unit.id}_C8_fill_${String(qIdx++).padStart(3, "0")}`,
          type: "VERSE_TO_TRANSLATION",
          shape: "choice",
          stage: 8,
          difficulty: 3,
          skill: "translation",
          verse: vNum,
          targets: [`vt:${vNum}`],
          promptFa: `ترجمه استاد انصاریان برای آیه شریفه ${toFarsiNum(vNum)} کدام است؟`,
          stem: {
            verse: vNum,
            ar: curV.arText,
          },
          options: opts,
          answer: ansSlot,
          distractorTags,
          explanationFa: `ترجمه انصاریان برای آیه ${toFarsiNum(vNum)}: «${curV.fa}»`,
        });
      } else if (qTypeMod === 1) {
        // TRANSLATION_TO_VERSE
        const decoys = [vNum + 2, vNum + 3, vNum + 4]
          .map((n) => (n > 88 ? n - 88 : n))
          .filter((n) => n !== vNum)
          .slice(0, 3)
          .map((n) => V.get(n));

        const { opts, distractorTags } = buildOptions(
          { ar: curV.arText },
          decoys.map((d) => ({ ar: d.arText })),
          "neighbor_verse"
        );

        questions.push({
          id: `q_${unit.id}_C8_fill_${String(qIdx++).padStart(3, "0")}`,
          type: "TRANSLATION_TO_VERSE",
          shape: "choice",
          stage: 8,
          difficulty: 4,
          skill: "translation",
          verse: vNum,
          targets: [`vt:${vNum}`],
          promptFa: `این ترجمه استاد انصاریان مربوط به کدام آیه است؟\n«${curV.fa}»`,
          stem: {
            verse: vNum,
            fa: curV.fa,
          },
          options: opts,
          answer: ansSlot,
          distractorTags,
          explanationFa: `متن عربی آیه ${toFarsiNum(vNum)}: «${curV.arText}»`,
        });
      } else if (qTypeMod === 2) {
        // NUMBER_TO_VERSE_START
        const decoys = [vNum + 2, vNum + 3, vNum + 4]
          .map((n) => (n > 88 ? n - 88 : n))
          .filter((n) => n !== vNum)
          .slice(0, 3)
          .map((n) => V.get(n));

        const { opts, distractorTags } = buildOptions(
          { ar: opening(curV) },
          decoys.map((d) => ({ ar: opening(d) })),
          "neighbor_verse"
        );

        questions.push({
          id: `q_${unit.id}_C8_fill_${String(qIdx++).padStart(3, "0")}`,
          type: "NUMBER_TO_VERSE_START",
          shape: "choice",
          stage: 8,
          difficulty: 3,
          skill: "number",
          verse: vNum,
          targets: [`vn:${vNum}`],
          promptFa: `آیه ${toFarsiNum(vNum)} سوره قصص با کدام عبارت آغاز می‌شود؟`,
          stem: {
            num: vNum,
          },
          options: opts,
          answer: ansSlot,
          distractorTags,
          explanationFa: `آغاز آیه ${toFarsiNum(vNum)}: «${opening(curV)}»`,
        });
      } else if (qTypeMod === 3) {
        // VERSE_TO_NUMBER
        const dNums = [vNum + 2, vNum + 3, vNum + 4]
          .map((n) => (n > 88 ? n - 88 : n))
          .filter((n) => n !== vNum)
          .slice(0, 3);

        const { opts, distractorTags } = buildOptions(
          { num: vNum },
          dNums.map((n) => ({ num: n })),
          "adjacent_number"
        );

        questions.push({
          id: `q_${unit.id}_C8_fill_${String(qIdx++).padStart(3, "0")}`,
          type: "VERSE_TO_NUMBER",
          shape: "choice",
          stage: 8,
          difficulty: 4,
          skill: "number",
          verse: vNum,
          targets: [`vn:${vNum}`],
          promptFa: `این آیه شریفه شماره چند سوره قصص است؟\n«${curV.arText}»`,
          stem: {
            verse: vNum,
            ar: curV.arText,
          },
          options: opts,
          answer: ansSlot,
          distractorTags,
          explanationFa: `این آیه شریفه شماره ${toFarsiNum(vNum)} سوره قصص است.`,
        });
      } else if (qTypeMod === 4 && vNum < 88) {
        // NEXT_VERSE_CHOICE
        const nextV = V.get(vNum + 1);
        const decoys = [vNum + 3, vNum + 4, vNum + 5]
          .map((n) => (n > 88 ? n - 88 : n))
          .filter((n) => n !== vNum + 1)
          .slice(0, 3)
          .map((n) => V.get(n));

        const { opts, distractorTags } = buildOptions(
          { ar: opening(nextV) },
          decoys.map((d) => ({ ar: opening(d) })),
          "neighbor_verse"
        );

        questions.push({
          id: `q_${unit.id}_C8_fill_${String(qIdx++).padStart(3, "0")}`,
          type: "NEXT_VERSE_CHOICE",
          shape: "choice",
          stage: 8,
          difficulty: 4,
          skill: "sequence",
          verse: vNum,
          targets: [`sq:${vNum}`, `vr:${vNum + 1}`],
          promptFa: `پس از آیه شریفه ${toFarsiNum(vNum)} کدام آیه قرار دارد؟`,
          stem: {
            verse: vNum,
            ar: opening(curV),
          },
          options: opts,
          answer: ansSlot,
          distractorTags,
          explanationFa: `پس از آیه ${toFarsiNum(vNum)}، آیه ${toFarsiNum(vNum + 1)} با «${opening(nextV)}» آغاز می‌شود.`,
        });
      } else if (vNum > 1) {
        // PREV_VERSE_CHOICE
        const prevV = V.get(vNum - 1);
        const decoys = [vNum + 2, vNum + 3, vNum + 4]
          .map((n) => (n > 88 ? n - 88 : n))
          .filter((n) => n !== vNum - 1)
          .slice(0, 3)
          .map((n) => V.get(n));

        const { opts, distractorTags } = buildOptions(
          { ar: opening(prevV) },
          decoys.map((d) => ({ ar: opening(d) })),
          "neighbor_verse"
        );

        questions.push({
          id: `q_${unit.id}_C8_fill_${String(qIdx++).padStart(3, "0")}`,
          type: "PREV_VERSE_CHOICE",
          shape: "choice",
          stage: 8,
          difficulty: 4,
          skill: "sequence",
          verse: vNum,
          targets: [`sq:${vNum - 1}`, `vr:${vNum - 1}`],
          promptFa: `قبل از آیه شریفه ${toFarsiNum(vNum)} کدام آیه قرار دارد؟`,
          stem: {
            verse: vNum,
            ar: opening(curV),
          },
          options: opts,
          answer: ansSlot,
          distractorTags,
          explanationFa: `قبل از آیه ${toFarsiNum(vNum)}، آیه ${toFarsiNum(vNum - 1)} با «${opening(prevV)}» قرار دارد.`,
        });
      }
    }

    const payload = {
      schema: "qasas.content.v1",
      unitId: unit.id,
      part: "C",
      generatedBy: "antigravity.stage8_fill",
      questions,
    };

    const outPath = path.join(UNITS_DIR, `${unit.id}.partC99.json`);
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  }
  console.log("✅ All stage 8 fill questions generated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
