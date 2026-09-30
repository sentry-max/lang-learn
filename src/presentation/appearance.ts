import { DEFAULT_PREFERENCES, Preferences, normalizePreferences } from "@domain/entities/Preferences";

const STORAGE_KEY = "lang-learn:appearance";

type Appearance = Pick<Preferences, "theme" | "fontSize" | "reduceMotion" | "liquidGlass">;

const listeners = new Set<() => void>();

/**
 * Applies theme, font size, reduced motion and the Liquid Glass style to
 * <html>. Mirrored to localStorage so the next visit renders correctly
 * before the profile (the source of truth, in Supabase) has loaded.
 */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  const wasLiquid = isLiquidGlass();
  if (appearance.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", appearance.theme);
  root.setAttribute("data-font-size", appearance.fontSize);
  root.setAttribute("data-reduce-motion", String(appearance.reduceMotion));
  if (appearance.liquidGlass) root.setAttribute("data-style", "liquid");
  else root.removeAttribute("data-style");
  syncThemeColor(appearance.theme, appearance.liquidGlass);
  try {
    const { theme, fontSize, reduceMotion, liquidGlass } = appearance;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, fontSize, reduceMotion, liquidGlass }));
  } catch {
    // Storage unavailable: it still applies for this visit.
  }
  if (wasLiquid !== appearance.liquidGlass) listeners.forEach((listener) => listener());
}

const THEME_COLORS = {
  classic: { light: "#f4f5fb", dark: "#0e1120" },
  liquid: { light: "#f2f2f7", dark: "#000000" },
};

/** The mobile browser bar follows the app's theme, not only the OS one. */
function syncThemeColor(theme: Appearance["theme"], liquid: boolean): void {
  const colors = THEME_COLORS[liquid ? "liquid" : "classic"];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const own = meta.media.includes("dark") ? colors.dark : colors.light;
    meta.content = theme === "system" ? own : colors[theme];
  });
}

export function applyStoredAppearance(): void {
  let stored: unknown = null;
  try {
    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    stored = null;
  }
  applyAppearance(stored ? normalizePreferences(stored) : DEFAULT_PREFERENCES);
}

/** Whether the Liquid Glass style is on right now. */
export function isLiquidGlass(): boolean {
  return document.documentElement.getAttribute("data-style") === "liquid";
}

/** Notifies when the Liquid Glass style is switched on or off (for components that draw differently). */
export function subscribeLiquidGlass(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when animations should be skipped (user setting or OS setting). */
export function prefersReducedMotion(): boolean {
  if (document.documentElement.getAttribute("data-reduce-motion") === "true") return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
