import { DIFFICULTY_RATINGS } from "@domain/entities/Learning";
import { displayForm } from "@domain/entities/Word";
import { WordStat } from "@application/usecases/GetStatsUseCase";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import { RATING_KEYS } from "@presentation/components/RatingPill";
import { formatNumber } from "@presentation/format";
import { PageLoader } from "@presentation/components/ui/Loader";

export default function DashboardPage() {
  const user = useCurrentUser();
  const { getStats } = useServices();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const { version } = useSyncStatus();
  const stats = useAsync(() => getStats.execute(user.id), [user.id, version]);

  if (stats.loading && !stats.data) return <PageLoader />;
  if (!stats.data) {
    return (
      <div className="app-main">
        <ErrorBanner message={errorMessage(stats.error, "statsLoadError")} onRetry={stats.reload} />
      </div>
    );
  }
  const s = stats.data;
  const roundPercent = s.totalWords === 0 ? 0 : Math.round((s.seenThisRound / s.totalWords) * 100);

  return (
    <div className="app-main">
      <div className="stat-grid">
        <Stat value={formatNumber(s.totalWords, language)} label={t("totalWords")} />
        <Stat value={formatNumber(s.wordsStarted, language)} label={t("wordsPracticed")} />
        <Stat value={formatNumber(s.dueToday, language)} label={t("dueToday")} />
        <Stat
          value={s.overallAccuracy === null ? "—" : `${formatNumber(Math.round(s.overallAccuracy * 100), language)}%`}
          label={t("overallAccuracy")}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t("roundProgress")}</h3>
        <div className="progress-bar large" aria-hidden="true">
          <div style={{ width: `${roundPercent}%` }} />
        </div>
        <p className="muted">{t("roundProgressBody", { seen: s.seenThisRound, total: s.totalWords })}</p>
        <div className="summary-grid">
          {DIFFICULTY_RATINGS.map((r) => (
            <div key={r} className={`summary-cell rating-pill ${r}`}>
              <strong>{formatNumber(s.byLastRating[r], language)}</strong>
              <span>{t(RATING_KEYS[r])}</span>
            </div>
          ))}
        </div>
      </div>

      <WordList title={t("weakestWords")} words={s.weakestWords} />
      <WordList title={t("strongestWords")} words={s.strongestWords} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-box">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function WordList({ title, words }: { title: string; words: WordStat[] }) {
  const { t, language } = useLanguage();
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {words.length === 0 && <p className="muted">{t("noDataYet")}</p>}
      {words.map((w) => (
        <div className="word-list-item" key={w.word.id}>
          <span dir="auto">{displayForm(w.word)}</span>
          <span className="muted">
            {w.accuracy === null ? "—" : `${formatNumber(Math.round(w.accuracy * 100), language)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}
