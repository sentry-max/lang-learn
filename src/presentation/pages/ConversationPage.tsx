import { useEffect, useMemo, useRef, useState } from "react";
import { Conversation, ConversationAttempt, ConversationLineResult, ConversationSetup, roleOf } from "@domain/entities/Conversation";
import { PlannedLine, defaultSetup, planConversation, validateSetup } from "@domain/services/ConversationPlanner";
import { SentenceGrade } from "@domain/services/SentenceGrading";
import { SpokenLineGrade, gradeSpokenLine, lastScoreByConversation } from "@domain/services/SpeechGrading";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices, useSyncStatus } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useConfirm } from "@presentation/context/FeedbackContext";
import { useAsync } from "@presentation/hooks/useAsync";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useFocusMode } from "@presentation/hooks/useFocusMode";
import { RecordedTake, RecorderError, RecorderFailure, canRecognizeSpeech, useLineRecorder } from "@presentation/hooks/useLineRecorder";
import ConversationPicker from "@presentation/components/conversation/ConversationPicker";
import ConversationSetupPanel from "@presentation/components/conversation/ConversationSetupPanel";
import ConversationDemo from "@presentation/components/conversation/ConversationDemo";
import ConversationTranscript from "@presentation/components/conversation/ConversationTranscript";
import ActiveLinePanel from "@presentation/components/conversation/ActiveLinePanel";
import ConversationSummary from "@presentation/components/conversation/ConversationSummary";
import ErrorBanner from "@presentation/components/ErrorBanner";
import Icon from "@presentation/components/ui/Icon";
import { PageLoader, ProgressIndicator } from "@presentation/components/ui/Loader";
import { UiStringKey } from "@presentation/i18n/translations";
import { canSpeak, speakLine, stopSpeaking } from "@presentation/speech";
import { formatNumber } from "@presentation/format";

type Stage = "pick" | "setup" | "demo" | "reading" | "done";

const DEFAULT_TURNS = 5;

const FAILURE_KEYS: Record<RecorderFailure, UiStringKey> = {
  unsupported: "conversationRecognitionUnavailable",
  microphone_denied: "conversationMicrophoneDenied",
  offline: "conversationRecognitionOffline",
  failed: "conversationRecognitionFailed",
};

interface ReadingRun {
  attempt: ConversationAttempt;
  plan: PlannedLine[];
  index: number;
  results: ConversationLineResult[];
  gradeByLineId: Record<string, SentenceGrade>;
  endedEarly: boolean;
}

interface PendingTake {
  take: RecordedTake;
  graded: SpokenLineGrade;
}

export default function ConversationPage() {
  const user = useCurrentUser();
  const { profile } = useProfile();
  const { conversations } = useServices();
  const { version } = useSyncStatus();
  const { t, language } = useLanguage();
  const confirm = useConfirm();
  const errorMessage = useErrorMessage();
  const recorder = useLineRecorder();

  const library = useAsync(() => conversations.list(), [conversations]);
  const history = useAsync(() => conversations.history(user.id), [user.id, version]);
  const lastScoreById = useMemo(() => lastScoreByConversation(history.data ?? []), [history.data]);

  const [stage, setStage] = useState<Stage>("pick");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [setup, setSetup] = useState<ConversationSetup | null>(null);
  const [run, setRunState] = useState<ReadingRun | null>(null);
  const [pending, setPending] = useState<PendingTake | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [demoReturnStage, setDemoReturnStage] = useState<Stage>("setup");

  // Refs mirror state for async callbacks that finish after a render.
  const runRef = useRef<ReadingRun | null>(null);
  const readingRef = useRef(false);
  const savingRef = useRef(false);
  const setRun = (next: ReadingRun | null) => {
    runRef.current = next;
    setRunState(next);
  };

  const plan = useMemo(
    () => (conversation && setup && validateSetup(conversation, setup).length === 0 ? planConversation(conversation, setup) : []),
    [conversation, setup]
  );
  const current = stage === "reading" && run ? (run.plan[run.index] ?? null) : null;
  useFocusMode(stage === "reading" || stage === "demo");

  function openDemo(from: Stage) {
    setDemoReturnStage(from);
    setStage("demo");
  }

  function pick(chosen: Conversation) {
    setConversation(chosen);
    setSetup(defaultSetup(chosen, 1, true, DEFAULT_TURNS));
    setError(null);
    setStage("setup");
  }

  async function startReading() {
    if (!conversation || !setup || isStarting) return;
    setStarting(true);
    setError(null);
    try {
      const started = await conversations.start(user.id, conversation, setup);
      setRun({ ...started, index: 0, results: [], gradeByLineId: {}, endedEarly: false });
      setPending(null);
      setFailure(null);
      setStage("reading");
    } catch (caughtError) {
      setError(errorMessage(caughtError, "conversationStartError"));
      setStage("setup");
    } finally {
      setStarting(false);
    }
  }

  function finish(endedEarly: boolean) {
    const active = runRef.current;
    if (!active) return;
    setRun({ ...active, endedEarly });
    setPending(null);
    void history.reload();
    setStage(active.results.length > 0 ? "done" : "setup");
  }

  function advance() {
    const active = runRef.current;
    if (!active) return;
    setFailure(null);
    if (active.index + 1 >= active.plan.length) {
      finish(false);
      return;
    }
    setRun({ ...active, index: active.index + 1 });
  }

  // The bot reads its line aloud, then the next speaker's turn begins.
  const botLine = current?.speaker === "bot" ? current : null;
  useEffect(() => {
    if (!botLine || !conversation) return;
    let cancelled = false;
    void speakLine(botLine.line.text, conversation.language, roleOf(conversation, botLine.roleId)?.gender ?? "female").then(() => {
      if (!cancelled) advance();
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // advance reads the latest run through runRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botLine, conversation]);

  async function readLine() {
    const line = current;
    if (!line || !conversation || readingRef.current) return;
    readingRef.current = true;
    setFailure(null);
    setPending(null);
    try {
      const take = await recorder.listen(conversation.language);
      if (runRef.current?.plan[runRef.current.index] !== line) return; // the screen moved on while listening
      setPending({ take, graded: gradeSpokenLine(line.line.text, take.alternatives, conversation.language) });
    } catch (caughtError) {
      setFailure(t(caughtError instanceof RecorderError ? FAILURE_KEYS[caughtError.failure] : "conversationRecognitionFailed"));
    } finally {
      readingRef.current = false;
    }
  }

  async function continueLine() {
    const active = runRef.current;
    const line = active?.plan[active.index];
    if (!active || !line || !pending || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const { take, graded } = pending;
      const result = await conversations.saveLine(user.id, active.attempt, line, {
        graded,
        confidence: take.confidence,
        audio: take.audio,
        durationMs: take.durationMs,
      });
      const latest = runRef.current ?? active;
      setRun({ ...latest, results: [...latest.results, result], gradeByLineId: { ...latest.gradeByLineId, [line.line.id]: graded.grade } });
      setPending(null);
      advance();
    } catch (caughtError) {
      setFailure(errorMessage(caughtError, "conversationSaveLineError"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function requestExit() {
    recorder.stop();
    const leave = await confirm({
      title: t("conversationExitTitle"),
      message: t("conversationExitBody"),
      confirmLabel: t("conversationExit"),
      cancelLabel: t("conversationKeepReading"),
      danger: true,
    });
    if (leave) finish(true);
  }

  // ---------------------------------------------------------------- render

  if (stage === "demo" && conversation) {
    return <ConversationDemo conversation={conversation} plan={plan} onEnd={() => setStage(demoReturnStage)} />;
  }

  if (stage === "done" && conversation && run) {
    return (
      <div className="app-main">
        <ConversationSummary
          conversation={conversation}
          humanRoleIds={run.attempt.humanRoleIds}
          results={run.results}
          gradeByLineId={run.gradeByLineId}
          endedEarly={run.endedEarly}
          onReadAgain={startReading}
          onDemo={() => openDemo("done")}
          onChooseAnother={() => setStage("pick")}
        />
      </div>
    );
  }

  if (stage === "reading" && conversation && run && current) {
    const total = run.plan.length;
    return (
      <div className="app-main quiz-main">
        <div className="quiz-header">
          <button type="button" className="icon-btn" onClick={requestExit} aria-label={t("conversationExit")} title={t("conversationExit")}>
            <Icon name="close" />
          </button>
          <ProgressIndicator value={run.index / total} />
          <span className="quiz-counter" aria-label={t("conversationLineOf", { current: run.index + 1, total })}>
            {formatNumber(run.index + 1, language)}/{formatNumber(total, language)}
          </span>
        </div>
        <ConversationTranscript conversation={conversation} plan={run.plan} activeIndex={run.index} gradeByLineId={run.gradeByLineId} />
        <ActiveLinePanel
          conversation={conversation}
          planned={current}
          primaryLanguage={profile.primaryLanguage}
          isListening={recorder.isListening}
          interimText={recorder.interimText}
          grade={pending?.graded.grade ?? null}
          saving={saving}
          failureMessage={failure}
          onRead={readLine}
          onStop={recorder.stop}
          onReadAgain={readLine}
          onContinue={continueLine}
        />
      </div>
    );
  }

  if (stage === "setup" && conversation && setup) {
    return (
      <div className="app-main">
        {error && <ErrorBanner message={error} />}
        {history.error !== null && <ErrorBanner message={errorMessage(history.error, "conversationHistoryLoadError")} onRetry={history.reload} />}
        <ConversationSetupPanel
          conversation={conversation}
          setup={setup}
          onChange={setSetup}
          history={history.data}
          primaryLanguage={profile.primaryLanguage}
          canRead={canRecognizeSpeech()}
          canSpeakOut={canSpeak()}
          isStarting={isStarting}
          onBack={() => setStage("pick")}
          onDemo={() => openDemo("setup")}
          onRead={startReading}
        />
      </div>
    );
  }

  if (library.loading && !library.data) return <PageLoader />;
  if (library.error) {
    return (
      <div className="app-main">
        <ErrorBanner message={errorMessage(library.error, "conversationLoadError")} onRetry={library.reload} />
      </div>
    );
  }
  return (
    <div className="app-main">
      {library.data && library.data.length > 0 ? (
        <ConversationPicker conversations={library.data} lastScoreById={lastScoreById} primaryLanguage={profile.primaryLanguage} onPick={pick} />
      ) : (
        <div className="card empty-state">
          <p>{t("conversationNoneAvailable")}</p>
        </div>
      )}
    </div>
  );
}
