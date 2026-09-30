/** A user's star rating (1-5) and optional written review of a published vocabulary. */
export interface VocabularyReview {
  id: string;
  vocabularyId: string;
  userId: string;
  authorName: string | null;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export const REVIEW_COMMENT_MAX = 2000;

export function isValidStarRating(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}
