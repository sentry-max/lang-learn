import { DIFFICULTY_RATINGS } from "@domain/entities/Learning";
import { formatCountdown } from "@domain/services/Duration";
import { SessionSummary } from "@domain/services/QuizSession";
import { useLanguage } from "@presentation/context/LanguageContext";
import { RATING_KEYS } from "@presentation/components/RatingPill";
import {
  DistributionBar,
  Kpi,
  SummaryActions,
  SummaryHeader,
  SummaryOverview,
  SummarySection,
} from "@presentation/components/ResultSummary";
import ScoreRing from "@presentation/components/ui/ScoreRing";
import Icon from "@presentation/components/ui/Icon";

interface Props {
  summary: SessionSummary;
  elapsedMs: number;
  cycleRestarted: boolean;
  /** Shows right and wrong counts instead of the ratings */
  isMultipleChoice: boolean;
  onAgain: () => void;
  onSettings: () => void;
}

/** The quiz finish screen: how it ended, the success rate with key figures, how the answers spread, what next. */
export default function QuizSummary({ summary, elapsedMs, cycleRestarted, isMultipleChoice, onAgain, onSettings }: Props) {
  const { t } = useLanguage();
  const isTimeUp = summary.endedEarly === "time_up";
  const title = isTimeUp ? t("timeUpTitle") : summary.endedEarly === "exited" ? t("quizExitedTitle") : t("sessionComplete");
  const tone = isTimeUp ? "warning" : summary.endedEarly === null && (summary.successRate ?? 0) >= 0.7 ? "success" : "neutral";

  const parts = isMultipleChoice
    ? [
        { key: "correct", label: t("choiceCorrectCount"), count: summary.correct, colorClass: "correct" },
        { key: "wrong", label: t("choiceWrongCount"), count: summary.incorrect, colorClass: "wrong" },
      ]
    : DIFFICULTY_RATINGS.map((rating) => ({ key: rating, label: t(RATING_KEYS[rating]), count: summary.byRating[rating], colorClass: `rating-${rating}` }));

  return (
    <div className="card summary-card">
      <SummaryHeader
        tone={tone}
        icon={isTimeUp ? "hourglass" : summary.endedEarly === "exited" ? "close" : "check"}
        title={title}
        subtitle={t("sessionCompleteBody", { count: summary.answered, words: summary.uniqueWords })}
      />

      <SummaryOverview score={<ScoreRing score={summary.successRate} size={120} label={t("successRate")} animate />}>
        <Kpi label={t("summaryAnswered")} value={summary.answered} />
        <Kpi label={t("summaryWords")} value={summary.uniqueWords} />
        <Kpi label={t("timeSpent")} value={formatCountdown(elapsedMs)} />
        {summary.timedOut > 0 && <Kpi label={t("timedOutCount")} value={summary.timedOut} />}
      </SummaryOverview>

      <SummarySection title={isMultipleChoice ? t("summaryAnswersTitle") : t("summaryRatingsTitle")} order={2}>
        <DistributionBar parts={parts} label={isMultipleChoice ? t("summaryAnswersTitle") : t("summaryRatingsTitle")} />
        {summary.notReached > 0 && <p className="muted small">{t("notReachedNote", { count: summary.notReached })}</p>}
        {cycleRestarted && <p className="muted small">{t("roundRestartedNote")}</p>}
      </SummarySection>

      <SummaryActions order={3}>
        <button className="btn btn-large" onClick={onAgain} autoFocus>
          <Icon name="refresh" size={18} /> {t("sameAgain")}
        </button>
        <button className="btn btn-secondary btn-large" onClick={onSettings}>
          {t("startAnother")}
        </button>
      </SummaryActions>
    </div>
  );
}
