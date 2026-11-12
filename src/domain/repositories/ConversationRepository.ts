import { Conversation, ConversationContent, ConversationStatus } from "@domain/entities/Conversation";

/** Port for conversations, their publication and downloads. Deletions are always soft. */
export interface ConversationRepository {
  listOwned(userId: string): Promise<Conversation[]>;
  /** Conversations the user downloaded that are still published */
  listDownloaded(userId: string): Promise<Conversation[]>;
  /** Published conversations of other users, newest first; `search` matches the title */
  listPublished(userId: string, search: string): Promise<Conversation[]>;

  create(ownerId: string, id: string, content: ConversationContent): Promise<Conversation>;
  /** Replaces the content (a re-import of the same key) */
  update(id: string, content: ConversationContent): Promise<Conversation>;
  setStatus(id: string, status: ConversationStatus): Promise<Conversation>;
  softDelete(id: string): Promise<void>;

  download(userId: string, conversationId: string): Promise<void>;
  removeDownload(userId: string, conversationId: string): Promise<void>;
}
