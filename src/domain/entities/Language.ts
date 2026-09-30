/**
 * Languages words can be learned in / translated to. The app is language
 * agnostic; only these three are enabled for now (mirrors the `languages`
 * table in supabase/schema.sql). Adding one means adding it here, to the
 * table, and (optionally) a grammar profile below.
 */
export type LanguageCode = "de" | "en" | "fa";

export interface LanguageInfo {
  code: LanguageCode;
  englishName: string;
  nativeName: string;
  rtl: boolean;
  /** BCP-47 locale used for case-folding and sorting */
  locale: string;
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  de: { code: "de", englishName: "German", nativeName: "Deutsch", rtl: false, locale: "de" },
  en: { code: "en", englishName: "English", nativeName: "English", rtl: false, locale: "en" },
  fa: { code: "fa", englishName: "Persian", nativeName: "فارسی", rtl: true, locale: "fa" },
};

export const SUPPORTED_LANGUAGES: LanguageCode[] = ["de", "en", "fa"];

/** Used when a word has no translation in the user's primary language. */
export const FALLBACK_LANGUAGE: LanguageCode = "en";

export const DEFAULT_PRIMARY_LANGUAGE: LanguageCode = "fa";

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

export function isRtl(language: LanguageCode): boolean {
  return LANGUAGES[language].rtl;
}

export function languageLabel(language: LanguageCode): string {
  return LANGUAGES[language].nativeName;
}

/**
 * Which grammar fields make sense for words of a language. The word form
 * only shows the inputs that apply, and import validation only requires
 * them where the language actually has them.
 */
export interface GrammarProfile {
  /** Allowed articles for nouns, or null if the language has no gendered articles */
  articles: string[] | null;
  hasPlural: boolean;
  hasVerbForms: boolean;
  /** Imports must include verb forms for verbs */
  verbFormsRequired: boolean;
  hasSeparableVerbs: boolean;
  hasAuxiliaryChoice: boolean;
}

export const GRAMMAR_PROFILES: Record<LanguageCode, GrammarProfile> = {
  de: {
    articles: ["der", "die", "das"],
    hasPlural: true,
    hasVerbForms: true,
    verbFormsRequired: true,
    hasSeparableVerbs: true,
    hasAuxiliaryChoice: true,
  },
  en: {
    articles: null,
    hasPlural: true,
    hasVerbForms: true,
    verbFormsRequired: false,
    hasSeparableVerbs: false,
    hasAuxiliaryChoice: false,
  },
  fa: {
    articles: null,
    hasPlural: true,
    hasVerbForms: false,
    verbFormsRequired: false,
    hasSeparableVerbs: false,
    hasAuxiliaryChoice: false,
  },
};

/** UI languages are the ones the interface itself is translated into. */
export type UiLanguage = "fa" | "en";

export const UI_LANGUAGES: UiLanguage[] = ["fa", "en"];

export const DEFAULT_UI_LANGUAGE: UiLanguage = "fa";

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "fa" || value === "en";
}
