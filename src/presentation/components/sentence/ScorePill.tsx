import { useLanguage } from "@presentation/context/LanguageContext";
import { formatNumber } from "@presentation/format";

/** A score as a coloured pill: green from 75%, amber from 50%, red below. */
export default function ScorePill({ score }: { score: number | null }) {
  const { language } = useLanguage();
  const level = score === null ? "none" : score >= 0.75 ? "good" : score >= 0.5 ? "fair" : "poor";
  return <span className={`pill score-pill ${level}`}>{score === null ? "—" : `${formatNumber(Math.round(score * 100), language)}%`}</span>;
}

/** A horizontal bar filled to the score, coloured like the pill. */
export function ScoreBar({ score }: { score: number }) {
  const level = score >= 0.75 ? "good" : score >= 0.5 ? "fair" : "poor";
  return (
    <div className={`score-bar ${level}`} aria-hidden="true">
      <div style={{ transform: `scaleX(${score})` }} />
    </div>
  );
}
