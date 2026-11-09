import { SentenceExercise } from "@domain/entities/SentenceExercise";
import { SentenceExerciseRepository } from "@domain/repositories/SentenceExerciseRepository";
import { Connectivity, assertOnline } from "@infrastructure/offline/Connectivity";
import { QueryCache } from "@infrastructure/cache/QueryCache";

/** Keeps the last loaded sentence exercises usable offline between visits. Imports need a connection. */
export class OfflineSentenceExerciseRepository implements SentenceExerciseRepository {
  constructor(
    private readonly inner: SentenceExerciseRepository,
    private readonly connectivity: Connectivity,
    private readonly cache: QueryCache
  ) {}

  listByCollections(collectionIds: string[]): Promise<SentenceExercise[]> {
    const key = [...collectionIds].sort().join(",");
    return this.cache.read(`exercises:${key}`, () => this.inner.listByCollections(collectionIds));
  }

  async saveMany(exercises: SentenceExercise[]): Promise<void> {
    assertOnline(this.connectivity);
    try {
      await this.inner.saveMany(exercises);
    } finally {
      this.cache.invalidate("exercises:");
      this.cache.invalidate("collections:");
    }
  }
}
