import { useLanguage } from "@presentation/context/LanguageContext";

interface Props {
  letters: { letter: string; count: number }[];
  selected: string[];
  onChange: (letters: string[]) => void;
}

/** Multi-select chips of the starting letters available in the chosen vocabularies. */
export default function LetterPicker({ letters, selected, onChange }: Props) {
  const { t } = useLanguage();
  const selectedSet = new Set(selected);

  function toggle(letter: string) {
    onChange(selectedSet.has(letter) ? selected.filter((l) => l !== letter) : [...selected, letter]);
  }

  return (
    <div className="chip-grid" role="group" aria-label={t("letterFilterLabel")}>
      <button
        type="button"
        className={`chip${selected.length === 0 ? " selected" : ""}`}
        aria-pressed={selected.length === 0}
        onClick={() => onChange([])}
      >
        {t("allLetters")}
      </button>
      {letters.map(({ letter, count }) => (
        <button
          key={letter}
          type="button"
          className={`chip${selectedSet.has(letter) ? " selected" : ""}`}
          aria-pressed={selectedSet.has(letter)}
          title={t("wordCountLabel", { count })}
          onClick={() => toggle(letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}
