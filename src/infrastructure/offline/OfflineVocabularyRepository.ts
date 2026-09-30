import { Vocabulary, VocabularyInput, VocabularyStatus } from "@domain/entities/Vocabulary";
import { isNetworkError } from "@domain/errors/AppError";
import { FeedQuery, Page, VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { Connectivity } from "@infrastructure/offline/Connectivity";
import { OfflineReadCache, assertOnline } from "@infrastructure/offline/OfflineReadCache";

/**
 * Keeps the last loaded vocabularies (own, downloaded, feed pages) usable
 * offline for the life of the tab. Changes need a connection.
 */
export class OfflineVocabularyRepository implements VocabularyRepository {
  private readonly cache: OfflineReadCache;

  constructor(
    private readonly inner: VocabularyRepository,
    private readonly connectivity: Connectivity
  ) {
    this.cache = new OfflineReadCache(connectivity);
  }

  listOwned(userId: string): Promise<Vocabulary[]> {
    return this.cache.read(`owned:${userId}`, () => this.inner.listOwned(userId));
  }

  listDownloaded(userId: string): Promise<Vocabulary[]> {
    return this.cache.read(`downloaded:${userId}`, () => this.inner.listDownloaded(userId));
  }

  listPublished(query: FeedQuery): Promise<Page<Vocabulary>> {
    return this.cache.read(`feed:${JSON.stringify(query)}`, () => this.inner.listPublished(query));
  }

  listDownloadedIds(userId: string): Promise<Set<string>> {
    return this.cache.read(`downloaded-ids:${userId}`, () => this.inner.listDownloadedIds(userId));
  }

  async getById(id: string): Promise<Vocabulary | null> {
    try {
      return await this.cache.read(`vocabulary:${id}`, () => this.inner.getById(id));
    } catch (err) {
      // Offline: any list loaded earlier may already contain it.
      const known = this.knownVocabularies().find((v) => v.id === id);
      if (known && isNetworkError(err)) return known;
      throw err;
    }
  }

  async create(ownerId: string, id: string, input: VocabularyInput): Promise<Vocabulary> {
    assertOnline(this.connectivity);
    return this.inner.create(ownerId, id, input);
  }

  async update(id: string, input: VocabularyInput): Promise<Vocabulary> {
    assertOnline(this.connectivity);
    return this.inner.update(id, input);
  }

  async setStatus(id: string, status: VocabularyStatus): Promise<Vocabulary> {
    assertOnline(this.connectivity);
    return this.inner.setStatus(id, status);
  }

  async softDelete(id: string): Promise<void> {
    assertOnline(this.connectivity);
    return this.inner.softDelete(id);
  }

  async download(userId: string, vocabularyId: string): Promise<void> {
    assertOnline(this.connectivity);
    return this.inner.download(userId, vocabularyId);
  }

  async removeDownload(userId: string, vocabularyId: string): Promise<void> {
    assertOnline(this.connectivity);
    return this.inner.removeDownload(userId, vocabularyId);
  }

  private knownVocabularies(): Vocabulary[] {
    return this.cache.values().flatMap((value) => {
      if (Array.isArray(value)) return value as Vocabulary[];
      if (value && typeof value === "object" && "items" in value) return (value as Page<Vocabulary>).items;
      return [];
    });
  }
}
