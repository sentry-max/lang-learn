import { LanguageCode, SUPPORTED_LANGUAGES } from "@domain/entities/Language";

/**
 * A named collection of words. Drafts are private to their owner and never
 * appear in quizzes; published vocabularies are visible in the feed, can be
 * downloaded by others, and are the only ones quizzes draw from.
 */
export type VocabularyStatus = "draft" | "published";

export const MIN_PUBLISH_WORDS = 50;
export const MAX_VOCABULARY_WORDS = 5000;
export const VOCABULARY_NAME_MAX = 120;
export const VOCABULARY_DESCRIPTION_MAX = 2000;

export interface Vocabulary {
  id: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  description: string;
  sourceLanguage: LanguageCode;
  targetLanguages: LanguageCode[];
  status: VocabularyStatus;
  wordCount: number;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface VocabularyInput {
  name: string;
  description: string;
  sourceLanguage: LanguageCode;
  targetLanguages: LanguageCode[];
}

export type VocabularyValidationError =
  | "name_required"
  | "name_too_long"
  | "description_too_long"
  | "invalid_language"
  | "target_same_as_source";

export function validateVocabularyInput(input: VocabularyInput): VocabularyValidationError[] {
  const errors: VocabularyValidationError[] = [];
  const name = input.name.trim();
  if (!name) errors.push("name_required");
  if (name.length > VOCABULARY_NAME_MAX) errors.push("name_too_long");
  if (input.description.length > VOCABULARY_DESCRIPTION_MAX) errors.push("description_too_long");
  const languages = [input.sourceLanguage, ...input.targetLanguages];
  if (languages.some((code) => !SUPPORTED_LANGUAGES.includes(code))) errors.push("invalid_language");
  if (input.targetLanguages.includes(input.sourceLanguage)) errors.push("target_same_as_source");
  return errors;
}

export function normalizeVocabularyInput(input: VocabularyInput): VocabularyInput {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    sourceLanguage: input.sourceLanguage,
    targetLanguages: Array.from(new Set(input.targetLanguages)).filter((code) => code !== input.sourceLanguage),
  };
}

export type PublishBlocker = "too_few_words" | "too_many_words" | null;

export function publishBlocker(wordCount: number): PublishBlocker {
  if (wordCount < MIN_PUBLISH_WORDS) return "too_few_words";
  if (wordCount > MAX_VOCABULARY_WORDS) return "too_many_words";
  return null;
}

export function isFull(vocabulary: Pick<Vocabulary, "wordCount">): boolean {
  return vocabulary.wordCount >= MAX_VOCABULARY_WORDS;
}

/** Only published vocabularies feed the quiz — even for their owner. */
export function isQuizEligible(vocabulary: Pick<Vocabulary, "status">): boolean {
  return vocabulary.status === "published";
}
