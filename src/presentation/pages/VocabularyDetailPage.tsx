import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MAX_VOCABULARY_WORDS, MIN_PUBLISH_WORDS, publishBlocker } from "@domain/entities/Vocabulary";
import { Word, displayForm, getTranslations } from "@domain/entities/Word";
import { firstLetter } from "@domain/services/LetterService";
import { ImportResult } from "@application/services/WordService";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useConfirm } from "@presentation/context/FeedbackContext";
import ErrorBanner from "@presentation/components/ErrorBanner";
import Icon from "@presentation/components/ui/Icon";
import Modal from "@presentation/components/Modal";
import ReviewsSection from "@presentation/components/ReviewsSection";
import WordFormDialog from "@presentation/components/WordFormDialog";
import WordFormsDetail from "@presentation/components/WordFormsDetail";
import { LanguagePair, StatusPill } from "@presentation/components/VocabularyBadges";
import { StarDisplay } from "@presentation/components/StarRating";
import { formatDate, formatNumber } from "@presentation/format";
import { InlineLoader, PageLoader } from "@presentation/components/ui/Loader";

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const WORDS_PAGE = 200;

interface FileImport {
  fileName: string;
  result: ImportResult;
}

type Dialog = { kind: "none" } | { kind: "details"; word: Word } | { kind: "form"; word?: Word };

export default function VocabularyDetailPage() {
  const { id = "" } = useParams();
  const user = useCurrentUser();
  const { profile } = useProfile();
  const { vocabularies, words: wordService, prepareOffline } = useServices();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { version } = useSyncStatus();
  const vocabulary = useAsync(() => vocabularies.get(id), [id, version]);
  const words = useAsync(() => wordService.listByVocabulary(id), [id, version]);
  const downloadedIds = useAsync(() => vocabularies.listDownloadedIds(user.id), [user.id, version]);

  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(WORDS_PAGE);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [imports, setImports] = useState<FileImport[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const v = vocabulary.data;
  const isOwner = v?.ownerId === user.id;
  const isDownloaded = v ? (downloadedIds.data?.has(v.id) ?? false) : false;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const list = (words.data ?? []).filter(
      (w) =>
        !query ||
        w.headword.toLocaleLowerCase().includes(query) ||
        getTranslations(w, profile.primaryLanguage).some((tr) => tr.toLocaleLowerCase().includes(query))
    );
    return list.sort((a, b) => a.headword.localeCompare(b.headword));
  }, [words.data, search, profile.primaryLanguage]);

  async function refreshAll() {
    await Promise.all([vocabulary.reload(), words.reload()]);
  }

  async function act(action: () => Promise<unknown>, fallback: Parameters<typeof errorMessage>[1], after?: () => void) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function handleFiles(files: FileList) {
    if (!v) return;
    setBusy(true);
    setError(null);
    const results: FileImport[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        results.push({ fileName: file.name, result: failed(t("importFileTooLarge")) });
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(await file.text());
        results.push({ fileName: file.name, result: await wordService.importWords(user.id, v, parsed) });
      } catch (err) {
        const text = err instanceof SyntaxError ? t("importInvalidJson") : errorMessage(err, "importError");
        results.push({ fileName: file.name, result: failed(text) });
      }
    }
    setImports(results);
    await refreshAll();
    setBusy(false);
  }

  if (vocabulary.loading && !v) return <PageLoader />;
  if (!v) {
    return (
      <div className="app-main">
        <ErrorBanner message={errorMessage(vocabulary.error, "vocabLoadError")} onRetry={vocabulary.reload} />
        <Link to="/vocabularies">{t("backToVocabularies")}</Link>
      </div>
    );
  }

  const blocker = publishBlocker(v.wordCount);
  let lastLetter = "";

  const downloadButton = isDownloaded ? (
    <button
      className="btn btn-secondary"
      disabled={busy}
      onClick={() => act(() => vocabularies.removeDownload(user.id, v.id), "downloadError", downloadedIds.reload)}
    >
      <Icon name="check" size={16} /> {t("removeDownload")}
    </button>
  ) : (
    <button
      className="btn"
      disabled={busy || v.status !== "published"}
      onClick={() =>
        act(
          () => vocabularies.download(user.id, v),
          "downloadError",
          () => {
            prepareOffline.execute(user.id).catch(() => {});
            downloadedIds.reload();
            vocabulary.reload();
            setMessage(t("downloadedNowInQuiz"));
          }
        )
      }
    >
      <Icon name="download" size={16} /> {t("download")}
    </button>
  );

  const wordButtons = (
    <>
      <button className="btn btn-secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
        <Icon name="upload" size={18} /> {busy ? t("importing") : t("importJsonButton")}
      </button>
      <button className="btn" disabled={busy} onClick={() => setDialog({ kind: "form" })}>
        <Icon name="plus" size={18} /> {t("addWordButton")}
      </button>
    </>
  );

  return (
    <div className="app-main">
      <Link className="back-link" to={isOwner ? "/vocabularies" : "/feed"}>
        ← {isOwner ? t("backToVocabularies") : t("backToFeed")}
      </Link>

      <div className="card">
        <div className="section-header">
          <h2 dir="auto" style={{ margin: 0 }}>
            {v.name}
          </h2>
          {isOwner && <StatusPill vocabulary={v} />}
        </div>
        {v.description && (
          <p className="description" dir="auto">
            {v.description}
          </p>
        )}
        <div className="meta-line">
          <LanguagePair vocabulary={v} />
          <span className="muted small">{t("wordCountLabel", { count: formatNumber(v.wordCount, language) })}</span>
          {v.ownerName && <span className="muted small">{t("byAuthor", { name: v.ownerName })}</span>}
          {v.status === "published" && (
            <span className="muted small">
              {t("downloadsCount", { count: formatNumber(v.downloadCount, language) })}
            </span>
          )}
          {v.status === "published" && <StarDisplay value={v.ratingAvg} count={v.ratingCount} />}
        </div>
        <p className="muted small">
          {t("createdOn", { date: formatDate(v.createdAt, language) })} ·{" "}
          {t("updatedOn", { date: formatDate(v.updatedAt, language) })}
        </p>

        {error && <ErrorBanner message={error} />}
        {message && <p className="feedback-correct">{message}</p>}

        <div className="button-row">
          {isOwner ? (
            <>
              <Link className="btn btn-secondary" to={`/vocabularies/${v.id}/edit`}>
                {t("edit")}
              </Link>
              {v.status === "draft" ? (
                <button
                  className="btn"
                  disabled={busy || blocker !== null}
                  onClick={() => act(() => vocabularies.publish(v), "publishError", refreshAll)}
                >
                  {t("publish")}
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    confirm({ title: t("confirmUnpublish"), confirmLabel: t("unpublish") }).then((ok) => {
                      if (ok) void act(() => vocabularies.unpublish(v.id), "publishError", refreshAll);
                    })
                  }
                >
                  {t("unpublish")}
                </button>
              )}
              <button
                className="btn btn-secondary danger-text"
                disabled={busy}
                onClick={() =>
                  confirm({
                    title: t("confirmDeleteVocabulary", { name: v.name }),
                    confirmLabel: t("delete"),
                    danger: true,
                  }).then((ok) => {
                    if (ok)
                      void act(
                        () => vocabularies.delete(v.id),
                        "deleteError",
                        () => navigate("/vocabularies")
                      );
                  })
                }
              >
                {t("delete")}
              </button>
            </>
          ) : (
            <div className="hide-mobile">{downloadButton}</div>
          )}
        </div>
        {isOwner && v.status === "draft" && (
          <p className="muted form-hint">
            {blocker ? t("publishRequirement") : t("readyToPublish")} ({formatNumber(v.wordCount, language)} /{" "}
            {formatNumber(MIN_PUBLISH_WORDS, language)}–{formatNumber(MAX_VOCABULARY_WORDS, language)})
          </p>
        )}
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            className="toolbar-search"
            enterKeyHint="search"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(WORDS_PAGE);
            }}
          />
          <div className="toolbar-spacer" />
          {isOwner && (
            <>
              <div className="button-row hide-mobile">{wordButtons}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {isOwner && <p className="muted form-hint">{t("importHint")}</p>}

        {imports.map(({ fileName, result }) => (
          <div key={fileName} className="import-result">
            <strong dir="auto">{fileName}</strong>
            <p className={result.importedCount + result.updatedCount > 0 ? "feedback-correct" : "feedback-incorrect"}>
              {t("importSummary", { imported: result.importedCount, updated: result.updatedCount })}
            </p>
            {result.duplicateHeadwords.length > 0 && (
              <p className="muted">
                {t("duplicateSkipped", { words: result.duplicateHeadwords.slice(0, 50).join(", ") })}
              </p>
            )}
            {result.errors.length > 0 && (
              <ul className="muted small">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 20 && <li>{t("moreErrors", { count: result.errors.length - 20 })}</li>}
              </ul>
            )}
          </div>
        ))}

        {words.error ? (
          <ErrorBanner message={errorMessage(words.error, "vocabLoadError")} onRetry={words.reload} />
        ) : null}
        {words.loading && !words.data && <InlineLoader />}
        {words.data && filtered.length === 0 && <p className="muted center-text">{t("noWordsFound")}</p>}

        {filtered.slice(0, limit).map((w) => {
          const letter = firstLetter(w.headword);
          const header = letter !== lastLetter ? <div className="letter-group-label">{letter}</div> : null;
          lastLetter = letter;
          return (
            <div key={w.id}>
              {header}
              <div className="vocab-row" onClick={() => setDialog({ kind: "details", word: w })}>
                <div className="vocab-row-main">
                  <div className="vocab-row-headword" dir="auto">
                    {displayForm(w)}
                  </div>
                  <div className="vocab-row-translation" dir="auto">
                    {getTranslations(w, profile.primaryLanguage).join("، ")}
                  </div>
                </div>
                {isOwner && (
                  <div className="vocab-row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t("edit")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialog({ kind: "form", word: w });
                      }}
                    >
                      <Icon name="edit" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={t("delete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        confirm({
                          title: t("confirmDelete", { word: displayForm(w) }),
                          confirmLabel: t("delete"),
                          danger: true,
                        }).then((ok) => {
                          if (ok) void act(() => wordService.deleteWords(user.id, v, [w]), "deleteError", refreshAll);
                        });
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length > limit && (
          <button className="btn btn-secondary btn-block" onClick={() => setLimit((l) => l + WORDS_PAGE)}>
            {t("showMore", { count: filtered.length - limit })}
          </button>
        )}
      </div>

      {v.status === "published" && <ReviewsSection vocabulary={v} onChanged={vocabulary.reload} />}

      {/* Phones: the main actions float at the bottom, within thumb reach. */}
      {(isOwner || v.status === "published") && (
        <div className="page-actions mobile-only">{isOwner ? wordButtons : downloadButton}</div>
      )}

      {dialog.kind === "details" && (
        <Modal title={displayForm(dialog.word)} onClose={() => setDialog({ kind: "none" })}>
          <WordFormsDetail word={dialog.word} />
          {isOwner && (
            <div className="button-row">
              <button className="btn" onClick={() => setDialog({ kind: "form", word: dialog.word })}>
                {t("edit")}
              </button>
            </div>
          )}
        </Modal>
      )}

      {dialog.kind === "form" && (
        <WordFormDialog
          vocabulary={v}
          word={dialog.word}
          onClose={() => setDialog({ kind: "none" })}
          onSaved={(text) => {
            setMessage(text);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function failed(message: string): ImportResult {
  return { importedCount: 0, updatedCount: 0, errors: [message], duplicateHeadwords: [] };
}
