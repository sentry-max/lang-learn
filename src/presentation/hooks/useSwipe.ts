import { PointerEvent, useRef } from "react";

const MIN_DISTANCE_PX = 70;

/**
 * Horizontal swipe on touch/pen (mouse drags are ignored). The element
 * follows the finger a little while dragging and calls `onSwipe` when let go
 * far enough sideways. Give the element `touch-action: pan-y` so vertical
 * scrolling still works.
 */
export function useSwipe<T extends HTMLElement>(onSwipe: () => void, enabled: boolean) {
  const ref = useRef<T>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  function reset() {
    start.current = null;
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 180ms ease";
    el.style.transform = "";
  }

  return {
    ref,
    onPointerDown(e: PointerEvent<T>) {
      if (!enabled || e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY };
      if (ref.current) ref.current.style.transition = "none";
    },
    onPointerMove(e: PointerEvent<T>) {
      const s = start.current;
      if (!s || !ref.current) return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > Math.abs(e.clientY - s.y)) ref.current.style.transform = `translateX(${dx * 0.4}px)`;
    },
    onPointerUp(e: PointerEvent<T>) {
      const s = start.current;
      reset();
      if (!s || !enabled) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) >= MIN_DISTANCE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe();
    },
    onPointerCancel: reset,
  };
}
