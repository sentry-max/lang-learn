/**
 * Languages the app can show translations and UI text in.
 * Persian ("fa") is the default; English ("en") is the fallback used
 * whenever an entry has no translation for the currently selected language.
 * Add a new code here to support another language app-wide.
 */
export type LanguageCode = "fa" | "en";

export const SUPPORTED_LANGUAGES: LanguageCode[] = ["fa", "en"];

export const DEFAULT_LANGUAGE: LanguageCode = "fa";

export const FALLBACK_LANGUAGE: LanguageCode = "en";

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  fa: "فارسی",
  en: "English",
};

export const RTL_LANGUAGES: LanguageCode[] = ["fa"];

export function isRtl(language: LanguageCode): boolean {
  return RTL_LANGUAGES.includes(language);
}
