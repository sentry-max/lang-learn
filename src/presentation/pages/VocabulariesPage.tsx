import { ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Vocabulary, publishBlocker } from "@domain/entities/Vocabulary";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useConfirm } from "@presentation/context/FeedbackContext";
import ErrorBanner from "@presentation/components/ErrorBanner";
import Icon from "@presentation/components/ui/Icon";
import WordFormDialog from "@presentation/components/WordFormDialog";
import { LanguagePair, StatusPill } from "@presentation/components/VocabularyBadges";
import { StarDisplay } from "@presentation/components/StarRating";
import { formatDate, formatNumber } from "@presentation/format";
import { InlineLoader } from "@presentation/components/ui/Loader";

type Tab = "mine" | "downloaded";

/** Manage own vocabularies (drafts and published) and downloaded ones. */
export default function VocabulariesPage() {
  const user = useCurrentUser();
  const { vocabularies } = useServices();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("mine");
  const [addingWord, setAddingWord] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { version } = useSyncStatus();
  const data = useAsync(async () => {
    const [owned, downloaded] = await Promise.all([
      vocabularies.listOwned(user.id),
      vocabularies.listDownloaded(user.id),
    ]);
    return { owned, downloaded };
  }, [user.id, version]);

  async function act(id: string, action: () => Promise<unknown>, fallback: Parameters<typeof errorMessage>[1]) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      await action();
      await data.reload();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusyId(null);
    }
  }

  const owned = data.data?.owned ?? [];
  const downloaded = data.data?.downloaded ?? [];

  return (
    <div className="app-main">
      <div className="page-header">
        <h2>{t("navVocabularies")}</h2>
        <div className="button-row">
          <button className="btn btn-secondary" onClick={() => setAddingWord(true)}>
            {t("addWordButton")}
          </button>
          <Link className="btn btn-secondary" to="/feed">
            {t("browseFeed")}
          </Link>
          <Link className="btn" to="/vocabularies/new">
            {t("newVocabulary")}
          </Link>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {data.error ? <ErrorBanner message={errorMessage(data.error, "vocabLoadError")} onRetry={data.reload} /> : null}
      {message && <p className="feedback-correct">{message}</p>}

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "mine"}
          className={`tab${tab === "mine" ? " active" : ""}`}
          onClick={() => setTab("mine")}
        >
          {t("myVocabularies")} ({owned.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "downloaded"}
          className={`tab${tab === "downloaded" ? " active" : ""}`}
          onClick={() => setTab("downloaded")}
        >
          {t("downloadedVocabularies")} ({downloaded.length})
        </button>
      </div>

      <div className="card">
        {data.loading && !data.data && <InlineLoader />}

        {tab === "mine" && data.data && owned.length === 0 && (
          <div className="center-text">
            <p className="muted">{t("noOwnVocabularies")}</p>
            <Link className="btn" to="/vocabularies/new">
              {t("newVocabulary")}
            </Link>
          </div>
        )}
        {tab === "mine" &&
          owned.map((v) => (
            <VocabularyRow key={v.id} vocabulary={v} onOpen={() => navigate(`/vocabularies/${v.id}`)}>
              <StatusPill vocabulary={v} />
              {v.status === "draft" ? (
                <button
                  className="btn btn-small"
                  disabled={busyId === v.id || publishBlocker(v.wordCount) !== null}
                  title={publishBlocker(v.wordCount) ? t("publishRequirement") : undefined}
                  onClick={() => act(v.id, () => vocabularies.publish(v), "publishError")}
                >
                  {t("publish")}
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-small"
                  disabled={busyId === v.id}
                  onClick={() =>
                    confirm({ title: t("confirmUnpublish"), confirmLabel: t("unpublish") }).then((ok) => {
                      if (ok) void act(v.id, () => vocabularies.unpublish(v.id), "publishError");
                    })
                  }
                >
                  {t("unpublish")}
                </button>
              )}
              <button
                className="icon-btn danger"
                aria-label={t("delete")}
                disabled={busyId === v.id}
                onClick={() =>
                  confirm({
                    title: t("confirmDeleteVocabulary", { name: v.name }),
                    confirmLabel: t("delete"),
                    danger: true,
                  }).then((ok) => {
                    if (ok) void act(v.id, () => vocabularies.delete(v.id), "deleteError");
                  })
                }
              >
                <Icon name="trash" size={18} />
              </button>
            </VocabularyRow>
          ))}

        {tab === "downloaded" && data.data && downloaded.length === 0 && (
          <div className="center-text">
            <p className="muted">{t("noDownloads")}</p>
            <Link className="btn" to="/feed">
              {t("browseFeed")}
            </Link>
          </div>
        )}
        {tab === "downloaded" &&
          downloaded.map((v) => (
            <VocabularyRow key={v.id} vocabulary={v} onOpen={() => navigate(`/vocabularies/${v.id}`)} showAuthor>
              <button
                className="btn btn-secondary btn-small"
                disabled={busyId === v.id}
                onClick={() =>
                  confirm({
                    title: t("confirmRemoveDownload", { name: v.name }),
                    confirmLabel: t("removeDownload"),
                    danger: true,
                  }).then((ok) => {
                    if (ok) void act(v.id, () => vocabularies.removeDownload(user.id, v.id), "downloadError");
                  })
                }
              >
                {t("removeDownload")}
              </button>
            </VocabularyRow>
          ))}
      </div>

      {addingWord && (
        <WordFormDialog
          vocabulary={null}
          ownedVocabularies={owned}
          onClose={() => setAddingWord(false)}
          onSaved={(text) => {
            setMessage(text);
            data.reload();
          }}
        />
      )}
    </div>
  );
}

function VocabularyRow({
  vocabulary: v,
  onOpen,
  showAuthor,
  children,
}: {
  vocabulary: Vocabulary;
  onOpen: () => void;
  showAuthor?: boolean;
  children: ReactNode;
}) {
  const { t, language } = useLanguage();
  return (
    <div className="vocab-card-row">
      <button type="button" className="vocab-card-main" onClick={onOpen}>
        <span className="vocab-row-headword" dir="auto">
          {v.name}
        </span>
        <span className="meta-line">
          <LanguagePair vocabulary={v} />
          <span className="muted small">{t("wordCountLabel", { count: formatNumber(v.wordCount, language) })}</span>
          {showAuthor && v.ownerName && <span className="muted small">{t("byAuthor", { name: v.ownerName })}</span>}
          {v.status === "published" && <StarDisplay value={v.ratingAvg} count={v.ratingCount} />}
          <span className="muted small">{t("updatedOn", { date: formatDate(v.updatedAt, language) })}</span>
        </span>
      </button>
      <div className="row-actions">{children}</div>
    </div>
  );
}
