import { LanguageCode, languageLabel } from "@domain/entities/Language";
import { DifficultyRating, isStrongRating } from "@domain/entities/Learning";
import { displayForm, resolveSentenceTranslation, resolveTranslations } from "@domain/entities/Word";
import { QuizItem } from "@domain/services/QuizSession";
import { useLanguage } from "@presentation/context/LanguageContext";
import DifficultyRatingPicker from "@presentation/components/DifficultyRatingPicker";
import Icon from "@presentation/components/ui/Icon";
import { RATING_KEYS } from "@presentation/components/RatingPill";
import { canSpeak } from "@presentation/speech";

export interface CardFeedback {
  rating: DifficultyRating;
  timedOut: boolean;
  reveal: boolean;
  willRetry: boolean;
}

interface Props {
  item: QuizItem;
  primaryLanguage: LanguageCode;
  hintOpen: boolean;
  onShowHint: () => void;
  onRate: (rating: DifficultyRating) => void;
  onPronounce: () => void;
  saving: boolean;
  feedback: CardFeedback | null;
  showShortcuts: boolean;
}

/** One quiz question: prompt, hint, rating buttons, and the revealed answer after rating. */
export default function QuizCard({
  item,
  primaryLanguage,
  hintOpen,
  onShowHint,
  onRate,
  onPronounce,
  saving,
  feedback,
  showShortcuts,
}: Props) {
  const { t } = useLanguage();
  const { word, mode, sourceLanguage } = item;
  const target = resolveTranslations(word, primaryLanguage);
  const sentence = word.sentences[0];
  const sentenceTranslation = sentence ? resolveSentenceTranslation(sentence, primaryLanguage) : null;
  const sourceLabel = languageLabel(sourceLanguage);
  const targetLabel = languageLabel(target.language);

  const pillText =
    mode === "source_to_target"
      ? `${sourceLabel} → ${targetLabel}`
      : mode === "target_to_source"
      ? `${targetLabel} → ${sourceLabel}`
      : t("modeSentence", { lang: sourceLabel });
  const promptText = mode === "target_to_source" ? target.values.join("، ") : displayForm(word);
  // Reading the word aloud before a reverse question is answered would give it away.
  const canPronounce = canSpeak() && (mode !== "target_to_source" || feedback !== null);

  const resultClass = feedback
    ? feedback.timedOut
      ? " result-timeout"
      : isStrongRating(feedback.rating)
      ? " result-good"
      : " result-bad"
    : "";

  return (
    <div className={`card quiz-card${resultClass}`}>
      <div className="pill-row">
        <span className="pill">{pillText}</span>
        {item.attempt > 0 && (
          <span className="pill retry-pill">
            <Icon name="refresh" size={14} /> {t("retryPill")}
          </span>
        )}
        <span className="toolbar-spacer" />
        {canPronounce && (
          <button type="button" className="icon-btn" onClick={onPronounce} aria-label={t("pronounce")} title={t("pronounce")}>
            <Icon name="volume" />
          </button>
        )}
      </div>

      <h2 className="quiz-prompt" dir="auto">
        {promptText}
      </h2>
      {mode === "sentence_writing" && <p className="muted">{t("sentenceHint", { lang: sourceLabel })}</p>}

      {sentence && sentenceTranslation?.value && mode !== "sentence_writing" && !feedback && (
        <>
          {!hintOpen ? (
            <button type="button" className="hint-toggle" onClick={onShowHint}>
              <Icon name="hint" size={16} /> {t("showHint")}
              {showShortcuts && <kbd>H</kbd>}
            </button>
          ) : (
            <div className="hint-box" dir="auto">
              {mode === "target_to_source" ? sentenceTranslation.value : sentence.text}
            </div>
          )}
        </>
      )}

      {!feedback && <DifficultyRatingPicker value={null} onChange={onRate} disabled={saving} showShortcuts={showShortcuts} />}

      {feedback && (
        <div className="feedback">
          <div className={`feedback-badge ${feedback.timedOut ? "timeout" : feedback.rating}`}>
            <Icon name={feedback.timedOut ? "timer" : isStrongRating(feedback.rating) ? "check" : "close"} size={18} />
            {feedback.timedOut ? t("timeUpWord") : t(RATING_KEYS[feedback.rating])}
          </div>
          {feedback.reveal && (
            <div className="answer-box" dir="auto">
              {mode === "source_to_target" && (
                <p>
                  <span className="muted">{t("correctAnswer")}</span> <strong>{target.values.join("، ")}</strong>
                </p>
              )}
              {mode === "target_to_source" && (
                <p>
                  <span className="muted">{t("correctWord")}</span> <strong>{displayForm(word)}</strong>
                </p>
              )}
              {mode === "sentence_writing" && (
                <p>
                  <span className="muted">{t("meaning")}</span> <strong>{target.values.join("، ")}</strong>
                </p>
              )}
              {sentence && (
                <p className="answer-example">
                  {sentence.text}
                  {sentenceTranslation?.value ? <span className="muted"> — {sentenceTranslation.value}</span> : null}
                </p>
              )}
            </div>
          )}
          {feedback.willRetry && (
            <p className="muted small">
              <Icon name="refresh" size={14} /> {t("willRetryNote")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
