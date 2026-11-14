// src/components/common/AudioWaveHalo.tsx
import React from "react";

export interface AudioWaveHaloProps {
  isPlaying: boolean;
  energy?: number; // عدد بین 0 تا 1 از useQuranAudio
  size?: "sm" | "md" | "lg";
  accentColor?: "amber" | "turquoise" | "primary";
  hasFrame?: boolean;
  className?: string;
  children: React.ReactNode;
}

const SIZE_DIMENSIONS: Record<"sm" | "md" | "lg", string> = {
  sm: "w-16 h-16",
  md: "w-24 h-24",
  lg: "w-32 h-32",
};

export const AudioWaveHalo: React.FC<AudioWaveHaloProps> = ({
  isPlaying,
  energy = 0.6,
  size = "md",
  accentColor = "amber",
  hasFrame = true,
  className = "",
  children,
}) => {
  const activeScale1 = isPlaying ? 1 + energy * 0.18 : 1;
  const activeScale2 = isPlaying ? 1 + energy * 0.34 : 1;
  const activeScale3 = isPlaying ? 1 + energy * 0.52 : 1;

  const isAmber = accentColor === "amber";

  const primaryRingColor = isAmber
    ? "border-brand-amber/60 bg-brand-amber/15"
    : "border-brand-primary/60 bg-brand-primary/15";

  const secondaryRingColor = isAmber
    ? "border-brand-primary/40 bg-brand-amber/10"
    : "border-brand-amber/40 bg-brand-primary/10";

  const shamsehBorderColor = isAmber
    ? "border-brand-amber shadow-[0_0_20px_rgba(245,158,11,0.45)]"
    : "border-brand-primary shadow-[0_0_20px_rgba(0,168,150,0.45)]";

  const frameBorderColor = isAmber
    ? "border-brand-amber"
    : "border-brand-primary";

  const equalizerBg = isAmber
    ? "bg-brand-amber"
    : "bg-brand-primary";

  return (
    <div
      className={`relative inline-flex items-center justify-center ${SIZE_DIMENSIONS[size]} ${className}`}
    >
      {/* حلقه موج بیرونی سوم */}
      <div
        style={{
          transform: `scale(${activeScale3})`,
          opacity: isPlaying ? Math.max(0.15, energy * 0.45) : 0,
        }}
        className={`absolute inset-0 rounded-full border transition-all duration-75 pointer-events-none ${secondaryRingColor}`}
      />

      {/* حلقه موج میانی دوم */}
      <div
        style={{
          transform: `scale(${activeScale2})`,
          opacity: isPlaying ? Math.max(0.25, energy * 0.65) : 0,
        }}
        className={`absolute inset-0 rounded-full border-2 transition-all duration-75 pointer-events-none ${primaryRingColor}`}
      />

      {/* حلقه شمسه نزدیک به قاب */}
      <div
        style={{
          transform: `scale(${activeScale1})`,
          opacity: isPlaying ? 0.95 : 0.35,
        }}
        className={`absolute inset-0 rounded-full border-2 ${shamsehBorderColor} transition-all duration-75 pointer-events-none`}
      />

      {/* قاب اصلی تصویر میزبان/قاری */}
      <div
        className={`relative z-10 w-full h-full rounded-full overflow-hidden ${
          hasFrame
            ? `border-[3px] ${frameBorderColor} bg-lapis-card shadow-inner`
            : ""
        } flex items-center justify-center`}
      >
        {children}
      </div>

      {/* نشانگر اکولایزر زنده در پایین قاب هنگام پخش صوت */}
      {isPlaying && (
        <div
          className={`absolute -bottom-2 z-20 flex items-end gap-0.5 px-2.5 py-1 rounded-full ${equalizerBg} text-white shadow-md border border-white/40`}
        >
          <span
            style={{ height: `${Math.max(4, Math.round(energy * 12))}px` }}
            className="w-1 bg-white rounded-full transition-all duration-75"
          />
          <span
            style={{ height: `${Math.max(6, Math.round(energy * 16))}px` }}
            className="w-1 bg-white rounded-full transition-all duration-75"
          />
          <span
            style={{ height: `${Math.max(4, Math.round(energy * 11))}px` }}
            className="w-1 bg-white rounded-full transition-all duration-75"
          />
        </div>
      )}
    </div>
  );
};