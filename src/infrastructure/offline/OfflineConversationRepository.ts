import { Conversation, ConversationContent, ConversationStatus } from "@domain/entities/Conversation";
import { ConversationRepository } from "@domain/repositories/ConversationRepository";
import { Connectivity, assertOnline } from "@infrastructure/offline/Connectivity";
import { QueryCache } from "@infrastructure/cache/QueryCache";

/** Keeps the last loaded conversations usable offline between visits. Changes need a connection. */
export class OfflineConversationRepository implements ConversationRepository {
  constructor(
    private readonly inner: ConversationRepository,
    private readonly connectivity: Connectivity,
    private readonly cache: QueryCache
  ) {}

  listOwned(userId: string): Promise<Conversation[]> {
    return this.cache.read(`conversations:owned:${userId}`, () => this.inner.listOwned(userId));
  }

  listDownloaded(userId: string): Promise<Conversation[]> {
    return this.cache.read(`conversations:downloaded:${userId}`, () => this.inner.listDownloaded(userId));
  }

  listPublished(userId: string, search: string): Promise<Conversation[]> {
    return this.cache.read(`conversations:published:${userId}:${search}`, () => this.inner.listPublished(userId, search));
  }

  create(ownerId: string, id: string, content: ConversationContent): Promise<Conversation> {
    return this.write(() => this.inner.create(ownerId, id, content));
  }

  update(id: string, content: ConversationContent): Promise<Conversation> {
    return this.write(() => this.inner.update(id, content));
  }

  setStatus(id: string, status: ConversationStatus): Promise<Conversation> {
    return this.write(() => this.inner.setStatus(id, status));
  }

  softDelete(id: string): Promise<void> {
    return this.write(() => this.inner.softDelete(id));
  }

  download(userId: string, conversationId: string): Promise<void> {
    return this.write(() => this.inner.download(userId, conversationId));
  }

  removeDownload(userId: string, conversationId: string): Promise<void> {
    return this.write(() => this.inner.removeDownload(userId, conversationId));
  }

  private async write<T>(change: () => Promise<T>): Promise<T> {
    assertOnline(this.connectivity);
    try {
      return await change();
    } finally {
      this.cache.invalidate("conversations:");
    }
  }
}
