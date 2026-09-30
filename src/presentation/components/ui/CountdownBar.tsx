import { formatCountdown, isTimeWarning, remainingFraction } from "@domain/services/Duration";
import { useRemaining } from "@presentation/hooks/useCountdown";
import Icon from "@presentation/components/ui/Icon";

interface Props {
  /** Epoch ms when time runs out; null keeps showing the last value */
  deadline: number | null;
  totalMs: number;
  running: boolean;
  label: string;
  /** Show the clock as run out (e.g. the word timed out) */
  expired?: boolean;
}

/** A slim bar that shrinks as time runs out, with the time next to it; red in the last 15%. */
export default function CountdownBar({ deadline, totalMs, running, label, expired }: Props) {
  const left = useRemaining(deadline, running);
  const remainingMs = expired ? 0 : left;
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

/** The thin bar under "Next" that empties until the quiz moves on by itself. */
export function AutoAdvanceBar({ deadline, totalMs, running }: { deadline: number; totalMs: number; running: boolean }) {
  const left = useRemaining(deadline, running, 100);
  return (
    <div className="auto-advance" aria-hidden="true">
      <div style={{ transform: `scaleX(${totalMs > 0 ? left / totalMs : 0})` }} />
    </div>
  );
}
