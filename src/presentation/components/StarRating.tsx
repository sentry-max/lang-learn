import { useState } from "react";
import { useLanguage } from "@presentation/context/LanguageContext";
import { formatNumber } from "@presentation/format";

const STARS = [1, 2, 3, 4, 5];

/** Read-only star display, e.g. ★★★★☆ 4.2 (12). */
export function StarDisplay({ value, count }: { value: number; count?: number }) {
  const { language, t } = useLanguage();
  const rounded = Math.round(value);
  return (
    <span className="stars" aria-label={t("ratingAria", { value: formatNumber(value, language, 1) })}>
      <span aria-hidden="true">
        {STARS.map((star) => (
          <span key={star} className={star <= rounded ? "star on" : "star"}>
            ★
          </span>
        ))}
      </span>
      {count !== undefined && (
        <span className="muted">
          {count > 0 ? ` ${formatNumber(value, language, 1)} (${formatNumber(count, language)})` : ` ${t("noRatingsYet")}`}
        </span>
      )}
    </span>
  );
}

/** 1–5 star picker. */
export function StarInput({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="stars stars-input" role="radiogroup" aria-label={t("yourRating")} onMouseLeave={() => setHover(0)}>
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={t("starsLabel", { count: star })}
          disabled={disabled}
          className={star <= shown ? "star on" : "star"}
          onMouseEnter={() => setHover(star)}
          onClick={() => onChange(star)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
