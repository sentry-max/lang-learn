import { DIFFICULTY_RATINGS, DifficultyRating } from "@domain/entities/Review";
import { useLanguage } from "@presentation/context/LanguageContext";
import { UiStringKey } from "@presentation/i18n/translations";

interface Props {
  value: DifficultyRating | null;
  onChange: (rating: DifficultyRating) => void;
  disabled?: boolean;
}

const RATING_KEY: Record<DifficultyRating, UiStringKey> = {
  very_easy: "ratingVeryEasy",
  easy: "ratingEasy",
  good: "ratingGood",
  bad: "ratingBad",
  very_bad: "ratingVeryBad",
};

/** The 5-level self-rating strip: very easy / easy / good / bad / very bad. */
export default function DifficultyRatingPicker({ value, onChange, disabled }: Props) {
  const { t } = useLanguage();
  return (
    <div>
      <p className="muted" style={{ marginBottom: 4 }}>{t("ratingPrompt")}</p>
      <div className="rating-grid">
        {DIFFICULTY_RATINGS.map((rating) => (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            className={`rating-btn ${rating}${value === rating ? " selected" : ""}`}
            onClick={() => onChange(rating)}
          >
            {t(RATING_KEY[rating])}
          </button>
        ))}
      </div>
    </div>
  );
}
