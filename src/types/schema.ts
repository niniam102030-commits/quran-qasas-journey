// src/types/schema.ts

export type SegmentType = "prefix" | "root" | "pronoun";

export type WordCategory =
  | "cognate"       // لایه ۱: مشترک با فارسی و هم‌ریشه‌های شفاف
  | "frequent"      // لایه ۲: کلمات و ادوات پرتکرار غیرفارسی قرآن
  | "false_friend"; // لایه ۳: کلمات فریبنده (مشترکات لفظی با معنای متفاوت)

export type ChallengeType =
  | "MORPHOLOGY_DEGLUING" // پازل چسب‌زدایی کلمه
  | "VERSE_BUILDER"       // آیه‌چین بر اساس ترجمه یا شماره آیه
  | "FALSE_FRIEND_HUNTER" // شکار کلمات فریبنده و چهارگزینه‌ای معنای کلمات سخت
  | "AUDIO_CLOZE"        // جای‌خالی صوتی
  | "WORD_MATCHING"       // بازی دو ستونه جفت‌سازی (تطبیق واژگان عربی با ترجمه انصاریان)
  | "AYAH_SEQUENCE"       // تسلط بر ترتیب آیات (آیه قبل / آیه بعد)
  | "AYAH_NUMBER_QUIZ"    // تسلط بر شماره آیات (متن به شماره یا شماره به مطلع)
  | "VERSE_COMPLETION";   // تکمیل بخش مفقود آیه از بانک عبارات

export type AqeeqMood =
  | "idle"      // حالت عادی و شناور با درخشش ملایم عقیق
  | "thinking"  // چرخش آرام هنگام مکث کاربر
  | "happy"     // درخشش طلایی-زمردی هنگام پاسخ صحیح
  | "warning"   // تپش کهربایی هنگام افتادن در تله کلمات فریبنده
  | "deep_tip"; // باز شدن هاله اسلیمی برای نمایش «نکته عمیق‌تر»

export type FSRSRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface VoiceClip {
  id: string;
  speakerName: string;          // نام شخصیت یا شهید میزبان (صرفاً جهت متادیتا)
  phraseText: string;           // مثال: «طیب‌الله انفاسکم» یا «احسنت»
  audioUrl: string;             // مسیر فایل صوتی کوتاه تشویقی
  durationMs: number;
}

export interface CityNode {
  id: string;                   // مثال: "qom_jamkaran", "mashhad", "karbala", "quds", "makkah"
  order: number;                // ترتیب در نقشه عمودی (۱ تا ۹)
  nameFa: string;               // نام نمایشی ایستگاه
  subtitleFa: string;           // توضیح کوتاه حال‌وهوای ایستگاه
  themeGradient: {
    from: string;
    to: string;
    accent: string;
  };
  backgroundSvgUrl: string;     // وکتور لایه‌ای اقلیم شهر
  hostPortraitUrl: string;      // تصویر دیجیتال فاخر 2.5D میزبان ایستگاه (WebP)
  hostNameFa: string;           // عنوان محترمانه میزبان
  voiceClipIds: string[];       // لیست کلیدهای صوت‌های تشویقی این ایستگاه
  isUnlockedByDefault: boolean;
}

export interface Unit {
  id: string;
  cityId: string;
  order: number;
  titleFa: string;              // موضوع حفظ موضوعی (مثال: «توکل و امید»، «ایستادگی»)
  descriptionFa: string;
  lessonIds: string[];
}

export interface MorphologySegment {
  text: string;                 // متن قطعه (مثال: "فَـ" یا "يَكْفِي" یا "هُمُ")
  type: SegmentType;            // "prefix" | "root" | "pronoun"
  meaningFa: string;            // معنای فارسی همان قطعه
  connectsLeft: boolean;        // آیا به قطعه سمت چپ خود در خط عربی می‌چسبد؟ (برای تزریق ZWJ)
}

export interface WordMorphology {
  id: string;                   // مثال: "w_002_137_001"
  arabicUthmani: string;        // شکل کامل کلمه با رسم‌الخط عثمان طه
  category: WordCategory;       // "cognate" | "frequent" | "false_friend"
  rootLetters: string | null;   // حروف ریشه (مثال: "ك ف ي") یا null برای ادوات
  meaningFa: string;            // معنای دقیق قرآنی
  persianCognateHint: string | null; // توضیح هم‌خانوادگی با فارسی
  falseFriendTrapFa: string | null;  // معنای رایج ولی اشتباه در فارسی امروز (ویژه کلمات فریبنده)
  deepTipFa: string | null;     // متن دکمه اختیاری «نکته عمیق‌تر» در پاسخ‌نامه
  audioWbwUrl: string;          // مسیر فایل صوتی تک‌کلمه از دیتاست QuranWBW
  segments: MorphologySegment[];// آرایه قطعات برای رنگ‌آمیزی ۳گانه و پازل چسب‌زدایی
}

export interface VerseWordTimestamp {
  wordId: string;
  textUthmani: string;
  startMs: number;              // زمان شروع کلمه در تلاوت استاد منشاوی (میلی‌ثانیه)
  endMs: number;                // زمان پایان کلمه در تلاوت استاد منشاوی (میلی‌ثانیه)
}

export interface VerseData {
  id: string;                   // مثال: "v_002_137"
  surahNumber: number;
  surahNameFa: string;
  ayahNumber: number;
  thematicTopicFa: string;      // موضوع در طرح حفظ موضوعی شیعه
  arabicFullText: string;       // متن کامل آیه (فونت عثمان طه)
  translationFa: string;        // ترجمه روان و دقیق فارسی
  menshawiAudioUrl: string;     // فایل صوتی تلاوت استاد منشاوی
  wordTimestamps: VerseWordTimestamp[]; // زمان‌بندی کارائوکه کلمه‌به‌کلمه
}

export interface Challenge {
  id: string;
  lessonId: string;
  order: number;
  layer: 1 | 2 | 3 | 4;         // ۱: هم‌ریشه، ۲: پرتکرار، ۳: فریبنده، ۴: ایستگاه پایانی فهم آیه
  type: ChallengeType;
  targetWordId: string | null;  // کلمه هدف (برای لایه‌های ۱ تا ۳)
  targetVerseId: string;        // آیه مرتبط با این تمرین
  promptFa: string;             // صورت سوال به فارسی
  options: string[];            // گزینه‌ها یا بانک کلمات (برای آیه‌چین و چهارگزینه‌ای)
  correctAnswer: string | string[]; // پاسخ صحیح (رشته یا آرایه ترتیب صحیح قطعات/کلمات)
  trapOption: string | null;    // گزینه تله (معنای فریبنده فارسی) برای نمایش هشدار ویژه
  explanationFa: string;        // توضیح کوتاه پاسخ‌نامه
  deepTipFa: string | null;     // توضیح تکمیلی در صورت زدن دکمه «نکته عمیق‌تر»
}

export interface Lesson {
  id: string;
  cityId: string;
  unitId: string;
  order: number;
  titleFa: string;
  targetVerseId: string;        // آیه محوری این درس
  wordIds: string[];            // کلمات آموزش داده‌شده در این درس
  challengeIds: string[];       // لیست تمرین‌های ۴ لایه درس
  rewardNoorXp: number;         // امتیاز «نور» پایان درس
  rewardAqeeqGem: number;       // پاداش «عقیق» پایان درس
}

export interface FSRSCardState {
  wordId: string;               // کلید اصلی (شناسه کلمه)
  due: string;                  // تاریخ سررسید مرور بعدی (ISO String)
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;         // 0: New, 1: Learning, 2: Review, 3: Relearning
  lastReview: string | null;    // تاریخ آخرین مرور (ISO String)
}

export interface UserStats {
  id: "singleton_user";         // همیشه یک ردیف ثابت در دیتابیس
  noorXp: number;               // مجموع امتیاز «نور»
  aqeeqGems: number;            // مجموع «عقیق»
  lampsCount: number;           // تعداد چراغ‌های روشن فعلی (۰ تا ۵)
  chillehCurrentDays: number;   // روزشمار فعلی «چله انس» (هدف: ۷، ۱۴، ۴۰ روز)
  chillehBestDays: number;      // بهترین رکورد چله انس
  chillehStage: 7 | 14 | 40;    // پله هدف فعلی چله
  lastActiveDateIso: string | null; // تاریخ آخرین فعالیت روزانه (YYYY-MM-DD)
  unlockedCityIds: string[];
  completedLessonIds: string[];
  currentCityId: string;
  currentLessonId: string;
  darkMode: boolean;
  soundEffectsEnabled: boolean;
}

export interface AudioCacheEntry {
  url: string;                  // کلید اصلی: مسیر نسبی فایل صوتی
  cityId: string;               // برای مدیریت حذف یا دانلود یکجای صوت‌های هر شهر
  blob: Blob;                   // داده باینری فایل MP3
  cachedAtIso: string;
}

export interface ContentPackSchema {
  schemaVersion: string;        // مثال: "1.0.0"
  generatedAtIso: string;
  cities: CityNode[];
  units: Unit[];
  lessons: Lesson[];
  verses: VerseData[];
  words: WordMorphology[];
  challenges: Challenge[];
  voiceClips: VoiceClip[];
}
