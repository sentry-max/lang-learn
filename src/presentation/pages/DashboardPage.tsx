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
import { PageLoader, ProgressIndicator } from "@presentation/components/ui/Loader";
import { DistributionBar } from "@presentation/components/ResultSummary";
import Icon from "@presentation/components/ui/Icon";
import { useSection } from "@presentation/hooks/useSection";
import SectionTabs from "@presentation/components/SectionTabs";
import SentenceProgress from "@presentation/components/sentence/SentenceProgress";
import ConversationProgress from "@presentation/components/conversation/ConversationProgress";

export default function DashboardPage() {
  const user = useCurrentUser();
  const { getStats } = useServices();
  const { t, language } = useLanguage();
  const [section, setSection] = useSection();
  const errorMessage = useErrorMessage();
  const { version } = useSyncStatus();
  const stats = useAsync(() => getStats.execute(user.id), [user.id, version]);

  const sectionTabs = <SectionTabs value={section} onChange={setSection} wordsLabel="sectionWords" hasConversations />;
  if (section !== "words") {
    return (
      <div className="app-main">
        {sectionTabs}
        {section === "sentences" ? <SentenceProgress /> : <ConversationProgress />}
      </div>
    );
  }

  if (stats.loading && !stats.data) return <PageLoader />;
  if (!stats.data) {
    return (
      <div className="app-main">
        <ErrorBanner message={errorMessage(stats.error, "statsLoadError")} onRetry={stats.reload} />
      </div>
    );
  }
  const currentStats = stats.data;
  const roundPercent = currentStats.totalWords === 0 ? 0 : Math.round((currentStats.seenThisRound / currentStats.totalWords) * 100);

  return (
    <div className="app-main">
      {sectionTabs}
      <div className="stat-grid">
        <Stat value={formatNumber(currentStats.totalWords, language)} label={t("totalWords")} />
        <Stat value={formatNumber(currentStats.wordsStarted, language)} label={t("wordsPracticed")} />
        <Stat value={formatNumber(currentStats.dueToday, language)} label={t("dueToday")} />
        <Stat
          value={currentStats.overallAccuracy === null ? "—" : `${formatNumber(Math.round(currentStats.overallAccuracy * 100), language)}%`}
          label={t("overallAccuracy")}
        />
      </div>

      <div className="card">
        <h3 className="card-title">
          <Icon name="chart" /> {t("roundProgress")}
        </h3>
        <div className="round-progress">
          <ProgressIndicator value={roundPercent / 100} size={56} label={t("roundProgress")} />
          <p className="muted">{t("roundProgressBody", { seen: currentStats.seenThisRound, total: currentStats.totalWords })}</p>
        </div>
        <DistributionBar
          label={t("roundProgress")}
          parts={DIFFICULTY_RATINGS.map((rating) => ({
            key: rating,
            label: t(RATING_KEYS[rating]),
            count: currentStats.byLastRating[rating],
            colorClass: `rating-${rating}`,
          }))}
        />
      </div>

      <WordList title={t("weakestWords")} words={currentStats.weakestWords} />
      <WordList title={t("strongestWords")} words={currentStats.strongestWords} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-box">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function WordList({ title, words }: { title: string; words: WordStat[] }) {
  const { t, language } = useLanguage();
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {words.length === 0 && <p className="muted">{t("noDataYet")}</p>}
      {words.map((stat) => (
        <div className="word-list-item" key={stat.word.id}>
          <span dir="auto">{displayForm(stat.word)}</span>
          <span className="muted">
            {stat.accuracy === null ? "—" : `${formatNumber(Math.round(stat.accuracy * 100), language)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}
