import { SupabaseClient } from "@supabase/supabase-js";
import { SentenceExercise } from "@domain/entities/SentenceExercise";
import { SentenceExerciseRepository } from "@domain/repositories/SentenceExerciseRepository";
import { parseSentenceInput } from "@domain/services/SentenceParser";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import { WRITE_CHUNK_SIZE, chunk, fetchAllPages, unique } from "@infrastructure/supabase/queryHelpers";

const EXERCISE_COLUMNS = "id, collection_id, external_id, kind, content, translations, hint, level, tags";

/** Collection ids per request (each may hold up to 2000 rows, paged). */
const COLLECTION_CHUNK_SIZE = 50;

interface ExerciseRow {
  id: string;
  collection_id: string;
  external_id: string | null;
  kind: string;
  content: unknown;
  translations: unknown;
  hint: string | null;
  level: string | null;
  tags: string[] | null;
}

/** Stored JSON is untrusted: a row goes through the import parser, and one that no longer passes is left out. */
function rowToExercise(row: ExerciseRow): SentenceExercise | null {
  const content = typeof row.content === "object" && row.content !== null ? row.content : {};
  const parsed = parseSentenceInput(
    { ...content, kind: row.kind, id: row.external_id, translations: row.translations, hint: row.hint, level: row.level, tags: row.tags },
    0
  );
  return parsed.ok ? { ...parsed.exercise, id: row.id, collectionId: row.collection_id } : null;
}

/** owner_id is deliberately absent: the database derives it from the collection. */
function exerciseToRow(exercise: SentenceExercise) {
  return {
    id: exercise.id,
    collection_id: exercise.collectionId,
    external_id: exercise.externalId,
    kind: exercise.content.kind,
    content: exercise.content,
    translations: exercise.translations,
    hint: exercise.hint,
    level: exercise.level,
    tags: exercise.tags,
  };
}

export class SupabaseSentenceExerciseRepository implements SentenceExerciseRepository {
  constructor(private readonly client: SupabaseClient) {}

  listByCollections(collectionIds: string[]): Promise<SentenceExercise[]> {
    return guard("Failed to load sentence exercises.", async () => {
      const exercises: SentenceExercise[] = [];
      for (const ids of chunk(unique(collectionIds), COLLECTION_CHUNK_SIZE)) {
        const rows = await fetchAllPages<ExerciseRow>(
          (from, to) =>
            this.client
              .from("sentence_exercises")
              .select(EXERCISE_COLUMNS)
              .in("collection_id", ids)
              .is("deleted_at", null)
              .order("id")
              .range(from, to)
              .returns<ExerciseRow[]>(),
          "Failed to load sentence exercises."
        );
        exercises.push(...rows.flatMap((row) => rowToExercise(row) ?? []));
      }
      return exercises;
    });
  }

  saveMany(exercises: SentenceExercise[]): Promise<void> {
    return guard("Failed to save sentence exercises.", async () => {
      for (const rows of chunk(exercises.map(exerciseToRow), WRITE_CHUNK_SIZE)) {
        const { error } = await this.client.from("sentence_exercises").upsert(rows, { onConflict: "id" });
        throwIfSupabaseError(error, "Failed to save sentence exercises.");
      }
    });
  }
}
