import { ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { QuizSettings } from "@domain/entities/QuizSettings";

export interface QuizSessionRecord {
  id: string;
  settings: QuizSettings;
  vocabularyIds: string[];
  plannedCount: number;
  cycleRestarted: boolean;
  startedAt: string;
}

/**
 * Port for everything the app learns from a user's answers: per-word
 * progress, the full answer history, quiz sessions and rounds.
 * Resets never delete: they soft-delete history so it can be audited.
 */
export interface LearningRepository {
  getAllProgress(userId: string): Promise<WordProgress[]>;
  getProgress(userId: string, wordId: string): Promise<WordProgress | null>;
  /** Stores the answer and the recalculated progress atomically. */
  recordReview(userId: string, event: ReviewEvent, progress: WordProgress): Promise<void>;
  getEvents(userId: string, wordIds: string[]): Promise<ReviewEvent[]>;

  /** Soft-resets progress and history; `null` resets everything. Returns words reset. */
  resetProgress(userId: string, wordIds: string[] | null): Promise<number>;
  /** Starts a new round for these words: parked words become eligible again. */
  restartCycle(userId: string, wordIds: string[]): Promise<void>;

  startSession(userId: string, session: QuizSessionRecord): Promise<void>;
  completeSession(userId: string, sessionId: string): Promise<void>;
}
