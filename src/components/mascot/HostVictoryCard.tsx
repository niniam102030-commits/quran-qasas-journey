// src/components/mascot/HostVictoryCard.tsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { db } from "../../db/database";
import type { CityNode, VoiceClip } from "../../types/schema";
import { useQuranAudio } from "../../hooks/useQuranAudio";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";
import { AudioWaveHalo } from "../common/AudioWaveHalo";
import { Button3D } from "../common/Button3D";

export interface HostVictoryCardProps {
  cityId?: string;
  city?: CityNode | null;
  voiceClip?: VoiceClip | null;
  lessonTitleFa?: string;
  earnedNoorXp: number;
  earnedAqeeqGem: number;
  accuracyPercent?: number;
  onContinueToMap: () => void;
}

const DEFAULT_VOICE_CLIP: VoiceClip = {
  id: "vc_default_ahsan",
  speakerName: "میزبان ایستگاه",
  phraseText: "احسنت، طیب‌الله انفاسکم! گام مبارکی در فهم کلام الهی برداشتید.",
  audioUrl: "/audio/hosts/vc_ahsan.mp3",
  durationMs: 2800,
};

export const HostVictoryCard: React.FC<HostVictoryCardProps> = ({
  cityId = "qasas_station_nile",
  city: initialCity = null,
  voiceClip: initialVoiceClip = null,
  lessonTitleFa = "گام جدید در فهم کلام الهی",
  earnedNoorXp,
  earnedAqeeqGem,
  accuracyPercent = 100,
  onContinueToMap,
}) => {
  const effectiveCityId = initialCity?.id || cityId;
  const { playHostClip, isPlaying, audioEnergy, stopAudio } =
    useQuranAudio(effectiveCityId);
  const { playSfx } = useHapticsAndSfx();

  const [city, setCity] = useState<CityNode | null>(initialCity);
  const [voiceClip, setVoiceClip] = useState<VoiceClip>(
    initialVoiceClip || DEFAULT_VOICE_CLIP
  );
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    playSfx("stage-fanfare");

    async function loadHostAndPlayVoice() {
      let activeCity = initialCity;
      if (!activeCity && effectiveCityId) {
        activeCity = (await db.cities.get(effectiveCityId)) ?? null;
        if (activeCity) {
          setCity(activeCity);
        }
      }

      let clipToPlay: VoiceClip = initialVoiceClip || DEFAULT_VOICE_CLIP;

      if (!initialVoiceClip && activeCity && activeCity.voiceClipIds.length > 0) {
        const randomClipId =
          activeCity.voiceClipIds[
            Math.floor(Math.random() * activeCity.voiceClipIds.length)
          ];
        const loadedClip = await db.voiceClips.get(randomClipId);
        if (loadedClip) {
          clipToPlay = loadedClip;
        }
      }

      setVoiceClip(clipToPlay);
      await playHostClip(clipToPlay);
    }

    loadHostAndPlayVoice();

    return () => {
      stopAudio();
    };
  }, [effectiveCityId, initialCity, initialVoiceClip, playHostClip, playSfx, stopAudio]);

  const handleReplayVoice = () => {
    playHostClip(voiceClip);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="w-full max-w-md mx-auto rounded-3xl bg-white dark:bg-lapis-card border-2 border-brand-amber shadow-2xl p-6 text-center space-y-6 relative overflow-hidden"
    >
      {/* پرتو نور طلایی پس‌زمینه */}
      <div className="absolute -top-20 inset-x-0 h-44 bg-gradient-to-b from-brand-amber/20 to-transparent pointer-events-none" />

      {/* قاب طلایی و هاله موج صوتی نورانی دور تصویر میزبان */}
      <div className="relative pt-4 flex flex-col items-center">
        <AudioWaveHalo
          isPlaying={isPlaying}
          energy={audioEnergy}
          size="lg"
          accentColor="amber"
        >
          {!imgError && city?.hostPortraitUrl ? (
            <img
              src={city.hostPortraitUrl}
              alt={city.hostNameFa}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-brand-primary to-lapis-bg flex items-center justify-center text-brand-amber text-4xl">
              ۞
            </div>
          )}
        </AudioWaveHalo>

        <span className="mt-4 px-3 py-0.5 rounded-full bg-brand-amber/15 border border-brand-amber/40 text-xs font-extrabold text-brand-amberDark dark:text-brand-amber">
          {city?.hostNameFa || voiceClip.speakerName}
        </span>
      </div>

      {/* جمله تشویقی میزبان و دکمه پخش مجدد صوت */}
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white">
          مرحله با موفقیت کامل شد!
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {lessonTitleFa}
        </p>

        <div className="mt-3 p-3.5 rounded-2xl bg-termeh-bg dark:bg-lapis-bg border border-brand-amber/40 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-700 dark:text-amber-100 text-right leading-relaxed flex-1">
            «{voiceClip.phraseText}»
          </p>
          <button
            type="button"
            onClick={handleReplayVoice}
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              isPlaying
                ? "bg-brand-amber text-white scale-105 shadow-md"
                : "bg-brand-amber/20 text-brand-amberDark dark:text-brand-amber hover:bg-brand-amber/30"
            }`}
            title="پخش مجدد پیام صوتی میزبان"
          >
            🔊
          </button>
        </div>
      </div>

      {/* کارت‌های پاداش نور، عقیق و دقت */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3 rounded-2xl bg-brand-amber/10 border border-brand-amber/30">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            پاداش نور
          </span>
          <span className="text-lg font-extrabold text-brand-amberDark dark:text-brand-amber">
            +{earnedNoorXp} ۞
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-brand-primary/10 border border-brand-primary/30">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            گوهر عقیق
          </span>
          <span className="text-lg font-extrabold text-brand-primary">
            +{earnedAqeeqGem} ♦
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-brand-success/10 border border-brand-success/30">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            دقت پاسخ
          </span>
          <span className="text-lg font-extrabold text-brand-success">
            {accuracyPercent}٪
          </span>
        </div>
      </div>

      {/* دکمه ادامه مسیر */}
      <Button3D variant="success" size="lg" fullWidth onClick={onContinueToMap}>
        ادامه سفر معنوی
      </Button3D>
    </motion.div>
  );
};