import { ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { QuizSettings } from "@domain/entities/QuizSettings";
import { SentenceAttempt } from "@domain/entities/SentencePractice";
import { ConversationAttempt, ConversationLineResult } from "@domain/entities/Conversation";

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
  /** Words answered in this letter collection since its current round began. */
  getAskedInRound(userId: string, collectionKey: string): Promise<string[]>;
  /** Begins a new round for the collection: answers before `startedAt` no longer count as asked. */
  startRound(userId: string, collectionKey: string, startedAt: string): Promise<void>;

  startSession(userId: string, session: QuizSessionRecord): Promise<void>;
  completeSession(userId: string, sessionId: string): Promise<void>;

  /** Stores one answered sentence exercise; sending the same attempt id again changes nothing. */
  recordSentenceAttempt(userId: string, attempt: SentenceAttempt): Promise<void>;
  getSentenceAttempts(userId: string): Promise<SentenceAttempt[]>;

  /** Stores the start of a conversation run; sending the same id again changes nothing. Sent before its lines. */
  recordConversationAttempt(userId: string, attempt: ConversationAttempt): Promise<void>;
  /** Stores one line read aloud; sending the same id again changes nothing. */
  recordConversationLine(userId: string, result: ConversationLineResult): Promise<void>;
  getConversationLines(userId: string): Promise<ConversationLineResult[]>;
}
