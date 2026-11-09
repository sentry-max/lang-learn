import { Link } from "react-router-dom";
import { ErrorBreakdown, TopicScore } from "@domain/services/SentenceInsights";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import ScoreRing from "@presentation/components/ui/ScoreRing";
import ScorePill, { ScoreBar } from "@presentation/components/sentence/ScorePill";
import Icon from "@presentation/components/ui/Icon";
import { PageLoader } from "@presentation/components/ui/Loader";
import { describeInsightTopic } from "@presentation/i18n/describeInsightTopic";
import { UiStringKey } from "@presentation/i18n/translations";
import { formatNumber, formatSeconds } from "@presentation/format";

const ERROR_TYPES: { type: keyof ErrorBreakdown; key: UiStringKey; hint: UiStringKey }[] = [
  { type: "wrong", key: "sentenceErrorsWrong", hint: "sentenceErrorsWrongHint" },
  { type: "missing", key: "sentenceErrorsMissing", hint: "sentenceErrorsMissingHint" },
  { type: "extra", key: "sentenceErrorsExtra", hint: "sentenceErrorsExtraHint" },
  { type: "typo", key: "sentenceErrorsTypo", hint: "sentenceErrorsTypoHint" },
];

/** The sentences half of Progress: overall score and trend, weak areas, every topic, mistake types, trouble words, activity. */
export default function SentenceProgress() {
  const user = useCurrentUser();
  const { sentences } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const insights = useAsync(() => sentences.insights(user.id), [user.id, version]);

  if (insights.loading && !insights.data) return <PageLoader />;
  if (!insights.data) return <ErrorBanner message={errorMessage(insights.error, "statsLoadError")} onRetry={insights.reload} />;
  const data = insights.data;
  if (data.attemptCount === 0) {
    return (
      <div className="card empty-state">
        <p className="muted">{t("sentenceProgressEmpty")}</p>
        <Link className="btn" to="/sentences">
          <Icon name="sentence" size={18} /> {t("sentenceStartTitle")}
        </Link>
      </div>
    );
  }

  const trend = data.recentScore !== null && data.previousScore !== null ? data.recentScore - data.previousScore : null;
  const totalErrors = ERROR_TYPES.reduce((sum, errorType) => sum + data.errors[errorType.type], 0);
  const busiestDay = Math.max(1, ...data.activity.map((day) => day.attemptCount));
  const percent = (value: number | null) => (value === null ? "—" : `${formatNumber(Math.round(value * 100), language)}%`);

  return (
    <>
      <div className="card progress-hero">
        <ScoreRing score={data.score} size={112} label={t("sentenceScoreLabel")} />
        <div className="progress-hero-stats">
          <div>
            <strong>{formatNumber(data.attemptCount, language)}</strong>
            <span className="muted small">{t("sentenceAnsweredLabel")}</span>
          </div>
          <div>
            <strong>
              {percent(data.recentScore)}
              {trend !== null && Math.abs(trend) >= 0.01 && (
                <span className={`trend ${trend > 0 ? "up" : "down"}`}>
                  {trend > 0 ? "▲" : "▼"} {formatNumber(Math.round(Math.abs(trend) * 100), language)}
                </span>
              )}
            </strong>
            <span className="muted small">{t("sentenceLastSevenDays")}</span>
          </div>
          <div>
            <strong>
              {formatSeconds(data.averageResponseMs, language)} {t("secondsShort")}
            </strong>
            <span className="muted small">{t("sentenceAverageTime")}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">
          <Icon name="hint" /> {t("sentenceWeakAreas")}
        </h3>
        {data.weakAreas.length === 0 ? (
          <p className="muted">{t("sentenceNoWeakAreas")}</p>
        ) : (
          <>
            <TopicList topics={data.weakAreas} />
            <p className="muted small">{t("sentenceWeakAreasNote")}</p>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">
          <Icon name="sentence" /> {t("sentenceByKind")}
        </h3>
        <TopicList topics={data.byKind} />
      </div>

      {data.topics.length > 0 && (
        <div className="card">
          <h3 className="card-title">
            <Icon name="chart" /> {t("sentenceAllTopics")}
          </h3>
          <TopicList topics={data.topics.slice(0, 15)} />
        </div>
      )}

      <div className="card">
        <h3 className="card-title">
          <Icon name="close" /> {t("sentenceMistakeTypes")}
        </h3>
        {totalErrors === 0 ? (
          <p className="muted">{t("sentenceNoMistakes")}</p>
        ) : (
          ERROR_TYPES.map((errorType) => (
            <div key={errorType.type} className="insight-row">
              <div className="insight-row-label">
                <span className={`mark-chip mark-${errorType.type === "missing" ? "missing" : errorType.type}`}>{t(errorType.key)}</span>
                <span className="muted small">{t(errorType.hint)}</span>
              </div>
              <strong>{formatNumber(data.errors[errorType.type], language)}</strong>
            </div>
          ))
        )}
      </div>

      {data.troubleWords.length > 0 && (
        <div className="card">
          <h3 className="card-title">
            <Icon name="book" /> {t("sentenceWordsToReview")}
          </h3>
          <div className="chip-grid">
            {data.troubleWords.map((troubleWord) => (
              <span key={troubleWord.word} className="topic-chip" dir="auto">
                {troubleWord.word} · {formatNumber(troubleWord.missCount, language)}×
              </span>
            ))}
          </div>
          <p className="muted small">{t("sentenceTroubleWordsNote")}</p>
        </div>
      )}

      <div className="card">
        <h3 className="card-title">
          <Icon name="history" /> {t("sentenceActivity")}
        </h3>
        <div className="activity-chart" role="img" aria-label={t("sentenceActivity")}>
          {data.activity.map((day) => (
            <div key={day.day} className="activity-day" title={`${day.day}: ${day.attemptCount} · ${percent(day.score)}`}>
              <div
                className={`activity-bar ${day.score === null ? "none" : day.score >= 0.75 ? "good" : day.score >= 0.5 ? "fair" : "poor"}`}
                style={{ height: `${(day.attemptCount / busiestDay) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Topics with their attempt count, a score bar and the score. */
export function TopicList({ topics }: { topics: TopicScore[] }) {
  const { t, language } = useLanguage();
  return (
    <div className="insight-list">
      {topics.map((topic) => (
        <div key={topic.key} className="insight-row">
          <div className="insight-row-label">
            <span dir="auto">{describeInsightTopic(t, topic.topic)}</span>
            <span className="muted small">{t("sentenceAnsweredCount", { count: formatNumber(topic.attemptCount, language) })}</span>
          </div>
          <ScoreBar score={topic.score} />
          <ScorePill score={topic.score} />
        </div>
      ))}
    </div>
  );
}
