// src/components/common/AqeeqIcon.tsx
// آیکون عقیق قرمز یمن (نگین بیضی با درخشش طبیعی)
interface Props {
  className?: string;
}

export default function AqeeqIcon({ className = "w-4 h-4 inline-block align-text-bottom" }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <radialGradient id="aqeeqGrad" cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#ff7b54" />
          <stop offset="42%" stopColor="#c81e1e" />
          <stop offset="85%" stopColor="#7f1019" />
          <stop offset="100%" stopColor="#4c0510" />
        </radialGradient>
        <linearGradient id="aqeeqRim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      {/* قاب طلایی نگین */}
      <ellipse cx="12" cy="12" rx="7.5" ry="10.2" fill="url(#aqeeqRim)" />
      {/* سنگ عقیق قرمز یمن */}
      <ellipse cx="12" cy="12" rx="6.3" ry="9" fill="url(#aqeeqGrad)" />
      {/* درخشش نرم روی نگین */}
      <ellipse
        cx="9.8"
        cy="8.2"
        rx="2.1"
        ry="3.6"
        transform="rotate(-18 9.8 8.2)"
        fill="white"
        fillOpacity="0.32"
      />
      <circle cx="9" cy="6.2" r="0.9" fill="white" fillOpacity="0.65" />
    </svg>
  );
}
