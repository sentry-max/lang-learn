import { useEffect, useRef, useState } from "react";
import { getSentenceTranslation } from "@domain/entities/Word";
import { DEFAULT_SENTENCE_SETTINGS, SentenceAttempt, SentencePracticeSettings, totalScore } from "@domain/entities/SentencePractice";
import { SentenceGrade } from "@domain/services/SentenceGrading";
import { analyzeSentenceAttempts, missedWordCounts } from "@domain/services/SentenceInsights";
import { AnswerDraft, PracticeItem, draftToAnswer, emptyDraft, isDraftComplete } from "@domain/services/SentenceSelectionService";
import { formatCountdown } from "@domain/services/Duration";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useConfirm } from "@presentation/context/FeedbackContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useDeadline } from "@presentation/hooks/useCountdown";
import { useFocusMode } from "@presentation/hooks/useFocusMode";
import SentenceSettingsPanel from "@presentation/components/sentence/SentenceSettingsPanel";
import FillBlankExercise from "@presentation/components/sentence/FillBlankExercise";
import JumbleExercise from "@presentation/components/sentence/JumbleExercise";
import TransformExercise from "@presentation/components/sentence/TransformExercise";
import SentenceResult from "@presentation/components/sentence/SentenceResult";
import ScoreRing from "@presentation/components/ui/ScoreRing";
import { Kpi, SummaryActions, SummaryHeader, SummaryOverview, SummarySection } from "@presentation/components/ResultSummary";
import { TopicList } from "@presentation/components/sentence/SentenceProgress";
import { Link } from "react-router-dom";
import ErrorBanner from "@presentation/components/ErrorBanner";
import CountdownBar from "@presentation/components/ui/CountdownBar";
import Icon from "@presentation/components/ui/Icon";
import { PageLoader, ProgressIndicator, Spinner } from "@presentation/components/ui/Loader";
import { SENTENCE_KIND_KEYS, TRANSFORM_TASK_KEYS } from "@presentation/i18n/grammarLabels";
import { formatNumber } from "@presentation/format";
import { playCue } from "@presentation/sound";
import { vibrate } from "@presentation/haptics";

type Stage = "settings" | "loading" | "running" | "done" | "empty";

type EndReason = "time_up" | "exited";

interface ActivePractice {
  sessionId: string;
  settings: SentencePracticeSettings;
  items: PracticeItem[];
  index: number;
  grades: SentenceGrade[];
  attempts: SentenceAttempt[];
  startedAt: number;
  endedAt: number | null;
  endReason: EndReason | null;
  /** Epoch ms when the total time runs out, in "quiz" timer mode */
  totalDeadline: number | null;
}

interface Graded {
  grade: SentenceGrade;
  timedOut: boolean;
}

export default function SentencePracticePage() {
  const user = useCurrentUser();
  const { profile, preferences } = useProfile();
  const { sentences } = useServices();
  const { t, language } = useLanguage();
  const confirm = useConfirm();
  const errorMessage = useErrorMessage();

  const [stage, setStage] = useState<Stage>("settings");
  const [lastSettings, setLastSettings] = useState<SentencePracticeSettings>(() => ({
    ...DEFAULT_SENTENCE_SETTINGS,
    collectionIds: preferences.defaultSentenceCollectionIds,
    includeDistractors: preferences.sentenceDistractors,
  }));
  const [practice, setPracticeState] = useState<ActivePractice | null>(null);
  const [draft, setDraft] = useState<AnswerDraft>({ tileIds: [], text: "" });
  const [graded, setGraded] = useState<Graded | null>(null);
  const [hintOpen, setHintOpen] = useState(preferences.sentenceAutoShowHint);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sentenceDeadline, setSentenceDeadline] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  // Refs mirror state for timer callbacks that fire outside React's render cycle.
  const practiceRef = useRef<ActivePractice | null>(null);
  const savingRef = useRef(false);
  const shownAtRef = useRef(new Date());
  const pausedRemainingRef = useRef<number | null>(null);

  const setPractice = (next: ActivePractice | null) => {
    practiceRef.current = next;
    setPracticeState(next);
  };
  const cue = (name: Parameters<typeof playCue>[0]) => {
    if (preferences.soundEffects) playCue(name, preferences.soundVolume);
    if (preferences.haptics) vibrate(name);
  };

  const item = practice && stage === "running" ? (practice.items[practice.index] ?? null) : null;
  const sentenceLimitMs = (practice?.settings.wordTimerSeconds ?? 0) * 1000;
  const isSentenceTimed = practice?.settings.timerMode === "word";

  function finish(reason: EndReason | null) {
    const active = practiceRef.current;
    if (!active || active.endedAt !== null) return;
    setPractice({ ...active, endedAt: Date.now(), endReason: reason });
    setGraded(null);
    setSentenceDeadline(null);
    setStage("done");
    cue(reason === "time_up" ? "timeout" : "complete");
  }

  async function start(chosenSettings: SentencePracticeSettings) {
    setLastSettings(chosenSettings);
    const settings = { ...chosenSettings, tolerateTypos: preferences.sentenceTolerateTypos };
    setError(null);
    setGraded(null);
    setStage("loading");
    try {
      const { sessionId, items } = await sentences.start(user.id, settings);
      const now = Date.now();
      setPractice({
        sessionId,
        settings,
        items,
        index: 0,
        grades: [],
        attempts: [],
        startedAt: now,
        endedAt: null,
        endReason: null,
        totalDeadline: settings.timerMode === "quiz" ? now + settings.quizTimerSeconds * 1000 : null,
      });
      if (items[0]) setDraft(emptyDraft(items[0]));
      setStage(items.length === 0 ? "empty" : "running");
    } catch (caughtError) {
      setError(errorMessage(caughtError, "sentenceLoadError"));
      setStage("settings");
    }
  }

  // A new sentence appeared: start its clock.
  useEffect(() => {
    if (!item) return;
    shownAtRef.current = new Date();
    setHintOpen(preferences.sentenceAutoShowHint);
    setSentenceDeadline(practiceRef.current?.settings.timerMode === "word" ? Date.now() + sentenceLimitMs : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key]);

  async function submit(timedOut = false) {
    const active = practiceRef.current;
    const current = active?.items[active.index];
    if (!active || !current || graded || savingRef.current) return;
    if (!timedOut && !isDraftComplete(current, draft)) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSentenceDeadline(null);

    const shownAt = shownAtRef.current;
    const answeredAt = timedOut ? new Date(shownAt.getTime() + sentenceLimitMs) : new Date();
    try {
      const { grade, attempt } = await sentences.submit({
        userId: user.id,
        sessionId: active.sessionId,
        item: current,
        settings: active.settings,
        answer: draftToAnswer(current, draft),
        timedOut,
        shownAt,
        answeredAt,
      });
      const latest = practiceRef.current;
      if (!latest || latest.endedAt !== null) return; // the total time ran out while saving
      setPractice({ ...latest, grades: [...latest.grades, grade], attempts: [...latest.attempts, attempt] });
      setGraded({ grade, timedOut });
      cue(timedOut ? "timeout" : grade.errorCount === 0 ? "success" : "fail");
    } catch (caughtError) {
      setError(errorMessage(caughtError, "saveAnswerError"));
      if (active.settings.timerMode === "word") setSentenceDeadline(Date.now() + sentenceLimitMs);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function next() {
    const active = practiceRef.current;
    if (!active) return;
    setGraded(null);
    const index = active.index + 1;
    if (index >= active.items.length) {
      finish(null);
      return;
    }
    setPractice({ ...active, index });
    setDraft(emptyDraft(active.items[index]));
  }

  async function requestExit() {
    // Pause the per-sentence clock while the user decides; the total clock keeps running.
    if (sentenceDeadline !== null) pausedRemainingRef.current = Math.max(0, sentenceDeadline - Date.now());
    setPaused(true);
    const leave = await confirm({
      title: t("sentenceExitTitle"),
      message: t("sentenceExitBody"),
      confirmLabel: t("exitQuiz"),
      cancelLabel: t("keepGoing"),
      danger: true,
    });
    setPaused(false);
    if (leave) finish("exited");
    else if (pausedRemainingRef.current !== null && practiceRef.current?.endedAt === null) setSentenceDeadline(Date.now() + pausedRemainingRef.current);
    pausedRemainingRef.current = null;
  }

  const sentenceClockRunning = stage === "running" && !paused && !graded && !saving;
  useDeadline(practice?.totalDeadline ?? null, stage === "running", () => finish("time_up"));
  useDeadline(sentenceDeadline, sentenceClockRunning, () => submit(true));
  useFocusMode(stage === "running");

  // ---------------------------------------------------------------- render

  if (stage === "settings") {
    return (
      <div className="app-main">
        {error && <ErrorBanner message={error} />}
        <SentenceSettingsPanel initial={lastSettings} onStart={start} />
      </div>
    );
  }

  if (stage === "loading") return <PageLoader label={t("sentencePreparing")} />;

  if (stage === "empty") {
    return (
      <div className="app-main">
        <div className="card empty-state">
          <p>{t("sentenceNoneOfKind")}</p>
          <button className="btn" onClick={() => setStage("settings")}>
            {t("settingsTitle")}
          </button>
        </div>
      </div>
    );
  }

  if (stage === "done" && practice) {
    const score = totalScore(practice.grades);
    const errorCount = practice.grades.reduce((sum, grade) => sum + Math.min(grade.errorCount, grade.maxErrors), 0);
    const maxErrors = practice.grades.reduce((sum, grade) => sum + grade.maxErrors, 0);
    const runExercises = practice.items.map((practiceItem) => practiceItem.exercise);
    const weakTopics = analyzeSentenceAttempts(practice.attempts, runExercises, new Date()).topics.filter((topic) => topic.score < 0.75).slice(0, 4);
    const missedWords = Array.from(missedWordCounts(practice.attempts, new Map(runExercises.map((exercise) => [exercise.id, exercise]))).keys()).slice(0, 8);
    const title = practice.endReason === "time_up" ? t("timeUpTitle") : practice.endReason === "exited" ? t("sentenceExitedTitle") : t("sessionComplete");
    return (
      <div className="app-main">
        <div className="card summary-card">
          <SummaryHeader
            tone={practice.endReason === "time_up" ? "warning" : practice.endReason === null && (score ?? 0) >= 0.75 ? "success" : "neutral"}
            icon={practice.endReason === "time_up" ? "hourglass" : practice.endReason === "exited" ? "close" : "check"}
            title={title}
            subtitle={t("sentenceSummarySubtitle", { count: formatNumber(practice.grades.length, language) })}
          />
          <SummaryOverview score={<ScoreRing score={score} size={120} label={t("sentenceScoreLabel")} animate />}>
            <Kpi label={t("sentenceCountLabel")} value={practice.grades.length} />
            <Kpi label={t("sentenceErrorsLabel")} value={`${formatNumber(errorCount, language)}/${formatNumber(maxErrors, language)}`} />
            <Kpi label={t("timeSpent")} value={formatCountdown((practice.endedAt ?? Date.now()) - practice.startedAt)} />
          </SummaryOverview>
          {weakTopics.length > 0 && (
            <SummarySection title={t("sentencePracticeMore")} order={2}>
              <TopicList topics={weakTopics} />
            </SummarySection>
          )}
          {missedWords.length > 0 && (
            <SummarySection title={t("sentenceWordsToReview")} order={3}>
              <div className="chip-grid">
                {missedWords.map((word) => (
                  <span key={word} className="topic-chip" dir="auto">
                    {word}
                  </span>
                ))}
              </div>
            </SummarySection>
          )}
          {(weakTopics.length > 0 || missedWords.length > 0) && <p className="muted small summary-note">{t("sentenceFocusNote")}</p>}
          <SummaryActions order={4}>
            <button className="btn btn-large" onClick={() => start(lastSettings)} autoFocus>
              <Icon name="refresh" size={18} /> {t("sameAgain")}
            </button>
            <button className="btn btn-secondary btn-large" onClick={() => setStage("settings")}>
              {t("startAnother")}
            </button>
            <Link className="btn btn-ghost btn-large" to="/dashboard?section=sentences">
              <Icon name="chart" size={18} /> {t("sentenceSeeProgress")}
            </Link>
          </SummaryActions>
        </div>
      </div>
    );
  }

  if (!practice || !item) return null;

  const { content } = item.exercise;
  const total = practice.items.length;
  const position = practice.index + 1;
  const translation = getSentenceTranslation({ text: "", translations: item.exercise.translations }, profile.primaryLanguage);
  const hasHelp = Boolean(translation || item.exercise.hint);
  const isComplete = isDraftComplete(item, draft);
  const isAnswering = graded === null;

  return (
    <div className="app-main quiz-main">
      <div className="quiz-header">
        <button type="button" className="icon-btn" onClick={requestExit} aria-label={t("exitQuiz")} title={t("exitQuiz")}>
          <Icon name="close" />
        </button>
        <ProgressIndicator value={(practice.index + (graded ? 1 : 0)) / total} />
        <span className="quiz-counter" aria-label={t("questionOf", { current: position, total })}>
          {formatNumber(position, language)}/{formatNumber(total, language)}
        </span>
      </div>

      {practice.totalDeadline !== null && (
        <CountdownBar deadline={practice.totalDeadline} running totalMs={practice.settings.quizTimerSeconds * 1000} label={t("timeLeftPractice")} />
      )}
      {isSentenceTimed && (
        <CountdownBar
          deadline={sentenceDeadline}
          running={sentenceClockRunning}
          expired={graded?.timedOut}
          totalMs={sentenceLimitMs}
          label={t("timeLeftSentence")}
        />
      )}

      {error && <ErrorBanner message={error} />}

      <div className="quiz-stage" key={item.key}>
        <div className={`card quiz-card sentence-card${graded ? (graded.grade.errorCount === 0 ? " result-good" : " result-bad") : ""}`}>
          <div className="task-banner">
            <Icon name={content.kind === "transform" ? "edit" : "sentence"} size={22} />
            <span>{content.kind === "transform" ? t(TRANSFORM_TASK_KEYS[content.task]) : t(SENTENCE_KIND_KEYS[content.kind].prompt)}</span>
          </div>
          {content.kind === "transform" && (
            <p className="sentence-text" dir="auto">
              {content.sentence}
            </p>
          )}

          {graded ? (
            <SentenceResult grade={graded.grade} timedOut={graded.timedOut} />
          ) : content.kind === "fill_blank" ? (
            <FillBlankExercise item={item} draft={draft} disabled={saving} onChange={setDraft} />
          ) : content.kind === "jumble" ? (
            <JumbleExercise key={item.key} item={item} draft={draft} disabled={saving} onChange={setDraft} />
          ) : (
            <TransformExercise draft={draft} disabled={saving} onChange={setDraft} onSubmit={() => submit()} />
          )}

          {hasHelp &&
            (hintOpen || !isAnswering ? (
              <div className="hint-box">
                {translation && <p dir="auto">{translation}</p>}
                {item.exercise.hint && (
                  <p className="muted small" dir="auto">
                    {item.exercise.hint}
                  </p>
                )}
              </div>
            ) : (
              <button type="button" className="hint-toggle" onClick={() => setHintOpen(true)}>
                <Icon name="hint" size={16} /> {t("showHint")}
              </button>
            ))}
        </div>
      </div>

      <div className="quiz-dock">
        {graded ? (
          <button className="btn btn-block btn-large" onClick={next} autoFocus>
            {t("next")} <Icon name="arrowRight" size={18} className="flip-rtl" />
          </button>
        ) : (
          <button className="btn btn-block btn-large" disabled={!isComplete || saving} onClick={() => submit()}>
            {saving && <Spinner />} {t("sentenceSubmit")}
          </button>
        )}
      </div>
    </div>
  );
}

