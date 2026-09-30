/** Helpers for the timer modes: splitting durations, countdowns and warnings. */

export interface DurationParts {
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitDuration(totalSeconds: number): DurationParts {
  const total = Math.max(0, Math.floor(totalSeconds));
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

export function joinDuration(parts: DurationParts): number {
  const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return n(parts.hours) * 3600 + n(parts.minutes) * 60 + n(parts.seconds);
}

/** "1:05:09", "5:09", "0:07" — rounds up so a countdown never shows 0 before it ends. */
export function formatCountdown(remainingMs: number): string {
  const { hours, minutes, seconds } = splitDuration(Math.ceil(Math.max(0, remainingMs) / 1000));
  const pad = (v: number) => String(v).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Share of the time limit that remains, 0..1. */
export function remainingFraction(remainingMs: number, totalMs: number): number {
  if (totalMs <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMs / totalMs));
}

/** The last 15% of the time limit is shown as a warning. */
export const WARNING_FRACTION = 0.15;

export function isTimeWarning(remainingMs: number, totalMs: number): boolean {
  return remainingFraction(remainingMs, totalMs) <= WARNING_FRACTION;
}
