// src/components/common/Button3D.tsx
import React from "react";
import { useHapticsAndSfx } from "../../hooks/useHapticsAndSfx";

export type Button3DVariant =
  | "primary"
  | "success"
  | "amber"
  | "ruby"
  | "neutral";

export interface Button3DProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Button3DVariant;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<Button3DVariant, string> = {
  primary: "btn-3d-primary",
  success: "btn-3d-success",
  amber: "btn-3d-amber",
  ruby: "btn-3d-ruby",
  neutral: "btn-3d-neutral",
};

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "px-3.5 py-2 text-xs rounded-xl border-b-[3px]",
  md: "px-6 py-3.5 text-sm md:text-base rounded-2xl border-b-4",
  lg: "px-8 py-4 text-base md:text-lg rounded-2xl border-b-[5px]",
};

export const Button3D: React.FC<Button3DProps> = ({
  variant = "primary",
  fullWidth = false,
  size = "md",
  className = "",
  disabled,
  onClick,
  children,
  ...rest
}) => {
  const { playSfx } = useHapticsAndSfx();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    playSfx("snap-click");
    onClick?.(e);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`
        ${VARIANT_CLASSES[variant]}
        ${SIZE_CLASSES[size]}
        ${fullWidth ? "w-full" : ""}
        ${disabled ? "opacity-50 pointer-events-none grayscale" : ""}
        ${className}
      `.trim()}
      {...rest}
    >
      {children}
    </button>
  );
};

