import { useMemo, useState } from "react";
import { Conversation, ConversationLineResult, roleOf } from "@domain/entities/Conversation";
import { latestRecordings, roleScores } from "@domain/services/SpeechGrading";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useRecordingPlayer } from "@presentation/hooks/useRecordingPlayer";
import ScorePill from "@presentation/components/sentence/ScorePill";
import Icon from "@presentation/components/ui/Icon";
import { formatNumber } from "@presentation/format";

interface Props {
  conversation: Conversation;
  /** Every line the user has read; undefined while loading */
  results: ConversationLineResult[] | undefined;
}

const percent = (score: number | null) => (score === null ? null : Math.round(score * 100));

/** Each role's own progress in this dialogue: readings, last, best and average score, words to review, latest take. */
export default function RoleHistory({ conversation, results }: Props) {
  const { conversations } = useServices();
  const { t, language } = useLanguage();
  const player = useRecordingPlayer();
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const scores = useMemo(() => roleScores(results ?? [], conversation.id, conversation.language), [results, conversation]);

  if (results === undefined) return null;

  async function playLatest(roleId: string, attemptId: string) {
    if (player.playingKey === roleId) {
      player.stop();
      return;
    }
    setPlaybackFailed(false);
    try {
      const paths = latestRecordings(results ?? [], attemptId, roleId).flatMap((result) => (result.audioPath ? [result.audioPath] : []));
      const urls = await Promise.all(paths.map((path) => conversations.playbackUrl(path)));
      await player.play(roleId, urls);
    } catch {
      setPlaybackFailed(true);
    }
  }

  return (
    <section className="start-section">
      <span className="field-label">{t("conversationHistoryTitle")}</span>
      {scores.length === 0 ? (
        <p className="muted">{t("conversationHistoryEmpty")}</p>
      ) : (
        <ul className="conversation-history">
          {scores.map((score) => {
            const hasRecording = score.latestAttemptId !== null && latestRecordings(results, score.latestAttemptId, score.roleId).length > 0;
            const isPlaying = player.playingKey === score.roleId;
            return (
              <li key={score.roleId} className="insight-row">
                <span className="insight-row-label">
                  <strong dir="auto">{roleOf(conversation, score.roleId)?.name ?? score.roleId}</strong>
                  <span className="muted small conversation-history-figures">
                    <span>
                      {t("conversationReadings")} {formatNumber(score.attemptCount, language)}
                    </span>
                    {score.bestScore !== null && (
                      <span>
                        {t("conversationBestScore")} {formatNumber(percent(score.bestScore)!, language)}%
                      </span>
                    )}
                    {score.averageScore !== null && (
                      <span>
                        {t("conversationAverageScore")} {formatNumber(percent(score.averageScore)!, language)}%
                      </span>
                    )}
                  </span>
                  {score.missedWords.length > 0 && (
                    <span className="chip-grid" aria-label={t("sentenceWordsToReview")}>
                      {score.missedWords.map((word) => (
                        <span key={word} className="topic-chip" dir="auto">
                          {word}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="conversation-history-actions">
                  <span className="muted small">{t("conversationLastScore")}</span>
                  <ScorePill score={score.lastScore} />
                  {hasRecording && (
                    <button
                      type="button"
                      className={`icon-btn bordered${isPlaying ? " active" : ""}`}
                      onClick={() => playLatest(score.roleId, score.latestAttemptId!)}
                      aria-label={isPlaying ? t("conversationStopPlayback") : t("conversationPlayLatest")}
                      title={isPlaying ? t("conversationStopPlayback") : t("conversationPlayLatest")}
                    >
                      <Icon name={isPlaying ? "volumeOff" : "volume"} size={18} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {playbackFailed && (
        <p className="field-error" role="alert">
          {t("conversationRecordingUnavailable")}
        </p>
      )}
    </section>
  );
}
