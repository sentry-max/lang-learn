import { LanguageCode, SUPPORTED_LANGUAGES } from "@domain/entities/Language";

/**
 * A named set of sentence exercises in one language. Drafts are private to their owner; published collections
 * can be found and downloaded by everyone. Practice draws from your own collections (drafts too) and downloaded ones.
 */
export type SentenceCollectionStatus = "draft" | "published";

export const COLLECTION_NAME_MAX = 120;
export const COLLECTION_DESCRIPTION_MAX = 2000;

export interface SentenceCollection {
  id: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  description: string;
  language: LanguageCode;
  status: SentenceCollectionStatus;
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface SentenceCollectionInput {
  name: string;
  description: string;
  language: LanguageCode;
}

export type CollectionValidationError = "name_required" | "name_too_long" | "description_too_long" | "invalid_language";

export function normalizeCollectionInput(input: SentenceCollectionInput): SentenceCollectionInput {
  return { name: input.name.trim(), description: input.description.trim(), language: input.language };
}

export function validateCollectionInput(input: SentenceCollectionInput): CollectionValidationError[] {
  const errors: CollectionValidationError[] = [];
  if (!input.name) errors.push("name_required");
  if (input.name.length > COLLECTION_NAME_MAX) errors.push("name_too_long");
  if (input.description.length > COLLECTION_DESCRIPTION_MAX) errors.push("description_too_long");
  if (!SUPPORTED_LANGUAGES.includes(input.language)) errors.push("invalid_language");
  return errors;
}

/** A collection needs at least one exercise to be published. */
export function canPublish(collection: Pick<SentenceCollection, "exerciseCount">): boolean {
  return collection.exerciseCount > 0;
}
