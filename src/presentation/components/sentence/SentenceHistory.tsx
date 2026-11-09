import { useState } from "react";
import { scoreOf } from "@domain/entities/SentencePractice";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import GradedSentence from "@presentation/components/sentence/GradedSentence";
import ScorePill from "@presentation/components/sentence/ScorePill";
import { InlineLoader } from "@presentation/components/ui/Loader";
import { SENTENCE_KIND_KEYS, TRANSFORM_TASK_KEYS } from "@presentation/i18n/grammarLabels";
import { formatDate, formatDateTime, formatNumber, formatSeconds } from "@presentation/format";

const PAGE_SIZE = 50;

/** The sentences half of History: every answered sentence, newest first, grouped by day; tap one to see the graded answer. */
export default function SentenceHistory() {
  const user = useCurrentUser();
  const { sentences } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const history = useAsync(() => sentences.history(user.id), [user.id, version]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (history.error) return <ErrorBanner message={errorMessage(history.error, "historyLoadError")} onRetry={history.reload} />;
  if (!history.data) return <InlineLoader />;
  if (history.data.length === 0) return <div className="card center-text muted">{t("sentenceHistoryEmpty")}</div>;

  let lastDay = "";
  return (
    <div className="card">
      <div className="section-header">
        <h3>{t("sentenceHistoryTitle")}</h3>
        <span className="pill">{t("sentenceAnsweredCount", { count: formatNumber(history.data.length, language) })}</span>
      </div>
      {history.data.slice(0, limit).map(({ attempt, exercise, grade }) => {
        const day = formatDate(attempt.answeredAt, language);
        const dayHeader = day !== lastDay ? <div className="letter-group-label">{day}</div> : null;
        lastDay = day;
        const isOpen = expandedId === attempt.id;
        const content = exercise?.content;
        return (
          <div key={attempt.id} className="history-word">
            {dayHeader}
            <button type="button" className="history-row" aria-expanded={isOpen} onClick={() => setExpandedId(isOpen ? null : attempt.id)}>
              <span className="history-row-main">
                <span className="vocab-row-headword" dir="auto">
                  {content ? content.sentence : t("sentenceUnavailable")}
                </span>
                <span className="vocab-row-translation">
                  {content?.kind === "transform" ? t(TRANSFORM_TASK_KEYS[content.task]) : t(SENTENCE_KIND_KEYS[attempt.kind].label)}
                </span>
              </span>
              <span className="history-row-meta">
                <ScorePill score={scoreOf(attempt)} />
              </span>
            </button>
            {isOpen && (
              <div className="history-details">
                <p className="muted small">
                  {formatDateTime(attempt.answeredAt, language)} · {t("responseTime")}: {formatSeconds(attempt.responseMs, language)}{" "}
                  {t("secondsShort")} ·{" "}
                  {t("sentenceErrorCount", { errors: formatNumber(attempt.errorCount, language), max: formatNumber(attempt.maxErrors, language) })}
                  {attempt.timedOut && ` · ${t("sentenceTimedOut")}`}
                </p>
                {grade ? (
                  <>
                    <GradedSentence grade={grade} />
                    {grade.errorCount > 0 && (
                      <p className="correct-sentence" dir="auto">
                        {grade.correctSentence}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted">{t("sentenceUnavailable")}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {history.data.length > limit && (
        <button className="btn btn-secondary btn-block" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
          {t("showMore", { count: history.data.length - limit })}
        </button>
      )}
    </div>
  );
}
