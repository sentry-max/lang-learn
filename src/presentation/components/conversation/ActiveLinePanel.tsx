import { Conversation, roleOf } from "@domain/entities/Conversation";
import { LanguageCode } from "@domain/entities/Language";
import { PlannedLine } from "@domain/services/ConversationPlanner";
import { SentenceGrade } from "@domain/services/SentenceGrading";
import { useLanguage } from "@presentation/context/LanguageContext";
import { scoreOf } from "@domain/entities/SentencePractice";
import GradedSentence from "@presentation/components/sentence/GradedSentence";
import ScorePill from "@presentation/components/sentence/ScorePill";
import Icon from "@presentation/components/ui/Icon";
import { Spinner } from "@presentation/components/ui/Loader";
import { formatNumber } from "@presentation/format";

interface Props {
  conversation: Conversation;
  planned: PlannedLine;
  primaryLanguage: LanguageCode;
  isListening: boolean;
  interimText: string;
  /** The graded take waiting for "Read again" or "Next" */
  grade: SentenceGrade | null;
  saving: boolean;
  failureMessage: string | null;
  onRead: () => void;
  onStop: () => void;
  onReadAgain: () => void;
  onContinue: () => void;
}

/** The line to read now, who reads it, and its one main action: read aloud, finish, or move on. */
export default function ActiveLinePanel(props: Props) {
  const { conversation, planned, primaryLanguage, isListening, interimText, grade, saving, failureMessage } = props;
  const { t, language } = useLanguage();
  const translation = planned.line.translations[primaryLanguage];
  const isBot = planned.speaker === "bot";

  return (
    <section className={`card conversation-active${isListening ? " listening" : ""}`} aria-live="polite">
      <p className="conversation-active-role">
        <strong dir="auto">{roleOf(conversation, planned.roleId)?.name}</strong>
        <span className="pill">
          {isBot ? t("conversationBotName") : t("conversationReaderNumber", { number: formatNumber(planned.readerNumber ?? 1, language) })}
        </span>
      </p>

      {grade ? (
        <div className="conversation-active-result">
          <ScorePill score={scoreOf(grade)} />
          <GradedSentence grade={grade} />
        </div>
      ) : (
        <p className="conversation-active-text" dir="auto">
          {planned.line.text}
        </p>
      )}
      {translation && !grade && (
        <p className="muted" dir="auto">
          {translation}
        </p>
      )}
      {isListening && (
        <p className="conversation-heard" dir="auto">
          {interimText || t("conversationListening")}
        </p>
      )}
      {failureMessage && (
        <p className="field-error" role="alert">
          {failureMessage}
        </p>
      )}

      <div className="conversation-active-actions">
        {isBot ? (
          <p className="muted conversation-bot-speaking">
            <Icon name="volume" size={18} /> {t("conversationBotSpeaking")}
          </p>
        ) : grade ? (
          <>
            <button className="btn btn-secondary btn-large" disabled={saving} onClick={props.onReadAgain}>
              <Icon name="refresh" size={18} /> {t("conversationReadAgain")}
            </button>
            <button className="btn btn-large" disabled={saving} onClick={props.onContinue} autoFocus>
              {saving && <Spinner />} {t("next")} <Icon name="arrowRight" size={18} className="flip-rtl" />
            </button>
          </>
        ) : isListening ? (
          <button className="btn btn-block btn-large conversation-mic listening" onClick={props.onStop}>
            <Spinner /> {t("conversationFinishReading")}
          </button>
        ) : (
          <button className="btn btn-block btn-large conversation-mic" onClick={props.onRead}>
            <Icon name="mic" size={20} /> {t("conversationReadAloud")}
          </button>
        )}
      </div>
    </section>
  );
}
