import { LanguageCode } from "@domain/entities/Language";
import { Vocabulary, VocabularyInput, VocabularyStatus } from "@domain/entities/Vocabulary";

export type FeedSort = "top_rated" | "most_downloaded" | "newest";

export interface FeedQuery {
  search?: string;
  language?: LanguageCode;
  sort: FeedSort;
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/**
 * Port for vocabularies (word collections), their publication state and
 * downloads. Deletions are always soft.
 */
export interface VocabularyRepository {
  listOwned(userId: string): Promise<Vocabulary[]>;
  /** Vocabularies the user downloaded that are still published */
  listDownloaded(userId: string): Promise<Vocabulary[]>;
  listPublished(query: FeedQuery): Promise<Page<Vocabulary>>;
  getById(id: string): Promise<Vocabulary | null>;

  create(ownerId: string, id: string, input: VocabularyInput): Promise<Vocabulary>;
  update(id: string, input: VocabularyInput): Promise<Vocabulary>;
  setStatus(id: string, status: VocabularyStatus): Promise<Vocabulary>;
  softDelete(id: string): Promise<void>;

  listDownloadedIds(userId: string): Promise<Set<string>>;
  download(userId: string, vocabularyId: string): Promise<void>;
  removeDownload(userId: string, vocabularyId: string): Promise<void>;
}
