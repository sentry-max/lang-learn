/**
 * Short vibrations for touch devices (Vibration API). Best-effort: browsers
 * without it (e.g. iOS Safari, desktops) simply do nothing.
 */
type Buzz = "tap" | "success" | "fail" | "timeout" | "complete";

const PATTERNS: Record<Buzz, number | number[]> = {
  tap: 8,
  success: 14,
  fail: [24, 50, 24],
  timeout: [40, 60, 40],
  complete: [16, 40, 16, 40, 30],
};

export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function vibrate(kind: Buzz): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Blocked (e.g. no user gesture yet): stay silent.
  }
}
