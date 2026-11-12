import { SentenceExercise } from "@domain/entities/SentenceExercise";

/** Port for sentence exercises. Every exercise belongs to exactly one collection; deletions are soft. */
export interface SentenceExerciseRepository {
  listByCollections(collectionIds: string[]): Promise<SentenceExercise[]>;
  /** Inserts new exercises and updates existing ones by id. */
  saveMany(exercises: SentenceExercise[]): Promise<void>;
}
