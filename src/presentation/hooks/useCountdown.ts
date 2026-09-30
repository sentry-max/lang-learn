import { useEffect, useRef, useState } from "react";

/**
 * Calls `onExpire` once when `deadline` (epoch ms) passes while `running`.
 * A single timeout, not a ticking clock, so the calling component never
 * re-renders because time passes.
 */
export function useDeadline(deadline: number | null, running: boolean, onExpire: () => void): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (deadline === null || !running) return;
    const timer = window.setTimeout(() => onExpireRef.current(), Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [deadline, running]);
}

/**
 * Milliseconds left until `deadline`, refreshed every `intervalMs` while
 * `running`. Only the component that displays the time should use this, so
 * a tick re-renders a small bar rather than a whole page. Stopped or cleared
 * countdowns keep showing their last value.
 */
export function useRemaining(deadline: number | null, running: boolean, intervalMs = 200): number {
  const [remaining, setRemaining] = useState(() => (deadline === null ? 0 : Math.max(0, deadline - Date.now())));

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      return left;
    };
    if (tick() === 0 || !running) return;
    const interval = window.setInterval(() => {
      if (tick() === 0) window.clearInterval(interval);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [deadline, running, intervalMs]);

  return remaining;
}
