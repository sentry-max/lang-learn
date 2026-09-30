import { SupabaseClient } from "@supabase/supabase-js";
import {
  CEFR_LEVELS,
  CefrLevel,
  NounForms,
  VerbForms,
  WORD_TYPES,
  Word,
  WordType,
  normalizeSentences,
  normalizeTranslationsMap,
} from "@domain/entities/Word";
import { WordRepository } from "@domain/repositories/WordRepository";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import {
  ID_CHUNK_SIZE,
  WRITE_CHUNK_SIZE,
  chunk,
  fetchAllPages,
  nowIso,
  unique,
} from "@infrastructure/supabase/queryHelpers";

const WORD_COLUMNS =
  "id, vocabulary_id, external_id, word_type, headword, translations, noun_forms, verb_forms, sentences, level, tags, regional_variant";

/** Vocabulary ids per request when listing words (each may hold thousands of rows, paged). */
const VOCABULARY_CHUNK_SIZE = 50;

interface WordRow {
  id: string;
  vocabulary_id: string;
  external_id: string | null;
  word_type: string;
  headword: string;
  translations: unknown;
  noun_forms: NounForms | null;
  verb_forms: VerbForms | null;
  sentences: unknown;
  level: string | null;
  tags: string[] | null;
  regional_variant: string | null;
}

function rowToWord(row: WordRow): Word {
  return {
    id: row.id,
    vocabularyId: row.vocabulary_id,
    externalId: row.external_id,
    wordType: (WORD_TYPES.includes(row.word_type as WordType) ? row.word_type : "other") as WordType,
    headword: row.headword,
    translations: normalizeTranslationsMap(row.translations),
    nounForms: row.noun_forms ?? undefined,
    verbForms: row.verb_forms ?? undefined,
    sentences: normalizeSentences(row.sentences),
    level: CEFR_LEVELS.includes(row.level as CefrLevel) ? (row.level as CefrLevel) : null,
    tags: row.tags ?? [],
    regionalVariant: row.regional_variant ?? undefined,
  };
}

/** owner_id is deliberately absent: the database derives it from the vocabulary. */
function wordToRow(word: Word) {
  return {
    id: word.id,
    vocabulary_id: word.vocabularyId,
    external_id: word.externalId,
    word_type: word.wordType,
    headword: word.headword,
    translations: word.translations,
    noun_forms: word.nounForms ?? null,
    verb_forms: word.verbForms ?? null,
    sentences: word.sentences,
    level: word.level,
    tags: word.tags,
    regional_variant: word.regionalVariant ?? null,
  };
}

export class SupabaseWordRepository implements WordRepository {
  constructor(private readonly client: SupabaseClient) {}

  listByVocabularies(vocabularyIds: string[]): Promise<Word[]> {
    return guard("Failed to load words.", async () => {
      const words: Word[] = [];
      for (const ids of chunk(unique(vocabularyIds), VOCABULARY_CHUNK_SIZE)) {
        const rows = await fetchAllPages<WordRow>(
          (from, to) =>
            this.client
              .from("words")
              .select(WORD_COLUMNS)
              .in("vocabulary_id", ids)
              .is("deleted_at", null)
              .order("id")
              .range(from, to)
              .returns<WordRow[]>(),
          "Failed to load words."
        );
        words.push(...rows.map(rowToWord));
      }
      return words;
    });
  }

  getByIds(ids: string[]): Promise<Word[]> {
    return guard("Failed to load words.", async () => {
      const chunks = chunk(unique(ids), ID_CHUNK_SIZE);
      const results = await Promise.all(
        chunks.map(async (idChunk) => {
          const { data, error } = await this.client
            .from("words")
            .select(WORD_COLUMNS)
            .in("id", idChunk)
            .returns<WordRow[]>();
          throwIfSupabaseError(error, "Failed to load words.");
          return (data ?? []).map(rowToWord);
        })
      );
      return results.flat();
    });
  }

  saveMany(words: Word[]): Promise<void> {
    return guard("Failed to save words.", async () => {
      for (const rows of chunk(words.map(wordToRow), WRITE_CHUNK_SIZE)) {
        const { error } = await this.client.from("words").upsert(rows, { onConflict: "id" });
        throwIfSupabaseError(error, "Failed to save words.");
      }
    });
  }

  softDelete(words: Pick<Word, "id" | "vocabularyId">[]): Promise<void> {
    return guard("Failed to delete words.", async () => {
      for (const ids of chunk(unique(words.map((w) => w.id)), ID_CHUNK_SIZE)) {
        const { error } = await this.client.from("words").update({ deleted_at: nowIso() }).in("id", ids);
        throwIfSupabaseError(error, "Failed to delete words.");
      }
    });
  }
}
