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
    const element = ref.current;
    if (!element) return;
    element.style.transition = "transform 180ms ease";
    element.style.transform = "";
  }

  return {
    ref,
    onPointerDown(event: PointerEvent<T>) {
      if (!enabled || event.pointerType === "mouse") return;
      start.current = { x: event.clientX, y: event.clientY };
      if (ref.current) ref.current.style.transition = "none";
    },
    onPointerMove(event: PointerEvent<T>) {
      const seconds = start.current;
      if (!seconds || !ref.current) return;
      const deltaX = event.clientX - seconds.x;
      if (Math.abs(deltaX) > Math.abs(event.clientY - seconds.y)) ref.current.style.transform = `translateX(${deltaX * 0.4}px)`;
    },
    onPointerUp(event: PointerEvent<T>) {
      const seconds = start.current;
      reset();
      if (!seconds || !enabled) return;
      const deltaX = event.clientX - seconds.x;
      const deltaY = event.clientY - seconds.y;
      if (Math.abs(deltaX) >= MIN_DISTANCE_PX && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) onSwipe();
    },
    onPointerCancel: reset,
  };
}
