import { DIFFICULTY_RATINGS, DifficultyRating } from "@domain/entities/Learning";
import { useLanguage } from "@presentation/context/LanguageContext";
import { RATING_KEYS } from "@presentation/components/RatingPill";

interface Props {
  value: DifficultyRating | null;
  onChange: (rating: DifficultyRating) => void;
  disabled?: boolean;
  /** Show the 1–5 keyboard shortcut on each button */
  showShortcuts?: boolean;
}

/** The 5-level self-rating strip: very easy / easy / good / bad / very bad. */
export default function DifficultyRatingPicker({ value, onChange, disabled, showShortcuts }: Props) {
  const { t } = useLanguage();
  return (
    <div className="rating-picker">
      <p className="muted rating-prompt">{t("ratingPrompt")}</p>
      <div className="rating-grid">
        {DIFFICULTY_RATINGS.map((rating, index) => (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            aria-pressed={value === rating}
            aria-keyshortcuts={showShortcuts ? String(index + 1) : undefined}
            className={`rating-btn ${rating}${value === rating ? " selected" : ""}`}
            onClick={() => onChange(rating)}
          >
            <span>{t(RATING_KEYS[rating])}</span>
            {showShortcuts && <kbd>{index + 1}</kbd>}
          </button>
        ))}
      </div>
    </div>
  );
}
