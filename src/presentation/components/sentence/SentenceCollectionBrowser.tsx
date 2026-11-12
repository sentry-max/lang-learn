import { useEffect, useState } from "react";
import { SentenceCollection } from "@domain/entities/SentenceCollection";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import CollectionRow from "@presentation/components/sentence/CollectionRow";
import Icon from "@presentation/components/ui/Icon";
import { InlineLoader } from "@presentation/components/ui/Loader";

const SEARCH_DELAY_MS = 300;

/** The sentences half of the Explore page: other people's published collections, searchable, to download. */
export default function SentenceCollectionBrowser() {
  const user = useCurrentUser();
  const { sentenceCollections } = useServices();
  const { version } = useSyncStatus();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const published = useAsync(() => sentenceCollections.browse(user.id, search), [user.id, search, version]);
  const downloaded = useAsync(() => sentenceCollections.listDownloaded(user.id), [user.id, version]);
  const downloadedIds = new Set((downloaded.data ?? []).map((collection) => collection.id));

  async function toggleDownload(collection: SentenceCollection) {
    setBusyId(collection.id);
    setError(null);
    try {
      if (downloadedIds.has(collection.id)) await sentenceCollections.removeDownload(user.id, collection.id);
      else await sentenceCollections.download(user.id, collection);
      await downloaded.reload();
    } catch (caughtError) {
      setError(errorMessage(caughtError, "downloadError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          className="toolbar-search"
          enterKeyHint="search"
          placeholder={t("searchSentenceCollections")}
          aria-label={t("searchSentenceCollections")}
          value={searchInput}
          maxLength={100}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>
      <div className="card">
        {error && <ErrorBanner message={error} />}
        {published.error ? (
          <ErrorBanner message={errorMessage(published.error, "sentenceCollectionsLoadError")} onRetry={published.reload} />
        ) : published.loading && !published.data ? (
          <InlineLoader />
        ) : (published.data ?? []).length === 0 ? (
          <p className="muted center-text">{t("noSentenceCollectionsMatch")}</p>
        ) : (
          (published.data ?? []).map((collection) => {
            const isDownloaded = downloadedIds.has(collection.id);
            return (
              <CollectionRow key={collection.id} collection={collection} isOthers>
                <button
                  type="button"
                  className={`btn btn-small${isDownloaded ? " btn-secondary" : ""}`}
                  disabled={busyId === collection.id}
                  onClick={() => toggleDownload(collection)}
                >
                  <Icon name={isDownloaded ? "check" : "download"} size={16} /> {isDownloaded ? t("removeDownload") : t("download")}
                </button>
              </CollectionRow>
            );
          })
        )}
      </div>
    </>
  );
}
