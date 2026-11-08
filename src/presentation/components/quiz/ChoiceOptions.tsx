import { ChoiceOption } from "@domain/services/MultipleChoiceService";
import { useLanguage } from "@presentation/context/LanguageContext";
import Icon from "@presentation/components/ui/Icon";

interface Props {
  choices: ChoiceOption[];
  /** Once answered, the options show which was correct and which was chosen */
  isAnswered: boolean;
  chosenIndex: number | null;
  disabled: boolean;
  showShortcuts: boolean;
  onChoose: (index: number) => void;
}

/** The options of a multiple-choice question. */
export default function ChoiceOptions({ choices, isAnswered, chosenIndex, disabled, showShortcuts, onChoose }: Props) {
  const { t } = useLanguage();
  return (
    <div className="choice-options" role="group" aria-label={t("choicePrompt")}>
      {choices.map((choice, index) => {
        const resultClass = !isAnswered ? "" : choice.isCorrect ? " correct" : index === chosenIndex ? " wrong" : " dimmed";
        return (
          <button
            key={index}
            type="button"
            className={`choice-btn${resultClass}`}
            disabled={disabled || isAnswered}
            aria-keyshortcuts={showShortcuts ? String(index + 1) : undefined}
            onClick={() => onChoose(index)}
          >
            {showShortcuts && <kbd>{index + 1}</kbd>}
            <span dir="auto">{choice.text}</span>
            {isAnswered && choice.isCorrect && <Icon name="check" size={18} />}
            {isAnswered && !choice.isCorrect && index === chosenIndex && <Icon name="close" size={18} />}
          </button>
        );
      })}
    </div>
  );
}
