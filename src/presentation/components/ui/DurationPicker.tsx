import { useEffect, useState } from "react";
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS } from "@domain/entities/QuizSettings";
import { DurationParts, joinDuration, splitDuration } from "@domain/services/Duration";
import { useLanguage } from "@presentation/context/LanguageContext";

interface Props {
  seconds: number;
  onChange: (seconds: number) => void;
  presets: number[];
  id?: string;
}

/** Hours / minutes / seconds picker limited to 1 second … 5 hours, with quick presets. */
export default function DurationPicker({ seconds, onChange, presets, id }: Props) {
  const { t } = useLanguage();
  const [parts, setParts] = useState<DurationParts>(() => splitDuration(seconds));

  // Follow outside changes (e.g. a preset), without fighting the user's typing.
  useEffect(() => {
    if (joinDuration(parts) !== seconds) setParts(splitDuration(seconds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  const total = joinDuration(parts);
  const invalid = total < MIN_TIMER_SECONDS || total > MAX_TIMER_SECONDS;

  function update(field: keyof DurationParts, raw: string) {
    const max = field === "hours" ? 5 : 59;
    const value = Math.min(max, Math.max(0, Math.floor(Number(raw.replace(/\D/g, "")) || 0)));
    const next = { ...parts, [field]: value };
    setParts(next);
    const nextTotal = joinDuration(next);
    if (nextTotal >= MIN_TIMER_SECONDS && nextTotal <= MAX_TIMER_SECONDS) onChange(nextTotal);
  }

  const field = (key: keyof DurationParts, label: string) => (
    <label className="duration-field">
      <input
        id={key === "hours" ? id : undefined}
        type="number"
        inputMode="numeric"
        min={0}
        max={key === "hours" ? 5 : 59}
        value={parts[key]}
        onChange={(e) => update(key, e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-invalid={invalid}
      />
      <span className="muted small">{label}</span>
    </label>
  );

  return (
    <div className="duration-picker">
      <div className={`duration-fields${invalid ? " invalid" : ""}`} dir="ltr">
        {field("hours", t("hoursShort"))}
        <span className="duration-sep">:</span>
        {field("minutes", t("minutesShort"))}
        <span className="duration-sep">:</span>
        {field("seconds", t("secondsShort"))}
      </div>
      {presets.length > 0 && <div className="chip-grid">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`chip${preset === seconds && !invalid ? " selected" : ""}`}
            onClick={() => {
              setParts(splitDuration(preset));
              onChange(preset);
            }}
          >
            {formatPreset(preset, t)}
          </button>
        ))}
      </div>}
      {invalid && (
        <p className="field-error" role="alert">
          {t("timerRangeError")}
        </p>
      )}
    </div>
  );
}

function formatPreset(seconds: number, t: ReturnType<typeof useLanguage>["t"]): string {
  const { hours, minutes, seconds: s } = splitDuration(seconds);
  if (hours) return t("presetHours", { count: hours });
  if (minutes) return t("presetMinutes", { count: minutes });
  return t("presetSeconds", { count: s });
}
