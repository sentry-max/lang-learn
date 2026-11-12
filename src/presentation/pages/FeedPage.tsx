import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LanguageCode, SUPPORTED_LANGUAGES, languageLabel } from "@domain/entities/Language";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { FeedSort } from "@domain/repositories/VocabularyRepository";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import Icon from "@presentation/components/ui/Icon";
import { LanguagePair } from "@presentation/components/VocabularyBadges";
import { StarDisplay } from "@presentation/components/StarRating";
import { formatDate, formatNumber } from "@presentation/format";
import { PageLoader, Spinner } from "@presentation/components/ui/Loader";
import { useSection } from "@presentation/hooks/useSection";
import SectionTabs from "@presentation/components/SectionTabs";
import SentenceCollectionBrowser from "@presentation/components/sentence/SentenceCollectionBrowser";
import ConversationBrowser from "@presentation/components/conversation/ConversationBrowser";

const PAGE_SIZE = 20;

/** Public feed of published vocabularies: search, filter, download, open to review. */
export default function FeedPage() {
  const user = useCurrentUser();
  const { vocabularies, prepareOffline } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
  const [section, setSection] = useSection();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode | "">("");
  const [sort, setSort] = useState<FeedSort>("top_rated");
  const [pages, setPages] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce typing so every keystroke doesn't hit the server.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPages(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const feed = useAsync(async () => {
    const results = await Promise.all(
      Array.from({ length: pages }, (_, page) =>
        vocabularies.browse({ search, language: sourceLanguage || undefined, sort, page, pageSize: PAGE_SIZE })
      )
    );
    return { items: results.flatMap((page) => page.items), total: results[0]?.total ?? 0 };
  }, [search, sourceLanguage, sort, pages, version]);
  const downloaded = useAsync(() => vocabularies.listDownloadedIds(user.id), [user.id, version]);

  async function toggleDownload(vocabulary: Vocabulary) {
    setBusyId(vocabulary.id);
    setError(null);
    try {
      if (downloaded.data?.has(vocabulary.id)) await vocabularies.removeDownload(user.id, vocabulary.id);
      else {
        await vocabularies.download(user.id, vocabulary);
        // Load its words now, so it's usable if the connection drops later.
        prepareOffline.execute(user.id).catch(() => {});
      }
      await Promise.all([downloaded.reload(), feed.reload()]);
    } catch (error) {
      setError(errorMessage(error, "downloadError"));
    } finally {
      setBusyId(null);
    }
  }

  const items = feed.data?.items ?? [];

  const sectionTabs = <SectionTabs value={section} onChange={setSection} wordsLabel="navVocabularies" hasConversations />;
  if (section !== "words") {
    return (
      <div className="app-main">
        {sectionTabs}
        {section === "sentences" ? <SentenceCollectionBrowser /> : <ConversationBrowser />}
      </div>
    );
  }

  return (
    <div className="app-main wide">
      {sectionTabs}
      <div className="page-header">
        <h2>{t("navFeed")}</h2>
        <div className="page-actions">
          <Link className="btn" to="/vocabularies/new">
            <Icon name="plus" size={18} /> {t("newVocabulary")}
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="toolbar-search"
          enterKeyHint="search"
          placeholder={t("feedSearchPlaceholder")}
          value={searchInput}
          maxLength={100}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <select
          aria-label={t("wordsLanguageLabel")}
          value={sourceLanguage}
          onChange={(event) => {
            setSourceLanguage(event.target.value as LanguageCode | "");
            setPages(1);
          }}
        >
          <option value="">{t("allLanguages")}</option>
          {SUPPORTED_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageLabel(code)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("sortLabel")}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as FeedSort);
            setPages(1);
          }}
        >
          <option value="top_rated">{t("sortTopRated")}</option>
          <option value="most_downloaded">{t("sortMostDownloaded")}</option>
          <option value="newest">{t("sortNewest")}</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}
      {feed.error ? <ErrorBanner message={errorMessage(feed.error, "feedLoadError")} onRetry={feed.reload} /> : null}
      {feed.loading && !feed.data && <PageLoader />}
      {feed.data && items.length === 0 && <div className="card center-text muted">{t("feedEmpty")}</div>}

      <div className="card-grid">
        {items.map((vocabulary) => {
          const isOwn = vocabulary.ownerId === user.id;
          const isDownloaded = downloaded.data?.has(vocabulary.id) ?? false;
          return (
            <article key={vocabulary.id} className="card vocab-card">
              <button type="button" className="vocab-card-title" onClick={() => navigate(`/vocabularies/${vocabulary.id}`)}>
                <h3 dir="auto">{vocabulary.name}</h3>
              </button>
              {vocabulary.description && (
                <p className="description clamp" dir="auto">
                  {vocabulary.description}
                </p>
              )}
              <div className="meta-line">
                <LanguagePair vocabulary={vocabulary} />
                <span className="muted small">{t("wordCountLabel", { count: formatNumber(vocabulary.wordCount, language) })}</span>
              </div>
              <div className="meta-line">
                <StarDisplay value={vocabulary.ratingAvg} count={vocabulary.ratingCount} />
                <span className="muted small icon-text"><Icon name="download" size={14} /> {formatNumber(vocabulary.downloadCount, language)}</span>
              </div>
              <p className="muted small">
                {t("byAuthor", { name: vocabulary.ownerName ?? t("unknownUser") })} · {formatDate(vocabulary.publishedAt ?? vocabulary.updatedAt, language)}
              </p>
              <div className="button-row">
                <button className="btn btn-secondary btn-small" onClick={() => navigate(`/vocabularies/${vocabulary.id}`)}>
                  {t("view")}
                </button>
                {isOwn ? (
                  <span className="pill">{t("yours")}</span>
                ) : (
                  <button
                    className={`btn btn-small${isDownloaded ? " btn-secondary" : ""}`}
                    disabled={busyId === vocabulary.id}
                    onClick={() => toggleDownload(vocabulary)}
                  >
                    <Icon name={isDownloaded ? "check" : "download"} size={16} /> {isDownloaded ? t("downloaded") : t("download")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {feed.data && items.length < feed.data.total && (
        <button className="btn btn-secondary btn-block" disabled={feed.loading} onClick={() => setPages((pageCount) => pageCount + 1)}>
          {feed.loading ? <Spinner /> : t("loadMore")}
        </button>
      )}
    </div>
  );
}
