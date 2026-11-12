import { SupabaseClient } from "@supabase/supabase-js";
import { Conversation, ConversationContent, ConversationStatus } from "@domain/entities/Conversation";
import { ConversationRepository } from "@domain/repositories/ConversationRepository";
import { conversationToJson, parseConversation } from "@domain/services/ConversationParser";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import { fetchAllPages, nowIso, sanitizeSearchText } from "@infrastructure/supabase/queryHelpers";

const CONVERSATION_COLUMNS =
  "id, owner_id, content, status, created_at, updated_at, published_at, deleted_at, owner:profiles!conversations_owner_id_fkey(display_name)";

/** Explore shows this many matches; search narrows it. */
const PUBLISHED_LIMIT = 50;

interface ConversationRow {
  id: string;
  owner_id: string;
  content: unknown;
  status: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  owner: { display_name: string } | { display_name: string }[] | null;
}

/** Stored JSON is untrusted too: a row whose content no longer parses is left out. */
function rowToConversation(row: ConversationRow): Conversation | null {
  const parsed = parseConversation(row.content);
  if (!("content" in parsed)) return null;
  const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
  return {
    ...parsed.content,
    id: row.id,
    ownerId: row.owner_id,
    ownerName: owner?.display_name ?? null,
    status: row.status === "published" ? "published" : "draft",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

const toConversations = (rows: ConversationRow[]) => rows.flatMap((row) => rowToConversation(row) ?? []);

export class SupabaseConversationRepository implements ConversationRepository {
  constructor(private readonly client: SupabaseClient) {}

  listOwned(userId: string): Promise<Conversation[]> {
    return guard("Failed to load your conversations.", async () => {
      const rows = await fetchAllPages<ConversationRow>(
        (from, to) =>
          this.client
            .from("conversations")
            .select(CONVERSATION_COLUMNS)
            .eq("owner_id", userId)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .order("id")
            .range(from, to)
            .returns<ConversationRow[]>(),
        "Failed to load your conversations."
      );
      return toConversations(rows);
    });
  }

  listDownloaded(userId: string): Promise<Conversation[]> {
    return guard("Failed to load downloaded conversations.", async () => {
      const rows = await fetchAllPages<{ conversation: ConversationRow | null }>(
        (from, to) =>
          this.client
            .from("conversation_subscriptions")
            .select(`conversation:conversations!conversation_subscriptions_conversation_id_fkey(${CONVERSATION_COLUMNS})`)
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .order("conversation_id")
            .range(from, to)
            .returns<{ conversation: ConversationRow | null }[]>(),
        "Failed to load downloaded conversations."
      );
      // RLS hides conversations that were unpublished; skip those and deleted ones.
      return toConversations(
        rows
          .map((row) => row.conversation)
          .filter((row): row is ConversationRow => row !== null && row.status === "published" && row.deleted_at === null)
      );
    });
  }

  listPublished(userId: string, search: string): Promise<Conversation[]> {
    return guard("Failed to load published conversations.", async () => {
      let request = this.client
        .from("conversations")
        .select(CONVERSATION_COLUMNS)
        .eq("status", "published")
        .is("deleted_at", null)
        .neq("owner_id", userId);
      const text = sanitizeSearchText(search.slice(0, 100));
      if (text) request = request.ilike("title", `%${text}%`);
      const { data, error } = await request.order("published_at", { ascending: false }).limit(PUBLISHED_LIMIT).returns<ConversationRow[]>();
      throwIfSupabaseError(error, "Failed to load published conversations.");
      return toConversations(data ?? []);
    });
  }

  create(ownerId: string, id: string, content: ConversationContent): Promise<Conversation> {
    return guard("Failed to save the conversation.", async () => {
      const { data, error } = await this.client
        .from("conversations")
        .insert({ id, owner_id: ownerId, content: conversationToJson(content) })
        .select(CONVERSATION_COLUMNS)
        .returns<ConversationRow[]>()
        .single();
      throwIfSupabaseError(error, "Failed to save the conversation.");
      return this.stored(data);
    });
  }

  update(id: string, content: ConversationContent): Promise<Conversation> {
    return this.patch(id, { content: conversationToJson(content) }, "Failed to save the conversation.");
  }

  setStatus(id: string, status: ConversationStatus): Promise<Conversation> {
    return this.patch(id, { status }, "Failed to change the conversation's status.");
  }

  softDelete(id: string): Promise<void> {
    return guard("Failed to delete the conversation.", async () => {
      const { error } = await this.client.from("conversations").update({ deleted_at: nowIso() }).eq("id", id);
      throwIfSupabaseError(error, "Failed to delete the conversation.");
    });
  }

  download(userId: string, conversationId: string): Promise<void> {
    return guard("Failed to download the conversation.", async () => {
      const { error } = await this.client
        .from("conversation_subscriptions")
        .upsert({ user_id: userId, conversation_id: conversationId, deleted_at: null }, { onConflict: "user_id,conversation_id" });
      throwIfSupabaseError(error, "Failed to download the conversation.");
    });
  }

  removeDownload(userId: string, conversationId: string): Promise<void> {
    return guard("Failed to remove the download.", async () => {
      const { error } = await this.client
        .from("conversation_subscriptions")
        .update({ deleted_at: nowIso() })
        .eq("user_id", userId)
        .eq("conversation_id", conversationId);
      throwIfSupabaseError(error, "Failed to remove the download.");
    });
  }

  private patch(id: string, values: Record<string, unknown>, errorMessage: string): Promise<Conversation> {
    return guard(errorMessage, async () => {
      const { data, error } = await this.client
        .from("conversations")
        .update(values)
        .eq("id", id)
        .select(CONVERSATION_COLUMNS)
        .returns<ConversationRow[]>()
        .single();
      throwIfSupabaseError(error, errorMessage);
      return this.stored(data);
    });
  }

  private stored(row: ConversationRow | null): Conversation {
    const conversation = row ? rowToConversation(row) : null;
    if (!conversation) throw new Error("The server returned a conversation that doesn't parse.");
    return conversation;
  }
}
