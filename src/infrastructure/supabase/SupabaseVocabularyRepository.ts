import { SupabaseClient } from "@supabase/supabase-js";
import {
  VocabularyEntry,
  normalizeSentenceTranslationsMap,
  normalizeTranslationsMap,
} from "@domain/entities/VocabularyEntry";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { toAppError } from "@domain/errors/AppError";
import { throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";

/** Row shape as stored in the `vocabulary_entries` table (see supabase/schema.sql). */
interface VocabularyRow {
  id: string;
  word_type: string;
  headword: string;
  translations: unknown;
  noun_forms: VocabularyEntry["nounForms"] | null;
  verb_forms: VocabularyEntry["verbForms"] | null;
  sentences: unknown;
  level: VocabularyEntry["level"];
  tags: string[];
  regional_variant: string | null;
}

/**
 * Normalizes a row's sentences to the current per-language shape, tolerating
 * rows written before multi-language support (which had a plain "english"
 * field instead of "translations").
 */
function normalizeSentences(raw: unknown): VocabularyEntry["sentences"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const sentence = s as Record<string, unknown>;
    const translations =
      "translations" in sentence
        ? normalizeSentenceTranslationsMap(sentence.translations)
        : normalizeSentenceTranslationsMap(sentence.english); // legacy field
    return { german: String(sentence.german ?? ""), translations };
  });
}

function rowToEntry(row: VocabularyRow): VocabularyEntry {
  return {
    id: row.id,
    wordType: row.word_type as VocabularyEntry["wordType"],
    headword: row.headword,
    translations: normalizeTranslationsMap(row.translations),
    nounForms: row.noun_forms ?? undefined,
    verbForms: row.verb_forms ?? undefined,
    sentences: normalizeSentences(row.sentences),
    level: row.level,
    tags: row.tags ?? [],
    regionalVariant: row.regional_variant ?? undefined,
  };
}

function entryToRow(entry: VocabularyEntry): VocabularyRow {
  return {
    id: entry.id,
    word_type: entry.wordType,
    headword: entry.headword,
    translations: entry.translations,
    noun_forms: entry.nounForms ?? null,
    verb_forms: entry.verbForms ?? null,
    sentences: entry.sentences,
    level: entry.level,
    tags: entry.tags,
    regional_variant: entry.regionalVariant ?? null,
  };
}

export class SupabaseVocabularyRepository implements VocabularyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<VocabularyEntry[]> {
    try {
      const { data, error } = await this.client.from("vocabulary_entries").select("*");
      throwIfSupabaseError(error, "Failed to load vocabulary.");
      return (data as VocabularyRow[]).map(rowToEntry);
    } catch (err) {
      throw toAppError(err, "Failed to load vocabulary.");
    }
  }

  async getById(id: string): Promise<VocabularyEntry | null> {
    try {
      const { data, error } = await this.client
        .from("vocabulary_entries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      throwIfSupabaseError(error, "Failed to load that vocabulary entry.");
      return data ? rowToEntry(data as VocabularyRow) : null;
    } catch (err) {
      throw toAppError(err, "Failed to load that vocabulary entry.");
    }
  }

  async saveMany(entries: VocabularyEntry[]): Promise<void> {
    try {
      const rows = entries.map(entryToRow);
      const { error } = await this.client
        .from("vocabulary_entries")
        .upsert(rows, { onConflict: "id" });
      throwIfSupabaseError(error, "Failed to save vocabulary.");
    } catch (err) {
      throw toAppError(err, "Failed to save vocabulary.");
    }
  }

  async count(): Promise<number> {
    try {
      const { count, error } = await this.client
        .from("vocabulary_entries")
        .select("*", { count: "exact", head: true });
      throwIfSupabaseError(error, "Failed to count vocabulary.");
      return count ?? 0;
    } catch (err) {
      throw toAppError(err, "Failed to count vocabulary.");
    }
  }

  async deleteById(id: string): Promise<void> {
    try {
      const { error } = await this.client.from("vocabulary_entries").delete().eq("id", id);
      throwIfSupabaseError(error, "Failed to delete that vocabulary entry.");
    } catch (err) {
      throw toAppError(err, "Failed to delete that vocabulary entry.");
    }
  }

  async deleteAll(): Promise<void> {
    try {
      // "id is not null" matches every row — Supabase requires an explicit filter on delete.
      const { error } = await this.client.from("vocabulary_entries").delete().not("id", "is", null);
      throwIfSupabaseError(error, "Failed to delete vocabulary.");
    } catch (err) {
      throw toAppError(err, "Failed to delete vocabulary.");
    }
  }
}
