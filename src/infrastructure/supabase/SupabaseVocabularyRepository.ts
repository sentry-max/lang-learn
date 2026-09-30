import { SupabaseClient } from "@supabase/supabase-js";
import { LanguageCode, isLanguageCode } from "@domain/entities/Language";
import { Vocabulary, VocabularyInput, VocabularyStatus } from "@domain/entities/Vocabulary";
import { FeedQuery, Page, VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import { sanitizeSearchText, fetchAllPages, nowIso } from "@infrastructure/supabase/queryHelpers";

const VOCABULARY_COLUMNS =
  "id, owner_id, name, description, source_language, target_languages, status, word_count, download_count, " +
  "rating_avg, rating_count, created_at, updated_at, published_at, deleted_at, owner:profiles!vocabularies_owner_id_fkey(display_name)";

interface VocabularyRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  source_language: string;
  target_languages: string[] | null;
  status: string;
  word_count: number;
  download_count: number;
  rating_avg: number | string;
  rating_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  owner: { display_name: string } | { display_name: string }[] | null;
}

function rowToVocabulary(row: VocabularyRow): Vocabulary {
  const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: owner?.display_name ?? null,
    name: row.name,
    description: row.description ?? "",
    sourceLanguage: (isLanguageCode(row.source_language) ? row.source_language : "en") as LanguageCode,
    targetLanguages: (row.target_languages ?? []).filter(isLanguageCode),
    status: row.status === "published" ? "published" : "draft",
    wordCount: row.word_count,
    downloadCount: row.download_count,
    ratingAvg: Number(row.rating_avg) || 0,
    ratingCount: row.rating_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function inputToRow(input: VocabularyInput) {
  return {
    name: input.name,
    description: input.description,
    source_language: input.sourceLanguage,
    target_languages: input.targetLanguages,
  };
}

export class SupabaseVocabularyRepository implements VocabularyRepository {
  constructor(private readonly client: SupabaseClient) {}

  listOwned(userId: string): Promise<Vocabulary[]> {
    return guard("Failed to load your vocabularies.", async () => {
      const rows = await fetchAllPages<VocabularyRow>(
        (from, to) =>
          this.client
            .from("vocabularies")
            .select(VOCABULARY_COLUMNS)
            .eq("owner_id", userId)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .order("id")
            .range(from, to)
            .returns<VocabularyRow[]>(),
        "Failed to load your vocabularies."
      );
      return rows.map(rowToVocabulary);
    });
  }

  listDownloaded(userId: string): Promise<Vocabulary[]> {
    return guard("Failed to load downloaded vocabularies.", async () => {
      const rows = await fetchAllPages<{ vocabulary: VocabularyRow | null }>(
        (from, to) =>
          this.client
            .from("vocabulary_subscriptions")
            .select(`vocabulary:vocabularies!vocabulary_subscriptions_vocabulary_id_fkey(${VOCABULARY_COLUMNS})`)
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .order("vocabulary_id")
            .range(from, to)
            .returns<{ vocabulary: VocabularyRow | null }[]>(),
        "Failed to load downloaded vocabularies."
      );
      // RLS hides vocabularies that were unpublished; skip those and deleted ones.
      return rows
        .map((r) => r.vocabulary)
        .filter((v): v is VocabularyRow => v !== null && v.status === "published" && v.deleted_at === null)
        .map(rowToVocabulary);
    });
  }

  listPublished(query: FeedQuery): Promise<Page<Vocabulary>> {
    return guard("Failed to load the vocabulary feed.", async () => {
      let request = this.client
        .from("vocabularies")
        .select(VOCABULARY_COLUMNS, { count: "exact" })
        .eq("status", "published")
        .is("deleted_at", null);

      const search = sanitizeSearchText(query.search?.slice(0, 100) ?? "");
      if (search) request = request.ilike("name", `%${search}%`);
      if (query.language) request = request.eq("source_language", query.language);

      if (query.sort === "top_rated") {
        request = request.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false });
      } else if (query.sort === "most_downloaded") {
        request = request.order("download_count", { ascending: false });
      } else {
        request = request.order("published_at", { ascending: false, nullsFirst: false });
      }

      const from = Math.max(0, query.page) * query.pageSize;
      const { data, error, count } = await request
        .order("id")
        .range(from, from + query.pageSize - 1)
        .returns<VocabularyRow[]>();
      throwIfSupabaseError(error, "Failed to load the vocabulary feed.");
      return { items: (data ?? []).map(rowToVocabulary), total: count ?? 0 };
    });
  }

  getById(id: string): Promise<Vocabulary | null> {
    return guard("Failed to load the vocabulary.", async () => {
      const { data, error } = await this.client
        .from("vocabularies")
        .select(VOCABULARY_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null)
        .returns<VocabularyRow[]>()
        .maybeSingle();
      throwIfSupabaseError(error, "Failed to load the vocabulary.");
      return data ? rowToVocabulary(data as VocabularyRow) : null;
    });
  }

  create(ownerId: string, id: string, input: VocabularyInput): Promise<Vocabulary> {
    return guard("Failed to create the vocabulary.", async () => {
      const { data, error } = await this.client
        .from("vocabularies")
        .insert({ id, owner_id: ownerId, ...inputToRow(input) })
        .select(VOCABULARY_COLUMNS)
        .returns<VocabularyRow[]>()
        .single();
      throwIfSupabaseError(error, "Failed to create the vocabulary.");
      return rowToVocabulary(data as VocabularyRow);
    });
  }

  update(id: string, input: VocabularyInput): Promise<Vocabulary> {
    return this.patch(id, inputToRow(input), "Failed to save the vocabulary.");
  }

  setStatus(id: string, status: VocabularyStatus): Promise<Vocabulary> {
    return this.patch(id, { status }, "Failed to change the vocabulary's status.");
  }

  softDelete(id: string): Promise<void> {
    return guard("Failed to delete the vocabulary.", async () => {
      const { error } = await this.client.from("vocabularies").update({ deleted_at: nowIso() }).eq("id", id);
      throwIfSupabaseError(error, "Failed to delete the vocabulary.");
    });
  }

  listDownloadedIds(userId: string): Promise<Set<string>> {
    return guard("Failed to load your downloads.", async () => {
      const rows = await fetchAllPages<{ vocabulary_id: string }>(
        (from, to) =>
          this.client
            .from("vocabulary_subscriptions")
            .select("vocabulary_id")
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("vocabulary_id")
            .range(from, to),
        "Failed to load your downloads."
      );
      return new Set(rows.map((r) => r.vocabulary_id));
    });
  }

  download(userId: string, vocabularyId: string): Promise<void> {
    return guard("Failed to download the vocabulary.", async () => {
      const { error } = await this.client
        .from("vocabulary_subscriptions")
        .upsert({ user_id: userId, vocabulary_id: vocabularyId, deleted_at: null }, { onConflict: "user_id,vocabulary_id" });
      throwIfSupabaseError(error, "Failed to download the vocabulary.");
    });
  }

  removeDownload(userId: string, vocabularyId: string): Promise<void> {
    return guard("Failed to remove the download.", async () => {
      const { error } = await this.client
        .from("vocabulary_subscriptions")
        .update({ deleted_at: nowIso() })
        .eq("user_id", userId)
        .eq("vocabulary_id", vocabularyId);
      throwIfSupabaseError(error, "Failed to remove the download.");
    });
  }

  private patch(id: string, values: Record<string, unknown>, errorMessage: string): Promise<Vocabulary> {
    return guard(errorMessage, async () => {
      const { data, error } = await this.client
        .from("vocabularies")
        .update(values)
        .eq("id", id)
        .select(VOCABULARY_COLUMNS)
        .returns<VocabularyRow[]>()
        .single();
      throwIfSupabaseError(error, errorMessage);
      return rowToVocabulary(data as VocabularyRow);
    });
  }
}
