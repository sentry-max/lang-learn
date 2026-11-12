import { useState } from "react";
import { QuizSettings, TimerMode } from "@domain/entities/QuizSettings";
import { splitDuration } from "@domain/services/Duration";
import { useLanguage } from "@presentation/context/LanguageContext";
import DurationPicker from "@presentation/components/ui/DurationPicker";
import Icon, { IconName } from "@presentation/components/ui/Icon";
import { UiStringKey } from "@presentation/i18n/translations";

export type TimerSettings = Pick<QuizSettings, "timerMode" | "quizTimerSeconds" | "wordTimerSeconds">;

/** What one question is: a word in the quiz, a sentence in sentence practice. */
type TimerUnit = "word" | "sentence";

interface ModeText {
  title: UiStringKey;
  subtitle: UiStringKey;
  note: UiStringKey | null;
}

const MODE_TEXT: Record<TimerUnit, Record<TimerMode, ModeText>> = {
  word: {
    none: { title: "modeClassic", subtitle: "modeClassicShort", note: null },
    quiz: { title: "modeQuizTimer", subtitle: "modeQuizTimerShort", note: "quizTimerNote" },
    word: { title: "modeWordTimer", subtitle: "modeWordTimerShort", note: "wordTimerNote" },
  },
  sentence: {
    none: { title: "modeClassic", subtitle: "modeClassicShort", note: null },
    quiz: { title: "modeTotalTimer", subtitle: "modeTotalTimerShort", note: "sentenceTotalTimerNote" },
    word: { title: "modeSentenceTimer", subtitle: "modeSentenceTimerShort", note: "sentenceTimerNote" },
  },
};

const MODE_ICONS: Record<TimerMode, IconName> = { none: "infinity", quiz: "hourglass", word: "timer" };

const TIME_PRESETS: Record<TimerUnit, Record<"quiz" | "word", number[]>> = {
  word: { quiz: [2 * 60, 5 * 60, 10 * 60, 20 * 60], word: [5, 10, 20, 30] },
  sentence: { quiz: [2 * 60, 5 * 60, 10 * 60, 20 * 60], word: [15, 30, 60, 120] },
};

interface Props {
  unit: TimerUnit;
  label: string;
  value: TimerSettings;
  onChange: (change: Partial<TimerSettings>) => void;
  /** An extra line under the timer's own note */
  extraNote?: string;
}

/** Classic, whole-run timer or per-question timer, with time presets and a custom h/m/s picker. */
export default function TimerModePicker({ unit, label, value, onChange, extraNote }: Props) {
  const { t } = useLanguage();
  const [customTime, setCustomTime] = useState(false);

  const timerKey = value.timerMode === "quiz" ? "quizTimerSeconds" : "wordTimerSeconds";
  const timerSeconds = value[timerKey];
  const presets = value.timerMode === "none" ? [] : TIME_PRESETS[unit][value.timerMode];
  const timed = value.timerMode !== "none";
  const showCustom = timed && (customTime || !presets.includes(timerSeconds));
  const note = MODE_TEXT[unit][value.timerMode].note;

  return (
    <section className="start-section">
      <span className="field-label">{label}</span>
      <div className="mode-grid" role="radiogroup" aria-label={label}>
        {(["none", "quiz", "word"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value.timerMode === mode}
            className={`mode-option${value.timerMode === mode ? " selected" : ""}`}
            onClick={() => {
              onChange({ timerMode: mode });
              setCustomTime(false);
            }}
          >
            <Icon name={MODE_ICONS[mode]} size={22} />
            <strong>{t(MODE_TEXT[unit][mode].title)}</strong>
            <span>{t(MODE_TEXT[unit][mode].subtitle)}</span>
          </button>
        ))}
      </div>

      {timed && (
        <div className="time-limit" key={value.timerMode}>
          <div className="chip-grid">
            {presets.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={`chip${!showCustom && timerSeconds === seconds ? " selected" : ""}`}
                onClick={() => {
                  onChange({ [timerKey]: seconds });
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
          {showCustom && <DurationPicker seconds={timerSeconds} onChange={(seconds) => onChange({ [timerKey]: seconds })} presets={[]} />}
          {note && <p className="muted small">{t(note)}</p>}
          {extraNote && <p className="muted small">{extraNote}</p>}
        </div>
      )}
    </section>
  );
}

function presetLabel(seconds: number, t: ReturnType<typeof useLanguage>["t"]): string {
  const { hours, minutes, seconds: currentSeconds } = splitDuration(seconds);
  if (hours) return t("presetHours", { count: hours });
  if (minutes) return t("presetMinutes", { count: minutes });
  return t("presetSeconds", { count: currentSeconds });
}
