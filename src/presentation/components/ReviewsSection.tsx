import { FormEvent, useEffect, useState } from "react";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { REVIEW_COMMENT_MAX } from "@domain/entities/VocabularyReview";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useConfirm } from "@presentation/context/FeedbackContext";
import { StarDisplay, StarInput } from "@presentation/components/StarRating";
import ErrorBanner from "@presentation/components/ErrorBanner";
import { formatDate } from "@presentation/format";
import { InlineLoader } from "@presentation/components/ui/Loader";

interface Props {
  vocabulary: Vocabulary;
  /** Called after the user's own review changes, so the page can refresh the average */
  onChanged: () => void;
}

/** Star ratings and written reviews for a published vocabulary. */
export default function ReviewsSection({ vocabulary, onChanged }: Props) {
  const user = useCurrentUser();
  const { reviews } = useServices();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const { version } = useSyncStatus();
  const list = useAsync(() => reviews.list(vocabulary.id), [vocabulary.id, version]);

  const mine = list.data?.find((r) => r.userId === user.id) ?? null;
  const canReview = reviews.canReview(user.id, vocabulary);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setComment(mine?.comment ?? "");
  }, [mine?.id, mine?.rating, mine?.comment]);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await list.reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "reviewSaveError"));
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError(t("reviewPickStars"));
      return;
    }
    run(() => reviews.save(user.id, vocabulary, rating, comment));
  }

  const others = (list.data ?? []).filter((r) => r.userId !== user.id);

  return (
    <div className="card">
      <div className="section-header">
        <h3>{t("reviewsTitle")}</h3>
        <StarDisplay value={vocabulary.ratingAvg} count={vocabulary.ratingCount} />
      </div>

      {canReview && (
        <form onSubmit={submit} className="review-form">
          <label className="field-label">{mine ? t("yourReview") : t("writeReview")}</label>
          <StarInput value={rating} onChange={setRating} disabled={saving} />
          <textarea
            rows={3}
            dir="auto"
            maxLength={REVIEW_COMMENT_MAX}
            placeholder={t("reviewPlaceholder")}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <ErrorBanner message={error} />}
          <div className="button-row">
            <button className="btn" type="submit" disabled={saving}>
              {mine ? t("updateReview") : t("postReview")}
            </button>
            {mine && (
              <button
                className="btn btn-secondary danger-text"
                type="button"
                disabled={saving}
                onClick={() =>
                  confirm({ title: t("confirmDeleteReview"), confirmLabel: t("delete"), danger: true }).then((ok) => {
                    if (ok) void run(() => reviews.delete(user.id, vocabulary.id));
                  })
                }
              >
                {t("delete")}
              </button>
            )}
          </div>
        </form>
      )}

      {list.error ? <ErrorBanner message={errorMessage(list.error, "reviewsLoadError")} onRetry={list.reload} /> : null}
      {list.loading && !list.data && <InlineLoader />}
      {list.data && others.length === 0 && !mine && <p className="muted">{t("noReviewsYet")}</p>}

      {[...(mine ? [mine] : []), ...others].map((review) => (
        <div key={review.id} className="review-item">
          <div className="review-meta">
            <strong dir="auto">{review.authorName ?? t("unknownUser")}</strong>
            <StarDisplay value={review.rating} />
            <span className="muted">{formatDate(review.updatedAt, language)}</span>
          </div>
          {review.comment && (
            <p className="review-comment" dir="auto">
              {review.comment}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
