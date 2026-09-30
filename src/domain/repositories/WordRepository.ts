import { Word } from "@domain/entities/Word";

/** Port for words. Every word belongs to exactly one vocabulary; deletions are soft. */
export interface WordRepository {
  listByVocabularies(vocabularyIds: string[]): Promise<Word[]>;
  getByIds(ids: string[]): Promise<Word[]>;
  /** Inserts new words and updates existing ones by id. */
  saveMany(words: Word[]): Promise<void>;
  softDelete(words: Pick<Word, "id" | "vocabularyId">[]): Promise<void>;
}
