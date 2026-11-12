import { useRef, useState } from "react";
import { Conversation } from "@domain/entities/Conversation";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useConfirm } from "@presentation/context/FeedbackContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useFileImport } from "@presentation/hooks/useFileImport";
import ErrorBanner from "@presentation/components/ErrorBanner";
import ImportResults, { ImportOutcome } from "@presentation/components/ImportResults";
import ConversationRow from "@presentation/components/conversation/ConversationRow";
import { Segmented } from "@presentation/components/ui/Controls";
import Icon from "@presentation/components/ui/Icon";
import { InlineLoader, Spinner } from "@presentation/components/ui/Loader";
import { describeConversationProblems } from "@presentation/i18n/describeConversationProblem";

type Shelf = "mine" | "downloaded";

/** The conversations half of the Vocabularies page: own conversations (import, publish, delete) and downloaded ones. */
export default function ConversationsManager() {
  const user = useCurrentUser();
  const { conversations } = useServices();
  const { version } = useSyncStatus();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [shelf, setShelf] = useState<Shelf>("mine");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { imports, isImporting, importFiles } = useFileImport();

  const lists = useAsync(async () => {
    const [owned, downloaded] = await Promise.all([conversations.listOwned(user.id), conversations.listDownloaded(user.id)]);
    return { owned, downloaded };
  }, [user.id, version]);

  async function act(id: string, action: () => Promise<unknown>, fallback: Parameters<typeof errorMessage>[1]) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await lists.reload();
    } catch (caughtError) {
      setError(errorMessage(caughtError, fallback));
    } finally {
      setBusyId(null);
    }
  }

  async function importConversationFile(parsed: unknown): Promise<ImportOutcome> {
    const result = await conversations.importFile(user.id, parsed);
    return {
      importedCount: result.importedCount,
      updatedCount: result.updatedCount,
      duplicateMessage: null,
      problems: result.problems.flatMap((problem) => describeConversationProblems(t, problem)),
    };
  }

  function requestDelete(conversation: Conversation) {
    void confirm({ title: t("confirmDeleteVocabulary", { name: conversation.title }), confirmLabel: t("delete"), danger: true }).then((isConfirmed) => {
      if (isConfirmed) void act(conversation.id, () => conversations.delete(user.id, conversation), "deleteError");
    });
  }

  const owned = lists.data?.owned ?? [];
  const downloaded = lists.data?.downloaded ?? [];

  const ownedRows = owned.map((conversation) => (
    <ConversationRow key={conversation.id} conversation={conversation} isOthers={false}>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={busyId === conversation.id}
        onClick={() =>
          act(conversation.id, () => (conversation.status === "draft" ? conversations.publish(user.id, conversation) : conversations.unpublish(user.id, conversation)), "publishError")
        }
      >
        {conversation.status === "draft" ? t("publish") : t("unpublish")}
      </button>
      <button
        type="button"
        className="icon-btn danger"
        disabled={busyId === conversation.id}
        aria-label={t("delete")}
        title={t("delete")}
        onClick={() => requestDelete(conversation)}
      >
        <Icon name="trash" size={18} />
      </button>
    </ConversationRow>
  ));

  const downloadedRows = downloaded.map((conversation) => (
    <ConversationRow key={conversation.id} conversation={conversation} isOthers>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={busyId === conversation.id}
        onClick={() => act(conversation.id, () => conversations.removeDownload(user.id, conversation.id), "downloadError")}
      >
        {t("removeDownload")}
      </button>
    </ConversationRow>
  ));
  const rows = shelf === "mine" ? ownedRows : downloadedRows;

  return (
    <>
      <div className="page-header">
        <h2>{t("navConversations")}</h2>
        <div className="button-row page-actions">
          <button className="btn" disabled={isImporting} onClick={() => fileInputRef.current?.click()}>
            {isImporting ? <Spinner /> : <Icon name="upload" size={18} />} {t("conversationImportButton")}
          </button>
        </div>
      </div>

      <Segmented
        options={[
          { value: "mine", label: `${t("sentenceCollectionsMine")} (${owned.length})` },
          { value: "downloaded", label: `${t("downloaded")} (${downloaded.length})` },
        ]}
        value={shelf}
        onChange={setShelf}
        ariaLabel={t("navConversations")}
      />

      <div className="card">
        {shelf === "mine" && <p className="muted form-hint">{t("conversationImportHint")}</p>}
        {shelf === "mine" && <ImportResults imports={imports} />}
        {error && <ErrorBanner message={error} />}
        {lists.error ? (
          <ErrorBanner message={errorMessage(lists.error, "conversationLoadError")} onRetry={lists.reload} />
        ) : lists.loading && !lists.data ? (
          <InlineLoader />
        ) : rows.length === 0 ? (
          <p className="muted center-text">{shelf === "mine" ? t("noOwnConversations") : t("noDownloadedConversations")}</p>
        ) : (
          rows
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) {
            setShelf("mine");
            void importFiles(event.target.files, importConversationFile).then(lists.reload);
          }
          event.target.value = "";
        }}
      />
    </>
  );
}
