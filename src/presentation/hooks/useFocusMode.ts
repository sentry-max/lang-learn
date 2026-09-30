import { useEffect } from "react";

/**
 * While `active`, marks the page as being in focus mode (e.g. a running
 * quiz). On small screens the CSS then hides the app bars so the task gets
 * the whole screen.
 */
export function useFocusMode(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.setAttribute("data-focus-mode", "true");
    return () => root.removeAttribute("data-focus-mode");
  }, [active]);
}
