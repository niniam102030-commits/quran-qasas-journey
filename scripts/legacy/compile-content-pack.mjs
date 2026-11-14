// scripts/compile-content-pack.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const STATIONS = [
  {
    id: "qasas_station_nile",
    nameFa: "قصر فرعون و کرانه نیل",
    subtitleFa: "ایستگاه اول: تولد موسی (ع)، افکندن به نیل و آرامش دل مادر (آیات ۱ تا ۱۳)",
    titleArabic: "شاطئ النيل وقصر فرعون",
    order: 1,
    themeGradient: { from: "#0F766E", to: "#115E59", accent: "#F59E0B" },
    backgroundSvgUrl: "/assets/cities/nile_palace.svg",
    hostPortraitUrl: "/assets/hosts/host_station_1.webp",
    hostNameFa: "مادر موسی و آسیه (ع)",
    voiceClipIds: ["vc_qasas_ahsan"],
    isUnlockedByDefault: true,
  },
  {
    id: "qasas_station_city",
    nameFa: "دروازه شهر و گریز در تاریکی",
    subtitleFa: "ایستگاه دوم: استغاثه مظلوم، مشت ناخواسته و خروج بیم‌ناک (آیات ۱۴ تا ۲۱)",
    titleArabic: "بلوغ أشدّه والخروج خائفاً",
    order: 2,
    themeGradient: { from: "#B45309", to: "#78350F", accent: "#FBBF24" },
    backgroundSvgUrl: "/assets/cities/city_gate.svg",
    hostPortraitUrl: "/assets/hosts/host_station_2.webp",
    hostNameFa: "مؤمن آل فرعون",
    voiceClipIds: [],
    isUnlockedByDefault: false,
  },
  {
    id: "qasas_station_madyan",
    nameFa: "چاه آب مَدین و سایه‌سار نخل‌ها",
    subtitleFa: "ایستگاه سوم: بازداشتن گله، شرم و وقار صفورا و استخدام امین (آیات ۲۲ تا ۲۸)",
    titleArabic: "ماء مدين ولقاء شعيب",
    order: 3,
    themeGradient: { from: "#059669", to: "#065F46", accent: "#34D399" },
    backgroundSvgUrl: "/assets/cities/madyan_well.svg",
    hostPortraitUrl: "/assets/hosts/host_station_3.webp",
    hostNameFa: "شعیب پیامبر (ع)",
    voiceClipIds: [],
    isUnlockedByDefault: false,
  },
  {
    id: "qasas_station_tur",
    nameFa: "کوه طور و کرانه وادی مقدس",
    subtitleFa: "ایستگاه چهارم: اخگر آتش در شب سرد، ندای شجره و مار تندرو (آیات ۲۹ تا ۴۲)",
    titleArabic: "جانب الطور ونار النبوّة",
    order: 4,
    themeGradient: { from: "#7C3AED", to: "#4C1D95", accent: "#F59E0B" },
    backgroundSvgUrl: "/assets/cities/mount_tur.svg",
    hostPortraitUrl: "/assets/hosts/host_station_4.webp",
    hostNameFa: "ندای طور و نور هدایت",
    voiceClipIds: [],
    isUnlockedByDefault: false,
  },
  {
    id: "qasas_station_qarun",
    nameFa: "کاخ قارون و گنج‌های سنگین",
    subtitleFa: "ایستگاه پنجم: سرمستی ثروت، کلیدهای طاقت‌فرسا و بلعیده شدن در زمین (آیات ۴۳ تا ۸۸)",
    titleArabic: "كنوز قارون وعاقبة المستكبرين",
    order: 5,
    themeGradient: { from: "#1E293B", to: "#0F172A", accent: "#EAB308" },
    backgroundSvgUrl: "/assets/cities/qarun_palace.svg",
    hostPortraitUrl: "/assets/hosts/host_station_5.webp",
    hostNameFa: "عالمان عبرت‌آموز بنی‌اسرائیل",
    voiceClipIds: [],
    isUnlockedByDefault: false,
  },
];

async function main() {
  console.log("📦 در حال کامپایل بانک سوالات سوره قصص از فایل‌های تولیدشده...");

  const baseVersesPath = path.join(ROOT_DIR, "public", "content", "base", "qasas.base.json");
  const unitsPlanPath = path.join(ROOT_DIR, "public", "content", "base", "units-plan.json");
  const unitsDir = path.join(ROOT_DIR, "public", "content", "units");
  const destPath = path.join(ROOT_DIR, "src", "data", "qasas_full_seed.json");

  const versesData = JSON.parse(await fs.readFile(baseVersesPath, "utf8"));
  const unitsPlan = JSON.parse(await fs.readFile(unitsPlanPath, "utf8"));

  function getStationForUnit(verseFrom, verseTo) {
    if (verseTo <= 13) return "qasas_station_nile";
    if (verseFrom >= 14 && verseTo <= 21) return "qasas_station_city";
    if (verseFrom >= 22 && verseTo <= 28) return "qasas_station_madyan";
    if (verseFrom >= 29 && verseTo <= 42) return "qasas_station_tur";
    return "qasas_station_qarun";
  }

  // ساخت لیست Unit ها
  const units = unitsPlan.map((u) => {
    const stationId = getStationForUnit(u.verseFrom, u.verseTo);
    const halfFa = u.half === "a" ? "نیمه اول" : "نیمه دوم";
    const titleText = `صفحه ${u.page} (${halfFa}) - آیات ${u.verseFrom} تا ${u.verseTo}`;
    const descText = `حفظ مصحف مدینه عثمان طه و تسلط بر واژگان و ترجمه انصاریان آیات ${u.verseFrom} تا ${u.verseTo}`;

    return {
      id: u.id,
      cityId: stationId,
      nameFa: titleText,
      titleFa: titleText,
      titleArabic: `صفحة ${u.page} - الآيات ${u.verseFrom} إلى ${u.verseTo}`,
      order: u.order,
      description: descText,
      descriptionFa: descText,
      lessonIds: [`lesson_${u.id}`],
    };
  });

  // ساخت درس‌ها
  const lessons = unitsPlan.map((u) => {
    const stationId = getStationForUnit(u.verseFrom, u.verseTo);
    const lessonTitle = `کارگاه تسلط آیات ${u.verseFrom} تا ${u.verseTo}`;
    return {
      id: `lesson_${u.id}`,
      cityId: stationId,
      unitId: u.id,
      nameFa: lessonTitle,
      titleFa: lessonTitle,
      order: u.order,
      targetVerseId: u.verses[0],
      isCheckpoint: u.half === "b",
      rewardNoorXp: 30,
      rewardAqeeqGem: 15,
      wordIds: [],
      challengeIds: [],
    };
  });

  // خواندن فایل‌های Part تولید شده
  let unitFiles = [];
  try {
    unitFiles = (await fs.readdir(unitsDir)).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  } catch {
    unitFiles = [];
  }

  const allWords = new Map();
  const allChallenges = [];
  const seenChallengeIds = new Set();

  for (const f of unitFiles) {
    const fPath = path.join(unitsDir, f);
    try {
      const data = JSON.parse(await fs.readFile(fPath, "utf8"));
      if (data.schema !== "qasas.content.v1") continue;

      // بررسی لغت‌نامه
      if (Array.isArray(data.lexicon)) {
        for (const item of data.lexicon) {
          if (!item.wordId) continue;
          allWords.set(item.wordId, {
            id: item.wordId,
            surahNumber: 28,
            ayahNumber: parseInt(item.wordId.split("_")[1] || "1", 10),
            positionInAyah: parseInt(item.wordId.split("_")[2] || "1", 10),
            arabicText: item.ar || "",
            cleanArabic: item.ar || "",
            translationFa: item.meaningFa || item.gloss || "",
            category: item.hard ? "hard" : "standard",
            rootLetters: item.rootAr || null,
            falseFriendWarning: item.trapFa || null,
            memoryTip: item.tipFa || null,
            morphologyBreakdown: [],
          });
        }
      }

      // بررسی سوالات
      if (Array.isArray(data.questions)) {
        for (const q of data.questions) {
          // خط قرمز: ممنوعیت ورود سوالات با متن ساختگی
          const qStr = JSON.stringify(q);
          if (qStr.includes("بخشی از آیه شریفه در ترجمه انصاریان") || qStr.includes("بخشی از ترجمه انصاریان مطرح شده است")) {
            console.warn(`⚠️ سوال ${q.id} به دلیل متن ساختگی نادیده گرفته شد.`);
            continue;
          }

          if (q.id && seenChallengeIds.has(q.id)) {
            console.warn(`⚠️ سوال ${q.id} تکراری است؛ رد شد.`);
            continue;
          }
          if (q.id) seenChallengeIds.add(q.id);

          allChallenges.push({
            id: q.id,
            lessonId: `lesson_${data.unitId}`,
            order: allChallenges.length + 1,
            layer: q.difficulty || 1,
            type: q.type,
            shape: q.shape,
            stage: q.stage,
            promptFa: q.promptFa,
            arabicPrompt: q.stem?.ar || null,
            targetWordId: q.targets?.[0] || null,
            targets: q.targets || [],
            options: q.options || [],
            correctAnswer: q.answer || null,
            left: q.left || null,
            right: q.right || null,
            pairs: q.pairs || null,
            bank: q.bank || null,
            stem: q.stem || null,
            explanationFa: q.explanationFa || null,
            distractorTags: q.distractorTags || {},
          });
        }
      }
    } catch (err) {
      console.warn(`خطا در خواندن فایل ${f}:`, err.message);
    }
  }

  // آماده‌سازی خروجی نهایی
  const contentPack = {
    schemaVersion: "1.0.0",
    generatedAtIso: new Date().toISOString(),
    cities: STATIONS,
    units,
    lessons,
    verses: versesData.map((v) => ({
      id: v.id,
      surahNumber: v.surahNumber,
      ayahNumber: v.ayahNumber,
      arabicText: v.arabicText,
      cleanArabic: v.cleanArabic,
      translationFa: v.translationFa, // ترجمه استاد حسین انصاریان
      words: v.words,
    })),
    words: Array.from(allWords.values()),
    challenges: allChallenges,
    voiceClips: [],
  };

  await fs.writeFile(destPath, JSON.stringify(contentPack, null, 2), "utf8");
  console.log(`✅ فایل نهایی ${destPath} با موفقیت کامپایل شد.`);
  console.log(`📊 آمار: ${units.length} واحد | ${versesData.length} آیه | ${allWords.size} واژه لغت‌نامه | ${allChallenges.length} چالش فعال.`);
}

main().catch(console.error);
