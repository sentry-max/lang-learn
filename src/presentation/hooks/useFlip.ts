import { RefObject, useLayoutEffect, useRef } from "react";

const FLY_MS = 260;

/**
 * Animates every `[data-flip-id]` element inside the container from where it was to where it is now whenever
 * `layoutKey` changes, so a word tapped in the bank flies into its place (and back). Positions are measured
 * against the container, so scrolling between renders doesn't trigger a flight.
 */
export function useFlip(containerRef: RefObject<HTMLElement>, layoutKey: string): void {
  const positionsRef = useRef(new Map<string, { left: number; top: number }>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const origin = container.getBoundingClientRect();
    const reduceMotion =
      document.documentElement.dataset.reduceMotion === "true" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const positions = new Map<string, { left: number; top: number }>();
    container.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      const position = { left: rect.left - origin.left, top: rect.top - origin.top };
      const flipId = element.dataset.flipId!;
      positions.set(flipId, position);
      const previous = positionsRef.current.get(flipId);
      if (!previous || reduceMotion || typeof element.animate !== "function") return;
      const deltaX = previous.left - position.left;
      const deltaY = previous.top - position.top;
      if (deltaX === 0 && deltaY === 0) return;
      element.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "none" }], {
        duration: FLY_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    });
    positionsRef.current = positions;
  }, [containerRef, layoutKey]);
}
