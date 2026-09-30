import { VocabularyReview } from "@domain/entities/VocabularyReview";
import { VocabularyReviewRepository } from "@domain/repositories/VocabularyReviewRepository";
import { Connectivity } from "@infrastructure/offline/Connectivity";
import { OfflineReadCache, assertOnline } from "@infrastructure/offline/OfflineReadCache";

/** Reviews already loaded stay readable offline; writing one needs a connection. */
export class OfflineVocabularyReviewRepository implements VocabularyReviewRepository {
  private readonly cache: OfflineReadCache;

  constructor(
    private readonly inner: VocabularyReviewRepository,
    private readonly connectivity: Connectivity
  ) {
    this.cache = new OfflineReadCache(connectivity);
  }

  listForVocabulary(vocabularyId: string): Promise<VocabularyReview[]> {
    return this.cache.read(`reviews:${vocabularyId}`, () => this.inner.listForVocabulary(vocabularyId));
  }

  async upsert(userId: string, vocabularyId: string, rating: number, comment: string): Promise<void> {
    assertOnline(this.connectivity);
    return this.inner.upsert(userId, vocabularyId, rating, comment);
  }

  async softDelete(userId: string, vocabularyId: string): Promise<void> {
    assertOnline(this.connectivity);
    return this.inner.softDelete(userId, vocabularyId);
  }
}
