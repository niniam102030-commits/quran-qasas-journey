# مشخصات تغییرات پروژه — برای ایجنت Antigravity (با دسترسی اینترنت)

> **به ایجنت:** این سند را کامل بخوان، سپس به ترتیب فازها اجرا کن. پس از هر فاز `npm run build` و `npm run lint` (و در صورت وجود تست‌ها `npm test`) را اجرا کن. کار را فاز‌به‌فاز انجام بده و پایان هر فاز را کوتاه گزارش کن. فرض‌های نامطمئن را **بدون حدس** در `docs/DECISIONS.md` ثبت کن.

---

## ۰) زمینه و هدف

پروژه‌ی `قصص` (React + TypeScript + Vite + Tailwind + Zustand + Dexie + Capacitor) یک اپ بازی‌وار برای یادگیری سوره‌ی قصص است. هدف جدید پروژه:

> کاربر باید **همه‌ی ۸۸ آیه‌ی سوره‌ی قصص** را با **شماره‌ی آیه، ترتیب آیات و ترجمه‌ی انصاریان** و با **معنای تک‌تک کلمات (به‌ویژه سخت‌ها)** کامل حفظ کند. واحد یادگیری «**نصف صفحه‌ی مصحف مدینه (چاپ عثمان طه)**» است. کالبدشکافی صرفی عمیق (DeGluing) دیگر محور نیست و رنگ‌بندی ساده‌ی قطعات کافی است. تطبیق صوتی/کارائوکه **خارج از محدوده** است.

### وضعیت فعلی (برای آگاهی)

- `src/db/database.ts`: دیتای seed درون‌کدی شامل **۵ درس** و ۶ آیه‌ی **ناقص** (متن آیه‌های ۱۵، ۲۳، ۲۹، ۷۶ کامل نیست و ترجمه‌ها خودساخته‌اند). **این دیتا باید کامل کنار گذاشته شود.**
- `src/types/schema.ts`: مدل Challenge با ۴ نوع (`MORPHOLOGY_DEGLUING`، `VERSE_BUILDER`، `FALSE_FRIEND_HUNTER`، `AUDIO_CLOZE`) که جوابش یک رشته یا آرایه‌ی رشته است.
- `src/store/useAppStore.ts`: جلسه‌ی ثابت درس؛ جواب غلط = چراغ کم می‌شود و با ۰ چراغ، جلسه قفل می‌شود.
- `src/services/fsrsScheduler.ts`: FSRS فقط روی `wordId`.
- `ChallengeEngine.tsx`: ۴ کامپوننت سوال.

### اصول طراحی (غیرقابل‌مذاکره)

1. **متن قرآن هرگز در کد نوشته نمی‌شود.** از فایل‌های JSON تولیدشده در `public/content/` بارگذاری می‌شود.
2. **تصحیح پاسخ با شناسه/اندیس است نه مقایسه‌ی رشته‌ی عربی.** (حرکات و نویسه‌های خاص مصحف نباید باعث خطای کاذب شوند.)
3. **همه‌ی سوال‌ها از قبل (توسط AI) در فایل‌ها ساخته شده‌اند**؛ اپ فقط «انتخاب، زمان‌بندی و تصحیح» می‌کند. اپ هیچ سوالی از خودش نمی‌سازد.
4. تکرارها را **FSRS + رفتار کاربر** تعیین می‌کند (بخش ۵).
5. خروجی AI را **اعتبارسنج خودکار** بررسی می‌کند؛ هر فایل ناسالم باید رد شود.
6. رابط RTL، فونت مصحف مدینه، موبایل‌محور؛ کدهای قدیمی را فعلاً حذف نکن بلکه از مسیر اصلی خارج کن (feature flag) و در `docs/DECISIONS.md` فهرست حذف‌های پیشنهادی را بنویس.

---

## فاز ۱ — داده‌ی پایه از منابع معتبر (نیازمند اینترنت)

### ۱-۱) اسکریپت `scripts/fetch-base-data.mjs`

هدف: ساخت `public/content/base/qasas.base.json` شامل ۸۸ آیه با این ساختار:

```ts
interface BaseVerse {
  id: string;            // "v28_010"
  n: number;             // 10
  page: number;          // شماره صفحه‌ی مصحف مدینه (۳۸۵ تا ۳۹۶ انتظار می‌رود)
  words: { id: string; i: number; ar: string; page: number; line: number }[];
  arText: string;        // اتصال words[].ar با فاصله
  fa: string;            // ترجمه‌ی انصاریان دقیقاً از منبع
  endPage: number; endLine: number; // مکان آخرین کلمه
}
```

**منابع پیشنهادی (به ترتیب اولویت؛ درستی هر کدام را خودت راستی‌آزمایی کن):**

1. **متن عثمانی + شماره‌ی صفحه + شماره‌ی خط هر کلمه:** Quran.com API v4. نقطه‌ی پایانی `verses/by_chapter/28` با `words=true` و `word_fields` شامل `text_uthmani`، `line_number`، `page_number` و `per_page=100`. مستند API را بخوان و پارامتر **مصحف مدینه ۱۵ خطی (حفص)** را درست انتخاب کن. اگر پاسخ فیلد خط نداشت، منبع دیگری مثل API دیتاست «KFGQPC / Quran.com mushaf layout» بگرد.
2. **ترجمه‌ی انصاریان:** Tanzil (شناسه‌ی `fa.ansarian`) از `tanzil.net/trans/`. اگر Quran.com همین ترجمه را با شناسه‌ی مشخص دارد می‌توانی از آنجا بگیری؛ **فقط یک منبع را انتخاب کن و در `DECISIONS.md` بنویس کدام.**
3. **فونت:** «KFGQPC Uthmanic Script HAFS» (مجتمع ملک فهد) را از منبع رسمی دانلود و در `public/fonts/` بگذار، با `@font-face` در `src/index.css`. مجوز استفاده را در `DECISIONS.md` ثبت کن.

**راستی‌آزمایی اجباری (اسکریپت باید fail شود اگر نتیجه فرق کند):**

- دقیقاً ۸۸ آیه
- آیه‌ی ۱ در صفحه‌ی ۳۸۵ و آیه‌ی ۸۸ در صفحه‌ی ۳۹۶ مصحف مدینه (اگر منبع فرق دارد، **گزارش بده و منبع را بررسی کن**، نه اینکه عدد را دست‌کاری کنی)
- هر صفحه حداکثر ۱۵ خط
- مجموع کلمات هر آیه با تعداد کلمات منبع برابر باشد
- `arText` هیچ کاراکتر کنترلی یا تطویل اضافی (ـ) ندارد
- ترجمه‌ی هر ۸۸ آیه غیرخالی است

### ۱-۲) واحدهای «نصف صفحه» (`public/content/base/units-plan.json`)

الگوریتم قطعی:

1. برای هر آیه **محل پایان آن** (`endPage`, `endLine`) را بگیر.
2. اگر `endLine ≤ 8` → واحد `u_p<صفحه>a`؛ اگر `endLine ≥ 9` → واحد `u_p<صفحه>b`.
3. واحدی که هیچ آیه‌ای در آن تمام نمی‌شود (مثلاً آیه‌ی بسیار بلند) را با واحد مجاور بعدی ادغام کن و در `DECISIONS.md` ثبت کن.
4. خروجی: `{ id, page, half, verseFrom, verseTo, verses:[…], lines:{from,to} }` برای هر واحد، به ترتیب. (انتظار ≈ ۲۲ تا ۲۴ واحد)

### ۱-۳) نقشه‌ی شباهت درون‌سوره‌ای (`public/content/base/similarity.json`)

برای هر آیه: آیات دیگر **همین سوره** که ۳ کلمه‌ی اول یا ۳ کلمه‌ی آخر یکسان دارند و عبارت‌های ≥۴ کلمه‌ای مشترک. (مقایسه روی کلمات بدون حرکات، ولی خروجی با حرکات.)

### ۱-۴) ورودی‌های AI (`input/<unitId>.input.json`)

اسکریپت `scripts/build-ai-inputs.mjs` برای هر واحد، فایلی بسازد که **دقیقاً** با بخش «۲) ورودی هر نوبت» در `docs/01-content-prompt.md` هم‌خوان است:
`unit`، `verses`، `contextBefore` (۲ آیه‌ی آخر واحد قبل)، `contextAfter` (۱ آیه‌ی اول واحد بعد)، `similarity` (فقط آیات واحد)، `earlierHardWords` (کلمات سخت واحدهای قبلی که تا آن لحظه ساخته شده‌اند؛ برای نوبت اول خالی)، `surahWordPool` (≈۱۵۰ کلمه‌ی متنوع از همه‌ی سوره، با حرکات).

اسکریپت `package.json` را به‌روز کن: `fetch:base`، `build:inputs`، `validate:content`.

---

## فاز ۲ — اعتبارسنج محتوا (`scripts/validate-content.mjs`)

برای هر `public/content/units/<unitId>.part*.json` بررسی کن (هر خطا → ریسه‌ی خروجی غیرصفر و پیام دقیق شامل `questionId`):

1. **شِمای:** فیلدهای اجباری بخش ۵ پرامپت (`id, type, shape, stage, difficulty, skill, targets, promptFa, answer, distractorTags, explanationFa`)، و یکتا بودن `id`.
2. **تطبیق متن:** هر `ar` گزینه/بانک یا برابر `words[].ar` از base است یا در `surahWordPool`/ورودی واحد وجود دارد؛ در غیر این صورت خطا.
3. **صحت پاسخ (پایه‌ی کار):**
   - `order`: با `wordIdx` بانک ترتیب درست، دنباله‌ی کلمات آیه‌ی هدف را **عیناً** بازسازی کند.
   - `cloze`: `hiddenIdx` در بازه‌ی کلمات آیه؛ `answer[idx]` به بانکی اشاره کند که `wordIdx` آن همان کلمه است.
   - `choice`: `answer` در `options` باشد؛ برای `VERSE_TO_NUMBER` گزینه‌ی درست = شماره‌ی واقعی آیه؛ برای `NEXT/PREV` ابتدای آیه‌ی بعدی/قبلی عیناً متن واقعی.
   - `match`: هر جفت یک‌به‌یک و درست؛ برای `MATCH_NUMBER_OPENING` ابتدای آیه با آیه‌ی واقعی تطبیق داده شود.
4. **ترجمه:** اتصال `faSegments` با فاصله = `fa` منبع؛ هر قطعه‌ی فارسی چانک و `faHidden` زیررشته‌ی `fa`.
5. **یگانگی پاسخ:** گزینه‌های غلط هیچ‌کدام با گزینه‌ی درست برابر نباشند؛ در `MUTASHABIH_SPOT` فقط یک نسخه برابر متن واقعی آیه است.
6. **targets:** قالب کلیدها؛ `sq:` برای آیه‌ی ۱ پیش و برای ۸۸ پس مجاز نیست.
7. **سهمیه‌ها:** حداقل‌های بخش ۷ پرامپت را شمارش و گزارش کن؛ اگر کمتر بود Warning (پیش‌فرض) یا Error با `--strict`.
8. **گزارش خلاصه:** جدول تعداد سوال به تفکیک `unit × stage × type` و فهرست کارت‌های بدون سوال کافی (هر کارت `vr/vt/vn/sq` باید دست‌کم ۸ سوال خواهر با ≥۳ نوع متفاوت داشته باشد؛ هر کارت `w:` دست‌کم ۶).
9. یک سوال تکراری (همان `stem` و `answer`) را خطا بگیر.
10. خروجی آزمایشی: `docs/validation-report.md`.

اعتبارسنج را با **تست‌های واحد** (vitest) پوشش بده؛ دست‌کم برای هر شکل سوال یک نمونه‌ی درست و یک نمونه‌ی خراب.

---

## فاز ۳ — مدل داده و دیتابیس

### ۳-۱) فایل جدید `src/types/learning.ts`

(`schema.ts` را دست نزن؛ فقط وارد کن. نوع‌های قدیمی `@deprecated` علامت بخورند.)

```ts
export type Skill = "word" | "translation" | "recall" | "number" | "sequence" | "page";
export type QuestionShape = "choice" | "match" | "order" | "cloze";
export type QuestionType =
  | "WORD_AR_TO_FA" | "WORD_FA_TO_AR" | "VERSE_TO_TRANSLATION" | "TRANSLATION_TO_VERSE"
  | "VERSE_TO_NUMBER" | "NUMBER_TO_VERSE_START" | "NEXT_VERSE_CHOICE" | "PREV_VERSE_CHOICE"
  | "ENDING_CHOICE" | "MUTASHABIH_SPOT"
  | "MATCH_WORDS" | "MATCH_PHRASES" | "MATCH_NUMBER_OPENING"
  | "BUILD_FROM_TRANSLATION" | "BUILD_FROM_NUMBER" | "BUILD_NEXT_VERSE" | "BUILD_PREV_VERSE"
  | "ORDER_TRANSLATION_CHUNKS" | "ORDER_VERSES"
  | "CLOZE_AR" | "CLOZE_COMPLETE_REST" | "CLOZE_FA";

export type CardKey = string; // "w:<wordId>" | "vr:10" | "vt:10" | "vn:10" | "sq:10" | "pg:<unitId>"
export type CardKind = "w" | "vr" | "vt" | "vn" | "sq" | "pg";

export interface Option { id: string; ar?: string; fa?: string; num?: number;
  words?: string[]; wordRange?: { verse: number; from: number; to: number }; }
export interface BankItem { id: string; ar?: string; fa?: string; wordIdx?: number[]; decoy?: boolean; }

export interface QuestionBase {
  id: string; unitId: string; part: string;
  type: QuestionType; shape: QuestionShape;
  stage: 1|2|3|4|5|6|7|8; difficulty: 1|2|3|4|5;
  skill: Skill; verse?: number;
  targets: CardKey[]; promptFa: string;
  stem: Record<string, unknown>;
  distractorTags?: Record<string, string>;
  explanationFa: string;
}
export interface ChoiceQuestion extends QuestionBase { shape: "choice"; options: Option[]; answer: string; }
export interface MatchQuestion  extends QuestionBase { shape: "match";
  left: { id: string; ar?: string; num?: number }[]; right: { id: string; fa?: string; ar?: string }[]; pairs: [string, string][]; }
export interface OrderQuestion  extends QuestionBase { shape: "order"; bank: BankItem[]; answer: string[]; }
export interface ClozeQuestion  extends QuestionBase { shape: "cloze"; bank: BankItem[]; answer: Record<string, string>; }
export type Question = ChoiceQuestion | MatchQuestion | OrderQuestion | ClozeQuestion;

export interface LexiconEntry { wordId: string; gloss: string; hard: boolean; meaningFa?: string;
  rootAr?: string; trapFa?: string | null; tipFa?: string; segments?: { text: string; type: "prefix"|"root"|"pronoun" }[]; }
export interface VerseChunks { verse: number; chunks: { from: number; to: number; fa: string }[]; faSegments: string[]; }

/** نتیجه‌ی تصحیح هر سوال؛ برای ثبت در attempts و FSRS */
export interface GradeResult {
  correct: boolean;           // کل سوال
  score: number;              // ۰ تا ۱ (برای order/cloze/match امتیاز جزئی)
  perTarget: Record<CardKey, boolean>;   // وضعیت هر کارت هدف
  wrongOptionIds: string[];   // گزینه/جفت‌های اشتباه انتخاب‌شده
}
```

### ۳-۲) Dexie نسخه‌ی ۲ (`src/db/database.ts`)

- نسخه‌ی ۱ را حفظ کن، `this.version(2).stores({...})` اضافه کن. جدول‌های **جدید**:

```
memUnits:   "id, page, order"
lexicon:    "wordId, unitId, hard"
chunks:     "verse, unitId"
questions:  "id, unitId, stage, type, skill, difficulty, verse, *targets"   // *targets: multiEntry
cards:      "key, kind, due, state, unitId, [state+due]"
attempts:   "++id, questionId, at, correct, *targets"
confusions: "[targetKey+optionTag], targetKey, count"
unitProgress: "unitId"
baseVerses: "n, page, unitId"
meta:       "key"
```

- جدول‌های قدیمی (`cities`, `lessons`, `fsrsCards`, `challenges` …) در نسخه‌ی ۲ بدون تغییر بمانند (حذف نکن). `userStats` را با فیلدهای جدید گسترش بده (در `schema.ts` اختیاری اضافه کن): `dailyNewUnitCap`, `desiredRetention` (۰٫۹۳)، `streak…` (موجود).
- `INITIAL_SEED_CONTENT` را از مسیر `initApp` خارج کن (حذف از seed؛ فایل بماند ولی استفاده نشود).

### ۳-۳) بارگذار محتوا `src/services/contentLoader.ts`

- `public/content/manifest.json`: `{ version, contentHash, units:[{id, page, half, order, verseFrom, verseTo, parts:["A","B","C"], files:[…] }] }`
- `loadManifestAndSync()`: اگر `meta.contentHash` با manifest فرق دارد، همه‌ی فایل‌ها را fetch، بدون پاک‌کردن `cards/attempts` در `questions/lexicon/chunks/baseVerses/memUnits` با `bulkPut` جایگزین کن؛ سوال‌های حذف‌شده را پاک کن.
- در حالت آفلاین از Dexie بخوان. کش Service-Worker/Capacitor لازم نیست.
- در راه‌اندازی، کارت‌های FSRS را **تنبل** بساز (هنگام اولین مشاهده‌ی هدف).

---

## فاز ۴ — موتور یادگیری (SRS + زمان‌بند جلسه + تصحیح)

### ۴-۱) تصحیح `src/services/grading.ts` (توابع خالص + تست)

`gradeQuestion(q: Question, response): GradeResult` برای هر شکل:

- **choice:** `response = optionId`. `correct = id===answer`. `wrongOptionIds=[id]` در صورت غلط.
- **match:** `response = [leftId, rightId][]`. امتیاز = تعداد جفت درست / کل؛ `correct` فقط اگر همه‌ی جفت‌ها درست؛ جفت‌های غلط در `wrongOptionIds` به صورت `"l1>r2"`.
- **order:** `response = bankId[]`. `correct` اگر برابر `answer`؛ امتیاز جزئی = نسبت جایگاه‌های درست (برای ORDER_VERSES امتیاز بر پایه‌ی طولانی‌ترین زیردنباله‌ی درست پیاپی).
- **cloze:** `response = Record<idx, bankId>`؛ امتیاز = جای‌خالی درست / کل.
- **perTarget:** برای سوال تک‌هدفی = `correct`؛ برای چندهدفی: اگر `score≥0.8` همه‌ی اهداف درست، وگرنه اهداف مربوط به آیه‌ی `q.verse` غلط و بقیه درست (قاعده را در یک تابع واحد پیاده کن و تست بنویس).
- هیچ مقایسه‌ی رشته‌ی عربی انجام نشود.

### ۴-۲) FSRS روی همه‌ی انواع کارت (`src/services/fsrsScheduler.ts`)

- موجود را حفظ و تعمیم بده: `recordCardReview(key: CardKey, rating, ctx)`، کلید اصلی جدول `cards` (کلید رشته‌ای). برای کارت‌های `w:` اگر قبلاً `fsrsCards` داشت مهاجرت لازم نیست.
- پارامتر `request_retention`: **۰٫۹۳** برای `vr/vn/sq/pg`، **۰٫۹۰** برای `w/vt`. حداکثر فاصله‌ی مرور ۱۲۰ روز. `enable_fuzz: false` برای قابل‌تکرار بودن تست‌ها.
- نگاشت رتبه (از `calculateImplicitFsrsRating` موجود استفاده کن و تعمیم بده):
  - غلط → ۱ (Again)
  - درست با راهنما/تغییر پاسخ/کند (> ۲٫۵× میانه‌ی زمان آن نوع) → ۲ (Hard)
  - درست → ۳ (Good)
  - درست و سریع (< ۰٫۶× میانه‌ی زمان) و بدون تغییر انتخاب → ۴ (Easy)
  - **میانه‌ی زمان هر نوع سوال** را از جدول `attempts` به‌صورت لغزنده (۵۰ آخرین) بگیر؛ پیش‌فرض‌ها: choice ۸ث، match ۲۰ث، order ۲۵ث، cloze ۳۰ث.
- اهداف چندگانه‌ی یک سوال هر کدام جداگانه ثبت شوند (طبق `perTarget`).

### ۴-۳) زمان‌بند جلسه `src/services/sessionPlanner.ts`

انواع جلسه:

| جلسه | محتوا |
|---|---|
| `STAGE` | یادگیری یک stage از یک واحد (۱ تا ۸) |
| `REVIEW` | مرور روزانه‌ی کارت‌های سررسیدشده (مستقل از واحد) |
| `REMEDIAL` | ترمیم خطاها: فقط اهدافی که امروز غلط شده یا `lapses` بالا دارند |
| `CUMULATIVE` | مرور تجمعی چند واحد/یک صفحه/کل سوره |

قواعد `STAGE`:

1. حجم هر جلسه: ۱۲ تا ۲۰ سوال؛ stage 8 تا ۳۰ سوال. اگر stage بیش از این سوال دارد، به چند «دور» تقسیم شود (دور‌ها متوالی‌اند و هر دور یک پیشرفت جزئی ثبت می‌کند).
2. **انتخاب سوال برای هر هدف:** از میان سوال‌های stage فعلی که `targets` را می‌پوشانند، سوالی را بردار که
   (الف) دشواری‌اش به «قدرت حافظه» هدف می‌خورد: `stability < 2d → ۱–۲`، `۲–۱۰d → ۳`، `>۱۰d → ۴–۵`؛ در stage جدید برای کارت `New` از آسان شروع کن و هر پاسخ درست پیاپی، دشواری را یک پله ببر؛ هر غلط دو پله پایین بیاور؛
   (ب) **تازه‌ترین نوع نبوده باشد** و **این `id` را کاربر در ۷ روز اخیر ندیده باشد** (چرخش بین سوال‌های خواهر؛ اگر همه دیده شده‌اند، قدیمی‌ترین دیده‌شده؛ آنگاه شکل جدید را ترجیح بده)؛
   (ج) اگر کاربر در `confusions` برای این هدف الگوی خطای مشخص دارد (مثلاً `false_friend` یا `adjacent_number`)، سوالی را ترجیح بده که همان `distractorTags` را دارد (تمرین هدفمند روی ضعف).
3. **کارت‌های جدید در جلسه‌ی یادگیری:** هر هدف جدید باید در همان جلسه حداقل ۳ بار با ۳ شکل متفاوت دیده شود (گام‌های درون‌جلسه‌ای: بعد از ۱ سوال، بعد از ~۴، بعد از ~۹ سوال) و فقط اگر در دو نوبت آخر درست بود «فارغ‌شده» شمرده شود.
4. **مرور درهم‌آمیخته:** ≈ ۲۰٪ هر جلسه از سوال‌های واحدهای قبلی (کارت‌های سررسید یا ضعیف) باشد.
5. **ارجاع مجدد پس از خطا:** سوال غلط → همان هدف با سوال خواهر دیگر پس از +۳ و بار دوم پس از +۷ سوال در صف بیاید (حداکثر ۲ بار؛ در stage 8 بازگردانی انجام نشود).
6. اهداف هر جلسه ترجیحاً از چند آیه‌ی هم‌جوار باشد (برای پیوستگی)؛ ترتیب آیات در stage 5 و 7 حتماً پیاپی.

قواعد `REVIEW`:

- فقط کارت‌های `due ≤ now`، به ترتیب «بیشترین فراموشی (کمترین retrievability) اول»؛ سقف ۶۰ سوال در جلسه، با گزینه‌ی «ادامه».
- برای هر کارت، سوال با روش بالا انتخاب شود (دشواری هماهنگ با stability).
- کارت‌های `pg:` فقط با `ORDER_VERSES` سراسری و `BUILD_FROM_NUMBER` پشت‌سر‌هم مرور می‌شوند.

### ۴-۴) قواعد پیشرفت و تسلط (`src/services/mastery.ts`)

- **پایان هر stage:** دقت ≥ ۸۵٪ و برای هر هدف stage دست‌کم ۲ درست پیاپی در آخرین نوبت‌ها؛ وگرنه «دور اصلاحی» (REMEDIAL) روی اهداف ضعیف و تکرار stage.
- **stage 8 (آزمون تسلط):** قبول با ≥ ۹۰٪ و بدون استفاده از راهنما؛ در غیر این صورت ۲۴ ساعت بعد مجدد (با سوال‌های متفاوت stage 8) و بلافاصله دور ترمیمی.
- **تسلط هر آیه** از چهار مهارت: `vr` (بازیابی)، `vt` (ترجمه)، `vn` (شماره)، `sq` (ترتیب). برای هر مهارت سطح: `۰ جدید`، `۱ در حال یادگیری`، `۲ تثبیت‌شده (stability ≥ ۷ روز)`، `۳ مسلط (stability ≥ ۳۰ روز و lapses=۰ در ۳ مرور آخر)`. **«آیه‌ی طلایی»** = هر چهار مهارت سطح ۳.
- **تسلط کلمه:** `w:` با stability ≥ ۲۱ روز.
- **تسلط واحد (نصف‌صفحه):** همه‌ی آیات طلایی + `pg:` مسلط + همه‌ی کلمات سخت مسلط.
- **قفل واحد بعدی:** وقتی stage 8 واحد قبل گذرانده شد و **بدهی مرور** (تعداد کارت‌های سررسید) < ۴۰ باشد. اگر بدهی بیشتر است، پیام «اول مرورها» و دکمه‌ی شروع مرور.
- **مرور تجمعی خودکار:** پس از هر ۳ واحد (و پس از اتمام هر صفحه‌ی کامل) یک آزمون `CUMULATIVE` اجباری؛ در پایان همه‌ی واحدها آزمون «کل سوره» با ORDER_VERSES و NUMBER_TO_VERSE_START روی ۸۸ آیه.
- **شاخص «احتمال یادآوری امروز»** برای هر آیه/واحد از `retrievability` کارت‌ها محاسبه و در داشبورد نمایش داده شود.

### ۴-۵) تغییر Zustand `useAppStore.ts`

- جلسه: `session.queue: PlannedItem[]` (`{question, kind:"main"|"requeue", retryOf?}`)، `index`, `responses`, `hintsUsed`، `startedAt` برای هر سوال.
- `submitAnswer(response)`: `gradeQuestion` → `recordCardReview` به‌ازای هر `perTarget` → ثبت `attempts` و به‌روزرسانی `confusions` برای گزینه‌های غلط (با `distractorTags`) → ورود مجدد به صف طبق قاعده‌ی ۵.
- **سیستم چراغ (lamps):** مانع یادگیری نشود. جلسه هرگز با صفر چراغ قفل نشود؛ در عوض «چراغ» فقط یک نشانگر نمره‌ی جلسه باشد (۵ تا ۰)، و پیامد آن فقط پاداش کمتر باشد. `LampRefillModal` از مسیر اصلی کنار برود.
- `recordDailyChillehActivity` را حفظ کن (چله‌ی انس)، با شرط «دست‌کم یک جلسه‌ی REVIEW یا STAGE تکمیل‌شده».
- `completeStage(unitId, stage)` / `unitProgress` ذخیره شود (حداقل: `currentStage`, `stageAccuracy`, `finalTestAttempts`, `lastFinalTestAt`, `passedAt`).

---

## فاز ۵ — رابط کاربری

### ۵-۱) نمای مصحف `src/components/mushaf/MushafHalfPage.tsx`

- نمایش **دقیق نصف‌صفحه** با خطوط واقعی مصحف (با `line` هر کلمه از base)، فونت KFGQPC Hafs، شماره‌ی آیه در دایره‌ی تزئینی (`۝` یا U+06DD) در پایان هر آیه.
- حالت‌ها: `reading` (رنگی)، `hidden` (آیات پنهان با فقط شماره‌ی آیه)، `partial` (آیه‌های انتخاب‌شده پنهان).
- لمس هر کلمه: نمایش `gloss`؛ کلمات `hard` با زیرخط رنگی و بازشدن کارت کوچک (`meaningFa`, `rootAr`, `trapFa`, `tipFa`).
- ترجمه‌ی انصاریان زیر هر آیه (قابل‌پنهان‌کردن).
- از `ColoredArabicWord` فقط برای رنگ‌بندی `segments` کلمات سخت استفاده شود؛ `DeGluingPuzzle` فقط در یک حالت اختیاری «تمرین بیشتر» باقی بماند (خارج از مسیر اصلی).

### ۵-۲) کامپوننت‌های سوال (جایگزین `ChallengeEngine`)

یک `QuestionRenderer.tsx` که بر اساس `shape` یکی از چهار کامپوننت زیر را نشان می‌دهد؛ **همه** باید `onSubmit(response)` و `disabled` داشته باشند و پاسخ را با شناسه‌ها برگردانند:

| کامپوننت | شکل | توضیح UI |
|---|---|---|
| `ChoiceQuestionView` | choice | کارت‌های گزینه، پشتیبانی از متن عربی بزرگ (RTL، فونت مصحف)، فارسی و شماره‌ی بزرگ |
| `MatchTwoRowsView` | match | **دو ردیف** چپ/راست؛ لمس یکی از هر ردیف → جفت و رنگ‌بندی؛ جفت غلط تکان می‌خورد؛ ردیف راست گزینه‌ی اضافه دارد. حداقل ۴ جفت. |
| `WordBankOrderView` | order | بانک کلمات/چانک‌ها پایین، ناحیه‌ی چینش بالا؛ لمس برای افزودن/حذف؛ جهت راست‌به‌چپ؛ امکان «پاک‌کردن»؛ برای `ORDER_VERSES` هر آیه کارت با شماره و آغاز آیه است و قابل drag |
| `ClozeView` | cloze | متن آیه با جای‌خالی (جای‌خالی به‌صورت باکس)؛ بانک زیر آن؛ لمس جای‌خالی سپس انتخاب بانک (یا برعکس) |

مشترک: شمارنده‌ی سوال، نوار پیشرفت، دکمه‌ی «بررسی»، **راهنما** (ترتیب: نمایش `gloss`/ترجمه، سپس یک کلمه‌ی اول؛ استفاده از راهنما رتبه را به Hard می‌برد و در stage 8 غیرفعال است)، بازخورد فوری (سبز/قرمز)، نمایش پاسخ درست با متن کامل آیه از `baseVerses`، نمایش `explanationFa`، و اگر هدف کلمه‌ی سخت است `trapFa`. گزینه‌ی انتخاب‌شده‌ی اشتباه با رنگ متفاوت نشان داده شود.

سایر سوال‌های قدیمی (`FalseFriendHunter`, `AudioCloze`) از مسیر اصلی حذف و فقط در پوشه‌ی `legacy/` نگه‌داشته شوند.

### ۵-۳) صفحات

1. **نقشه (`MapPage` / `JourneyMap`)**: هر «گره» یک stage از یک واحد است؛ ۵ ایستگاه موجود **حفظ شوند** اما صرفاً تزئینی: واحدها به‌صورت پیوسته و برابر بین ۵ ایستگاه تقسیم شوند (مثلاً ۲۴ واحد → ۵،۵،۵،۵،۴). نام و عنوان ایستگاه‌ها را فقط اگر نیاز بود به «بخش ۱…۵» ساده کن؛ ادعای تطبیق ایستگاه با داستان آیات نباید باشد.
2. **صفحه‌ی واحد (`UnitPage`)**: نمایش `MushafHalfPage` در حالت مطالعه («قرائت اولیه»، stage 0 بدون امتیاز)، فهرست ۸ stage با وضعیت و درصد، دکمه‌ی شروع/ادامه، و سطح تسلط هر آیه (۴ حلقه).
3. **جلسه (`LessonSessionPage`)** بازنویسی با `sessionPlanner` و `QuestionRenderer`.
4. **مرور روزانه (`ReviewPage`)**: تعداد کارت‌های سررسید، تخمین زمان، دکمه‌ی شروع، تفکیک بر اساس مهارت.
5. **داشبورد تسلط (`MasteryPage`)**: شبکه‌ی ۸۸ خانه‌ای آیات که هر خانه‌ی آیه با چهار ربع (vr/vt/vn/sq) رنگ می‌شود، فیلتر بر اساس واحد/صفحه، لیست «ضعیف‌ترین ۱۰ آیه/کلمه»، نمودار روند دقت، و دکمه‌ی «تمرین نقاط ضعف» (جلسه‌ی REMEDIAL).
6. **تنظیمات**: اندازه‌ی فونت مصحف، نمایش/پنهان ترجمه، اندازه‌ی جلسه، سقف واحد جدید روزانه.
7. **مشاهده‌ی صفحه‌ای/تدریجی**: از طریق `MushafHalfPage` در حالت `reading` برای هر واحد؛ نمایش «صفحه‌ی کامل» با اتصال دو نصف.

### ۵-۴) بازخورد روانی (کوتاه)

- «نگین عقیق» (`SmartAqeeqGem`) و `HostVictoryCard` را نگه دار؛ پیام‌ها بر اساس نتیجه‌ی جلسه‌ی جدید (دقت و آیات تازه‌طلایی‌شده).
- پاداش نور بر اساس تعداد پاسخ درست و تثبیت‌ها، نه صرف «تمام کردن».

---

## فاز ۶ — ادغام محتوای تولیدشده و تحویل

1. ساختار نهایی: `public/content/units/<unitId>.partA.json|partB|partC` + `manifest.json` (اسکریپت `scripts/build-manifest.mjs` که `contentHash` را از محتوای فایل‌ها می‌سازد).
2. `npm run validate:content -- --strict` در `prebuild` اجرا شود تا ساخت با محتوای مشکل‌دار fail شود.
3. چند واحد نمونه (دست‌کم `u_p385a`) را با خروجی AI ادغام و اپ را کامل با آن راه‌اندازی کن؛ در نبود فایل‌های AI، یک **fixture دستی بسیار کوچک** فقط برای تست خودکار در `src/__fixtures__/` بساز (این fixture باید از base واقعی ساخته شود، نه نوشته‌ی دستی).
4. به‌روزرسانی `README.md` (حذف ادعای ۴ لایه‌ی قدیمی؛ توضیح مسیر جدید، دستورهای `fetch:base`، `build:inputs`، `validate:content`، و معماری).

---

## تست‌ها و پذیرش (Definition of Done)

**تست‌های خودکار (vitest):**

- `grading`: هر ۴ شکل، امتیاز جزئی، `perTarget` برای چندهدفی.
- `sessionPlanner`: عدم تکرار id در ۷ روز، چرخش نوع، دشواری مطابق stability، سقف جلسه، بازگردانی پس از خطا (+۳/+۷)، ۲۰٪ مرور درهم، نبود `PREV` برای آیه‌ی ۱.
- `fsrs`: نگاشت رتبه، کارت `w:` و `vr:`، فاصله‌های بیشینه.
- `mastery`: آیه‌ی طلایی، قفل واحد بعدی، بدهی مرور.
- `validate-content`: نمونه‌های درست و خراب.
- `units-plan`: تعداد آیه‌ها = ۸۸، تقسیم پیوسته و بدون هم‌پوشانی، همه‌ی آیات دقیقاً در یک واحد.

**پذیرش دستی:**

1. اپ بدون خطای کنسول اجرا شود و واحد ۱ را بدون اینترنت (پس از نخستین sync) کامل انجام دهد.
2. در `MushafHalfPage` هر نصف‌صفحه با مصحف چاپی مطابقت خطی دارد (نمونه‌ی ۳ صفحه را چشمی با نسخه‌ی چاپی مقایسه و در `DECISIONS.md` ثبت کن).
3. دو ردیف جفت‌سازی، چیدن آیه، جای‌خالی، آیه‌ی قبل/بعد، ترتیب آیات و شماره‌ی آیه همگی قابل بازی با لمس و کیبورد هستند.
4. پاسخ غلط → همان هدف دوباره در همان جلسه و در `confusions` ثبت می‌شود.
5. پس از دو روز شبیه‌سازی‌شده (تغییر ساعت)، `ReviewPage` کارت‌های سررسید را نشان می‌دهد.
6. هیچ متن قرآنی در سورس‌کد (`src/`) وجود ندارد (جز fixtureهای تست که از base ساخته شده‌اند).
7. `npm run build`، `lint` و تست‌ها بدون خطا.

**گزارش نهایی ایجنت:** فهرست فایل‌های ساخته/تغییر داده، تصمیم‌های `DECISIONS.md`، نتایج راستی‌آزمایی صفحه/خط، و موارد باز.
