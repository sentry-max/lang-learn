import { AppError } from "@domain/errors/AppError";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { REVIEW_COMMENT_MAX, VocabularyReview, isValidStarRating } from "@domain/entities/VocabularyReview";
import { VocabularyReviewRepository } from "@domain/repositories/VocabularyReviewRepository";

/** Star ratings and written reviews of published vocabularies. */
export class VocabularyReviewService {
  constructor(private readonly reviews: VocabularyReviewRepository) {}

  list(vocabularyId: string): Promise<VocabularyReview[]> {
    return this.reviews.listForVocabulary(vocabularyId);
  }

  canReview(userId: string, vocabulary: Vocabulary): boolean {
    return vocabulary.status === "published" && vocabulary.ownerId !== userId;
  }

  async save(userId: string, vocabulary: Vocabulary, rating: number, comment: string): Promise<void> {
    if (!this.canReview(userId, vocabulary)) {
      throw new AppError("forbidden", "You can only review published vocabularies by other people.");
    }
    const text = comment.trim();
    if (!isValidStarRating(rating) || text.length > REVIEW_COMMENT_MAX) {
      throw new AppError("validation", "Pick 1 to 5 stars and keep the review under 2000 characters.", {
        reason: "invalid_input",
      });
    }
    return this.reviews.upsert(userId, vocabulary.id, rating, text);
  }

  delete(userId: string, vocabularyId: string): Promise<void> {
    return this.reviews.softDelete(userId, vocabularyId);
  }
}
