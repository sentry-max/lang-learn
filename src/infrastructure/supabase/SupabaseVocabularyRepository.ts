import { SupabaseClient } from "@supabase/supabase-js";
import {
  VocabularyEntry,
  normalizeSentenceTranslationsMap,
  normalizeTranslationsMap,
} from "@domain/entities/VocabularyEntry";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";

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
  async deleteById(id: string): Promise<void> {
    const { error } = await this.client
      .from("vocabulary_entries")
      .delete()
      .eq("id", id);
    if (error)
      throw new Error(
        `Failed to delete vocabulary entry ${id}: ${error.message}`,
      );
  }

  async deleteAll(): Promise<void> {
    // PostgREST rejects a DELETE with no filter, so match every row explicitly.
    const { error } = await this.client
      .from("vocabulary_entries")
      .delete()
      .not("id", "is", null);
    if (error)
      throw new Error(`Failed to delete all vocabulary: ${error.message}`);
  }

  async getAll(): Promise<VocabularyEntry[]> {
    // Supabase/PostgREST caps a single response at the project's "Max Rows"
    // setting (1000 by default), regardless of how many rows match the query.
    // Page through with .range() so we always get everything, no matter the
    // table size or that project setting.
    const pageSize = 1000;
    const allRows: VocabularyRow[] = [];
    let from = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await this.client
        .from("vocabulary_entries")
        .select("*")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Failed to load vocabulary: ${error.message}`);
      if (!data || data.length === 0) break;

      allRows.push(...(data as VocabularyRow[]));
      if (data.length < pageSize) break; // last page
      from += pageSize;
    }

    return allRows.map(rowToEntry);
  }

  async getById(id: string): Promise<VocabularyEntry | null> {
    const { data, error } = await this.client
      .from("vocabulary_entries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new Error(
        `Failed to load vocabulary entry ${id}: ${error.message}`,
      );
    return data ? rowToEntry(data as VocabularyRow) : null;
  }

  async saveMany(entries: VocabularyEntry[]): Promise<void> {
    const rows = entries.map(entryToRow);
    const { error } = await this.client
      .from("vocabulary_entries")
      .upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Failed to save vocabulary: ${error.message}`);
  }

  async count(): Promise<number> {
    const { count, error } = await this.client
      .from("vocabulary_entries")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`Failed to count vocabulary: ${error.message}`);
    return count ?? 0;
  }
}
