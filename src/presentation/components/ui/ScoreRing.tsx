import { useLanguage } from "@presentation/context/LanguageContext";
import { useCountUp } from "@presentation/hooks/useCountUp";
import { formatNumber } from "@presentation/format";

interface Props {
  /** 0..1, or null for no score yet */
  score: number | null;
  size?: number;
  label: string;
  /** Fill up from empty when it appears (finish screens) */
  animate?: boolean;
}

const STROKE = 8;

/** A ring that fills with the score: green from 75%, amber from 50%, red below. */
export default function ScoreRing({ score, size = 88, label, animate = false }: Props) {
  const { language } = useLanguage();
  const counted = useCountUp(animate ? (score ?? 0) : 0);
  const shown = animate ? counted : (score ?? 0);
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const level = score === null ? "none" : score >= 0.75 ? "good" : score >= 0.5 ? "fair" : "poor";
  const percent = score === null ? null : Math.round(shown * 100);
  return (
    <div
      className={`score-ring ${level}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${score === null ? "—" : Math.round(score * 100)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="score-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={STROKE} fill="none" />
        <circle
          className={`score-ring-fill${animate ? " counting" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="score-ring-value" aria-hidden="true">
        {percent === null ? "—" : `${formatNumber(percent, language)}%`}
      </span>
    </div>
  );
}
