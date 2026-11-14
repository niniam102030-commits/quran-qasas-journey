// src/components/common/ProgressBar.tsx
import React from "react";
import { motion } from "framer-motion";

interface ProgressBarProps {
    current: number;
    total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
    const safeTotal = Math.max(total, 1);
    const percentage = Math.min(100, Math.max(0, (current / safeTotal) * 100));

    return (
        <div
            className="relative h-4 w-full overflow-hidden rounded-full bg-termeh-border/70 dark:bg-lapis-border/60 p-0.5"
            role="progressbar"
            aria-valuenow={Math.round(percentage)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                className="relative h-full rounded-full bg-gradient-to-l from-brand-success to-brand-primary"
            >
                {/* افکت هایلایت براق به سبک دولینگو */}
                <div className="absolute inset-x-2 top-0.5 h-1 rounded-full bg-white/35" />
            </motion.div>
        </div>
    );
};