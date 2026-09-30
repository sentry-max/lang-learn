import { DEFAULT_PREFERENCES, Preferences, normalizePreferences } from "@domain/entities/Preferences";

const STORAGE_KEY = "lang-learn:appearance";

type Appearance = Pick<Preferences, "theme" | "fontSize" | "reduceMotion">;

/**
 * Applies theme, font size and reduced motion to <html>. Mirrored to
 * localStorage so the next visit renders correctly before the profile
 * (the source of truth, in Supabase) has loaded.
 */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  if (appearance.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", appearance.theme);
  root.setAttribute("data-font-size", appearance.fontSize);
  root.setAttribute("data-reduce-motion", String(appearance.reduceMotion));
  syncThemeColor(appearance.theme);
  try {
    const { theme, fontSize, reduceMotion } = appearance;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, fontSize, reduceMotion }));
  } catch {
    // Storage unavailable: it still applies for this visit.
  }
}

const THEME_COLORS = { light: "#f4f5fb", dark: "#0e1120" };

/** The mobile browser bar follows the app's theme, not only the OS one. */
function syncThemeColor(theme: Appearance["theme"]): void {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const own = meta.media.includes("dark") ? THEME_COLORS.dark : THEME_COLORS.light;
    meta.content = theme === "system" ? own : THEME_COLORS[theme];
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

/** True when animations should be skipped (user setting or OS setting). */
export function prefersReducedMotion(): boolean {
  if (document.documentElement.getAttribute("data-reduce-motion") === "true") return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
