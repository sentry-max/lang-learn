/**
 * A single word (or phrase) inside a vocabulary. Words are language
 * agnostic: the vocabulary they belong to decides the source language,
 * and translations are keyed by language code.
 */

import { FALLBACK_LANGUAGE, LanguageCode, isLanguageCode } from "@domain/entities/Language";

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

export const WORD_TYPES: WordType[] = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "pronoun",
  "numeral",
  "phrase",
  "other",
];

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const CEFR_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export interface VerbForms {
  infinitive: string;
  presentThirdPerson: string;
  simplePast: string;
  perfect: string;
  passive: string | null;
  /** German: auxiliary is "sein" instead of "haben" */
  auxiliaryIsSein: boolean;
  /** German: separable-prefix verb, e.g. "anfangen" */
  separable: boolean;
}

export interface NounForms {
  /** Grammatical article where the language has one (e.g. der/die/das) */
  article: string | null;
  plural: string | null;
}

export type TranslationMap = Partial<Record<LanguageCode, string[]>>;

export type SentenceTranslationMap = Partial<Record<LanguageCode, string>>;

export interface ExampleSentence {
  /** The sentence in the vocabulary's source language */
  text: string;
  translations: SentenceTranslationMap;
}

export interface Word {
  id: string;
  vocabularyId: string;
  /** Stable id from an imported JSON file; re-importing the same id updates the word */
  externalId: string | null;
  wordType: WordType;
  headword: string;
  translations: TranslationMap;
  nounForms?: NounForms;
  verbForms?: VerbForms;
  sentences: ExampleSentence[];
  level: CefrLevel | null;
  tags: string[];
  regionalVariant?: string;
}

/** A word before it has been assigned an id or a vocabulary. */
export type WordDraft = Omit<Word, "id" | "vocabularyId"> & { id?: string };

/** Headword with its article, as it would appear on a flashcard. */
export function displayForm(word: Pick<Word, "wordType" | "headword" | "nounForms">): string {
  if (word.wordType === "noun" && word.nounForms?.article) {
    return `${word.nounForms.article} ${word.headword}`;
  }
  return word.headword;
}

/** Normalized key used to detect duplicate words regardless of casing/whitespace. */
export function headwordKey(word: Pick<Word, "wordType" | "headword">): string {
  return `${word.wordType}:${word.headword.trim().normalize("NFC").toLocaleLowerCase()}`;
}

/**
 * Resolves translations for the requested language, reporting which
 * language was actually used — it falls back to English, then to any
 * language present. Labels must use the returned `language`.
 */
export function resolveTranslations(
  word: Pick<Word, "translations">,
  language: LanguageCode
): { language: LanguageCode; values: string[] } {
  const byLanguage = normalizeTranslationsMap(word.translations);
  if (byLanguage[language]?.length) return { language, values: byLanguage[language]! };
  if (byLanguage[FALLBACK_LANGUAGE]?.length) {
    return { language: FALLBACK_LANGUAGE, values: byLanguage[FALLBACK_LANGUAGE]! };
  }
  const first = (Object.entries(byLanguage) as [LanguageCode, string[]][]).find(([, v]) => v.length > 0);
  if (first) return { language: first[0], values: first[1] };
  return { language, values: [] };
}

export function getTranslations(word: Pick<Word, "translations">, language: LanguageCode): string[] {
  return resolveTranslations(word, language).values;
}

export function resolveSentenceTranslation(
  sentence: ExampleSentence,
  language: LanguageCode
): { language: LanguageCode; value: string } {
  const byLanguage = normalizeSentenceTranslationsMap(sentence.translations);
  if (byLanguage[language]) return { language, value: byLanguage[language]! };
  if (byLanguage[FALLBACK_LANGUAGE]) {
    return { language: FALLBACK_LANGUAGE, value: byLanguage[FALLBACK_LANGUAGE]! };
  }
  const first = (Object.entries(byLanguage) as [LanguageCode, string][]).find(([, v]) => v.length > 0);
  if (first) return { language: first[0], value: first[1] };
  return { language, value: "" };
}

export function getSentenceTranslation(sentence: ExampleSentence, language: LanguageCode): string {
  return resolveSentenceTranslation(sentence, language).value;
}

/** Languages a word has at least one translation for. */
export function translationLanguages(word: Pick<Word, "translations">): LanguageCode[] {
  const byLanguage = normalizeTranslationsMap(word.translations);
  return (Object.keys(byLanguage) as LanguageCode[]).filter((code) => byLanguage[code]!.length > 0);
}

/**
 * Coerces a stored/imported translations value into the current shape.
 * Accepts the legacy plain-array shape (always English) and a single string
 * per language; drops unknown language codes and non-string values.
 */
export function normalizeTranslationsMap(value: unknown): TranslationMap {
  if (Array.isArray(value)) {
    const strings = cleanStrings(value);
    return strings.length > 0 ? { en: strings } : {};
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { en: [trimmed] } : {};
  }
  if (typeof value !== "object" || value === null) return {};

  const result: TranslationMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isLanguageCode(key)) continue;
    const strings = Array.isArray(raw) ? cleanStrings(raw) : cleanStrings([raw]);
    if (strings.length > 0) result[key] = strings;
  }
  return result;
}

/** Same defensive coercion as normalizeTranslationsMap, for one sentence's translations. */
export function normalizeSentenceTranslationsMap(value: unknown): SentenceTranslationMap {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { en: trimmed } : {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const result: SentenceTranslationMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isLanguageCode(key)) continue;
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (typeof candidate === "string" && candidate.trim()) result[key] = candidate.trim();
  }
  return result;
}

/**
 * Normalizes example sentences from any supported shape: the current
 * `{ text, translations }`, the v1 `{ german, translations }`, and the
 * oldest `{ german, english }`.
 */
export function normalizeSentences(value: unknown): ExampleSentence[] {
  if (!Array.isArray(value)) return [];
  const sentences: ExampleSentence[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const s = raw as Record<string, unknown>;
    const text = typeof s.text === "string" ? s.text : typeof s.german === "string" ? s.german : "";
    if (!text.trim()) continue;
    const translations =
      "translations" in s
        ? normalizeSentenceTranslationsMap(s.translations)
        : normalizeSentenceTranslationsMap(s.english);
    sentences.push({ text: text.trim(), translations });
  }
  return sentences;
}

function cleanStrings(values: unknown[]): string[] {
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}
