import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { languageLabel } from "@domain/entities/Language";
import {
  AnswerFormat,
  MAX_QUESTION_COUNT,
  QuizDirection,
  QuizSettings,
  TimerMode,
  isValidTimerSeconds,
  questionQuota,
} from "@domain/entities/QuizSettings";
import { splitDuration } from "@domain/services/Duration";
import { countByLetter, filterByLetters } from "@domain/services/LetterService";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useConfirm, useToast } from "@presentation/context/FeedbackContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import LetterPicker from "@presentation/components/LetterPicker";
import VocabularyPicker from "@presentation/components/VocabularyPicker";
import DurationPicker from "@presentation/components/ui/DurationPicker";
import { Spinner } from "@presentation/components/ui/Loader";
import Icon, { IconName } from "@presentation/components/ui/Icon";
import { Segmented, Switch } from "@presentation/components/ui/Controls";
import { UiStringKey } from "@presentation/i18n/translations";
import { formatNumber } from "@presentation/format";

interface Props {
  initial: QuizSettings;
  onStart: (settings: QuizSettings) => void;
}

const QUESTION_CHOICES = [10, 20, 50, 100];

const MODES: { value: TimerMode; icon: IconName; title: UiStringKey; subtitle: UiStringKey }[] = [
  { value: "none", icon: "infinity", title: "modeClassic", subtitle: "modeClassicShort" },
  { value: "quiz", icon: "hourglass", title: "modeQuizTimer", subtitle: "modeQuizTimerShort" },
  { value: "word", icon: "timer", title: "modeWordTimer", subtitle: "modeWordTimerShort" },
];

const TIME_PRESETS: Record<"quiz" | "word", number[]> = {
  quiz: [2 * 60, 5 * 60, 10 * 60, 20 * 60],
  word: [5, 10, 20, 30],
};

const ANSWER_FORMATS: { value: AnswerFormat; key: UiStringKey }[] = [
  { value: "recall", key: "answerFormatRecall" },
  { value: "multiple_choice", key: "answerFormatChoice" },
];

const DIRECTIONS: { value: QuizDirection; key: UiStringKey }[] = [
  { value: "source_to_target", key: "directionForward" },
  { value: "target_to_source", key: "directionReverse" },
  { value: "mix", key: "directionMix" },
];

/** The quiz start screen: the essentials up front, everything else under "More options". */
export default function QuizSettingsPanel({ initial, onStart }: Props) {
  const user = useCurrentUser();
  const { profile } = useProfile();
  const { vocabularies, words, history } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const toast = useToast();

  const [settings, setSettings] = useState<QuizSettings>(initial);
  const [customTime, setCustomTime] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const set = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) =>
    setSettings((settings) => ({ ...settings, [key]: value }));

  const library = useAsync(() => vocabularies.listQuizLibrary(user.id), [user.id, version]);

  // Only vocabularies still in the library count as selected; nothing selected means nothing to quiz.
  const selectedIds = useMemo(() => {
    const available = new Set((library.data ?? []).map((vocabulary) => vocabulary.id));
    return settings.vocabularyIds.filter((id) => available.has(id));
  }, [library.data, settings.vocabularyIds]);

  const poolWords = useAsync(
    () => (selectedIds.length ? words.listByVocabularies(selectedIds) : Promise.resolve([])),
    [selectedIds.join(","), version]
  );

  const letterCounts = useMemo(() => countByLetter(poolWords.data ?? [], (word) => word.headword), [poolWords.data]);
  const validLetters = useMemo(
    () => settings.letters.filter((letter) => letterCounts.some((letterCount) => letterCount.letter === letter)),
    [settings.letters, letterCounts]
  );
  const poolWordsForLetters = useMemo(
    () => filterByLetters(poolWords.data ?? [], (word) => word.headword, validLetters),
    [poolWords.data, validLetters]
  );
  const poolSize = poolWordsForLetters.length;
  const poolWordIds = useMemo(() => poolWordsForLetters.map((word) => word.id), [poolWordsForLetters]);
  const askedWordIds = useAsync(
    () => history.askedInRound(user.id, validLetters, poolWordIds),
    [user.id, validLetters.join(","), poolWordIds, version]
  );
  const askedCount = askedWordIds.data?.length ?? 0;

  async function clearLetterHistory() {
    const isConfirmed = await confirm({
      title: t("letterHistoryConfirmTitle"),
      message: t("letterHistoryConfirmBody"),
      confirmLabel: t("letterHistoryClear"),
      danger: true,
    });
    if (!isConfirmed) return;
    setIsClearingHistory(true);
    try {
      await history.clearRound(user.id, validLetters);
      await askedWordIds.reload();
      toast(t("letterHistoryCleared"), "success");
    } catch (error) {
      toast(errorMessage(error, "letterHistoryClearError"), "error");
    } finally {
      setIsClearingHistory(false);
    }
  }

  if (library.loading && !library.data) {
    return (
      <div className="card">
        <div className="skeleton" style={{ height: 28, width: "40%" }} />
        <div className="skeleton" style={{ height: 44, marginTop: 16 }} />
        <div className="skeleton" style={{ height: 88, marginTop: 16 }} />
      </div>
    );
  }
  if (library.error) {
    return <ErrorBanner message={errorMessage(library.error, "vocabLoadError")} onRetry={library.reload} />;
  }

  if (!library.data || library.data.length === 0) {
    return (
      <div className="card empty-state">
        <div className="empty-icon">
          <Icon name="book" size={36} />
        </div>
        <h2>{t("noQuizVocabTitle")}</h2>
        <p className="muted">{t("noQuizVocabBody")}</p>
        <div className="button-row center">
          <Link className="btn" to="/feed">
            <Icon name="compass" size={18} /> {t("browseFeed")}
          </Link>
          <Link className="btn btn-secondary" to="/vocabularies">
            {t("manageVocabularies")}
          </Link>
        </div>
      </div>
    );
  }

  const allCount = questionQuota({ questionCount: MAX_QUESTION_COUNT, letters: validLetters }, poolSize);
  const effectiveCount = questionQuota({ ...settings, letters: validLetters }, poolSize);
  const choices = QUESTION_CHOICES.filter((questionCount) => questionCount < poolSize);
  const timed = settings.timerMode !== "none";
  const timerKey = settings.timerMode === "quiz" ? "quizTimerSeconds" : "wordTimerSeconds";
  const timerSeconds = settings.timerMode === "quiz" ? settings.quizTimerSeconds : settings.wordTimerSeconds;
  const presets = settings.timerMode === "none" ? [] : TIME_PRESETS[settings.timerMode];
  const showCustom = timed && (customTime || !presets.includes(timerSeconds));
  const timerValid = !timed || isValidTimerSeconds(timerSeconds);
  const isMultipleChoice = settings.answerFormat === "multiple_choice";
  const extrasCount =
    (validLetters.length > 0 ? 1 : 0) + (settings.direction !== "mix" ? 1 : 0) + (settings.includeSentenceWriting || isMultipleChoice ? 0 : 1);

  return (
    <div className="card start-card">
      <h2 className="card-title">{t("startQuizTitle")}</h2>

      <section className="start-section">
        <span className="field-label">{t("quizVocabulariesLabel")}</span>
        <div className="picker-row">
          <VocabularyPicker
            vocabularies={library.data}
            selected={selectedIds}
            onChange={(ids) => setSettings((settings) => ({ ...settings, vocabularyIds: ids, letters: [] }))}
            currentUserId={user.id}
          />
          <Link className="icon-btn bordered" to="/vocabularies" title={t("manageVocabularies")} aria-label={t("manageVocabularies")}>
            <Icon name="settings" />
          </Link>
          <Link className="icon-btn bordered" to="/feed" title={t("addVocabularies")} aria-label={t("addVocabularies")}>
            <Icon name="plus" />
          </Link>
        </div>
      </section>

      <section className="start-section">
        <span className="field-label">{t("questionsLabel")}</span>
        {selectedIds.length === 0 ? (
          <p className="muted small">{t("chooseVocabularyFirst")}</p>
        ) : poolWords.loading && !poolWords.data ? (
          <div className="skeleton" style={{ height: 36 }} />
        ) : (
          <div className="chip-grid" role="radiogroup" aria-label={t("questionsLabel")}>
            {choices.map((questionCount) => (
              <button
                key={questionCount}
                type="button"
                role="radio"
                aria-checked={effectiveCount === questionCount}
                className={`chip chip-large${effectiveCount === questionCount ? " selected" : ""}`}
                onClick={() => set("questionCount", questionCount)}
              >
                {formatNumber(questionCount, language)}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={effectiveCount === allCount}
              className={`chip chip-large${effectiveCount === allCount ? " selected" : ""}`}
              onClick={() => set("questionCount", MAX_QUESTION_COUNT)}
            >
              {t("allWordsChoice", { count: formatNumber(allCount, language) })}
            </button>
          </div>
        )}
        {askedCount > 0 && (
          <div className="letter-history">
            <span className="muted small">
              {t("letterHistoryAsked", { asked: formatNumber(askedCount, language), total: formatNumber(poolSize, language) })}
            </span>
            <button type="button" className="btn btn-secondary btn-small" disabled={isClearingHistory} onClick={clearLetterHistory}>
              {isClearingHistory && <Spinner />} {t("letterHistoryClear")}
            </button>
          </div>
        )}
      </section>

      <section className="start-section">
        <span className="field-label">{t("answerFormatLabel")}</span>
        <Segmented
          options={ANSWER_FORMATS.map(({ value, key }) => ({ value, label: t(key) }))}
          value={settings.answerFormat}
          onChange={(answerFormat) => set("answerFormat", answerFormat)}
          ariaLabel={t("answerFormatLabel")}
        />
        <p className="muted small">{isMultipleChoice ? t("answerFormatChoiceNote") : t("answerFormatRecallNote")}</p>
      </section>

      <section className="start-section">
        <span className="field-label">{t("quizModeLabel")}</span>
        <div className="mode-grid" role="radiogroup" aria-label={t("quizModeLabel")}>
          {MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={settings.timerMode === mode.value}
              className={`mode-option${settings.timerMode === mode.value ? " selected" : ""}`}
              onClick={() => {
                set("timerMode", mode.value);
                setCustomTime(false);
              }}
            >
              <Icon name={mode.icon} size={22} />
              <strong>{t(mode.title)}</strong>
              <span>{t(mode.subtitle)}</span>
            </button>
          ))}
        </div>

        {timed && (
          <div className="time-limit" key={settings.timerMode}>
            <div className="chip-grid">
              {presets.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className={`chip${!showCustom && timerSeconds === seconds ? " selected" : ""}`}
                  onClick={() => {
                    set(timerKey, seconds);
                    setCustomTime(false);
                  }}
                >
                  {presetLabel(seconds, t)}
                </button>
              ))}
              <button type="button" className={`chip${showCustom ? " selected" : ""}`} onClick={() => setCustomTime(true)}>
                {t("customTime")}
              </button>
            </div>
            {showCustom && <DurationPicker seconds={timerSeconds} onChange={(value) => set(timerKey, value)} presets={[]} />}
            <p className="muted small">{settings.timerMode === "quiz" ? t("quizTimerNote") : t("wordTimerNote")}</p>
            {isMultipleChoice && settings.timerMode === "quiz" && <p className="muted small">{t("choiceQuizTimerNote")}</p>}
          </div>
        )}
      </section>

      <button type="button" className="more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen((isOpen) => !isOpen)}>
        <Icon name="chevronDown" size={16} className={moreOpen ? "rotated" : undefined} />
        {t("moreOptions")}
        {extrasCount > 0 && <span className="pill">{extrasCount}</span>}
      </button>

      {moreOpen && (
        <div className="more-options">
          <div className="form-field">
            <span className="field-label">{t("letterFilterLabel")}</span>
            <LetterPicker letters={letterCounts} selected={validLetters} onChange={(letters) => set("letters", letters)} />
          </div>
          <div className="form-field">
            <span className="field-label">{t("directionLabel")}</span>
            <Segmented
              options={DIRECTIONS.map(({ value, key }) => ({ value, label: t(key, { lang: languageLabel(profile.primaryLanguage) }) }))}
              value={settings.direction}
              onChange={(direction) => set("direction", direction)}
              ariaLabel={t("directionLabel")}
            />
          </div>
          {!isMultipleChoice && (
            <Switch
              checked={settings.includeSentenceWriting}
              onChange={(isChecked) => set("includeSentenceWriting", isChecked)}
              label={t("sentenceToggleLabel")}
            />
          )}
        </div>
      )}

      {/* Pinned to the bottom of the screen on phones, where the thumb is. */}
      <div className="action-bar">
        <button
          className="btn btn-block btn-large start-btn"
          disabled={selectedIds.length === 0 || poolSize === 0 || poolWords.loading || !timerValid}
          onClick={() => onStart({ ...settings, vocabularyIds: selectedIds, letters: validLetters })}
        >
          <Icon name={timed ? "timer" : "quiz"} />{" "}
          {selectedIds.length === 0
            ? t("chooseVocabularyToStart")
            : t("startQuizCount", { count: formatNumber(effectiveCount, language) })}
        </button>
      </div>
    </div>
  );
}

function presetLabel(seconds: number, t: ReturnType<typeof useLanguage>["t"]): string {
  const { hours, minutes, seconds: currentSeconds } = splitDuration(seconds);
  if (hours) return t("presetHours", { count: hours });
  if (minutes) return t("presetMinutes", { count: minutes });
  return t("presetSeconds", { count: currentSeconds });
}
