/**
 * What the app learns about a user from their answers.
 */

/** The user's own 5-level self-rating for one answer. */
export type DifficultyRating = "very_easy" | "easy" | "good" | "bad" | "very_bad";

export const DIFFICULTY_RATINGS: DifficultyRating[] = ["very_easy", "easy", "good", "bad", "very_bad"];

/**
 * "Known" ratings: a word rated like this is parked until every other word
 * in the pool has been shown once in the current round.
 */
export const STRONG_RATINGS: readonly DifficultyRating[] = ["very_easy", "easy", "good"];

/** "Still struggling" ratings: always eligible, prioritized, retried in-session. */
export const WEAK_RATINGS: readonly DifficultyRating[] = ["bad", "very_bad"];

export function isStrongRating(rating: DifficultyRating): boolean {
  return STRONG_RATINGS.includes(rating);
}

export function isWeakRating(rating: DifficultyRating): boolean {
  return WEAK_RATINGS.includes(rating);
}

export function isDifficultyRating(value: unknown): value is DifficultyRating {
  return typeof value === "string" && (DIFFICULTY_RATINGS as string[]).includes(value);
}

/** Which way a question is asked. */
export type QuestionMode = "source_to_target" | "target_to_source" | "sentence_writing";

export const QUESTION_MODES: QuestionMode[] = ["source_to_target", "target_to_source", "sentence_writing"];

export function isQuestionMode(value: unknown): value is QuestionMode {
  return typeof value === "string" && (QUESTION_MODES as string[]).includes(value);
}

export interface ModeStat {
  correct: number;
  incorrect: number;
}

export type ModeStats = Partial<Record<QuestionMode, ModeStat>>;

/** Learned state for one (user, word). */
export interface WordProgress {
  wordId: string;
  /** SM-2 ease factor, 1.3..5, starts at 2.5 */
  easeFactor: number;
  intervalDays: number;
  /** Consecutive successful repetitions (SM-2) */
  repetitions: number;
  /** Times the word was forgotten after having been known */
  lapses: number;
  timesSeen: number;
  totalCorrect: number;
  totalIncorrect: number;
  /** Current run of successful answers */
  streak: number;
  lastRating: DifficultyRating | null;
  lastReviewedAt: string | null;
  nextReviewAt: string;
  /** Exponential moving average of how long the user takes to answer */
  avgResponseMs: number | null;
  /** Shown during the current round (see QuizSelectionService) */
  seenInCycle: boolean;
  modeStats: ModeStats;
}

/** One answered question. */
export interface ReviewEvent {
  id: string;
  wordId: string;
  sessionId: string | null;
  mode: QuestionMode;
  rating: DifficultyRating;
  shownAt: string;
  answeredAt: string;
  responseMs: number | null;
}

export function createInitialProgress(wordId: string, now: Date = new Date()): WordProgress {
  return {
    wordId,
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    timesSeen: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
    streak: 0,
    lastRating: null,
    lastReviewedAt: null,
    nextReviewAt: now.toISOString(),
    avgResponseMs: null,
    seenInCycle: false,
    modeStats: {},
  };
}

export function accuracyOf(progress: Pick<WordProgress, "totalCorrect" | "totalIncorrect">): number | null {
  const total = progress.totalCorrect + progress.totalIncorrect;
  return total === 0 ? null : progress.totalCorrect / total;
}
