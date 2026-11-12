import { Fragment, useRef, useState } from "react";
import { SUPPORTED_LANGUAGES } from "@domain/entities/Language";
import { SentenceCollection, canPublish } from "@domain/entities/SentenceCollection";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useConfirm } from "@presentation/context/FeedbackContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useFileImport } from "@presentation/hooks/useFileImport";
import ErrorBanner from "@presentation/components/ErrorBanner";
import ImportResults, { ImportOutcome } from "@presentation/components/ImportResults";
import CollectionRow from "@presentation/components/sentence/CollectionRow";
import SentenceCollectionDialog from "@presentation/components/sentence/SentenceCollectionDialog";
import { Segmented } from "@presentation/components/ui/Controls";
import Icon from "@presentation/components/ui/Icon";
import { InlineLoader } from "@presentation/components/ui/Loader";
import { describeSentenceProblem } from "@presentation/i18n/describeSentenceProblem";

type Shelf = "mine" | "downloaded";

type Dialog = { kind: "none" } | { kind: "form"; collection?: SentenceCollection };

/** The sentences half of the Vocabularies page: own collections (create, edit, import, publish, delete) and downloaded ones. */
export default function SentenceCollectionsManager() {
  const user = useCurrentUser();
  const { profile } = useProfile();
  const { sentences, sentenceCollections } = useServices();
  const { version } = useSyncStatus();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTargetRef = useRef<SentenceCollection | null>(null);

  const [shelf, setShelf] = useState<Shelf>("mine");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importedCollectionId, setImportedCollectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { imports, isImporting, importFiles } = useFileImport();

  const lists = useAsync(async () => {
    const [owned, downloaded] = await Promise.all([sentenceCollections.listOwned(user.id), sentenceCollections.listDownloaded(user.id)]);
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

  async function importSentenceFile(parsed: unknown): Promise<ImportOutcome> {
    const result = await sentences.importExercises(user.id, importTargetRef.current!, parsed);
    const duplicates = result.duplicateSentences.slice(0, 20).join(" · ");
    return {
      importedCount: result.importedCount,
      updatedCount: result.updatedCount,
      duplicateMessage: result.duplicateSentences.length > 0 ? t("sentenceDuplicateSkipped", { sentences: duplicates }) : null,
      problems: result.errors.map((problem) => describeSentenceProblem(t, problem)),
    };
  }

  function chooseImportFile(collection: SentenceCollection) {
    importTargetRef.current = collection;
    fileInputRef.current?.click();
  }

  const isBusy = (id: string) => busyId === id || (isImporting && importTargetRef.current?.id === id);
  const owned = lists.data?.owned ?? [];
  const downloaded = lists.data?.downloaded ?? [];

  const ownedRows = owned.map((collection) => (
    <Fragment key={collection.id}>
      <CollectionRow collection={collection} isOthers={false}>
        <button
          type="button"
          className="icon-btn"
          disabled={isBusy(collection.id)}
          aria-label={t("sentenceImportButton")}
          title={t("sentenceImportButton")}
          onClick={() => chooseImportFile(collection)}
        >
          <Icon name="upload" size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={isBusy(collection.id)}
          aria-label={t("edit")}
          title={t("edit")}
          onClick={() => setDialog({ kind: "form", collection })}
        >
          <Icon name="edit" size={18} />
        </button>
        {collection.status === "draft" ? (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={isBusy(collection.id) || !canPublish(collection)}
            title={canPublish(collection) ? undefined : t("errorCollectionEmpty")}
            onClick={() => act(collection.id, () => sentenceCollections.publish(user.id, collection), "publishError")}
          >
            {t("publish")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={isBusy(collection.id)}
            onClick={() => act(collection.id, () => sentenceCollections.unpublish(user.id, collection), "publishError")}
          >
            {t("unpublish")}
          </button>
        )}
        <button
          type="button"
          className="icon-btn danger"
          disabled={isBusy(collection.id)}
          aria-label={t("delete")}
          title={t("delete")}
          onClick={() =>
            confirm({ title: t("confirmDeleteVocabulary", { name: collection.name }), confirmLabel: t("delete"), danger: true }).then((isConfirmed) => {
              if (isConfirmed) void act(collection.id, () => sentenceCollections.delete(user.id, collection), "deleteError");
            })
          }
        >
          <Icon name="trash" size={18} />
        </button>
      </CollectionRow>
      {importedCollectionId === collection.id && <ImportResults imports={imports} />}
    </Fragment>
  ));

  const downloadedRows = downloaded.map((collection) => (
    <CollectionRow key={collection.id} collection={collection} isOthers>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={isBusy(collection.id)}
        onClick={() => act(collection.id, () => sentenceCollections.removeDownload(user.id, collection.id), "downloadError")}
      >
        {t("removeDownload")}
      </button>
    </CollectionRow>
  ));
  const rows = shelf === "mine" ? ownedRows : downloadedRows;

  return (
    <>
      <div className="page-header">
        <h2>{t("sentenceCollectionsLabel")}</h2>
        <div className="button-row page-actions">
          <button className="btn" onClick={() => setDialog({ kind: "form" })}>
            <Icon name="plus" size={18} /> {t("newSentenceCollection")}
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
        ariaLabel={t("sentenceCollectionsLabel")}
      />

      <div className="card">
        {shelf === "mine" && <p className="muted form-hint">{t("sentenceImportHint")}</p>}
        {error && <ErrorBanner message={error} />}
        {lists.error ? (
          <ErrorBanner message={errorMessage(lists.error, "sentenceCollectionsLoadError")} onRetry={lists.reload} />
        ) : lists.loading && !lists.data ? (
          <InlineLoader />
        ) : rows.length === 0 ? (
          <p className="muted center-text">{shelf === "mine" ? t("noOwnSentenceCollections") : t("noDownloadedSentenceCollections")}</p>
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
          const target = importTargetRef.current;
          if (event.target.files?.length && target) {
            setImportedCollectionId(target.id);
            importFiles(event.target.files, importSentenceFile).then(lists.reload);
          }
          event.target.value = "";
        }}
      />

      {dialog.kind === "form" && (
        <SentenceCollectionDialog
          collection={dialog.collection}
          defaultLanguage={SUPPORTED_LANGUAGES.find((code) => code !== profile.primaryLanguage) ?? profile.primaryLanguage}
          onClose={() => setDialog({ kind: "none" })}
          onSaved={() => {
            setDialog({ kind: "none" });
            setShelf("mine");
            void lists.reload();
          }}
        />
      )}
    </>
  );
}
