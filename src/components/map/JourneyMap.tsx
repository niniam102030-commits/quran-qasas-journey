// src/components/map/JourneyMap.tsx
import React, { useEffect, useState, useRef } from "react";
import { db } from "../../db/database";
import { useAppStore } from "../../store/useAppStore";
import type { CityNode, Unit, Lesson } from "../../types/schema";
import { CityStationHeader } from "./CityStationHeader";
import { LessonNodeButton, type LessonNodeStatus } from "./LessonNodeButton";

export interface JourneyMapProps {
    onStartLesson: (lessonId: string) => void;
}

/**
 * ایستگاه‌های پیش‌فرض سوره مبارکه قصص (سفر سرگذشت حضرت موسی و عبرت قارون)
 */
const SPIRITUAL_ROADMAP_FALLBACK_CITIES: CityNode[] = [
    {
        id: "qasas_station_nile",
        order: 1,
        nameFa: "قصر فرعون و کرانه نیل",
        subtitleFa: "ایستگاه اول: تولد موسی (ع)، افکندن به نیل و آرامش دل مادر",
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
        subtitleFa: "ایستگاه دوم: استغاثه مظلوم، مشت ناخواسته و خروج بیم‌ناک",
        themeGradient: { from: "#B45309", to: "#78350F", accent: "#FBBF24" },
        backgroundSvgUrl: "/assets/cities/city_gate.svg",
        hostPortraitUrl: "/assets/hosts/host_station_2.webp",
        hostNameFa: "مؤمن آل فرعون",
        voiceClipIds: [],
        isUnlockedByDefault: false,
    },
    {
        id: "qasas_station_madyan",
        order: 3,
        nameFa: "چاه آب مَدین و سایه‌سار نخل‌ها",
        subtitleFa: "ایستگاه سوم: بازداشتن گله، شرم و وقار صفورا و استخدام امین",
        themeGradient: { from: "#059669", to: "#065F46", accent: "#34D399" },
        backgroundSvgUrl: "/assets/cities/madyan_well.svg",
        hostPortraitUrl: "/assets/hosts/host_station_3.webp",
        hostNameFa: "شعیب پیامبر (ع)",
        voiceClipIds: [],
        isUnlockedByDefault: false,
    },
    {
        id: "qasas_station_tur",
        order: 4,
        nameFa: "کوه طور و کرانه وادی مقدس",
        subtitleFa: "ایستگاه چهارم: اخگر آتش در شب سرد، ندای شجره و مار تندرو",
        themeGradient: { from: "#7C3AED", to: "#4C1D95", accent: "#F59E0B" },
        backgroundSvgUrl: "/assets/cities/mount_tur.svg",
        hostPortraitUrl: "/assets/hosts/host_station_4.webp",
        hostNameFa: "ندای طور و نور هدایت",
        voiceClipIds: [],
        isUnlockedByDefault: false,
    },
    {
        id: "qasas_station_qarun",
        order: 5,
        nameFa: "کاخ قارون و گنج‌های سنگین",
        subtitleFa: "ایستگاه پنجم: سرمستی ثروت، کلیدهای طاقت‌فرسا و بلعیده شدن در زمین",
        themeGradient: { from: "#1E293B", to: "#0F172A", accent: "#EAB308" },
        backgroundSvgUrl: "/assets/cities/qarun_palace.svg",
        hostPortraitUrl: "/assets/hosts/host_station_5.webp",
        hostNameFa: "عالمان عبرت‌آموز بنی‌اسرائیل",
        voiceClipIds: [],
        isUnlockedByDefault: false,
    },
];

export const JourneyMap: React.FC<JourneyMapProps> = ({ onStartLesson }) => {
    const userStats = useAppStore((s) => s.userStats);
    const [cities, setCities] = useState<CityNode[]>([]);
    const [unitsByCity, setUnitsByCity] = useState<Record<string, Unit[]>>({});
    const [lessonsByUnit, setLessonsByUnit] = useState<Record<string, Lesson[]>>(
        {}
    );
    const activeLessonRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        async function loadMapData() {
            const dbCities = await db.cities.orderBy("order").toArray();
            const mergedCities = [...dbCities];

            // افزودن ایستگاه‌های بعدی مسیر معنوی در صورتی که در دیتابیس هنوز وارد نشده باشند
            for (const fallbackCity of SPIRITUAL_ROADMAP_FALLBACK_CITIES) {
                if (!mergedCities.some((c) => c.id === fallbackCity.id)) {
                    mergedCities.push(fallbackCity);
                }
            }
            mergedCities.sort((a, b) => a.order - b.order);
            setCities(mergedCities);

            const allUnits = await db.units.orderBy("order").toArray();
            const unitGroup: Record<string, Unit[]> = {};
            allUnits.forEach((u) => {
                if (!unitGroup[u.cityId]) unitGroup[u.cityId] = [];
                unitGroup[u.cityId].push(u);
            });
            setUnitsByCity(unitGroup);

            const allLessons = await db.lessons.orderBy("order").toArray();
            const lessonGroup: Record<string, Lesson[]> = {};
            allLessons.forEach((l) => {
                if (!lessonGroup[l.unitId]) lessonGroup[l.unitId] = [];
                lessonGroup[l.unitId].push(l);
            });
            setLessonsByUnit(lessonGroup);
        }

        loadMapData();
    }, []);

    // اسکرول خودکار به سمت مرحله فعال جاری (پایین نقشه) تا کاربر سفر رو به بالای خود را آغاز کند
    useEffect(() => {
        if (cities.length > 0) {
            const timer = setTimeout(() => {
                if (activeLessonRef.current) {
                    activeLessonRef.current.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                } else {
                    window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: "smooth",
                    });
                }
            }, 250);
            return () => clearTimeout(timer);
        }
    }, [cities, userStats?.currentLessonId]);

    if (!userStats) return null;

    // شهرها را از مکه (بالا) به قم (پایین) مرتب می‌کنیم تا جهت نقشه از پایین به بالا (رو به تعالی) باشد
    const ascendingCities = [...cities].sort((a, b) => b.order - a.order);

    return (
        <div className="w-full max-w-xl mx-auto px-4 pt-4 pb-28 space-y-12">
            {/* قله مسیر: مقصد نهایی سوره قصص */}
            <div className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold text-center shadow-sm">
                <span>🏛️</span>
                <span>مقصد نهایی: کاخ قارون، فرجام استکبار و بشارت بازگشت پیروزمندانه (آیات ۴۳ تا ۸۸)</span>
            </div>

            {ascendingCities.map((city) => {
                const isCityUnlocked =
                    city.isUnlockedByDefault ||
                    userStats.unlockedCityIds.includes(city.id);

                const cityUnits = unitsByCity[city.id] || [];
                const cityLessons = cityUnits.flatMap(
                    (u) => lessonsByUnit[u.id] || []
                );

                const completedInCity = cityLessons.filter((l) =>
                    userStats.completedLessonIds.includes(l.id)
                ).length;

                // مرتب‌سازی واحدها و مراحل از بالا به پایین در رندر (تا شماره ۱ در پایین‌ترین مکان قرار گیرد)
                const sortedUnits = [...cityUnits].sort((a, b) => b.order - a.order);

                return (
                    <section key={city.id} className="space-y-6">
                        {/* واحدهای موضوعی و مسیر پرپیچ‌وخم گره‌ها به سمت بالا */}
                        {sortedUnits.length > 0 ? (
                            sortedUnits.map((unit) => {
                                const lessons = lessonsByUnit[unit.id] || [];
                                // مراحل داخل واحد را معکوس می‌کنیم تا مرحله ۱ در پایین‌ترین نقطه باشد
                                const sortedLessons = [...lessons].sort(
                                    (a, b) => b.order - a.order
                                );

                                return (
                                    <div key={unit.id} className="relative py-2 space-y-6">
                                        {/* جاده منحنی سینوسی بین گره‌ها با جهت صعودی */}
                                        <div className="relative flex flex-col items-center space-y-4">
                                            {/* خط نقطه‌چین طلایی مسیر در پس‌زمینه */}
                                            <div className="absolute top-6 bottom-6 w-1 border-r-4 border-dashed border-brand-amber/35 pointer-events-none" />

                                            {sortedLessons.map((lesson) => {
                                                const isCompleted =
                                                    userStats.completedLessonIds.includes(lesson.id);
                                                const isCurrent =
                                                    userStats.currentLessonId === lesson.id ||
                                                    (!isCompleted &&
                                                        lesson.order === 1 &&
                                                        isCityUnlocked &&
                                                        completedInCity === 0);

                                                const status: LessonNodeStatus = isCompleted
                                                    ? "completed"
                                                    : isCurrent
                                                        ? "current"
                                                        : "locked";

                                                // فرمول سینوسی بر اساس شماره مرحله (مرحله ۱ شروع از مرکز و پیچ به سمت بالا)
                                                const offsetX = Math.round(
                                                    Math.sin((lesson.order - 1) * 1.15) * 64
                                                );

                                                return (
                                                    <div
                                                        key={lesson.id}
                                                        ref={isCurrent ? activeLessonRef : null}
                                                        className="relative"
                                                    >
                                                        <LessonNodeButton
                                                            lesson={lesson}
                                                            status={status}
                                                            offsetX={offsetX}
                                                            onSelectLesson={onStartLesson}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* برچسب موضوع حفظ موضوعی واحد در ورودی واحد */}
                                        <div className="mx-auto w-fit px-4 py-1.5 rounded-full bg-termeh-card dark:bg-lapis-card border border-termeh-border dark:border-lapis-border shadow-sm text-center">
                                            <span className="text-xs font-extrabold text-brand-primary dark:text-brand-amber">
                                                موضوع: {unit.titleFa}
                                            </span>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                {unit.descriptionFa}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            /* پیش‌نمایش گره ایستگاه‌های آینده که هنوز قفل هستند */
                            <div className="relative flex flex-col items-center py-4">
                                <LessonNodeButton
                                    lesson={{
                                        id: `preview_${city.id}`,
                                        cityId: city.id,
                                        unitId: "",
                                        order: 1,
                                        titleFa: `مراحل ${city.nameFa}`,
                                        targetVerseId: "",
                                        wordIds: [],
                                        challengeIds: [],
                                        rewardNoorXp: 30,
                                        rewardAqeeqGem: 15,
                                    }}
                                    status="locked"
                                    offsetX={0}
                                    onSelectLesson={() => { }}
                                />
                            </div>
                        )}

                        {/* هدر ایستگاه شهر و میزبان (در پایین مراحل این شهر به‌عنوان دروازه ورود) */}
                        <CityStationHeader
                            city={city}
                            isUnlocked={isCityUnlocked}
                            completedLessonsCount={completedInCity}
                            totalLessonsCount={Math.max(1, cityLessons.length)}
                        />
                    </section>
                );
            })}

            {/* نشان نقطه آغازین سفر در پایین‌ترین نقطه نقشه */}
            <div className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-bold text-center shadow-sm">
                <span>🌊</span>
                <span>نقطه آغاز: قصر فرعون و کرانه نیل (تولد حضرت موسی (ع) • آیات ۱ تا ۱۳ • جهت حرکت رو به بالا ⬆️)</span>
            </div>
        </div>
    );
};