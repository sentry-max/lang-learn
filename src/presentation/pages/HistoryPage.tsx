import { useMemo, useState } from "react";
import { DIFFICULTY_RATINGS, DifficultyRating } from "@domain/entities/Learning";
import { displayForm, getTranslations } from "@domain/entities/Word";
import {
  HistoryOverview,
  HistoryWord,
  wordIdsForLetter,
  wordIdsForRating,
} from "@application/services/LearningHistoryService";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useConfirm } from "@presentation/context/FeedbackContext";
import ErrorBanner from "@presentation/components/ErrorBanner";
import RatingPill, { MODE_KEYS, RATING_KEYS } from "@presentation/components/RatingPill";
import { formatDateTime, formatSeconds } from "@presentation/format";
import { InlineLoader, PageLoader } from "@presentation/components/ui/Loader";

/**
 * The History tab: letters that have seen words; per letter every seen word
 * with its full answer history (when shown, how fast, what rating). Resets
 * per letter, per last answer, or everything — all soft, nothing deleted.
 */
export default function HistoryPage() {
  const user = useCurrentUser();
  const { history } = useServices();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();

  const { version } = useSyncStatus();
  const overview = useAsync(() => history.getOverview(user.id), [user.id, version]);
  const [letter, setLetter] = useState<string | null>(null);
  const [resetRating, setResetRating] = useState<DifficultyRating>("very_bad");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeLetter = letter && overview.data?.letters.some((l) => l.letter === letter) ? letter : null;

  async function reset(wordIds: string[] | null, confirmText: string) {
    if (!(await confirm({ title: t("resetConfirmTitle"), message: confirmText, confirmLabel: t("reset"), danger: true }))) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const count = wordIds === null ? await history.resetAll(user.id) : await history.resetWords(user.id, wordIds);
      setMessage(t("resetDone", { count }));
      await overview.reload();
    } catch (err) {
      setError(errorMessage(err, "resetError"));
    } finally {
      setBusy(false);
    }
  }

  if (overview.loading && !overview.data) return <PageLoader />;
  if (overview.error && !overview.data) {
    return (
      <div className="app-main">
        <ErrorBanner message={errorMessage(overview.error, "historyLoadError")} onRetry={overview.reload} />
      </div>
    );
  }
  const data = overview.data!;
  const ratingCount = wordIdsForRating(data, resetRating).length;

  return (
    <div className="app-main">
      <div className="page-header">
        <h2>{t("navHistory")}</h2>
        <span className="pill">{t("seenWordsCount", { count: data.words.length })}</span>
      </div>
      {error && <ErrorBanner message={error} />}
      {message && <p className="feedback-correct">{message}</p>}

      {data.words.length === 0 ? (
        <div className="card center-text muted">{t("historyEmpty")}</div>
      ) : (
        <>
          <div className="card">
            <div className="toolbar">
              <label className="inline-field">
                <span className="muted">{t("resetByAnswer")}</span>
                <select value={resetRating} onChange={(e) => setResetRating(e.target.value as DifficultyRating)}>
                  {DIFFICULTY_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {t(RATING_KEYS[r])} ({wordIdsForRating(data, r).length})
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-secondary"
                disabled={busy || ratingCount === 0}
                onClick={() =>
                  reset(
                    wordIdsForRating(data, resetRating),
                    t("confirmResetRating", { rating: t(RATING_KEYS[resetRating]), count: ratingCount })
                  )
                }
              >
                {t("reset")}
              </button>
              <div className="toolbar-spacer" />
              <button
                className="btn btn-secondary danger-text"
                disabled={busy}
                onClick={() => reset(null, t("confirmResetAll"))}
              >
                {t("resetAll")}
              </button>
            </div>

            <div className="chip-grid" role="tablist" aria-label={t("lettersLabel")}>
              {data.letters.map(({ letter: l, count }) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={activeLetter === l}
                  className={`chip letter-chip${activeLetter === l ? " selected" : ""}`}
                  onClick={() => setLetter(activeLetter === l ? null : l)}
                >
                  <strong>{l}</strong>
                  <span className="chip-count">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {activeLetter ? (
            <LetterHistory
              overview={data}
              letter={activeLetter}
              busy={busy}
              onReset={() =>
                reset(wordIdsForLetter(data, activeLetter), t("confirmResetLetter", { letter: activeLetter }))
              }
            />
          ) : (
            <p className="muted center-text">{t("pickLetter")}</p>
          )}
        </>
      )}
    </div>
  );
}

function LetterHistory({
  overview,
  letter,
  busy,
  onReset,
}: {
  overview: HistoryOverview;
  letter: string;
  busy: boolean;
  onReset: () => void;
}) {
  const user = useCurrentUser();
  const { history } = useServices();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const errorMessage = useErrorMessage();
  const [expanded, setExpanded] = useState<string | null>(null);

  const words = useMemo(() => overview.words.filter((w) => w.letter === letter), [overview, letter]);
  const events = useAsync(
    () => history.getEvents(user.id, words.map((w) => w.wordId)),
    [user.id, words.map((w) => w.wordId).join(",")]
  );

  return (
    <div className="card">
      <div className="section-header">
        <h3>
          {letter} <span className="muted">({words.length})</span>
        </h3>
        <button className="btn btn-secondary danger-text" disabled={busy} onClick={onReset}>
          {t("resetLetter", { letter })}
        </button>
      </div>
      {events.error ? <ErrorBanner message={errorMessage(events.error, "historyLoadError")} onRetry={events.reload} /> : null}

      {words.map((entry: HistoryWord) => {
        const isOpen = expanded === entry.wordId;
        const wordEvents = events.data?.get(entry.wordId) ?? [];
        return (
          <div key={entry.wordId} className="history-word">
            <button
              type="button"
              className="history-row"
              aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? null : entry.wordId)}
            >
              <span className="history-row-main">
                <span className="vocab-row-headword" dir="auto">
                  {entry.word ? displayForm(entry.word) : t("wordUnavailable")}
                </span>
                {entry.word && (
                  <span className="vocab-row-translation" dir="auto">
                    {getTranslations(entry.word, profile.primaryLanguage).join("، ")}
                  </span>
                )}
              </span>
              <span className="history-row-meta">
                <RatingPill rating={entry.progress.lastRating} />
                <span className="muted small">{t("timesSeen", { count: entry.progress.timesSeen })}</span>
              </span>
            </button>

            {isOpen && (
              <div className="history-details">
                <p className="muted small">
                  {t("lastSeen")}: {formatDateTime(entry.progress.lastReviewedAt, language)} · {t("nextReview")}:{" "}
                  {formatDateTime(entry.progress.nextReviewAt, language)} · {t("avgResponse")}:{" "}
                  {formatSeconds(entry.progress.avgResponseMs, language)} {t("secondsShort")}
                </p>
                {events.loading && !events.data ? (
                  <InlineLoader />
                ) : wordEvents.length === 0 ? (
                  <p className="muted">{t("noEvents")}</p>
                ) : (
                  <div className="table-scroll">
                    <table className="events-table">
                      <thead>
                        <tr>
                          <th>{t("shownAt")}</th>
                          <th>{t("responseTime")}</th>
                          <th>{t("direction")}</th>
                          <th>{t("yourAnswer")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wordEvents.map((event) => (
                          <tr key={event.id}>
                            <td>{formatDateTime(event.shownAt, language)}</td>
                            <td>
                              {formatSeconds(event.responseMs, language)} {t("secondsShort")}
                            </td>
                            <td>{t(MODE_KEYS[event.mode])}</td>
                            <td>
                              <RatingPill rating={event.rating} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
