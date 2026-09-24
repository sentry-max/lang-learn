import { VocabularyEntry } from "@domain/entities/VocabularyEntry";

/**
 * Port for reading and writing vocabulary entries. The domain and application
 * layers depend only on this interface, never on Supabase directly — that
 * keeps the business logic testable and the storage backend swappable.
 */
export interface VocabularyRepository {
  getAll(): Promise<VocabularyEntry[]>;
  getById(id: string): Promise<VocabularyEntry | null>;
  /** Inserts new entries and updates existing ones by id (upsert). */
  saveMany(entries: VocabularyEntry[]): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  count(): Promise<number>;
}
