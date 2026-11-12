import { SentenceCollection, SentenceCollectionInput, SentenceCollectionStatus } from "@domain/entities/SentenceCollection";
import { SentenceCollectionRepository } from "@domain/repositories/SentenceCollectionRepository";
import { Connectivity, assertOnline } from "@infrastructure/offline/Connectivity";
import { QueryCache } from "@infrastructure/cache/QueryCache";

/** Keeps the last loaded sentence collections usable offline between visits. Changes need a connection. */
export class OfflineSentenceCollectionRepository implements SentenceCollectionRepository {
  constructor(
    private readonly inner: SentenceCollectionRepository,
    private readonly connectivity: Connectivity,
    private readonly cache: QueryCache
  ) {}

  listOwned(userId: string): Promise<SentenceCollection[]> {
    return this.cache.read(`collections:owned:${userId}`, () => this.inner.listOwned(userId));
  }

  listDownloaded(userId: string): Promise<SentenceCollection[]> {
    return this.cache.read(`collections:downloaded:${userId}`, () => this.inner.listDownloaded(userId));
  }

  listPublished(userId: string, search: string): Promise<SentenceCollection[]> {
    return this.cache.read(`collections:published:${userId}:${search}`, () => this.inner.listPublished(userId, search));
  }

  async create(ownerId: string, id: string, input: SentenceCollectionInput): Promise<SentenceCollection> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.create(ownerId, id, input);
    } finally {
      this.cache.invalidate("collections:");
    }
  }

  async update(id: string, input: SentenceCollectionInput): Promise<SentenceCollection> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.update(id, input);
    } finally {
      this.cache.invalidate("collections:");
    }
  }

  async setStatus(id: string, status: SentenceCollectionStatus): Promise<SentenceCollection> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.setStatus(id, status);
    } finally {
      this.cache.invalidate("collections:");
    }
  }

  async softDelete(id: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.softDelete(id);
    } finally {
      this.cache.invalidate("collections:");
    }
  }

  async download(userId: string, collectionId: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.download(userId, collectionId);
    } finally {
      this.cache.invalidate("collections:");
    }
  }

  async removeDownload(userId: string, collectionId: string): Promise<void> {
    assertOnline(this.connectivity);
    try {
      return await this.inner.removeDownload(userId, collectionId);
    } finally {
      this.cache.invalidate("collections:");
    }
  }
}
