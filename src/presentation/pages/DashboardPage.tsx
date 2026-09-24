import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { StatsSummary, WordStat } from "@application/usecases/GetStatsUseCase";
import { displayForm } from "@domain/entities/VocabularyEntry";
import { toAppError } from "@domain/errors/AppError";
import ErrorBanner from "@presentation/components/ErrorBanner";

export default function DashboardPage() {
  const { session } = useAuth();
  const { getStats } = useServices();
  const { t } = useLanguage();
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getStats.execute(session!.user.id);
      setStats(result);
    } catch (err) {
      setError(toAppError(err, t("statsLoadError")).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="app-main center-text muted">{t("loading")}</div>;

  if (error && !stats) {
    return (
      <div className="app-main">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="app-main">
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="stat-grid">
        <div className="stat-box">
          <div className="value">{stats.totalWords}</div>
          <div className="label">{t("totalWords")}</div>
        </div>
        <div className="stat-box">
          <div className="value">{stats.wordsStarted}</div>
          <div className="label">{t("wordsPracticed")}</div>
        </div>
        <div className="stat-box">
          <div className="value">{stats.dueToday}</div>
          <div className="label">{t("dueToday")}</div>
        </div>
        <div className="stat-box">
          <div className="value">
            {stats.overallAccuracy === null ? "—" : `${Math.round(stats.overallAccuracy * 100)}%`}
          </div>
          <div className="label">{t("overallAccuracy")}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t("weakestWords")}</h3>
        {stats.weakestWords.length === 0 && <p className="muted">{t("noDataYet")}</p>}
        {stats.weakestWords.map((w: WordStat) => (
          <div className="word-list-item" key={w.entry.id}>
            <span>{displayForm(w.entry)}</span>
            <span className="muted">{Math.round((w.accuracy ?? 0) * 100)}%</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t("strongestWords")}</h3>
        {stats.strongestWords.length === 0 && <p className="muted">{t("noDataYet")}</p>}
        {stats.strongestWords.map((w: WordStat) => (
          <div className="word-list-item" key={w.entry.id}>
            <span>{displayForm(w.entry)}</span>
            <span className="muted">{Math.round((w.accuracy ?? 0) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
