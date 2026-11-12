import { SupabaseClient } from "@supabase/supabase-js";
import { isLanguageCode } from "@domain/entities/Language";
import { SentenceCollection, SentenceCollectionInput, SentenceCollectionStatus } from "@domain/entities/SentenceCollection";
import { SentenceCollectionRepository } from "@domain/repositories/SentenceCollectionRepository";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import { fetchAllPages, nowIso, sanitizeSearchText } from "@infrastructure/supabase/queryHelpers";

const COLLECTION_COLUMNS =
  "id, owner_id, name, description, language, status, exercise_count, created_at, updated_at, published_at, deleted_at, " +
  "owner:profiles!sentence_collections_owner_id_fkey(display_name)";

/** The feed shows this many matches; search narrows it. */
const PUBLISHED_LIMIT = 50;

interface CollectionRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  language: string;
  status: string;
  exercise_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  owner: { display_name: string } | { display_name: string }[] | null;
}

function rowToCollection(row: CollectionRow): SentenceCollection {
  const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: owner?.display_name ?? null,
    name: row.name,
    description: row.description ?? "",
    language: isLanguageCode(row.language) ? row.language : "en",
    status: row.status === "published" ? "published" : "draft",
    exerciseCount: row.exercise_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export class SupabaseSentenceCollectionRepository implements SentenceCollectionRepository {
  constructor(private readonly client: SupabaseClient) {}

  listOwned(userId: string): Promise<SentenceCollection[]> {
    return guard("Failed to load your sentence collections.", async () => {
      const rows = await fetchAllPages<CollectionRow>(
        (from, to) =>
          this.client
            .from("sentence_collections")
            .select(COLLECTION_COLUMNS)
            .eq("owner_id", userId)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .order("id")
            .range(from, to)
            .returns<CollectionRow[]>(),
        "Failed to load your sentence collections."
      );
      return rows.map(rowToCollection);
    });
  }

  listDownloaded(userId: string): Promise<SentenceCollection[]> {
    return guard("Failed to load downloaded sentence collections.", async () => {
      const rows = await fetchAllPages<{ collection: CollectionRow | null }>(
        (from, to) =>
          this.client
            .from("sentence_collection_subscriptions")
            .select(`collection:sentence_collections!sentence_collection_subscriptions_collection_id_fkey(${COLLECTION_COLUMNS})`)
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .order("collection_id")
            .range(from, to)
            .returns<{ collection: CollectionRow | null }[]>(),
        "Failed to load downloaded sentence collections."
      );
      // RLS hides collections that were unpublished; skip those and deleted ones.
      return rows
        .map((row) => row.collection)
        .filter((row): row is CollectionRow => row !== null && row.status === "published" && row.deleted_at === null)
        .map(rowToCollection);
    });
  }

  listPublished(userId: string, search: string): Promise<SentenceCollection[]> {
    return guard("Failed to load published sentence collections.", async () => {
      let request = this.client
        .from("sentence_collections")
        .select(COLLECTION_COLUMNS)
        .eq("status", "published")
        .is("deleted_at", null)
        .neq("owner_id", userId);
      const text = sanitizeSearchText(search.slice(0, 100));
      if (text) request = request.ilike("name", `%${text}%`);
      const { data, error } = await request.order("published_at", { ascending: false }).limit(PUBLISHED_LIMIT).returns<CollectionRow[]>();
      throwIfSupabaseError(error, "Failed to load published sentence collections.");
      return (data ?? []).map(rowToCollection);
    });
  }

  create(ownerId: string, id: string, input: SentenceCollectionInput): Promise<SentenceCollection> {
    return guard("Failed to create the collection.", async () => {
      const { data, error } = await this.client
        .from("sentence_collections")
        .insert({ id, owner_id: ownerId, ...input })
        .select(COLLECTION_COLUMNS)
        .returns<CollectionRow[]>()
        .single();
      throwIfSupabaseError(error, "Failed to create the collection.");
      return rowToCollection(data as CollectionRow);
    });
  }

  update(id: string, input: SentenceCollectionInput): Promise<SentenceCollection> {
    return this.patch(id, { ...input }, "Failed to save the collection.");
  }

  setStatus(id: string, status: SentenceCollectionStatus): Promise<SentenceCollection> {
    return this.patch(id, { status }, "Failed to change the collection's status.");
  }

  softDelete(id: string): Promise<void> {
    return guard("Failed to delete the collection.", async () => {
      const { error } = await this.client.from("sentence_collections").update({ deleted_at: nowIso() }).eq("id", id);
      throwIfSupabaseError(error, "Failed to delete the collection.");
    });
  }

  download(userId: string, collectionId: string): Promise<void> {
    return guard("Failed to download the collection.", async () => {
      const { error } = await this.client
        .from("sentence_collection_subscriptions")
        .upsert({ user_id: userId, collection_id: collectionId, deleted_at: null }, { onConflict: "user_id,collection_id" });
      throwIfSupabaseError(error, "Failed to download the collection.");
    });
  }

  removeDownload(userId: string, collectionId: string): Promise<void> {
    return guard("Failed to remove the download.", async () => {
      const { error } = await this.client
        .from("sentence_collection_subscriptions")
        .update({ deleted_at: nowIso() })
        .eq("user_id", userId)
        .eq("collection_id", collectionId);
      throwIfSupabaseError(error, "Failed to remove the download.");
    });
  }

  private patch(id: string, values: Record<string, unknown>, errorMessage: string): Promise<SentenceCollection> {
    return guard(errorMessage, async () => {
      const { data, error } = await this.client
        .from("sentence_collections")
        .update(values)
        .eq("id", id)
        .select(COLLECTION_COLUMNS)
        .returns<CollectionRow[]>()
        .single();
      throwIfSupabaseError(error, errorMessage);
      return rowToCollection(data as CollectionRow);
    });
  }
}
