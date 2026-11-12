import { VocabularyReview } from "@domain/entities/VocabularyReview";
import { VocabularyReviewRepository } from "@domain/repositories/VocabularyReviewRepository";
import { Connectivity, assertOnline } from "@infrastructure/offline/Connectivity";
import { QueryCache } from "@infrastructure/cache/QueryCache";

/** Reviews already loaded stay readable offline; writing one needs a connection. */
export class OfflineVocabularyReviewRepository implements VocabularyReviewRepository {
  constructor(
    private readonly inner: VocabularyReviewRepository,
    private readonly connectivity: Connectivity,
    private readonly cache: QueryCache
  ) {}

  listForVocabulary(vocabularyId: string): Promise<VocabularyReview[]> {
    return this.cache.read(`reviews:reviews:${vocabularyId}`, () => this.inner.listForVocabulary(vocabularyId));
  }

  async upsert(userId: string, vocabularyId: string, rating: number, comment: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.upsert(userId, vocabularyId, rating, comment);
    } finally {
      this.cache.invalidate("reviews:");
      this.cache.invalidate("vocabularies:");
    }
  }

  async softDelete(userId: string, vocabularyId: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.softDelete(userId, vocabularyId);
    } finally {
      this.cache.invalidate("reviews:");
      this.cache.invalidate("vocabularies:");
    }
  }
}
