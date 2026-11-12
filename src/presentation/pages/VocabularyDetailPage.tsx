import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MAX_VOCABULARY_WORDS, MIN_PUBLISH_WORDS, publishBlocker } from "@domain/entities/Vocabulary";
import { Word, displayForm, getTranslations } from "@domain/entities/Word";
import { firstLetter } from "@domain/services/LetterService";
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
import { describeWordProblem } from "@presentation/i18n/describeWordProblem";
import ImportResults, { ImportOutcome } from "@presentation/components/ImportResults";
import { useFileImport } from "@presentation/hooks/useFileImport";
import { LanguagePair, StatusPill } from "@presentation/components/VocabularyBadges";
import { StarDisplay } from "@presentation/components/StarRating";
import { formatDate, formatNumber } from "@presentation/format";
import { InlineLoader, PageLoader } from "@presentation/components/ui/Loader";

const WORDS_PAGE = 200;

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
  const [isActing, setIsActing] = useState(false);
  const { imports, isImporting, importFiles } = useFileImport();
  const busy = isActing || isImporting;
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currentVocabulary = vocabulary.data;
  const isOwner = currentVocabulary?.ownerId === user.id;
  const isDownloaded = currentVocabulary ? (downloadedIds.data?.has(currentVocabulary.id) ?? false) : false;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const list = (words.data ?? []).filter(
      (word) =>
        !query ||
        word.headword.toLocaleLowerCase().includes(query) ||
        getTranslations(word, profile.primaryLanguage).some((translation) => translation.toLocaleLowerCase().includes(query))
    );
    return list.sort((a, b) => a.headword.localeCompare(b.headword));
  }, [words.data, search, profile.primaryLanguage]);

  async function refreshAll() {
    await Promise.all([vocabulary.reload(), words.reload()]);
  }

  async function act(action: () => Promise<unknown>, fallback: Parameters<typeof errorMessage>[1], after?: () => void) {
    setIsActing(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      after?.();
    } catch (error) {
      setError(errorMessage(error, fallback));
    } finally {
      setIsActing(false);
    }
  }

  async function importWordFile(parsed: unknown): Promise<ImportOutcome> {
    const result = await wordService.importWords(user.id, currentVocabulary!, parsed);
    return {
      importedCount: result.importedCount,
      updatedCount: result.updatedCount,
      duplicateMessage: result.duplicateHeadwords.length > 0 ? t("duplicateSkipped", { words: result.duplicateHeadwords.slice(0, 50).join(", ") }) : null,
      problems: result.errors.map((problem) => describeWordProblem(t, problem)),
    };
  }

  if (vocabulary.loading && !currentVocabulary) return <PageLoader />;
  if (!currentVocabulary) {
    return (
      <div className="app-main">
        <ErrorBanner message={errorMessage(vocabulary.error, "vocabLoadError")} onRetry={vocabulary.reload} />
        <Link to="/vocabularies">{t("backToVocabularies")}</Link>
      </div>
    );
  }

  const blocker = publishBlocker(currentVocabulary.wordCount);
  let lastLetter = "";

  const downloadButton = isDownloaded ? (
    <button
      className="btn btn-secondary"
      disabled={busy}
      onClick={() => act(() => vocabularies.removeDownload(user.id, currentVocabulary.id), "downloadError", downloadedIds.reload)}
    >
      <Icon name="check" size={16} /> {t("removeDownload")}
    </button>
  ) : (
    <button
      className="btn"
      disabled={busy || currentVocabulary.status !== "published"}
      onClick={() =>
        act(
          () => vocabularies.download(user.id, currentVocabulary),
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
          <h2 dir="auto">
            {currentVocabulary.name}
          </h2>
          {isOwner && <StatusPill vocabulary={currentVocabulary} />}
        </div>
        {currentVocabulary.description && (
          <p className="description" dir="auto">
            {currentVocabulary.description}
          </p>
        )}
        <div className="meta-line">
          <LanguagePair vocabulary={currentVocabulary} />
          <span className="muted small">{t("wordCountLabel", { count: formatNumber(currentVocabulary.wordCount, language) })}</span>
          {currentVocabulary.ownerName && <span className="muted small">{t("byAuthor", { name: currentVocabulary.ownerName })}</span>}
          {currentVocabulary.status === "published" && (
            <span className="muted small">
              {t("downloadsCount", { count: formatNumber(currentVocabulary.downloadCount, language) })}
            </span>
          )}
          {currentVocabulary.status === "published" && <StarDisplay value={currentVocabulary.ratingAvg} count={currentVocabulary.ratingCount} />}
        </div>
        <p className="muted small">
          {t("createdOn", { date: formatDate(currentVocabulary.createdAt, language) })} ·{" "}
          {t("updatedOn", { date: formatDate(currentVocabulary.updatedAt, language) })}
        </p>

        {error && <ErrorBanner message={error} />}
        {message && <p className="feedback-correct">{message}</p>}

        <div className="button-row">
          {isOwner ? (
            <>
              <Link className="btn btn-secondary" to={`/vocabularies/${currentVocabulary.id}/edit`}>
                {t("edit")}
              </Link>
              {currentVocabulary.status === "draft" ? (
                <button
                  className="btn"
                  disabled={busy || blocker !== null}
                  onClick={() => act(() => vocabularies.publish(currentVocabulary), "publishError", refreshAll)}
                >
                  {t("publish")}
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    confirm({ title: t("confirmUnpublish"), confirmLabel: t("unpublish") }).then((ok) => {
                      if (ok) void act(() => vocabularies.unpublish(currentVocabulary.id), "publishError", refreshAll);
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
                    title: t("confirmDeleteVocabulary", { name: currentVocabulary.name }),
                    confirmLabel: t("delete"),
                    danger: true,
                  }).then((ok) => {
                    if (ok)
                      void act(
                        () => vocabularies.delete(currentVocabulary.id),
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
        {isOwner && currentVocabulary.status === "draft" && (
          <p className="muted form-hint">
            {blocker ? t("publishRequirement") : t("readyToPublish")} ({formatNumber(currentVocabulary.wordCount, language)} /{" "}
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
            onChange={(event) => {
              setSearch(event.target.value);
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
                onChange={(event) => {
                  if (event.target.files?.length) importFiles(event.target.files, importWordFile).then(refreshAll);
                  event.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {isOwner && <p className="muted form-hint">{t("importHint")}</p>}

        <ImportResults imports={imports} />

        {words.error ? (
          <ErrorBanner message={errorMessage(words.error, "vocabLoadError")} onRetry={words.reload} />
        ) : null}
        {words.loading && !words.data && <InlineLoader />}
        {words.data && filtered.length === 0 && <p className="muted center-text">{t("noWordsFound")}</p>}

        {filtered.slice(0, limit).map((word) => {
          const letter = firstLetter(word.headword);
          const header = letter !== lastLetter ? <div className="letter-group-label">{letter}</div> : null;
          lastLetter = letter;
          return (
            <div key={word.id}>
              {header}
              <div className="vocab-row" onClick={() => setDialog({ kind: "details", word: word })}>
                <div className="vocab-row-main">
                  <div className="vocab-row-headword" dir="auto">
                    {displayForm(word)}
                  </div>
                  <div className="vocab-row-translation" dir="auto">
                    {getTranslations(word, profile.primaryLanguage).join("، ")}
                  </div>
                </div>
                {isOwner && (
                  <div className="vocab-row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t("edit")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDialog({ kind: "form", word: word });
                      }}
                    >
                      <Icon name="edit" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={t("delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        confirm({
                          title: t("confirmDelete", { word: displayForm(word) }),
                          confirmLabel: t("delete"),
                          danger: true,
                        }).then((ok) => {
                          if (ok) void act(() => wordService.deleteWords(user.id, currentVocabulary, [word]), "deleteError", refreshAll);
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
          <button className="btn btn-secondary btn-block" onClick={() => setLimit((limit) => limit + WORDS_PAGE)}>
            {t("showMore", { count: filtered.length - limit })}
          </button>
        )}
      </div>

      {currentVocabulary.status === "published" && <ReviewsSection vocabulary={currentVocabulary} onChanged={vocabulary.reload} />}

      {/* Phones: the main actions float at the bottom, within thumb reach. */}
      {(isOwner || currentVocabulary.status === "published") && (
        <div className="page-actions mobile-only">{isOwner ? wordButtons : downloadButton}</div>
      )}

      {dialog.kind === "details" && (
        <Modal title={displayForm(dialog.word)} onClose={() => setDialog({ kind: "none" })}>
          <WordFormsDetail word={dialog.word} sourceLanguage={currentVocabulary.sourceLanguage} />
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
          vocabulary={currentVocabulary}
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
