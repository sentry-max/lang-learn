import { Vocabulary, VocabularyInput, VocabularyStatus } from "@domain/entities/Vocabulary";
import { isNetworkError } from "@domain/errors/AppError";
import { FeedQuery, Page, VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { Connectivity, assertOnline } from "@infrastructure/offline/Connectivity";
import { QueryCache } from "@infrastructure/cache/QueryCache";

/**
 * Keeps the last loaded vocabularies (own, downloaded, feed pages) usable
 * offline between visits. Changes need a connection.
 */
export class OfflineVocabularyRepository implements VocabularyRepository {
  constructor(
    private readonly inner: VocabularyRepository,
    private readonly connectivity: Connectivity,
    private readonly cache: QueryCache
  ) {}

  listOwned(userId: string): Promise<Vocabulary[]> {
    return this.cache.read(`vocabularies:owned:${userId}`, () => this.inner.listOwned(userId));
  }

  listDownloaded(userId: string): Promise<Vocabulary[]> {
    return this.cache.read(`vocabularies:downloaded:${userId}`, () => this.inner.listDownloaded(userId));
  }

  listPublished(query: FeedQuery): Promise<Page<Vocabulary>> {
    return this.cache.read(`vocabularies:feed:${JSON.stringify(query)}`, () => this.inner.listPublished(query));
  }

  listDownloadedIds(userId: string): Promise<Set<string>> {
    // Cached as a list: a Set doesn't survive being stored.
    return this.cache
      .read(`vocabularies:downloaded-ids:${userId}`, async () => Array.from(await this.inner.listDownloadedIds(userId)))
      .then((ids) => new Set(ids));
  }

  async getById(id: string): Promise<Vocabulary | null> {
    try {
      return await this.cache.read(`vocabularies:vocabulary:${id}`, () => this.inner.getById(id));
    } catch (error) {
      // Offline: any list loaded earlier may already contain it.
      const known = this.knownVocabularies().find((vocabulary) => vocabulary.id === id);
      if (known && isNetworkError(error)) return known;
      throw error;
    }
  }

  async create(ownerId: string, id: string, input: VocabularyInput): Promise<Vocabulary> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.create(ownerId, id, input);
    } finally {
      this.cache.invalidate("vocabularies:");
    }
  }

  async update(id: string, input: VocabularyInput): Promise<Vocabulary> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.update(id, input);
    } finally {
      this.cache.invalidate("vocabularies:");
    }
  }

  async setStatus(id: string, status: VocabularyStatus): Promise<Vocabulary> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.setStatus(id, status);
    } finally {
      this.cache.invalidate("vocabularies:");
    }
  }

  async softDelete(id: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.softDelete(id);
    } finally {
      this.cache.invalidate("vocabularies:");
    }
  }

  async download(userId: string, vocabularyId: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.download(userId, vocabularyId);
    } finally {
      this.cache.invalidate("vocabularies:");
    }
  }

  async removeDownload(userId: string, vocabularyId: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.removeDownload(userId, vocabularyId);
    } finally {
      this.cache.invalidate("vocabularies:");
    }
  }

  private knownVocabularies(): Vocabulary[] {
    // The cache is shared with other repositories: keep only values that are vocabularies.
    const isVocabulary = (value: unknown): value is Vocabulary => typeof value === "object" && value !== null && "sourceLanguage" in value;
    return this.cache.values().flatMap((value) => {
      if (Array.isArray(value)) return value.filter(isVocabulary);
      if (value && typeof value === "object" && "items" in value) return (value as Page<Vocabulary>).items;
      return isVocabulary(value) ? [value] : [];
    });
  }
}
