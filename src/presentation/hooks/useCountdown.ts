import { useEffect, useRef, useState } from "react";

/**
 * Milliseconds left until `deadline` (epoch ms), updated ~10×/second while
 * `running`. Calls `onExpire` once when it reaches zero. Paused countdowns
 * keep showing the last value.
 */
export function useCountdown(deadline: number | null, running: boolean, onExpire?: () => void): number {
  const [remaining, setRemaining] = useState(() => (deadline === null ? 0 : Math.max(0, deadline - Date.now())));
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      return left;
    };
    if (!running) {
      tick();
      return;
    }
    if (tick() === 0) {
      onExpireRef.current?.();
      return;
    }
    const interval = window.setInterval(() => {
      if (tick() === 0) {
        window.clearInterval(interval);
        onExpireRef.current?.();
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [deadline, running]);

  return remaining;
}
