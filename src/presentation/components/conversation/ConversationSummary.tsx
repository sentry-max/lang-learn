import { useState } from "react";
import { Conversation, ConversationLineResult, roleOf } from "@domain/entities/Conversation";
import { totalScore } from "@domain/entities/SentencePractice";
import { SentenceGrade, countMarks } from "@domain/services/SentenceGrading";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useRecordingPlayer } from "@presentation/hooks/useRecordingPlayer";
import { DistributionBar, Kpi, SummaryActions, SummaryHeader, SummaryOverview, SummarySection } from "@presentation/components/ResultSummary";
import GradedSentence from "@presentation/components/sentence/GradedSentence";
import ScoreRing from "@presentation/components/ui/ScoreRing";
import Icon from "@presentation/components/ui/Icon";
import { formatNumber } from "@presentation/format";

interface Props {
  conversation: Conversation;
  /** The human roles of this run, in reader order */
  humanRoleIds: string[];
  results: ConversationLineResult[];
  gradeByLineId: Record<string, SentenceGrade>;
  endedEarly: boolean;
  onReadAgain: () => void;
  onDemo: () => void;
  onChooseAnother: () => void;
}

/** The finish screen of one reading: a score per role, how the words spread, and the lines to practise with their takes. */
export default function ConversationSummary({ conversation, humanRoleIds, results, gradeByLineId, endedEarly, onReadAgain, onDemo, onChooseAnother }: Props) {
  const { conversations } = useServices();
  const { t, language } = useLanguage();
  const player = useRecordingPlayer();
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const score = totalScore(results);
  const linesWithErrors = results.filter((result) => result.errorCount > 0 && gradeByLineId[result.lineId]);
  const roleName = (roleId: string) => roleOf(conversation, roleId)?.name ?? roleId;

  async function playLine(result: ConversationLineResult) {
    if (player.playingKey === result.id) {
      player.stop();
      return;
    }
    setPlaybackFailed(false);
    try {
      await player.play(result.id, [await conversations.playbackUrl(result.audioPath!)]);
    } catch {
      setPlaybackFailed(true);
    }
  }

  return (
    <div className="card summary-card">
      <SummaryHeader
        tone={!endedEarly && (score ?? 0) >= 0.75 ? "success" : "neutral"}
        icon={endedEarly ? "close" : "check"}
        title={endedEarly ? t("conversationExitedTitle") : t("conversationDoneTitle")}
        subtitle={t("conversationDoneSubtitle", { count: formatNumber(results.length, language) })}
      />
      <SummaryOverview score={<ScoreRing score={score} size={120} label={t("sentenceScoreLabel")} animate />}>
        {humanRoleIds.map((roleId) => {
          const roleScore = totalScore(results.filter((result) => result.roleId === roleId));
          return <Kpi key={roleId} label={roleName(roleId)} value={roleScore === null ? "—" : Math.round(roleScore * 100)} suffix="%" />;
        })}
      </SummaryOverview>

      {humanRoleIds.map((roleId, index) => {
        const marks = results.filter((result) => result.roleId === roleId).flatMap((result) => gradeByLineId[result.lineId]?.marks ?? []);
        if (marks.length === 0) return null;
        const counts = countMarks(marks);
        return (
          <SummarySection key={roleId} title={roleName(roleId)} order={2 + index}>
            <DistributionBar
              label={roleName(roleId)}
              parts={[
                { key: "correct", label: t("conversationMarkCorrect"), count: counts.correct, colorClass: "correct" },
                { key: "near", label: t("conversationMarkNear"), count: counts.typo, colorClass: "near" },
                { key: "errors", label: t("conversationMarkErrors"), count: counts.wrong + counts.missing + counts.extra, colorClass: "wrong" },
              ]}
            />
          </SummarySection>
        );
      })}

      {linesWithErrors.length > 0 && (
        <SummarySection title={t("conversationLinesWithErrors")} order={2 + humanRoleIds.length}>
          <ul className="conversation-review">
            {linesWithErrors.map((result) => (
              <li key={result.id}>
                <span className="conversation-review-head">
                  <strong dir="auto">{roleName(result.roleId)}</strong>
                  {result.audioPath && (
                    <button
                      type="button"
                      className={`icon-btn bordered${player.playingKey === result.id ? " active" : ""}`}
                      onClick={() => playLine(result)}
                      aria-label={player.playingKey === result.id ? t("conversationStopPlayback") : t("conversationPlayRecording")}
                      title={player.playingKey === result.id ? t("conversationStopPlayback") : t("conversationPlayRecording")}
                    >
                      <Icon name={player.playingKey === result.id ? "volumeOff" : "volume"} size={18} />
                    </button>
                  )}
                </span>
                <GradedSentence grade={gradeByLineId[result.lineId]} />
              </li>
            ))}
          </ul>
          {playbackFailed && (
            <p className="field-error" role="alert">
              {t("conversationRecordingUnavailable")}
            </p>
          )}
        </SummarySection>
      )}

      <SummaryActions order={3 + humanRoleIds.length}>
        <button className="btn btn-large" onClick={onReadAgain} autoFocus>
          <Icon name="refresh" size={18} /> {t("conversationReadAgain")}
        </button>
        <button className="btn btn-secondary btn-large" onClick={onDemo}>
          <Icon name="volume" size={18} /> {t("conversationPlayDemo")}
        </button>
        <button className="btn btn-ghost btn-large" onClick={onChooseAnother}>
          {t("conversationChooseAnother")}
        </button>
      </SummaryActions>
    </div>
  );
}
