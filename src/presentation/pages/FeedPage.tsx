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

const PAGE_SIZE = 20;

/** Public feed of published vocabularies: search, filter, download, open to review. */
export default function FeedPage() {
  const user = useCurrentUser();
  const { vocabularies, prepareOffline } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
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
    return { items: results.flatMap((r) => r.items), total: results[0]?.total ?? 0 };
  }, [search, sourceLanguage, sort, pages, version]);
  const downloaded = useAsync(() => vocabularies.listDownloadedIds(user.id), [user.id, version]);

  async function toggleDownload(v: Vocabulary) {
    setBusyId(v.id);
    setError(null);
    try {
      if (downloaded.data?.has(v.id)) await vocabularies.removeDownload(user.id, v.id);
      else {
        await vocabularies.download(user.id, v);
        // Load its words now, so it's usable if the connection drops later.
        prepareOffline.execute(user.id).catch(() => {});
      }
      await Promise.all([downloaded.reload(), feed.reload()]);
    } catch (err) {
      setError(errorMessage(err, "downloadError"));
    } finally {
      setBusyId(null);
    }
  }

  const items = feed.data?.items ?? [];

  return (
    <div className="app-main wide">
      <div className="page-header">
        <h2>{t("navFeed")}</h2>
        <Link className="btn" to="/vocabularies/new">
          {t("newVocabulary")}
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder={t("feedSearchPlaceholder")}
          value={searchInput}
          maxLength={100}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select
          aria-label={t("wordsLanguageLabel")}
          value={sourceLanguage}
          onChange={(e) => {
            setSourceLanguage(e.target.value as LanguageCode | "");
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
          onChange={(e) => {
            setSort(e.target.value as FeedSort);
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
        {items.map((v) => {
          const isOwn = v.ownerId === user.id;
          const isDownloaded = downloaded.data?.has(v.id) ?? false;
          return (
            <article key={v.id} className="card vocab-card">
              <button type="button" className="vocab-card-title" onClick={() => navigate(`/vocabularies/${v.id}`)}>
                <h3 dir="auto">{v.name}</h3>
              </button>
              {v.description && (
                <p className="description clamp" dir="auto">
                  {v.description}
                </p>
              )}
              <div className="meta-line">
                <LanguagePair vocabulary={v} />
                <span className="muted small">{t("wordCountLabel", { count: formatNumber(v.wordCount, language) })}</span>
              </div>
              <div className="meta-line">
                <StarDisplay value={v.ratingAvg} count={v.ratingCount} />
                <span className="muted small icon-text"><Icon name="download" size={14} /> {formatNumber(v.downloadCount, language)}</span>
              </div>
              <p className="muted small">
                {t("byAuthor", { name: v.ownerName ?? t("unknownUser") })} · {formatDate(v.publishedAt ?? v.updatedAt, language)}
              </p>
              <div className="button-row">
                <button className="btn btn-secondary btn-small" onClick={() => navigate(`/vocabularies/${v.id}`)}>
                  {t("view")}
                </button>
                {isOwn ? (
                  <span className="pill">{t("yours")}</span>
                ) : (
                  <button
                    className={`btn btn-small${isDownloaded ? " btn-secondary" : ""}`}
                    disabled={busyId === v.id}
                    onClick={() => toggleDownload(v)}
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
        <button className="btn btn-secondary btn-block" disabled={feed.loading} onClick={() => setPages((p) => p + 1)}>
          {feed.loading ? <Spinner /> : t("loadMore")}
        </button>
      )}
    </div>
  );
}
