import { useEffect, useState } from "react";
import { Conversation } from "@domain/entities/Conversation";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import ConversationRow from "@presentation/components/conversation/ConversationRow";
import Icon from "@presentation/components/ui/Icon";
import { InlineLoader } from "@presentation/components/ui/Loader";

const SEARCH_DELAY_MS = 300;

/** The conversations half of the Explore page: other people's published conversations, searchable, to download. */
export default function ConversationBrowser() {
  const user = useCurrentUser();
  const { conversations } = useServices();
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

  const published = useAsync(() => conversations.browse(user.id, search), [user.id, search, version]);
  const downloaded = useAsync(() => conversations.listDownloaded(user.id), [user.id, version]);
  const downloadedIds = new Set((downloaded.data ?? []).map((conversation) => conversation.id));

  async function toggleDownload(conversation: Conversation) {
    setBusyId(conversation.id);
    setError(null);
    try {
      if (downloadedIds.has(conversation.id)) await conversations.removeDownload(user.id, conversation.id);
      else await conversations.download(user.id, conversation);
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
          placeholder={t("searchConversations")}
          aria-label={t("searchConversations")}
          value={searchInput}
          maxLength={100}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>
      <div className="card">
        {error && <ErrorBanner message={error} />}
        {published.error ? (
          <ErrorBanner message={errorMessage(published.error, "conversationLoadError")} onRetry={published.reload} />
        ) : published.loading && !published.data ? (
          <InlineLoader />
        ) : (published.data ?? []).length === 0 ? (
          <p className="muted center-text">{t("noConversationsMatch")}</p>
        ) : (
          (published.data ?? []).map((conversation) => {
            const isDownloaded = downloadedIds.has(conversation.id);
            return (
              <ConversationRow key={conversation.id} conversation={conversation} isOthers>
                <button
                  type="button"
                  className={`btn btn-small${isDownloaded ? " btn-secondary" : ""}`}
                  disabled={busyId === conversation.id}
                  onClick={() => toggleDownload(conversation)}
                >
                  <Icon name={isDownloaded ? "check" : "download"} size={16} /> {isDownloaded ? t("removeDownload") : t("download")}
                </button>
              </ConversationRow>
            );
          })
        )}
      </div>
    </>
  );
}
