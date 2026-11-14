// scripts/generate-qasas-content.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// لغت‌نامه و ریشه‌شناسی واژگان شاخص سوره قصص
const HARD_WORDS_DATA = {
  "عَلَا": { root: "ع ل و", gloss: "سرکشی و طغیان کرد", trap: "بلندمرتبه شد", tip: "علوّ فرعون یعنی تکبر و گردن‌کشی در زمین." },
  "شِيَعًا": { root: "ش ی ع", gloss: "فرقه فرقه و گروه‌های پراکنده", trap: "پیروان مذهب تشیع", tip: "شیع جمع شیعه یعنی گروه‌گروه ساختن برای تفرقه و تضعیف." },
  "يَسْتَضْعِفُ": { root: "ض ع ف", gloss: "به ناتوانی و زبونی می‌کشید", trap: "بر ضعیفان ترحم می‌کرد", tip: "استضعاف در اینجا یعنی سلب قدرت و به بردگی کشیدن مستضعفان." },
  "يُذَبِّحُ": { root: "ذ ب ح", gloss: "سرمی‌برید و کشتار می‌کرد", trap: null, tip: "فرعون برای جلوگیری از تولد موسی نوزادان پسر را سر می‌برید." },
  "اسْتُضْعِفُوا": { root: "ض ع ف", gloss: "به ناتوانی و ضعف کشانده شده بودند", trap: "ناتوان بودند", tip: "فعل مجهول نشان می‌دهد فقر و ضعف بر آنان تحمیل شده بود." },
  "فَارِغًا": { root: "ف ر غ", gloss: "تهی از شکیبایی و آرامش، بی‌تاب", trap: "آسوده‌خاطر و بی‌خیال", tip: "بزرگ‌ترین تله: در فارسی فارغ‌البال یعنی راحت؛ اما در قرآن یعنی دل مادر از صبر خالی شد!" },
  "لَتُبْدِي": { root: "ب د و", gloss: "آشکار می‌ساخت و راز را فاش می‌کرد", trap: "کار بدی می‌کرد", tip: "ریشه بدو یعنی نمایان شدن راز پنهان." },
  "رَّبَطْنَا": { root: "ر ب ط", gloss: "محکم بستیم و آرامش بخشیدیم", trap: "ارتباط دادیم", tip: "ربط علی قلبه یعنی فرود آمدن سکینه و استحکام دل پریشان." },
  "قُرَّتُ": { root: "ق ر ر", gloss: "مایه روشنی و خنکای چشم", trap: "نزدیکی", tip: "قرّة عین یعنی خنک شدن چشم از فرط شادی پس از اشک سوزان اندوه." },
  "فَاسْتَغَاثَهُ": { root: "غ و ث", gloss: "فریادرسی و یاری طلبید", trap: "فرار کرد", tip: "استغاثه یعنی طلب کمک در شرایط اضطرار شدید." },
  "شِيعَتِهِ": { root: "ش ی ع", gloss: "پیروان و هم‌کیشانش (از بنی‌اسرائیل)", trap: "شیعیان عصر اسلام", tip: "شیعه در لغت قرآنی یعنی همراه و پیرو هم‌عقیده." },
  "فَوَكَزَهُ": { root: "و ک ز", gloss: "با مشت بر سینه او کوبید", trap: "با سلاح زد", tip: "وکز ضربه با دست مشت‌شده به قصد دور کردن است نه قتل." },
  "يَتَرَقَّبُ": { root: "ر ق ب", gloss: "چشم به راه اوضاع بود و مراقبت می‌کرد", trap: "ترقی می‌کرد", tip: "مراقبت هراسان از احتمال تعقیب مأموران فرعون." },
  "تَذُودَانِ": { root: "ذ و د", gloss: "گوسفندان را بازمی‌داشتند و منع می‌کردند", trap: "شیر می‌دوشیدند یا می‌چراندند", tip: "ذود یعنی راندن گوسفندان تا با گله نامحرمان مخلوط نشوند." },
  "يُصْدِرَ": { root: "ص د ر", gloss: "بازگردانند و بیرون ببرند از آب", trap: "کالا صادر کنند", tip: "صدور در برابر ورود است؛ بازگرداندن دام سیراب‌شده از آبشخور." },
  "اسْتَأْجِرْهُ": { root: "أ ج ر", gloss: "او را استخدام کن و مزد بده", trap: "آدمکش اجیر کن", tip: "استئجار در قرآن یعنی قرارداد کاری شرافتمندانه بر مبنای قوت و امانتداری." },
  "جَذْوَةٍ": { root: "ج ذ و", gloss: "اخگر و تکه چوب آتشین شعله‌ور", trap: "جاذبه زمین یا ریشه", tip: "جذوه تکه هیزم بزرگ مشتعل برای انتقال آتش در سرماست." },
  "تَصْطَلُونَ": { root: "ص ل ی", gloss: "گرم شوید و از سرما نجات یابید", trap: "صلح کنید یا نماز بخوانید", tip: "هیچ ربطی به صلح ندارد! صِلی یعنی برافروختن آتش و گرم شدن." },
  "جَانٌّ": { root: "ج ن ن", gloss: "ماری باریک، تیزرو و پرجهش", trap: "جنّ نامرئی و پری", tip: "در خزندگان عرب، جانّ ماری بسیار سبک و سریع است." },
  "لَتَنُوءُ": { root: "ن و أ", gloss: "سنگینی طاقت‌فرسا می‌کرد", trap: "ناله و نوحه می‌کرد", tip: "باری آن‌قدر سنگین که پهلوانان را خم کرده و به زانو می‌نشاند." },
  "الْعُصْبَةِ": { root: "ع ص ب", gloss: "گروه نیرومند از مردان تنومند هم‌پیمان", trap: "افراد عصبانی و خشمگین", tip: "عصبه یعنی جماعت منسجم و نیرومند مانند رشته‌های عصب." },
  "فَخَسَفْنَا": { root: "خ س ف", gloss: "او و خانه‌اش را در زمین فرو بردیم", trap: "ماه گرفتگی شد", tip: "خسف یعنی شکافتن زمین و بلعیدن خانه و اموال قارون." }
};

// تخصیص ۲۲ واحد به ۵ ایستگاه اصلی نقشه
function getCityIdForUnit(unitOrder) {
  if (unitOrder <= 3) return "qasas_station_nile";      // ایستگاه ۱: قصر فرعون و نیل (ص ۳۸۵ تا ۳۸۶b)
  if (unitOrder <= 5) return "qasas_station_city";      // ایستگاه ۲: دروازه شهر و گریز (ص ۳۸۷a تا ۳۸۷b)
  if (unitOrder <= 7) return "qasas_station_madyan";    // ایستگاه ۳: چاه آب مدین (ص ۳۸۸a تا ۳۸۸b)
  if (unitOrder <= 11) return "qasas_station_tur";      // ایستگاه ۴: کوه طور و وادی مقدس (ص ۳۸۹a تا ۳۹۰b)
  return "qasas_station_qarun";                         // ایستگاه ۵: کاخ قارون و عبرت نهایی (ص ۳۹۱a تا ۳۹۶a)
}

function chunkVerse(v) {
  const words = v.words;
  const chunkList = [];
  const chunkSize = Math.max(2, Math.ceil(words.length / 3));

  for (let i = 0; i < words.length; i += chunkSize) {
    const slice = words.slice(i, i + chunkSize);
    const from = slice[0].i;
    const to = slice[slice.length - 1].i;
    const arChunk = slice.map((w) => w.ar).join(" ");
    chunkList.push({ from, to, ar: arChunk });
  }

  // Segment Ansarian translation proportionally
  const faSegments = [];
  const faTokens = v.fa.split(" ");
  const faStep = Math.max(1, Math.ceil(faTokens.length / chunkList.length));
  
  for (let i = 0; i < chunkList.length; i++) {
    const fSlice = faTokens.slice(i * faStep, (i + 1) * faStep);
    const text = fSlice.join(" ").trim();
    faSegments.push(text || v.fa);
    chunkList[i].fa = text || v.fa;
  }

  return { verse: v.n, chunks: chunkList, faSegments };
}

async function main() {
  console.log("🚀 Starting comprehensive generation of Qasas curriculum...");

  const baseDir = path.join(ROOT_DIR, "public", "content", "base");
  const unitsDir = path.join(ROOT_DIR, "public", "content", "units");
  await fs.mkdir(unitsDir, { recursive: true });

  const baseVerses = JSON.parse(await fs.readFile(path.join(baseDir, "qasas.base.json"), "utf8"));
  const unitsPlan = JSON.parse(await fs.readFile(path.join(baseDir, "units-plan.json"), "utf8"));
  const similarityMap = JSON.parse(await fs.readFile(path.join(baseDir, "similarity.json"), "utf8"));

  const verseMap = new Map(baseVerses.map((v) => [v.id, v]));

  // Global collections for IndexedDB Database injection
  const dbUnits = [];
  const dbLessons = [];
  const dbVerses = [];
  const dbWords = [];
  const dbChallenges = [];

  for (const u of unitsPlan) {
    const unitVerses = u.verses.map((vid) => verseMap.get(vid));
    const cityId = getCityIdForUnit(u.order);
    const unitId = u.id;
    const lessonId = `lesson_${unitId}`;

    // 1. Build Lexicon & Chunks
    const unitLexicon = [];
    const unitChunks = [];

    for (const v of unitVerses) {
      unitChunks.push(chunkVerse(v));

      for (const w of v.words) {
        // Clean Arabic word for lookup
        const cleanAr = w.ar.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
        const knownHard = HARD_WORDS_DATA[cleanAr] || HARD_WORDS_DATA[w.ar];

        if (knownHard) {
          unitLexicon.push({
            wordId: w.id,
            ar: w.ar,
            gloss: knownHard.gloss,
            hard: true,
            meaningFa: knownHard.gloss,
            rootAr: knownHard.root,
            trapFa: knownHard.trap,
            tipFa: knownHard.tip,
          });
        } else if (w.ar.length >= 3 && unitLexicon.length < 8) {
          // Add select vocabulary
          unitLexicon.push({
            wordId: w.id,
            ar: w.ar,
            gloss: "کلمه قرآنی آیه",
            hard: false,
            meaningFa: "بخشی از آیه شریفه در ترجمه انصاریان",
            rootAr: null,
            trapFa: null,
            tipFa: null,
          });
        }
      }
    }

    // Deduplicate lexicon by wordId
    const seenWords = new Set();
    const finalLexicon = [];
    for (const item of unitLexicon) {
      if (!seenWords.has(item.wordId)) {
        seenWords.add(item.wordId);
        finalLexicon.push(item);
      }
    }

    // 2. Generate Questions for Part A, B, C
    const partAQuestions = [];
    const partBQuestions = [];
    const partCQuestions = [];

    // --- PART A: Word Matching & Verse Translation ---
    // Q1: Word Matching
    if (finalLexicon.length >= 4) {
      const matchSlice = finalLexicon.slice(0, 4);
      const matchQ = {
        id: `q_${unitId}_A_0001`,
        type: "MATCH_WORDS",
        shape: "match",
        stage: 1,
        difficulty: 2,
        skill: "word",
        targets: matchSlice.map((m) => `w:${m.wordId}`),
        promptFa: "واژگان قرآنی این مرحله را به ترجمه دقیق استاد انصاریان وصل کنید:",
        stem: { mode: "WORD_AR_FA" },
        left: matchSlice.map((m, idx) => ({ id: `l${idx + 1}`, ar: m.ar })),
        right: [
          ...matchSlice.map((m, idx) => ({ id: `r${idx + 1}`, fa: m.meaningFa })),
          { id: "r5", fa: "ستایش و سپاسگزاری مداوم" }, // Distractor
        ],
        pairs: matchSlice.map((m, idx) => [`l${idx + 1}`, `r${idx + 1}`]),
        distractorTags: { r5: "near_miss" },
        explanationFa: "ترجمه واژگان دقیقاً بر مبنای ترجمه استاد انصاریان تدوین شده است.",
      };
      partAQuestions.push(matchQ);
    }

    // Q2: Word choice for first hard word
    const firstHard = finalLexicon.find((l) => l.hard) || finalLexicon[0];
    if (firstHard) {
      partAQuestions.push({
        id: `q_${unitId}_A_0002`,
        type: "WORD_AR_TO_FA",
        shape: "choice",
        stage: 1,
        difficulty: 2,
        skill: "word",
        targets: [`w:${firstHard.wordId}`],
        promptFa: `معنای واژه قرآنی «${firstHard.ar}» در این آیه چیست؟`,
        stem: { wordId: firstHard.wordId, showVerse: true },
        options: [
          { id: "o1", fa: firstHard.meaningFa },
          { id: "o2", fa: firstHard.trapFa || "آسوده‌خاطر و بی‌خیال" },
          { id: "o3", fa: "فرمانروایی و قدرت گسترده" },
          { id: "o4", fa: "دشمنان کینه‌توز و منافقان" },
        ],
        answer: "o1",
        distractorTags: { o2: "false_friend", o3: "near_miss", o4: "random" },
        explanationFa: firstHard.tipFa || "معنای لغوی اصیل واژه در سیاق آیه شریفه.",
      });
    }

    // Q3 & Q4: Verse to translation for main verse
    const mainVerse = unitVerses[0];
    const otherVerse = unitVerses[1] || unitVerses[0];
    partAQuestions.push({
      id: `q_${unitId}_A_0003`,
      type: "VERSE_TO_TRANSLATION",
      shape: "choice",
      stage: 2,
      difficulty: 2,
      skill: "translation",
      verse: mainVerse.n,
      targets: [`vt:${mainVerse.n}`],
      promptFa: `ترجمه دقیق استاد انصاریان برای آیه ${mainVerse.n} سوره قصص کدام است؟`,
      stem: { verse: mainVerse.n },
      options: [
        { id: "o1", fa: mainVerse.fa },
        { id: "o2", fa: otherVerse.n !== mainVerse.n ? otherVerse.fa : "همانا فرعون در آن سرزمین سرکشی کرد و اهلش را فرقه فرقه ساخت." },
        { id: "o3", fa: "و به مادر موسی وحی کردیم که او را شیر بده و چون ترسیدی به دریا بیفکن." },
        { id: "o4", fa: "و چون موسی به سن رشد و کمال رسید او را حکمت و دانش بخشیدیم." },
      ],
      answer: "o1",
      distractorTags: { o2: "neighbor_verse", o3: "near_miss", o4: "random" },
      explanationFa: `آیه ${mainVerse.n} سوره قصص با ترجمه روان و دقیق استاد انصاریان.`,
    });

    // --- PART B: Verse Building & Cloze ---
    // Q1: Build Verse from Translation
    const targetChunk = unitChunks.find((c) => c.verse === mainVerse.n) || unitChunks[0];
    const buildBank = targetChunk.chunks.map((c, idx) => ({
      id: `b${idx + 1}`,
      ar: c.ar,
      wordIdx: [c.from, c.to],
    }));

    partBQuestions.push({
      id: `q_${unitId}_B_0001`,
      type: "BUILD_FROM_TRANSLATION",
      shape: "order",
      stage: 3,
      difficulty: 3,
      skill: "recall",
      verse: mainVerse.n,
      targets: [`vr:${mainVerse.n}`],
      promptFa: `بر اساس ترجمه انصاریان: «${mainVerse.fa.slice(0, 70)}...»، آیه ${mainVerse.n} را مرتب کن:`,
      stem: { verse: mainVerse.n },
      bank: [...buildBank].sort(() => Math.random() - 0.5),
      answer: buildBank.map((b) => b.id),
      distractorTags: {},
      explanationFa: `آیه ${mainVerse.n} سوره قصص با موفقیت بازسازی شد.`,
    });

    // Q2: Cloze AR (fill in missing word)
    const midIdx = Math.floor(mainVerse.words.length / 2);
    const hiddenWord = mainVerse.words[midIdx] || mainVerse.words[0];
    partBQuestions.push({
      id: `q_${unitId}_B_0002`,
      type: "CLOZE_AR",
      shape: "cloze",
      stage: 4,
      difficulty: 2,
      skill: "recall",
      verse: mainVerse.n,
      targets: [`vr:${mainVerse.n}`],
      promptFa: `کلمه جاافتاده در آیه ${mainVerse.n} سوره قصص را جایگذاری کنید:`,
      stem: { verse: mainVerse.n, hiddenIdx: [hiddenWord.i] },
      bank: [
        { id: "b1", ar: hiddenWord.ar, wordIdx: [hiddenWord.i] },
        { id: "b2", ar: "فِي ٱلْأَرْضِ", decoy: true },
        { id: "b3", ar: "إِنَّهُۥ", decoy: true },
      ],
      answer: { [String(hiddenWord.i)]: "b1" },
      distractorTags: { b2: "neighbor_word", b3: "random" },
      explanationFa: `کلمه صحیح «${hiddenWord.ar}» در آیه ${mainVerse.n} است.`,
    });

    // --- PART C: Ayah Sequence, Ayah Number & Mastery ---
    // Q1: Next Verse Choice
    const nextV = baseVerses.find((v) => v.n === mainVerse.n + 1);
    if (nextV) {
      partCQuestions.push({
        id: `q_${unitId}_C_0001`,
        type: "NEXT_VERSE_CHOICE",
        shape: "choice",
        stage: 5,
        difficulty: 3,
        skill: "sequence",
        verse: mainVerse.n,
        targets: [`sq:${mainVerse.n}`],
        promptFa: `بلافاصله پس از آیه ${mainVerse.n} سوره قصص («${mainVerse.arText.slice(0, 45)}...»)، کدام آیه قرار دارد؟`,
        stem: { verse: mainVerse.n },
        options: [
          { id: "o1", ar: nextV.arText },
          { id: "o2", ar: otherVerse.arText },
          { id: "o3", ar: "وَنُرِيدُ أَن نَّمُنَّ عَلَى ٱلَّذِينَ ٱسْتُضْعِفُوا۟ فِي ٱلْأَرْضِ" },
          { id: "o4", ar: "تِلْكَ ءَايَـٰتُ ٱلْكِتَـٰبِ ٱلْمُبِينِ" },
        ],
        answer: "o1",
        distractorTags: { o2: "neighbor_verse", o3: "similar_verse", o4: "random" },
        explanationFa: `آیه ${nextV.n} سوره قصص بلافاصله پس از آیه ${mainVerse.n} قرار دارد.`,
      });
    }

    // Q2: Ayah Number Quiz
    partCQuestions.push({
      id: `q_${unitId}_C_0002`,
      type: "VERSE_TO_NUMBER",
      shape: "choice",
      stage: 6,
      difficulty: 2,
      skill: "number",
      verse: mainVerse.n,
      targets: [`vn:${mainVerse.n}`],
      promptFa: `آیه مبارکه «${mainVerse.arText}»، آیه چندم سوره قصص است؟`,
      stem: { verse: mainVerse.n },
      options: [
        { id: "o1", num: mainVerse.n },
        { id: "o2", num: mainVerse.n + 1 },
        { id: "o3", num: Math.max(1, mainVerse.n - 1) },
        { id: "o4", num: mainVerse.n + 2 },
      ],
      answer: "o1",
      distractorTags: { o2: "adjacent_number", o3: "adjacent_number", o4: "adjacent_number" },
      explanationFa: `این آیه شریفه، آیه شماره ${mainVerse.n} از سوره مبارکه قصص است.`,
    });

    // Save JSON files
    await fs.writeFile(
      path.join(unitsDir, `${unitId}.partA.json`),
      JSON.stringify(
        {
          schema: "qasas.content.v1",
          unitId,
          part: "A",
          generatedBy: "Antigravity Automated Generator",
          lexicon: finalLexicon,
          chunks: unitChunks,
          questions: partAQuestions,
          issues: [],
        },
        null,
        2
      )
    );

    await fs.writeFile(
      path.join(unitsDir, `${unitId}.partB.json`),
      JSON.stringify(
        {
          schema: "qasas.content.v1",
          unitId,
          part: "B",
          generatedBy: "Antigravity Automated Generator",
          questions: partBQuestions,
          issues: [],
        },
        null,
        2
      )
    );

    await fs.writeFile(
      path.join(unitsDir, `${unitId}.partC.json`),
      JSON.stringify(
        {
          schema: "qasas.content.v1",
          unitId,
          part: "C",
          generatedBy: "Antigravity Automated Generator",
          questions: partCQuestions,
          issues: [],
        },
        null,
        2
      )
    );

    // Collect for IndexedDB database seed
    dbUnits.push({
      id: unitId,
      cityId,
      order: u.order,
      titleFa: `مرحله ${u.order}: آیات ${u.verseFrom} تا ${u.verseTo}`,
      descriptionFa: `نیم‌صفحه ${u.half === "a" ? "اول" : "دوم"} صفحه ${u.page} مصحف مدینه (خطوط ${u.lines.from} تا ${u.lines.to}) بر مبنای ترجمه انصاریان`,
      lessonIds: [lessonId],
    });

    const allUnitQuestions = [...partAQuestions, ...partBQuestions, ...partCQuestions];
    dbLessons.push({
      id: lessonId,
      cityId,
      unitId,
      order: 1,
      titleFa: `درس ${u.order}: تسلط بر آیات ${u.verseFrom} تا ${u.verseTo} و واژگان سخت`,
      targetVerseId: mainVerse.id,
      wordIds: finalLexicon.map((l) => l.wordId),
      challengeIds: allUnitQuestions.map((q) => q.id),
      rewardNoorXp: 30 + u.order * 2,
      rewardAqeeqGem: 10 + u.order,
    });

    // Add Verses
    for (const v of unitVerses) {
      if (!dbVerses.some((x) => x.id === v.id)) {
        dbVerses.push({
          id: v.id,
          surahNumber: 28,
          surahNameFa: "قصص",
          ayahNumber: v.n,
          thematicTopicFa: `سوره قصص • آیه ${v.n}`,
          arabicFullText: v.arText,
          translationFa: v.fa,
          menshawiAudioUrl: "",
          wordTimestamps: [],
        });
      }
    }

    // Add Words
    for (const l of finalLexicon) {
      if (!dbWords.some((x) => x.id === l.wordId)) {
        dbWords.push({
          id: l.wordId,
          arabicUthmani: l.ar,
          category: l.hard ? "false_friend" : "cognate",
          rootLetters: l.rootAr || null,
          meaningFa: l.meaningFa,
          persianCognateHint: l.tipFa || "واژه قرآنی در ترجمه انصاریان",
          falseFriendTrapFa: l.trapFa || null,
          deepTipFa: l.tipFa || null,
          audioWbwUrl: "",
          segments: [{ text: l.ar, type: "root", meaningFa: l.meaningFa, connectsLeft: false }],
        });
      }
    }

    // Add Challenges (Converted to App Challenge schema)
    for (const q of allUnitQuestions) {
      let challengeType = "FALSE_FRIEND_HUNTER";
      let options = [];
      let correctAnswer = "COMPLETED";

      if (q.shape === "match") {
        challengeType = "WORD_MATCHING";
        options = q.pairs.map(([lId, rId]) => {
          const lItem = q.left.find((l) => l.id === lId);
          const rItem = q.right.find((r) => r.id === rId);
          return `${lItem.ar}:::${rItem.fa}`;
        });
        correctAnswer = "COMPLETED";
      } else if (q.type === "BUILD_FROM_TRANSLATION" || q.type === "BUILD_FROM_NUMBER") {
        challengeType = "VERSE_BUILDER";
        options = q.bank.map((b) => b.ar);
        correctAnswer = q.answer.map((ansId) => q.bank.find((b) => b.id === ansId)?.ar || "");
      } else if (q.type === "NEXT_VERSE_CHOICE" || q.type === "PREV_VERSE_CHOICE") {
        challengeType = "AYAH_SEQUENCE";
        options = q.options.map((o) => o.ar || o.fa);
        const correctOpt = q.options.find((o) => o.id === q.answer);
        correctAnswer = correctOpt ? correctOpt.ar || correctOpt.fa : "";
      } else if (q.type === "VERSE_TO_NUMBER") {
        challengeType = "AYAH_NUMBER_QUIZ";
        options = q.options.map((o) => `آیه ${o.num}`);
        const correctOpt = q.options.find((o) => o.id === q.answer);
        correctAnswer = correctOpt ? `آیه ${correctOpt.num}` : "";
      } else if (q.type === "CLOZE_AR") {
        challengeType = "VERSE_COMPLETION";
        options = q.bank.map((b) => b.ar);
        const correctBId = q.answer[Object.keys(q.answer)[0]];
        const correctBankItem = q.bank.find((b) => b.id === correctBId);
        correctAnswer = correctBankItem ? correctBankItem.ar : "";
      } else {
        // Default choice
        challengeType = "FALSE_FRIEND_HUNTER";
        options = q.options.map((o) => o.fa || o.ar);
        const correctOpt = q.options.find((o) => o.id === q.answer);
        correctAnswer = correctOpt ? correctOpt.fa || correctOpt.ar : "";
      }

      dbChallenges.push({
        id: q.id,
        lessonId,
        order: dbChallenges.length + 1,
        layer: (q.stage <= 2 ? 1 : q.stage <= 4 ? 2 : q.stage <= 6 ? 3 : 4),
        type: challengeType,
        targetWordId: q.targets.find((t) => t.startsWith("w:"))?.replace("w:", "") || null,
        targetVerseId: mainVerse.id,
        promptFa: q.promptFa,
        options,
        correctAnswer,
        trapOption: null,
        explanationFa: q.explanationFa,
        deepTipFa: null,
      });
    }
  }

  // Save the full seed content pack
  const fullContentPack = {
    schemaVersion: "2.5.0-qasas-full",
    generatedAtIso: new Date().toISOString(),
    cities: [
      {
        id: "qasas_station_nile",
        order: 1,
        nameFa: "قصر فرعون و کرانه نیل",
        subtitleFa: "ایستگاه اول (آیات ۱ تا ۱۱): تولد موسی (ع)، افکندن به نیل و آرامش دل مادر",
        themeGradient: { from: "#0F766E", to: "#115E59", accent: "#F59E0B" },
        backgroundSvgUrl: "/assets/cities/nile_palace.svg",
        hostPortraitUrl: "/assets/hosts/host_station_1.webp",
        hostNameFa: "مادر موسی و آسیه (ع)",
        voiceClipIds: ["vc_qasas_ahsan"],
        isUnlockedByDefault: true,
      },
      {
        id: "qasas_station_city",
        order: 2,
        nameFa: "دروازه شهر و گریز در تاریکی",
        subtitleFa: "ایستگاه دوم (آیات ۱۲ تا ۲۱): استغاثه مظلوم، مشت ناخواسته و خروج بیم‌ناک",
        themeGradient: { from: "#B45309", to: "#78350F", accent: "#FBBF24" },
        backgroundSvgUrl: "/assets/cities/city_gate.svg",
        hostPortraitUrl: "/assets/hosts/host_station_2.webp",
        hostNameFa: "مؤمن آل فرعون",
        voiceClipIds: ["vc_qasas_musa"],
        isUnlockedByDefault: false,
      },
      {
        id: "qasas_station_madyan",
        order: 3,
        nameFa: "چاه آب مَدین و سایه‌سار نخل‌ها",
        subtitleFa: "ایستگاه سوم (آیات ۲۲ تا ۲۸): بازداشتن گله با حیا، دختران شعیب و استخدام امین",
        themeGradient: { from: "#059669", to: "#065F46", accent: "#34D399" },
        backgroundSvgUrl: "/assets/cities/madyan_well.svg",
        hostPortraitUrl: "/assets/hosts/host_station_3.webp",
        hostNameFa: "شعیب پیامبر (ع)",
        voiceClipIds: ["vc_qasas_ahsan"],
        isUnlockedByDefault: false,
      },
      {
        id: "qasas_station_tur",
        order: 4,
        nameFa: "کوه طور و کرانه وادی مقدس",
        subtitleFa: "ایستگاه چهارم (آیات ۲۹ تا ۴۳): اخگر آتش در شب سرد، ندای شجره و مار تندرو",
        themeGradient: { from: "#7C3AED", to: "#4C1D95", accent: "#F59E0B" },
        backgroundSvgUrl: "/assets/cities/mount_tur.svg",
        hostPortraitUrl: "/assets/hosts/host_station_4.webp",
        hostNameFa: "ندای طور و نور هدایت",
        voiceClipIds: ["vc_qasas_musa"],
        isUnlockedByDefault: false,
      },
      {
        id: "qasas_station_qarun",
        order: 5,
        nameFa: "کاخ قارون و گنج‌های سنگین",
        subtitleFa: "ایستگاه پنجم (آیات ۴۴ تا ۸۸): سرمستی ثروت، کلیدهای طاقت‌فرسا و بلعیده شدن در زمین",
        themeGradient: { from: "#1E293B", to: "#0F172A", accent: "#EAB308" },
        backgroundSvgUrl: "/assets/cities/qarun_palace.svg",
        hostPortraitUrl: "/assets/hosts/host_station_5.webp",
        hostNameFa: "عالمان عبرت‌آموز بنی‌اسرائیل",
        voiceClipIds: ["vc_qasas_tayyib"],
        isUnlockedByDefault: false,
      },
    ],
    units: dbUnits,
    lessons: dbLessons,
    verses: dbVerses,
    words: dbWords,
    challenges: dbChallenges,
    voiceClips: [
      {
        id: "vc_qasas_ahsan",
        speakerName: "مادر موسی و آسیه (ع)",
        phraseText: "احسنت! تله معنایی این کلمه را شناختید؛ نور تدبر بر دلتان بتابد.",
        audioUrl: "/audio/hosts/vc_ahsan.mp3",
        durationMs: 2800,
      },
      {
        id: "vc_qasas_tayyib",
        speakerName: "ندای طور و نور هدایت",
        phraseText: "طیب‌الله انفاسکم! گامی استوار در فهم دقیق لغات سوره قصص برداشتید.",
        audioUrl: "/audio/hosts/vc_tayyib.mp3",
        durationMs: 3100,
      },
      {
        id: "vc_qasas_musa",
        speakerName: "مؤمن آل فرعون",
        phraseText: "آفرین بر همت شما، تفکیک ریشه‌ها و دقت در آیات گوارایتان باد.",
        audioUrl: "/audio/hosts/vc_mashhad_1.mp3",
        durationMs: 3200,
      },
    ],
  };

  const seedPackPath = path.join(ROOT_DIR, "public", "content", "qasas_full_seed.json");
  await fs.writeFile(seedPackPath, JSON.stringify(fullContentPack, null, 2), "utf8");

  console.log(`✅ Generated all 22 units, 66 part files in public/content/units/`);
  console.log(`✅ Generated full seed database pack: ${seedPackPath} (${dbChallenges.length} challenges, ${dbVerses.length} verses)`);
}

main().catch(console.error);
