import { ProgressState, ReviewRecord } from "@domain/entities/Review";

/**
 * Port for reading and writing per-user spaced-repetition progress and
 * review history. Implemented by the Supabase adapter in infrastructure/.
 */
export interface ProgressRepository {
  getAllProgress(userId: string): Promise<ProgressState[]>;
  getProgress(userId: string, vocabularyEntryId: string): Promise<ProgressState | null>;
  saveProgress(userId: string, progress: ProgressState): Promise<void>;

  addReviewRecord(userId: string, record: ReviewRecord): Promise<void>;
  getReviewHistory(userId: string, vocabularyEntryId: string): Promise<ReviewRecord[]>;
  getAllReviewHistory(userId: string): Promise<ReviewRecord[]>;
}
