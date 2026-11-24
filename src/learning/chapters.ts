// src/learning/chapters.ts
// فصل‌بندی داستانی سوره قصص (۱۰ فصل — G1)

export interface StoryChapter {
  id: string;
  order: number;
  titleFa: string;
  teaserFa: string;
  verseFrom: number;
  verseTo: number;
}

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    id: "ch1",
    order: 1,
    titleFa: "ستم فرعون و وعدهٔ نصرت",
    teaserFa: "داستان سرکشی فرعون و وعدهٔ خداوند به مستضعفان",
    verseFrom: 1,
    verseTo: 6,
  },
  {
    id: "ch2",
    order: 2,
    titleFa: "کودکی موسی و دریا",
    teaserFa: "الهام به مادر موسی، سپردن به نیل و بازگشت به آغوش مادر",
    verseFrom: 7,
    verseTo: 13,
  },
  {
    id: "ch3",
    order: 3,
    titleFa: "جوانی، حادثه و خروج از مصر",
    teaserFa: "نزاع در شهر، خبر توطئهٔ سران و خروج بیمناک از مصر",
    verseFrom: 14,
    verseTo: 21,
  },
  {
    id: "ch4",
    order: 4,
    titleFa: "مدین و پیمان ده ساله",
    teaserFa: "آب‌کشیدن برای دو دختر و پیمان ازدواج و خدمت در مدین",
    verseFrom: 22,
    verseTo: 28,
  },
  {
    id: "ch5",
    order: 5,
    titleFa: "آتش طور و آغاز رسالت",
    teaserFa: "ندای پروردگار از درخت، دو نشانهٔ عصا و دست سپید و همراهی هارون",
    verseFrom: 29,
    verseTo: 37,
  },
  {
    id: "ch6",
    order: 6,
    titleFa: "برج هامان و غرق فرعون",
    teaserFa: "ادعای خدایی فرعون، سرکشی سپاهیان و غرق‌شدن آنان در دریا",
    verseFrom: 38,
    verseTo: 46,
  },
  {
    id: "ch7",
    order: 7,
    titleFa: "حجت بر منکران و نعمت حرم",
    teaserFa: "پاداش اهل کتاب، یادآوری نعمت حرم امن و سنجش دنیا و آخرت",
    verseFrom: 47,
    verseTo: 61,
  },
  {
    id: "ch8",
    order: 8,
    titleFa: "پرسش قیامت و رحمت شب و روز",
    teaserFa: "بیزاری گمراه‌کنندگان، رحمت آفرینش شب و روز و گواهی امت‌ها",
    verseFrom: 62,
    verseTo: 75,
  },
  {
    id: "ch9",
    order: 9,
    titleFa: "قارون و سرانجام غرور",
    teaserFa: "ثروت و شکوه قارون، پند اهل علم و فرورفتن قارون در زمین",
    verseFrom: 76,
    verseTo: 82,
  },
  {
    id: "ch10",
    order: 10,
    titleFa: "سرای آخرت و توحید خالص",
    teaserFa: "پاداش نیکوکاران، وعدهٔ بازگشت و توحید بی‌شریک",
    verseFrom: 83,
    verseTo: 88,
  },
] as const;

export function chapterOfUnit(unitVerseFrom: number): StoryChapter {
  const found = STORY_CHAPTERS.find(
    (c) => unitVerseFrom >= c.verseFrom && unitVerseFrom <= c.verseTo,
  );
  if (found) return found;
  if (unitVerseFrom < STORY_CHAPTERS[0].verseFrom) return STORY_CHAPTERS[0];
  return STORY_CHAPTERS[STORY_CHAPTERS.length - 1];
}

export function chapterProgress(
  chapter: StoryChapter,
  units: { verseFrom: number; stage8Passed: boolean }[],
): { total: number; done: number; complete: boolean } {
  const members = units.filter((u) => chapterOfUnit(u.verseFrom).id === chapter.id);
  const total = members.length;
  const done = members.filter((u) => u.stage8Passed).length;
  return {
    total,
    done,
    complete: total > 0 && done === total,
  };
}
