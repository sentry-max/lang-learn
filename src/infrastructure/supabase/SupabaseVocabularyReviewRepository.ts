import { SupabaseClient } from "@supabase/supabase-js";
import { VocabularyReview } from "@domain/entities/VocabularyReview";
import { VocabularyReviewRepository } from "@domain/repositories/VocabularyReviewRepository";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import { nowIso } from "@infrastructure/supabase/queryHelpers";

const REVIEW_COLUMNS = "id, vocabulary_id, user_id, rating, comment, created_at, updated_at, author:profiles!vocabulary_reviews_user_id_fkey(display_name)";
const MAX_REVIEWS_SHOWN = 200;

interface ReviewRow {
  id: string;
  vocabulary_id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
  author: { display_name: string } | { display_name: string }[] | null;
}

function rowToReview(row: ReviewRow): VocabularyReview {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    id: row.id,
    vocabularyId: row.vocabulary_id,
    userId: row.user_id,
    authorName: author?.display_name ?? null,
    rating: row.rating,
    comment: row.comment ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseVocabularyReviewRepository implements VocabularyReviewRepository {
  constructor(private readonly client: SupabaseClient) {}

  listForVocabulary(vocabularyId: string): Promise<VocabularyReview[]> {
    return guard("Failed to load reviews.", async () => {
      const { data, error } = await this.client
        .from("vocabulary_reviews")
        .select(REVIEW_COLUMNS)
        .eq("vocabulary_id", vocabularyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(MAX_REVIEWS_SHOWN)
        .returns<ReviewRow[]>();
      throwIfSupabaseError(error, "Failed to load reviews.");
      return (data ?? []).map(rowToReview);
    });
  }

  upsert(userId: string, vocabularyId: string, rating: number, comment: string): Promise<void> {
    return guard("Failed to save your review.", async () => {
      const { error } = await this.client
        .from("vocabulary_reviews")
        .upsert(
          { vocabulary_id: vocabularyId, user_id: userId, rating, comment, deleted_at: null },
          { onConflict: "vocabulary_id,user_id" }
        );
      throwIfSupabaseError(error, "Failed to save your review.");
    });
  }

  softDelete(userId: string, vocabularyId: string): Promise<void> {
    return guard("Failed to delete your review.", async () => {
      const { error } = await this.client
        .from("vocabulary_reviews")
        .update({ deleted_at: nowIso() })
        .eq("vocabulary_id", vocabularyId)
        .eq("user_id", userId);
      throwIfSupabaseError(error, "Failed to delete your review.");
    });
  }
}
