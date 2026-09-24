import { SupabaseClient } from "@supabase/supabase-js";
import { ProgressState, ReviewRecord } from "@domain/entities/Review";
import { ProgressRepository } from "@domain/repositories/ProgressRepository";
import { toAppError } from "@domain/errors/AppError";
import { throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";

interface ProgressRow {
  user_id: string;
  vocabulary_entry_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_date: string;
  total_correct: number;
  total_incorrect: number;
  last_reviewed_at: string | null;
  last_rating: string | null;
}

interface ReviewRow {
  id: string;
  user_id: string;
  vocabulary_entry_id: string;
  mode: string;
  user_answer: string | null;
  was_correct: boolean | null;
  difficulty_rating: string;
  answered_at: string;
}

function rowToProgress(row: ProgressRow): ProgressState {
  return {
    vocabularyEntryId: row.vocabulary_entry_id,
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    nextReviewDate: row.next_review_date,
    totalCorrect: row.total_correct,
    totalIncorrect: row.total_incorrect,
    lastReviewedAt: row.last_reviewed_at,
    lastRating: (row.last_rating as ProgressState["lastRating"]) ?? null,
  };
}

function rowToReview(row: ReviewRow): ReviewRecord {
  return {
    id: row.id,
    vocabularyEntryId: row.vocabulary_entry_id,
    mode: row.mode as ReviewRecord["mode"],
    userAnswer: row.user_answer,
    wasCorrect: row.was_correct,
    difficultyRating: row.difficulty_rating as ReviewRecord["difficultyRating"],
    answeredAt: row.answered_at,
  };
}

export class SupabaseProgressRepository implements ProgressRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAllProgress(userId: string): Promise<ProgressState[]> {
    try {
      const { data, error } = await this.client
        .from("progress_state")
        .select("*")
        .eq("user_id", userId);
      throwIfSupabaseError(error, "Failed to load progress.");
      return (data as ProgressRow[]).map(rowToProgress);
    } catch (err) {
      throw toAppError(err, "Failed to load progress.");
    }
  }

  async getProgress(userId: string, vocabularyEntryId: string): Promise<ProgressState | null> {
    try {
      const { data, error } = await this.client
        .from("progress_state")
        .select("*")
        .eq("user_id", userId)
        .eq("vocabulary_entry_id", vocabularyEntryId)
        .maybeSingle();
      throwIfSupabaseError(error, "Failed to load progress.");
      return data ? rowToProgress(data as ProgressRow) : null;
    } catch (err) {
      throw toAppError(err, "Failed to load progress.");
    }
  }

  async saveProgress(userId: string, progress: ProgressState): Promise<void> {
    try {
      const row: ProgressRow = {
        user_id: userId,
        vocabulary_entry_id: progress.vocabularyEntryId,
        ease_factor: progress.easeFactor,
        interval_days: progress.intervalDays,
        repetitions: progress.repetitions,
        next_review_date: progress.nextReviewDate,
        total_correct: progress.totalCorrect,
        total_incorrect: progress.totalIncorrect,
        last_reviewed_at: progress.lastReviewedAt,
        last_rating: progress.lastRating,
      };
      const { error } = await this.client
        .from("progress_state")
        .upsert(row, { onConflict: "user_id,vocabulary_entry_id" });
      throwIfSupabaseError(error, "Failed to save progress.");
    } catch (err) {
      throw toAppError(err, "Failed to save progress.");
    }
  }

  async addReviewRecord(userId: string, record: ReviewRecord): Promise<void> {
    try {
      const row: ReviewRow = {
        id: record.id,
        user_id: userId,
        vocabulary_entry_id: record.vocabularyEntryId,
        mode: record.mode,
        user_answer: record.userAnswer,
        was_correct: record.wasCorrect,
        difficulty_rating: record.difficultyRating,
        answered_at: record.answeredAt,
      };
      const { error } = await this.client.from("review_records").insert(row);
      throwIfSupabaseError(error, "Failed to save your answer.");
    } catch (err) {
      throw toAppError(err, "Failed to save your answer.");
    }
  }

  async getReviewHistory(userId: string, vocabularyEntryId: string): Promise<ReviewRecord[]> {
    try {
      const { data, error } = await this.client
        .from("review_records")
        .select("*")
        .eq("user_id", userId)
        .eq("vocabulary_entry_id", vocabularyEntryId)
        .order("answered_at", { ascending: false });
      throwIfSupabaseError(error, "Failed to load review history.");
      return (data as ReviewRow[]).map(rowToReview);
    } catch (err) {
      throw toAppError(err, "Failed to load review history.");
    }
  }

  async getAllReviewHistory(userId: string): Promise<ReviewRecord[]> {
    try {
      const { data, error } = await this.client
        .from("review_records")
        .select("*")
        .eq("user_id", userId)
        .order("answered_at", { ascending: false });
      throwIfSupabaseError(error, "Failed to load review history.");
      return (data as ReviewRow[]).map(rowToReview);
    } catch (err) {
      throw toAppError(err, "Failed to load review history.");
    }
  }
}
