import { useEffect, useMemo, useRef, useState } from "react";
import { Conversation, roleOf } from "@domain/entities/Conversation";
import { LanguageCode } from "@domain/entities/Language";
import { PlannedLine } from "@domain/services/ConversationPlanner";
import { SentenceGrade } from "@domain/services/SentenceGrading";
import { followSpokenLine } from "@domain/services/SpeechGrading";
import { useLanguage } from "@presentation/context/LanguageContext";
import { scoreOf } from "@domain/entities/SentencePractice";
import GradedSentence from "@presentation/components/sentence/GradedSentence";
import ScorePill from "@presentation/components/sentence/ScorePill";
import Icon from "@presentation/components/ui/Icon";
import { Spinner } from "@presentation/components/ui/Loader";
import { formatNumber } from "@presentation/format";
import { canSpeak, speakLine, stopSpeaking } from "@presentation/speech";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const playingRef = useRef(false);
  const role = roleOf(conversation, planned.roleId);

  // A sample still playing stops when the line changes or the screen closes.
  useEffect(
    () => () => {
      if (playingRef.current) stopSpeaking();
      playingRef.current = false;
      setIsPlaying(false);
    },
    [planned.line.id]
  );

  function togglePlayback() {
    if (playingRef.current) {
      stopSpeaking();
      return;
    }
    playingRef.current = true;
    setIsPlaying(true);
    void speakLine(planned.line.text, conversation.language, role?.gender ?? "female").then(() => {
      playingRef.current = false;
      setIsPlaying(false);
    });
  }

  const live = useMemo(
    () => (isListening ? followSpokenLine(planned.line.text, interimText, conversation.language) : null),
    [isListening, planned.line.text, interimText, conversation.language]
  );
  const { onStop } = props;
  // The take ends by itself once every word of the line has been heard.
  useEffect(() => {
    if (live?.isComplete) onStop();
  }, [live?.isComplete, onStop]);

  // The microphone would hear the sample, so it stops before reading starts.
  function startReading(action: () => void) {
    if (playingRef.current) stopSpeaking();
    action();
  }

  return (
    <section className={`card conversation-active${isListening ? " listening" : ""}`} aria-live="polite">
      <p className="conversation-active-role">
        <strong dir="auto">{role?.name}</strong>
        <span className="pill">
          {isBot ? t("conversationBotName") : t("conversationReaderNumber", { number: formatNumber(planned.readerNumber ?? 1, language) })}
        </span>
        {!isBot && !isListening && canSpeak() && (
          <button
            type="button"
            className="icon-btn conversation-sample"
            onClick={togglePlayback}
            aria-label={isPlaying ? t("conversationStopPlayback") : t("conversationPlaySample")}
            title={isPlaying ? t("conversationStopPlayback") : t("conversationPlaySample")}
          >
            <Icon name={isPlaying ? "volumeOff" : "volume"} />
          </button>
        )}
      </p>

      {grade ? (
        <div className="conversation-active-result">
          <ScorePill score={scoreOf(grade)} />
          <GradedSentence grade={grade} />
        </div>
      ) : live ? (
        <p className="conversation-active-text" dir="auto">
          {live.words.map((word, index) => (
            <span key={index} className={`live-word ${word.state}`}>
              {word.text}{" "}
            </span>
          ))}
        </p>
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
            <button className="btn btn-secondary btn-large" disabled={saving} onClick={() => startReading(props.onReadAgain)}>
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
          <button className="btn btn-block btn-large conversation-mic" onClick={() => startReading(props.onRead)}>
            <Icon name="mic" size={20} /> {t("conversationReadAloud")}
          </button>
        )}
      </div>
    </section>
  );
}
