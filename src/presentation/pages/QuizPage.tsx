import { useCallback, useEffect, useRef, useState } from "react";
import { DIFFICULTY_RATINGS, DifficultyRating, WordProgress, isStrongRating } from "@domain/entities/Learning";
import { afterRating } from "@domain/entities/Preferences";
import { QuizSettings } from "@domain/entities/QuizSettings";
import {
  EndReason,
  QuizItem,
  QuizSessionState,
  answerCurrent,
  createQuizSession,
  currentItem,
  endSession,
  isFinished,
  summarize,
  willRetry,
} from "@domain/services/QuizSession";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useConfirm } from "@presentation/context/FeedbackContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useDeadline } from "@presentation/hooks/useCountdown";
import { useFocusMode } from "@presentation/hooks/useFocusMode";
import { useSwipe } from "@presentation/hooks/useSwipe";
import QuizSettingsPanel from "@presentation/components/QuizSettingsPanel";
import QuizCard, { CardFeedback } from "@presentation/components/quiz/QuizCard";
import QuizSummary from "@presentation/components/quiz/QuizSummary";
import ErrorBanner from "@presentation/components/ErrorBanner";
import CountdownBar, { AutoAdvanceBar } from "@presentation/components/ui/CountdownBar";
import DifficultyRatingPicker from "@presentation/components/DifficultyRatingPicker";
import Icon from "@presentation/components/ui/Icon";
import { playCue } from "@presentation/sound";
import { vibrate } from "@presentation/haptics";
import { speak, stopSpeaking } from "@presentation/speech";
import { PageLoader } from "@presentation/components/ui/Loader";

type Stage = "settings" | "loading" | "running" | "done" | "empty";

interface ActiveQuiz {
  sessionId: string | null;
  cycleRestarted: boolean;
  settings: QuizSettings;
  session: QuizSessionState;
  startedAt: number;
  endedAt: number | null;
  /** Whole-quiz deadline (epoch ms), in "quiz" timer mode */
  quizDeadline: number | null;
}

/** The answered item kept on screen while its result is shown. */
interface Shown extends CardFeedback {
  item: QuizItem;
  /** Epoch ms when it moves on by itself, or null to wait for "Next" */
  advanceAt: number | null;
  advanceTotalMs: number;
}

export default function QuizPage() {
  const user = useCurrentUser();
  const { profile, preferences, updateProfile } = useProfile();
  const { generateQuiz, submitAnswer, completeQuizSession } = useServices();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const errorMessage = useErrorMessage();
  // Quick mute in the quiz: sound effects only — pronunciation has its own setting.
  const [soundOn, setSoundOn] = useState(preferences.soundEffects);
  // Answer feedback: a sound (unless muted) and, on phones, a short vibration.
  const cue = (name: Parameters<typeof playCue>[0]) => {
    if (soundOn) playCue(name, preferences.soundVolume);
    if (preferences.haptics) vibrate(name);
  };
  const say = (text: string, lang: QuizItem["sourceLanguage"]) => speak(text, lang, preferences.speechRate);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    if (next) playCue("success", preferences.soundVolume);
    updateProfile({ preferences: { ...preferences, soundEffects: next } }).catch(() => {
      // Offline: the choice still applies to this quiz.
    });
  };

  const [stage, setStage] = useState<Stage>("settings");
  const [quiz, setQuizState] = useState<ActiveQuiz | null>(null);
  // Nothing is pre-selected unless the user chose default vocabularies in Settings.
  const [lastSettings, setLastSettings] = useState<QuizSettings>(() => ({
    ...profile.quizSettings,
    vocabularyIds: preferences.defaultVocabularyIds,
  }));
  const [shown, setShown] = useState<Shown | null>(null);
  const [hintOpen, setHintOpen] = useState(preferences.autoShowHint);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wordDeadline, setWordDeadline] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  // Refs mirror state for timer callbacks that fire outside React's render cycle.
  const quizRef = useRef<ActiveQuiz | null>(null);
  const savingRef = useRef(false);
  const progressRef = useRef<Map<string, WordProgress | null>>(new Map());
  const shownAtRef = useRef<Date>(new Date());
  const pausedRemainingRef = useRef<number | null>(null);

  const setQuiz = useCallback((next: ActiveQuiz | null) => {
    quizRef.current = next;
    setQuizState(next);
  }, []);

  const current = quiz && stage === "running" ? currentItem(quiz.session) : null;
  const displayed = shown?.item ?? current;
  const timerMode = quiz?.settings.timerMode ?? "none";
  const wordLimitMs = (quiz?.settings.wordTimerSeconds ?? 0) * 1000;

  // ------------------------------------------------------------ lifecycle

  const finish = useCallback(
    (reason: EndReason | null) => {
      const q = quizRef.current;
      if (!q || q.endedAt !== null) return;
      const session = reason ? endSession(q.session, reason) : q.session;
      setQuiz({ ...q, session, endedAt: Date.now() });
      setShown(null);
      setWordDeadline(null);
      setStage("done");
      stopSpeaking();
      const summary = summarize(session);
      cue(reason === "time_up" ? "timeout" : summary.successRate && summary.successRate >= 0.7 ? "complete" : "success");
      if (q.sessionId) completeQuizSession.execute(user.id, q.sessionId).catch(() => {});
    },
    [completeQuizSession, soundOn, preferences.soundVolume, preferences.haptics, setQuiz, user.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function startQuiz(settings: QuizSettings) {
    setLastSettings(settings);
    setError(null);
    setShown(null);
    setStage("loading");
    updateProfile({ quizSettings: settings }).catch(() => {
      // Remembering settings is a convenience (and needs a connection); the quiz still starts.
    });
    try {
      const generated = await generateQuiz.execute(user.id, settings);
      progressRef.current = generated.progressByWordId;
      const now = Date.now();
      setQuiz({
        sessionId: generated.sessionId,
        cycleRestarted: generated.cycleRestarted,
        settings,
        session: createQuizSession(generated.items),
        startedAt: now,
        endedAt: null,
        quizDeadline: settings.timerMode === "quiz" ? now + settings.quizTimerSeconds * 1000 : null,
      });
      setStage(generated.items.length === 0 ? "empty" : "running");
    } catch (err) {
      setError(errorMessage(err, "quizLoadError"));
      setStage("settings");
    }
  }

  // A new question appeared: start its clock (and its own timer in word mode).
  useEffect(() => {
    if (!current || shown) return;
    shownAtRef.current = new Date();
    setHintOpen(preferences.autoShowHint);
    setWordDeadline(timerMode === "word" ? Date.now() + wordLimitMs : null);
    if (preferences.autoPronounce && current.mode !== "target_to_source") {
      say(current.word.headword, current.sourceLanguage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, shown === null]);

  // ------------------------------------------------------------- answering

  async function rate(rating: DifficultyRating, timedOut = false) {
    const q = quizRef.current;
    const item = q ? currentItem(q.session) : null;
    if (!q || !item || shown || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setWordDeadline(null);

    const shownAt = shownAtRef.current;
    const answeredAt = timedOut ? new Date(shownAt.getTime() + wordLimitMs) : new Date();
    try {
      const previous = progressRef.current.has(item.word.id) ? progressRef.current.get(item.word.id)! : undefined;
      const updated = await submitAnswer.execute({
        userId: user.id,
        sessionId: q.sessionId,
        wordId: item.word.id,
        mode: item.mode,
        rating,
        shownAt,
        answeredAt,
        previous,
      });
      progressRef.current.set(item.word.id, updated);
    } catch (err) {
      setError(errorMessage(err, "saveAnswerError"));
      if (timerMode === "word") setWordDeadline(Date.now() + wordLimitMs);
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }

    const latest = quizRef.current;
    if (!latest || latest.endedAt !== null) return; // time ran out while saving

    cue(timedOut ? "timeout" : isStrongRating(rating) ? "success" : "fail");

    const session = answerCurrent(latest.session, rating, { timedOut });
    setQuiz({ ...latest, session });

    const plan = afterRating(preferences, rating);
    if (!plan.reveal && plan.advanceAfterMs === 0) {
      if (isFinished(session)) finish(null);
      return;
    }
    if (plan.reveal && item.mode === "target_to_source" && preferences.autoPronounce) {
      say(item.word.headword, item.sourceLanguage);
    }
    setShown({
      item,
      rating,
      timedOut,
      reveal: plan.reveal,
      willRetry: willRetry(item, rating),
      advanceAt: plan.advanceAfterMs === null ? null : Date.now() + plan.advanceAfterMs,
      advanceTotalMs: plan.advanceAfterMs ?? 0,
    });
  }

  const next = useCallback(() => {
    const q = quizRef.current;
    setShown(null);
    if (q && isFinished(q.session)) finish(null);
  }, [finish]);

  // ---------------------------------------------------------------- timers

  // Timers fire once at their deadline; only the bars that show the time tick.
  const wordClockRunning = stage === "running" && !paused && !shown && !saving;
  const advanceRunning = stage === "running" && !paused;
  useDeadline(quiz?.quizDeadline ?? null, stage === "running", () => finish("time_up"));
  useDeadline(wordDeadline, wordClockRunning, () => rate("very_bad", true));
  useDeadline(shown?.advanceAt ?? null, advanceRunning, () => next());

  useFocusMode(stage === "running");
  const swipe = useSwipe<HTMLDivElement>(() => next(), shown !== null);

  async function requestExit() {
    // Pause the per-word clock while the user decides; the whole-quiz clock keeps running.
    if (wordDeadline !== null) pausedRemainingRef.current = Math.max(0, wordDeadline - Date.now());
    setPaused(true);
    const leave = await confirm({
      title: t("exitQuizTitle"),
      message: t("exitQuizBody"),
      confirmLabel: t("exitQuiz"),
      cancelLabel: t("keepGoing"),
      danger: true,
    });
    setPaused(false);
    if (leave) {
      finish("exited");
    } else if (pausedRemainingRef.current !== null && quizRef.current?.endedAt === null) {
      setWordDeadline(Date.now() + pausedRemainingRef.current);
    }
    pausedRemainingRef.current = null;
  }

  // ------------------------------------------------------------- keyboard

  useEffect(() => {
    if (stage !== "running" || !preferences.keyboardShortcuts) return;
    function onKey(e: KeyboardEvent) {
      if (paused || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, .modal-backdrop")) return;
      if (shown) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          next();
        }
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        e.preventDefault();
        rate(DIFFICULTY_RATINGS[n - 1]);
      } else if (e.key.toLowerCase() === "h") {
        setHintOpen(true);
      } else if (e.key.toLowerCase() === "p" && current && current.mode !== "target_to_source") {
        say(current.word.headword, current.sourceLanguage);
      } else if (e.key === "Escape") {
        requestExit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => stopSpeaking(), []);

  // ---------------------------------------------------------------- render

  if (stage === "settings") {
    return (
      <div className="app-main">
        {error && <ErrorBanner message={error} />}
        <QuizSettingsPanel initial={lastSettings} onStart={startQuiz} />
      </div>
    );
  }

  if (stage === "loading") return <PageLoader label={t("preparingQuiz")} />;

  if (stage === "empty") {
    return (
      <div className="app-main">
        <div className="card empty-state">
          <p>{t("noWordsInPool")}</p>
          <button className="btn" onClick={() => setStage("settings")}>
            {t("settingsTitle")}
          </button>
        </div>
      </div>
    );
  }

  if (stage === "done" && quiz) {
    return (
      <div className="app-main">
        <QuizSummary
          summary={summarize(quiz.session)}
          elapsedMs={(quiz.endedAt ?? Date.now()) - quiz.startedAt}
          cycleRestarted={quiz.cycleRestarted}
          onAgain={() => startQuiz(lastSettings)}
          onSettings={() => setStage("settings")}
        />
      </div>
    );
  }

  if (!quiz || !displayed) return null;

  const total = quiz.session.items.length;
  const answered = quiz.session.index;
  const position = shown ? answered : answered + 1;

  return (
    <div className="app-main quiz-main">
      <div className="quiz-header">
        <button type="button" className="icon-btn" onClick={requestExit} aria-label={t("exitQuiz")} title={t("exitQuiz")}>
          <Icon name="close" />
        </button>
        <div className="progress-bar" aria-hidden="true">
          <div style={{ transform: `scaleX(${total ? answered / total : 0})` }} />
        </div>
        <span className="quiz-counter" aria-label={t("questionOf", { current: Math.min(position, total), total })}>
          {Math.min(position, total)}/{total}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? t("muteSounds") : t("unmuteSounds")}
          title={soundOn ? t("muteSounds") : t("unmuteSounds")}
        >
          <Icon name={soundOn ? "volume" : "volumeOff"} />
        </button>
      </div>

      {timerMode === "quiz" && quiz.quizDeadline !== null && (
        <CountdownBar
          deadline={quiz.quizDeadline}
          running
          totalMs={quiz.settings.quizTimerSeconds * 1000}
          label={t("timeLeftQuiz")}
        />
      )}
      {timerMode === "word" && (
        <CountdownBar
          deadline={wordDeadline}
          running={wordClockRunning}
          expired={shown?.timedOut}
          totalMs={wordLimitMs}
          label={t("timeLeftWord")}
        />
      )}

      {error && <ErrorBanner message={error} />}

      <div className="quiz-stage" key={displayed.key}>
        <div
          className="swipe-area"
          ref={swipe.ref}
          onPointerDown={swipe.onPointerDown}
          onPointerMove={swipe.onPointerMove}
          onPointerUp={swipe.onPointerUp}
          onPointerCancel={swipe.onPointerCancel}
        >
          <QuizCard
            item={displayed}
            primaryLanguage={profile.primaryLanguage}
            hintOpen={hintOpen}
            onShowHint={() => setHintOpen(true)}
            onPronounce={() => say(displayed.word.headword, displayed.sourceLanguage)}
            feedback={shown}
            showShortcuts={false}
          />
        </div>
      </div>

      {/* Answer buttons live at the bottom, in easy reach of the thumb on phones. */}
      <div className="quiz-dock">
        {shown ? (
          <div className="next-row" key="next">
            <button className="btn btn-block btn-large" onClick={next} autoFocus>
              {t("next")} <Icon name="arrowRight" size={18} className="flip-rtl" />
            </button>
            {shown.advanceAt !== null && shown.advanceTotalMs > 0 && (
              <AutoAdvanceBar deadline={shown.advanceAt} totalMs={shown.advanceTotalMs} running={advanceRunning} />
            )}
          </div>
        ) : (
          <>
            <DifficultyRatingPicker value={null} onChange={(r) => rate(r)} disabled={saving} />
            {preferences.keyboardShortcuts && <p className="shortcut-tip muted small">{t("shortcutTip")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
