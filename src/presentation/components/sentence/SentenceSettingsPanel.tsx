import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { activeTimerSeconds, isValidTimerSeconds } from "@domain/entities/QuizSettings";
import { SENTENCE_EXERCISE_KINDS } from "@domain/entities/SentenceExercise";
import { MAX_SENTENCE_COUNT, SentencePracticeSettings } from "@domain/entities/SentencePractice";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import CollectionPicker from "@presentation/components/CollectionPicker";
import TimerModePicker from "@presentation/components/TimerModePicker";
import Icon from "@presentation/components/ui/Icon";
import { Segmented, Switch } from "@presentation/components/ui/Controls";
import { SENTENCE_KIND_KEYS } from "@presentation/i18n/grammarLabels";
import { formatNumber } from "@presentation/format";

interface Props {
  initial: SentencePracticeSettings;
  onStart: (settings: SentencePracticeSettings) => void;
}

const COUNT_CHOICES = [5, 10, 20];

/** The sentence practice start screen: sentence collections, exercise kind, how many, timer and (for word order) extra words. */
export default function SentenceSettingsPanel({ initial, onStart }: Props) {
  const user = useCurrentUser();
  const { sentences, sentenceCollections } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const [settings, setSettings] = useState(initial);

  const library = useAsync(() => sentenceCollections.listLibrary(user.id), [user.id, version]);
  const stats = useAsync(() => sentences.statsByKind(user.id), [user.id, version]);
  const selectedIds = useMemo(() => {
    const available = new Set((library.data ?? []).map((collection) => collection.id));
    return settings.collectionIds.filter((id) => available.has(id));
  }, [library.data, settings.collectionIds]);
  const exercises = useAsync(() => sentences.listByCollections(selectedIds), [selectedIds.join(","), version]);

  if (library.loading && !library.data) {
    return (
      <div className="card">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-field" />
        <div className="skeleton skeleton-card short" />
      </div>
    );
  }
  if (library.error) return <ErrorBanner message={errorMessage(library.error, "sentenceCollectionsLoadError")} onRetry={library.reload} />;
  if (!library.data || library.data.length === 0) {
    return (
      <div className="card empty-state">
        <div className="empty-icon">
          <Icon name="sentence" size={36} />
        </div>
        <h2>{t("sentenceNoLibraryTitle")}</h2>
        <p className="muted">{t("sentenceNoLibraryBody")}</p>
        <div className="button-row center">
          <Link className="btn" to="/vocabularies?section=sentences">
            {t("manageSentenceCollections")}
          </Link>
        </div>
      </div>
    );
  }

  const poolSize = (exercises.data ?? []).filter((exercise) => exercise.content.kind === settings.kind).length;
  const allCount = Math.min(poolSize, MAX_SENTENCE_COUNT);
  const effectiveCount = Math.min(settings.sentenceCount, allCount);
  const kindStats = stats.data?.[settings.kind];
  const timerValid = settings.timerMode === "none" || isValidTimerSeconds(activeTimerSeconds(settings) ?? 0);

  return (
    <div className="card start-card">
      <h2 className="card-title">{t("sentenceStartTitle")}</h2>

      <section className="start-section">
        <span className="field-label">{t("sentenceCollectionsLabel")}</span>
        <div className="picker-row">
          <CollectionPicker
            kind="sentenceCollection"
            items={library.data}
            selected={selectedIds}
            onChange={(ids) => setSettings((current) => ({ ...current, collectionIds: ids }))}
            currentUserId={user.id}
          />
          <Link
            className="icon-btn bordered"
            to="/vocabularies?section=sentences"
            title={t("manageSentenceCollections")}
            aria-label={t("manageSentenceCollections")}
          >
            <Icon name="settings" />
          </Link>
        </div>
      </section>

      <section className="start-section">
        <span className="field-label">{t("sentenceKindLabel")}</span>
        <Segmented
          options={SENTENCE_EXERCISE_KINDS.map((kind) => ({ value: kind, label: t(SENTENCE_KIND_KEYS[kind].label) }))}
          value={settings.kind}
          onChange={(kind) => setSettings((current) => ({ ...current, kind }))}
          ariaLabel={t("sentenceKindLabel")}
        />
        <p className="muted small">{t(SENTENCE_KIND_KEYS[settings.kind].note)}</p>
        {kindStats && kindStats.score !== null && (
          <p className="muted small">
            {t("sentenceStatsLine", {
              count: formatNumber(kindStats.attemptCount, language),
              score: `${formatNumber(Math.round(kindStats.score * 100), language)}%`,
            })}
          </p>
        )}
        {settings.kind === "jumble" && (
          <Switch
            checked={settings.includeDistractors}
            onChange={(includeDistractors) => setSettings((current) => ({ ...current, includeDistractors }))}
            label={t("sentenceDistractorsLabel")}
            description={t("sentenceDistractorsHint")}
          />
        )}
      </section>

      <section className="start-section">
        <span className="field-label">{t("sentenceCountLabel")}</span>
        {selectedIds.length === 0 ? (
          <p className="muted small">{t("chooseSentenceCollectionFirst")}</p>
        ) : exercises.loading && !exercises.data ? (
          <div className="skeleton skeleton-field" />
        ) : exercises.error ? (
          <ErrorBanner message={errorMessage(exercises.error, "sentenceLoadError")} onRetry={exercises.reload} />
        ) : poolSize === 0 ? (
          <p className="muted small">{t("sentenceNoneOfKind")}</p>
        ) : (
          <div className="chip-grid" role="radiogroup" aria-label={t("sentenceCountLabel")}>
            {COUNT_CHOICES.filter((count) => count < allCount).map((count) => (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={effectiveCount === count}
                className={`chip chip-large${effectiveCount === count ? " selected" : ""}`}
                onClick={() => setSettings((current) => ({ ...current, sentenceCount: count }))}
              >
                {formatNumber(count, language)}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={effectiveCount === allCount}
              className={`chip chip-large${effectiveCount === allCount ? " selected" : ""}`}
              onClick={() => setSettings((current) => ({ ...current, sentenceCount: MAX_SENTENCE_COUNT }))}
            >
              {t("allWordsChoice", { count: formatNumber(allCount, language) })}
            </button>
          </div>
        )}
      </section>

      <TimerModePicker
        unit="sentence"
        label={t("sentenceModeLabel")}
        value={settings}
        onChange={(change) => setSettings((current) => ({ ...current, ...change }))}
      />

      <div className="action-bar">
        <button
          className="btn btn-block btn-large start-btn"
          disabled={selectedIds.length === 0 || poolSize === 0 || exercises.loading || !timerValid}
          onClick={() => onStart({ ...settings, collectionIds: selectedIds, sentenceCount: effectiveCount })}
        >
          <Icon name={settings.timerMode === "none" ? "sentence" : "timer"} />{" "}
          {selectedIds.length === 0 ? t("chooseSentenceCollectionToStart") : t("sentenceStartCount", { count: formatNumber(effectiveCount, language) })}
        </button>
      </div>
    </div>
  );
}
