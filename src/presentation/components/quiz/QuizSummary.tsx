import { DIFFICULTY_RATINGS } from "@domain/entities/Learning";
import { formatCountdown } from "@domain/services/Duration";
import { SessionSummary } from "@domain/services/QuizSession";
import { useLanguage } from "@presentation/context/LanguageContext";
import { RATING_KEYS } from "@presentation/components/RatingPill";
import Confetti from "@presentation/components/ui/Confetti";
import Icon from "@presentation/components/ui/Icon";
import { formatNumber } from "@presentation/format";

interface Props {
  summary: SessionSummary;
  elapsedMs: number;
  cycleRestarted: boolean;
  onAgain: () => void;
  onSettings: () => void;
}

const CELEBRATE_AT = 0.7;

export default function QuizSummary({ summary, elapsedMs, cycleRestarted, onAgain, onSettings }: Props) {
  const { t, language } = useLanguage();
  const percent = summary.successRate === null ? null : Math.round(summary.successRate * 100);
  const celebrate = summary.endedEarly === null && summary.successRate !== null && summary.successRate >= CELEBRATE_AT;

  const title =
    summary.endedEarly === "time_up"
      ? t("timeUpTitle")
      : summary.endedEarly === "exited"
      ? t("quizExitedTitle")
      : t("sessionComplete");

  return (
    <div className="card summary-card">
      {celebrate && <Confetti />}
      <div className={`summary-icon${summary.endedEarly === "time_up" ? " warning" : ""}`}>
        <Icon name={summary.endedEarly === "time_up" ? "hourglass" : "trophy"} size={40} />
      </div>
      <h2>{title}</h2>
      <p className="muted">{t("sessionCompleteBody", { count: summary.answered, words: summary.uniqueWords })}</p>

      <div className="summary-stats">
        <div className="summary-stat">
          <strong>{percent === null ? "—" : `${formatNumber(percent, language)}%`}</strong>
          <span>{t("successRate")}</span>
        </div>
        <div className="summary-stat">
          <strong>{formatCountdown(elapsedMs)}</strong>
          <span>{t("timeSpent")}</span>
        </div>
        {summary.timedOut > 0 && (
          <div className="summary-stat">
            <strong>{formatNumber(summary.timedOut, language)}</strong>
            <span>{t("timedOutCount")}</span>
          </div>
        )}
      </div>

      <div className="summary-grid">
        {DIFFICULTY_RATINGS.map((r, i) => (
          <div key={r} className={`summary-cell rating-pill ${r}`} style={{ animationDelay: `${i * 60}ms` }}>
            <strong>{formatNumber(summary.byRating[r], language)}</strong>
            <span>{t(RATING_KEYS[r])}</span>
          </div>
        ))}
      </div>

      {summary.notReached > 0 && <p className="muted">{t("notReachedNote", { count: summary.notReached })}</p>}
      {cycleRestarted && <p className="muted">{t("roundRestartedNote")}</p>}

      <div className="button-row center">
        <button className="btn btn-large" onClick={onAgain} autoFocus>
          <Icon name="refresh" size={18} /> {t("sameAgain")}
        </button>
        <button className="btn btn-secondary btn-large" onClick={onSettings}>
          {t("startAnother")}
        </button>
      </div>
    </div>
  );
}
