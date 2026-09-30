import { VocabularyReview } from "@domain/entities/VocabularyReview";

export interface VocabularyReviewRepository {
  listForVocabulary(vocabularyId: string): Promise<VocabularyReview[]>;
  /** Creates or replaces the user's review (reviving a soft-deleted one). */
  upsert(userId: string, vocabularyId: string, rating: number, comment: string): Promise<void>;
  softDelete(userId: string, vocabularyId: string): Promise<void>;
}
