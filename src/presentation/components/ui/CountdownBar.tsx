import { formatCountdown, isTimeWarning, remainingFraction } from "@domain/services/Duration";
import Icon from "@presentation/components/ui/Icon";

interface Props {
  remainingMs: number;
  totalMs: number;
  label: string;
}

/** A slim bar that shrinks as time runs out, with the time next to it; red in the last 15%. */
export default function CountdownBar({ remainingMs, totalMs, label }: Props) {
  const fraction = remainingFraction(remainingMs, totalMs);
  const warning = isTimeWarning(remainingMs, totalMs);
  const text = formatCountdown(remainingMs);
  return (
    <div className={`countdown${warning ? " warning" : ""}`} role="timer" aria-label={`${label}: ${text}`}>
      <div className="countdown-track" aria-hidden="true">
        <div className="countdown-fill" style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <span className="countdown-time" title={label}>
        <Icon name="timer" size={15} /> {text}
      </span>
    </div>
  );
}
