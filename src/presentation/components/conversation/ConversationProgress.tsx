import { Link } from "react-router-dom";
import { conversationTitle } from "@domain/entities/Conversation";
import { conversationProgress } from "@domain/services/SpeechGrading";
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
import { formatNumber } from "@presentation/format";

/** The conversations part of Progress: overall score, every dialogue read with its score, and words to review. */
export default function ConversationProgress() {
  const user = useCurrentUser();
  const { conversations } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const progress = useAsync(async () => {
    const [results, library] = await Promise.all([conversations.history(user.id), conversations.listLibrary(user.id)]);
    return conversationProgress(results, library);
  }, [user.id, version]);

  if (progress.loading && !progress.data) return <PageLoader />;
  if (!progress.data) return <ErrorBanner message={errorMessage(progress.error, "statsLoadError")} onRetry={progress.reload} />;
  const data = progress.data;
  if (data.attemptCount === 0) {
    return (
      <div className="card empty-state">
        <p className="muted">{t("conversationProgressEmpty")}</p>
        <Link className="btn" to="/conversations">
          <Icon name="mic" size={18} /> {t("conversationStartTitle")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="card progress-hero">
        <ScoreRing score={data.score} size={112} label={t("sentenceScoreLabel")} />
        <div className="progress-hero-stats">
          <div>
            <strong>{formatNumber(data.attemptCount, language)}</strong>
            <span className="muted small">{t("conversationReadings")}</span>
          </div>
          <div>
            <strong>{formatNumber(data.lineCount, language)}</strong>
            <span className="muted small">{t("conversationLinesRead")}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">
          <Icon name="mic" /> {t("conversationByDialogue")}
        </h3>
        <div className="insight-list">
          {data.byConversation.map((dialogue) => (
            <div key={dialogue.conversation.id} className="insight-row">
              <div className="insight-row-label">
                <span dir="auto">{conversationTitle(dialogue.conversation)}</span>
                <span className="muted small">
                  {t("conversationReadings")} {formatNumber(dialogue.attemptCount, language)}
                  {dialogue.lastScore !== null && ` · ${t("conversationLastScore")} ${formatNumber(Math.round(dialogue.lastScore * 100), language)}%`}
                </span>
              </div>
              {dialogue.score !== null && <ScoreBar score={dialogue.score} />}
              <ScorePill score={dialogue.score} />
            </div>
          ))}
        </div>
      </div>

      {data.missedWords.length > 0 && (
        <div className="card">
          <h3 className="card-title">
            <Icon name="book" /> {t("sentenceWordsToReview")}
          </h3>
          <div className="chip-grid">
            {data.missedWords.map((word) => (
              <span key={word} className="topic-chip" dir="auto">
                {word}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
