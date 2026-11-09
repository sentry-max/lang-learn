import { AnswerDraft } from "@domain/services/SentenceSelectionService";
import { useLanguage } from "@presentation/context/LanguageContext";

interface Props {
  draft: AnswerDraft;
  disabled: boolean;
  onChange: (draft: AnswerDraft) => void;
  onSubmit: () => void;
}

/** A text box for the rewritten sentence; Enter submits. */
export default function TransformExercise({ draft, disabled, onChange, onSubmit }: Props) {
  const { t } = useLanguage();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="transform-input"
        type="text"
        dir="auto"
        value={draft.text}
        placeholder={t("sentenceTransformPlaceholder")}
        aria-label={t("sentenceTransformPlaceholder")}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={500}
        disabled={disabled}
        autoFocus
        onChange={(event) => onChange({ ...draft, text: event.target.value })}
      />
    </form>
  );
}
