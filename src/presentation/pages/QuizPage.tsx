import { useState } from "react";
import { useAuth } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { QuizQuestion } from "@application/usecases/GenerateQuizUseCase";
import { DifficultyRating } from "@domain/entities/Review";
import { QuizSettings } from "@domain/entities/QuizSettings";
import { toAppError } from "@domain/errors/AppError";
import {
  displayForm,
  resolveSentenceTranslation,
  resolveTranslations,
} from "@domain/entities/VocabularyEntry";
import { LANGUAGE_LABELS } from "@domain/entities/Language";
import DifficultyRatingPicker from "@presentation/components/DifficultyRatingPicker";
import QuizSettingsPanel from "@presentation/components/QuizSettingsPanel";
import ErrorBanner from "@presentation/components/ErrorBanner";

/** Ratings this low mean the user didn't really know it — reveal the answer before moving on. */
function shouldRevealAnswer(rating: DifficultyRating): boolean {
  return rating === "bad" || rating === "very_bad";
}

type Stage = "settings" | "loading" | "answering" | "revealed" | "done" | "empty";

export default function QuizPage() {
  const { session } = useAuth();
  const { generateQuiz, submitAnswer } = useServices();
  const { language, t } = useLanguage();
  const userId = session!.user.id;

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("settings");
  const [hintOpen, setHintOpen] = useState(false);
  const [lastRating, setLastRating] = useState<DifficultyRating | null>(null);
  const [lastSettings, setLastSettings] = useState<QuizSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingRating, setSavingRating] = useState(false);

  async function startQuiz(settings: QuizSettings) {
    setLastSettings(settings);
    setError(null);
    setStage("loading");
    try {
      const q = await generateQuiz.execute({ userId, ...settings });
      setQuestions(q);
      setIndex(0);
      setStage(q.length === 0 ? "empty" : "answering");
      resetQuestionState();
    } catch (err) {
      setError(toAppError(err, t("quizLoadError")).message);
      setStage("settings");
    }
  }

  function resetQuestionState() {
    setHintOpen(false);
    setLastRating(null);
    setError(null);
  }

  if (stage === "settings") {
    return (
      <div className="app-main">
        {error && <ErrorBanner message={error} />}
        <QuizSettingsPanel onStart={startQuiz} />
      </div>
    );
  }
  if (stage === "loading") return <div className="app-main center-text muted">{t("loading")}</div>;
  if (stage === "empty")
    return (
      <div className="app-main">
        <div className="card center-text">
          <p>{t("noVocabTitle")}</p>
          <p className="muted">{t("noVocabBody")}</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setStage("settings")}>
            {t("settingsTitle")}
          </button>
        </div>
      </div>
    );

  const question = questions[index];
  const { entry, mode } = question;
  const resolvedTarget = resolveTranslations(entry, language);
  const resolvedSentence = entry.sentences[0]
    ? resolveSentenceTranslation(entry.sentences[0], language)
    : null;

  const promptText =
    mode === "de_to_en" || mode === "sentence_writing" ? displayForm(entry) : resolvedTarget.values[0];

  const pillText =
    mode === "de_to_en"
      ? `${t("german")} → ${LANGUAGE_LABELS[resolvedTarget.language]}`
      : mode === "en_to_de"
      ? `${LANGUAGE_LABELS[resolvedTarget.language]} → ${t("german")}`
      : t("modeSentence");

  async function handleRate(rating: DifficultyRating) {
    setLastRating(rating);
    setError(null);
    setSavingRating(true);
    try {
      await submitAnswer.execute({
        userId,
        vocabularyEntryId: entry.id,
        mode,
        userAnswer: null,
        wasCorrect: null,
        difficultyRating: rating,
      });
      setSavingRating(false);

      if (shouldRevealAnswer(rating)) {
        setHintOpen(true);
        setStage("revealed");
      } else {
        advance();
      }
    } catch (err) {
      setSavingRating(false);
      // Let the user retry the same rating without losing their place in the quiz.
      setLastRating(null);
      setError(toAppError(err, t("saveAnswerError")).message);
    }
  }

  function advance() {
    if (index + 1 >= questions.length) {
      setStage("done");
    } else {
      setIndex(index + 1);
      resetQuestionState();
      setStage("answering");
    }
  }

  if (stage === "done") {
    return (
      <div className="app-main">
        <div className="card center-text">
          <h2>{t("sessionComplete")}</h2>
          <p className="muted">{t("sessionCompleteBody", { count: questions.length })}</p>
          <button className="btn" onClick={() => setStage("settings")}>
            {t("startAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main">
      <p className="muted">{t("questionOf", { current: index + 1, total: questions.length })}</p>
      {error && (
        <ErrorBanner
          message={error}
          onRetry={lastSettings ? () => startQuiz(lastSettings) : undefined}
        />
      )}
      <div className="card">
        <span className="pill">{pillText}</span>
        <h2 style={{ marginTop: 8 }}>{promptText}</h2>
        {mode === "sentence_writing" && <p className="muted">{t("sentenceHint")}</p>}

        {resolvedSentence?.value && (
          <>
            {!hintOpen ? (
              <button type="button" className="hint-toggle" onClick={() => setHintOpen(true)}>
                💡 {t("showHint")}
              </button>
            ) : (
              <div className="hint-box">
                <p style={{ margin: "0 0 4px" }}>{entry.sentences[0].german}</p>
                <p className="muted" style={{ margin: 0 }}>
                  {resolvedSentence.value}
                </p>
              </div>
            )}
          </>
        )}

        {stage === "answering" && (
          <DifficultyRatingPicker value={lastRating} onChange={handleRate} disabled={savingRating} />
        )}

        {stage === "revealed" && (
          <>
            {mode === "de_to_en" && (
              <p className="muted">{t("accepted")} {resolvedTarget.values.join(", ")}</p>
            )}
            {mode === "en_to_de" && <p className="muted">{t("correctWord")} {displayForm(entry)}</p>}
            {mode === "sentence_writing" && resolvedSentence?.value && (
              <p className="muted">
                {t("example")} {entry.sentences[0].german} — {resolvedSentence.value}
              </p>
            )}
            <DifficultyRatingPicker value={lastRating} onChange={() => {}} disabled />
            <button className="btn btn-block" style={{ marginTop: 12 }} onClick={advance}>
              {t("next")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
