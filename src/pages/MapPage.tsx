// src/pages/MapPage.tsx
import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { TopStatsBar } from "../components/layout/TopStatsBar";
import { JourneyMap } from "../components/map/JourneyMap";
import { LampRefillModal } from "../components/recovery/LampRefillModal";

export interface MapPageProps {
    onNavigateToLessonSession?: (lessonId: string) => void;
}

export const MapPage: React.FC<MapPageProps> = ({
    onNavigateToLessonSession,
}) => {
    const userStats = useAppStore((s) => s.userStats);
    const startLessonSession = useAppStore((s) => s.startLessonSession);
    const [isLampModalOpen, setIsLampModalOpen] = useState(false);

    const handleStartLesson = async (lessonId: string) => {
        if (userStats && userStats.lampsCount <= 0) {
            setIsLampModalOpen(true);
            return;
        }
        await startLessonSession(lessonId);
        onNavigateToLessonSession?.(lessonId);
    };

    return (
        <div className="min-h-screen bg-termeh-bg dark:bg-lapis-bg text-slate-800 dark:text-slate-100 transition-colors">
            {/* نوار وضعیت چسبیده به بالای صفحه */}
            <TopStatsBar onOpenLampRefillModal={() => setIsLampModalOpen(true)} />

            {/* نقشه عمودی سیر داستانی سوره قصص از نیل تا طور و کاخ قارون */}
            <main className="pb-24">
                <JourneyMap onStartLesson={handleStartLesson} />
            </main>

            {/* مودال شارژ ۵ چراغ با مرور ۳ دقیقه‌ای */}
            <LampRefillModal
                isOpen={isLampModalOpen}
                onClose={() => setIsLampModalOpen(false)}
            />
        </div>
    );
};