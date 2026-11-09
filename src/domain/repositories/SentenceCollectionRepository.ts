import { SentenceCollection, SentenceCollectionInput, SentenceCollectionStatus } from "@domain/entities/SentenceCollection";

/** Port for sentence collections, their publication and downloads. Deletions are always soft. */
export interface SentenceCollectionRepository {
  listOwned(userId: string): Promise<SentenceCollection[]>;
  /** Collections the user downloaded that are still published */
  listDownloaded(userId: string): Promise<SentenceCollection[]>;
  /** Published collections of other users, newest first; `search` matches the name */
  listPublished(userId: string, search: string): Promise<SentenceCollection[]>;

  create(ownerId: string, id: string, input: SentenceCollectionInput): Promise<SentenceCollection>;
  update(id: string, input: SentenceCollectionInput): Promise<SentenceCollection>;
  setStatus(id: string, status: SentenceCollectionStatus): Promise<SentenceCollection>;
  softDelete(id: string): Promise<void>;

  download(userId: string, collectionId: string): Promise<void>;
  removeDownload(userId: string, collectionId: string): Promise<void>;
}
