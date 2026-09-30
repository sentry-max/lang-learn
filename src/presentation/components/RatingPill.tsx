import { DifficultyRating, QuestionMode } from "@domain/entities/Learning";
import { useLanguage } from "@presentation/context/LanguageContext";
import { UiStringKey } from "@presentation/i18n/translations";

export const RATING_KEYS: Record<DifficultyRating, UiStringKey> = {
  very_easy: "ratingVeryEasy",
  easy: "ratingEasy",
  good: "ratingGood",
  bad: "ratingBad",
  very_bad: "ratingVeryBad",
};

export const MODE_KEYS: Record<QuestionMode, UiStringKey> = {
  source_to_target: "modeForwardShort",
  target_to_source: "modeReverseShort",
  sentence_writing: "modeSentenceShort",
};

export default function RatingPill({ rating }: { rating: DifficultyRating | null }) {
  const { t } = useLanguage();
  if (!rating) return <span className="pill">—</span>;
  return <span className={`pill rating-pill ${rating}`}>{t(RATING_KEYS[rating])}</span>;
}
