import { useState } from "react";
import {
  DEFAULT_QUIZ_SETTINGS,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  QuizSettings,
} from "@domain/entities/QuizSettings";
import { sanitizeLetterInput } from "@domain/services/VocabularySelectionService";
import { LANGUAGE_LABELS } from "@domain/entities/Language";
import { useLanguage } from "@presentation/context/LanguageContext";

interface Props {
  onStart: (settings: QuizSettings) => void;
}

export default function QuizSettingsPanel({ onStart }: Props) {
  const { language, t } = useLanguage();
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUIZ_SETTINGS.questionCount);
  const [direction, setDirection] = useState(DEFAULT_QUIZ_SETTINGS.direction);
  const [includeSentenceWriting, setIncludeSentenceWriting] = useState(
    DEFAULT_QUIZ_SETTINGS.includeSentenceWriting
  );
  const [letterFrom, setLetterFrom] = useState("");
  const [letterTo, setLetterTo] = useState("");
  const [letterToEnd, setLetterToEnd] = useState(false);

  const targetLabel = LANGUAGE_LABELS[language];

  function handleStart() {
    const settings: QuizSettings = {
      questionCount,
      direction,
      includeSentenceWriting,
      letterFilter: letterFrom
        ? { from: letterFrom, to: letterToEnd ? undefined : letterTo || undefined, toEnd: letterToEnd }
        : undefined,
    };
    onStart(settings);
  }

  return (
    <div className="app-main">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("settingsTitle")}</h2>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>
            {t("questionCountLabel")}: {questionCount}
          </label>
          <input
            type="range"
            min={MIN_QUESTION_COUNT}
            max={MAX_QUESTION_COUNT}
            step={5}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <p className="muted" style={{ marginTop: 4 }}>{t("questionCountHint")}</p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
            {t("directionLabel")}
          </label>
          <div className="rating-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <button
              type="button"
              className={`rating-btn good${direction === "de_to_target" ? " selected" : ""}`}
              onClick={() => setDirection("de_to_target")}
            >
              {t("directionDeToTarget", { lang: targetLabel })}
            </button>
            <button
              type="button"
              className={`rating-btn good${direction === "target_to_de" ? " selected" : ""}`}
              onClick={() => setDirection("target_to_de")}
            >
              {t("directionTargetToDe", { lang: targetLabel })}
            </button>
            <button
              type="button"
              className={`rating-btn good${direction === "mix" ? " selected" : ""}`}
              onClick={() => setDirection("mix")}
            >
              {t("directionMix")}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
            {t("letterRangeLabel")}
          </label>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted">{t("letterFromLabel")}</span>
              <input
                type="text"
                inputMode="text"
                maxLength={4}
                style={{ width: 56, textAlign: "center" }}
                value={letterFrom}
                onChange={(e) => setLetterFrom(sanitizeLetterInput(e.target.value))}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted">{t("letterToLabel")}</span>
              <input
                type="text"
                inputMode="text"
                maxLength={4}
                disabled={letterToEnd}
                style={{ width: 56, textAlign: "center" }}
                value={letterTo}
                onChange={(e) => setLetterTo(sanitizeLetterInput(e.target.value))}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 18 }}>
              <input
                type="checkbox"
                checked={letterToEnd}
                onChange={(e) => {
                  setLetterToEnd(e.target.checked);
                  if (e.target.checked) setLetterTo("");
                }}
              />
              <span>{t("letterToEndLabel")}</span>
            </label>
          </div>
          {letterFrom && !letterTo && !letterToEnd && (
            <p className="muted" style={{ marginTop: 8 }}>{t("letterSingleHint")}</p>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={includeSentenceWriting}
              onChange={(e) => setIncludeSentenceWriting(e.target.checked)}
            />
            {t("sentenceToggleLabel")}
          </label>
        </div>

        <button className="btn btn-block" onClick={handleStart}>
          {t("startQuiz")}
        </button>
      </div>
    </div>
  );
}
