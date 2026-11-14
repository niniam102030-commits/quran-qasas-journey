// src/components/map/CityStationHeader.tsx
import React, { useState, useEffect } from "react";
import type { CityNode } from "../../types/schema";
import {
    audioCacheService,
    type CityAudioDownloadProgress,
} from "../../db/audioCacheService";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

export interface CityStationHeaderProps {
    city: CityNode;
    isUnlocked: boolean;
    completedLessonsCount: number;
    totalLessonsCount: number;
}

/**
 * رندرکننده وکتور لایه‌ای نماد معماری هر شهر (SVG خالص برای اجرای آنی آفلاین)
 */
const CitySkylineSvg: React.FC<{ cityId: string }> = ({ cityId }) => {
    if (cityId.includes("makkah")) {
        // نماد کعبه معظمه و رواق‌های مسجدالحرام
        return (
            <svg
                className="absolute left-2 bottom-0 w-44 h-28 opacity-20 pointer-events-none"
                viewBox="0 0 200 120"
                fill="currentColor"
            >
                <rect x="65" y="35" width="70" height="85" rx="4" />
                <rect x="65" y="52" width="70" height="10" fill="#F59E0B" />
                <path d="M20 120V70l15-15 15 15v50H20zm130 0V70l15-15 15 15v50h-30z" />
            </svg>
        );
    }

    if (cityId.includes("quds") || cityId.includes("gaza")) {
        // نماد قبةالصخره و مسجدالاقصی
        return (
            <svg
                className="absolute left-2 bottom-0 w-44 h-28 opacity-20 pointer-events-none"
                viewBox="0 0 200 120"
                fill="currentColor"
            >
                <path d="M60 75a40 40 0 0180 0H60z" />
                <rect x="45" y="75" width="110" height="45" />
                <rect x="97" y="20" width="6" height="18" />
            </svg>
        );
    }

    // نماد گنبد و گلدسته‌های حرم‌های مطهر (قم، مشهد، کربلا و سایر ایستگاه‌ها)
    return (
        <svg
            className="absolute left-2 bottom-0 w-48 h-28 opacity-20 pointer-events-none"
            viewBox="0 0 220 120"
            fill="currentColor"
        >
            <path d="M75 75c0-25 35-45 35-55 0 10 35 30 35 55H75z" />
            <rect x="60" y="75" width="100" height="45" />
            <rect x="40" y="30" width="10" height="90" rx="3" />
            <rect x="170" y="30" width="10" height="90" rx="3" />
            <circle cx="110" cy="15" r="4" />
        </svg>
    );
};

export const CityStationHeader: React.FC<CityStationHeaderProps> = ({
    city,
    isUnlocked,
    completedLessonsCount,
    totalLessonsCount,
}) => {
    const { playSfx } = useHapticsAndSfx();
    const [cacheStatus, setCacheStatus] =
        useState<CityAudioDownloadProgress | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        let mounted = true;
        audioCacheService.getCityCacheStatus(city.id).then((status: CityAudioDownloadProgress) => {
            if (mounted) setCacheStatus(status);
        });
        return () => {
            mounted = false;
        };
    }, [city.id]);

    const handleDownloadAudio = async () => {
        if (isDownloading) return;
        playSfx("snap-click");
        setIsDownloading(true);
        try {
            await audioCacheService.downloadCityAudioPack(city.id, (progress: CityAudioDownloadProgress) => {
                setCacheStatus(progress);
            });
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div
            style={{
                background: `linear-gradient(135deg, ${city.themeGradient.from}, ${city.themeGradient.to})`,
            }}
            className={`relative w-full rounded-3xl p-5 text-white shadow-xl border-b-4 border-black/25 overflow-hidden transition-all ${!isUnlocked ? "grayscale opacity-75" : ""
                }`}
        >
            {/* وکتور افق معماری شهر در پس‌زمینه */}
            <CitySkylineSvg cityId={city.id} />

            {/* حاشیه اسلیمی بالای کارت */}
            <div className="relative z-10 flex items-start justify-between gap-4">
                {/* اطلاعات شهر و پیشرفت */}
                <div className="flex-1 space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/25 text-[11px] font-bold">
                        <span
                            style={{ backgroundColor: city.themeGradient.accent }}
                            className="w-2 h-2 rounded-full"
                        />
                        <span>ایستگاه {city.order}</span>
                        {!isUnlocked && <span>🔒 قفل</span>}
                    </div>

                    <h2 className="text-xl md:text-2xl font-extrabold tracking-tight drop-shadow-sm">
                        {city.nameFa}
                    </h2>

                    <p className="text-xs md:text-sm text-white/90 leading-relaxed max-w-md">
                        {city.subtitleFa}
                    </p>

                    {/* نوار وضعیت دروس شهر + دکمه کش آفلاین صوت */}
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 rounded-xl bg-white/15 backdrop-blur-sm text-xs font-bold">
                            {completedLessonsCount} از {totalLessonsCount} مرحله
                        </span>

                        <button
                            type="button"
                            onClick={handleDownloadAudio}
                            disabled={isDownloading || cacheStatus?.isComplete}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${cacheStatus?.isComplete
                                    ? "bg-brand-success/30 border border-white/30 text-white cursor-default"
                                    : "bg-brand-amber text-slate-900 hover:brightness-105 active:scale-95 cursor-pointer shadow-sm"
                                }`}
                        >
                            {cacheStatus?.isComplete ? (
                                <>
                                    <span>✓</span>
                                    <span>صوت آفلاین آماده</span>
                                </>
                            ) : isDownloading ? (
                                <>
                                    <span className="animate-spin">⏳</span>
                                    <span>دریافت صوت ({cacheStatus?.percentage ?? 0}٪)</span>
                                </>
                            ) : (
                                <>
                                    <span>⬇</span>
                                    <span>دانلود صوت شهر</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* قاب باوقار ۲.۵ بعدی شخصیت میزبان ایستگاه */}
                <div className="flex flex-col items-center shrink-0">
                    <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl p-1 bg-gradient-to-b from-brand-amber via-amber-300 to-brand-amberDark shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
                        <div className="w-full h-full rounded-xl overflow-hidden bg-lapis-card flex items-center justify-center relative">
                            {!imgError && city.hostPortraitUrl ? (
                                <img
                                    src={city.hostPortraitUrl}
                                    alt={city.hostNameFa}
                                    onError={() => setImgError(true)}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                /* سیلوئت نورانی باوقار در صورت عدم وجود تصویر محلی */
                                <div className="w-full h-full bg-gradient-to-t from-lapis-bg to-brand-primaryDark flex flex-col items-center justify-center text-brand-amber">
                                    <svg
                                        className="w-10 h-10 opacity-90"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path d="M12 2L14.8 8.2L21.5 9.2L16.6 14L17.8 20.7L12 17.6L6.2 20.7L7.4 14L2.5 9.2L9.2 8.2L12 2Z" />
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* نشان تاج طلایی میزبان */}
                        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-brand-amber text-white text-xs flex items-center justify-center shadow border border-white">
                            ۞
                        </span>
                    </div>

                    <span className="mt-1.5 px-2.5 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-[11px] font-bold text-amber-200 border border-amber-300/30">
                        {city.hostNameFa}
                    </span>
                </div>
            </div>
        </div>
    );
};