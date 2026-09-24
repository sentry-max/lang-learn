/**
 * Domain entities for a German vocabulary entry.
 * These types describe the shape of imported vocabulary data (JSON)
 * and contain no framework or persistence concerns.
 */

import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, LanguageCode } from "@domain/entities/Language";

export type WordType =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "preposition"
  | "conjunction"
  | "pronoun"
  | "numeral"
  | "phrase"
  | "other";

export type GrammaticalGender = "der" | "die" | "das" | null;

/** Full conjugation set for a verb, covering the forms the user asked for. */
export interface VerbForms {
  infinitive: string;
  presentThirdPerson: string;
  /** Präteritum (simple past) */
  simplePast: string;
  /** Perfekt, e.g. "hat gemacht" / "ist gefahren" */
  perfect: string;
  /** Vorgangspassiv present tense, e.g. "wird gemacht" — null if not commonly used in passive */
  passive: string | null;
  /** true if the auxiliary verb is "sein" instead of "haben" */
  auxiliaryIsSein: boolean;
  /** true for separable-prefix verbs (trennbare Verben), e.g. "anfangen" */
  separable: boolean;
}

/** Declension info for a noun. */
export interface NounForms {
  article: GrammaticalGender;
  /** Plural form, e.g. "-e", "¨-er", or the full plural word */
  plural: string | null;
}

/**
 * An example sentence, given in German plus a translation for every
 * supported UI language. Only "en" is guaranteed for older/partial data;
 * other languages are optional and fall back to English when missing.
 */
export interface ExampleSentence {
  german: string;
  translations: Partial<Record<LanguageCode, string>>;
}

export interface VocabularyEntry {
  /** Stable unique id, e.g. "b1-noun-abend" — required so progress can be tracked across imports */
  id: string;
  wordType: WordType;
  /** The headword as it appears in dictionaries, without article (e.g. "Abend", "anfangen") */
  headword: string;
  /**
   * Translation(s) per language, first item in each array is the primary sense.
   * A word needs at least one language filled in; missing languages fall
   * back to "en", then to whichever language is present.
   */
  translations: Partial<Record<LanguageCode, string[]>>;
  nounForms?: NounForms;
  verbForms?: VerbForms;
  sentences: ExampleSentence[];
  /** CEFR level tag, defaults to "B1" but kept extensible for future levels */
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  /** Free-form topical tags for filtering, e.g. ["time", "daily-routine"] */
  tags: string[];
  /** Regional variant note, e.g. "CH" for Swiss standard German — optional */
  regionalVariant?: string;
}

/** Renders the headword with its article/prefix, as it would appear on a flashcard. */
export function displayForm(entry: VocabularyEntry): string {
  if (entry.wordType === "noun" && entry.nounForms?.article) {
    return `${entry.nounForms.article} ${entry.headword}`;
  }
  return entry.headword;
}

/**
 * Resolves an entry's translations for the requested language, reporting
 * which language was actually used (may differ from the request if it
 * fell back to English or another available language). UI labels should
 * use the returned `language`, not the requested one, so a label never
 * claims "Persian" when the data only had an English translation.
 */
export function resolveTranslations(
  entry: VocabularyEntry,
  language: LanguageCode
): { language: LanguageCode; values: string[] } {
  const byLanguage = normalizeTranslationsMap(entry.translations);
  if (byLanguage[language]?.length) return { language, values: byLanguage[language]! };
  if (byLanguage[FALLBACK_LANGUAGE]?.length) {
    return { language: FALLBACK_LANGUAGE, values: byLanguage[FALLBACK_LANGUAGE]! };
  }
  const anyEntry = Object.entries(byLanguage).find(([, v]) => v && v.length > 0);
  if (anyEntry) return { language: anyEntry[0] as LanguageCode, values: anyEntry[1] as string[] };
  return { language, values: [] };
}

/** Convenience wrapper over resolveTranslations for callers that only need the strings. */
export function getTranslations(entry: VocabularyEntry, language: LanguageCode): string[] {
  return resolveTranslations(entry, language).values;
}

/** Same as resolveTranslations, for one example sentence's translated text. */
export function resolveSentenceTranslation(
  sentence: ExampleSentence,
  language: LanguageCode
): { language: LanguageCode; value: string } {
  const byLanguage = normalizeSentenceTranslationsMap(sentence.translations);
  if (byLanguage[language]) return { language, value: byLanguage[language]! };
  if (byLanguage[FALLBACK_LANGUAGE]) return { language: FALLBACK_LANGUAGE, value: byLanguage[FALLBACK_LANGUAGE]! };
  const anyEntry = Object.entries(byLanguage).find(([, v]) => typeof v === "string" && v.length > 0);
  if (anyEntry) return { language: anyEntry[0] as LanguageCode, value: anyEntry[1] as string };
  return { language, value: "" };
}

/** Convenience wrapper over resolveSentenceTranslation for callers that only need the text. */
export function getSentenceTranslation(sentence: ExampleSentence, language: LanguageCode): string {
  return resolveSentenceTranslation(sentence, language).value;
}

/**
 * Coerces a translations value into the current per-language shape,
 * accepting legacy formats so previously-imported data (e.g. a plain
 * string array from before multi-language support) keeps working instead
 * of crashing the quiz. Unrecognized shapes become an empty object.
 */
export function normalizeTranslationsMap(
  value: unknown
): Partial<Record<LanguageCode, string[]>> {
  if (Array.isArray(value)) {
    // Legacy shape: a plain string array was always English.
    return { en: value.filter((v): v is string => typeof v === "string") };
  }
  if (typeof value === "object" && value !== null) {
    const result: Partial<Record<LanguageCode, string[]>> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(raw)) {
        const strings = raw.filter((v): v is string => typeof v === "string");
        if (strings.length > 0) result[key as LanguageCode] = strings;
      } else if (typeof raw === "string" && raw.length > 0) {
        // A single string where an array was expected — wrap it defensively.
        result[key as LanguageCode] = [raw];
      }
    }
    return result;
  }
  if (typeof value === "string" && value.length > 0) {
    return { en: [value] };
  }
  return {};
}

/** Same defensive coercion as normalizeTranslationsMap, for a single sentence's translations. */
export function normalizeSentenceTranslationsMap(
  value: unknown
): Partial<Record<LanguageCode, string>> {
  if (typeof value === "string" && value.length > 0) {
    return { en: value };
  }
  if (typeof value === "object" && value !== null) {
    const result: Partial<Record<LanguageCode, string>> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === "string" && raw.length > 0) {
        result[key as LanguageCode] = raw;
      } else if (Array.isArray(raw) && typeof raw[0] === "string") {
        result[key as LanguageCode] = raw[0];
      }
    }
    return result;
  }
  return {};
}

export { DEFAULT_LANGUAGE };
