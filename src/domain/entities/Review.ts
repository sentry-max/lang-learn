/**
 * Domain entities for tracking how a user answers and self-rates a vocabulary item.
 */

/** The user's own difficulty rating after seeing the correct answer, five levels as requested. */
export type DifficultyRating =
  | "very_easy"
  | "easy"
  | "good"
  | "bad"
  | "very_bad";

export const DIFFICULTY_RATINGS: DifficultyRating[] = [
  "very_easy",
  "easy",
  "good",
  "bad",
  "very_bad",
];

export const DIFFICULTY_LABELS: Record<DifficultyRating, string> = {
  very_easy: "Very easy",
  easy: "Easy",
  good: "Good",
  bad: "Bad",
  very_bad: "Very bad",
};

/** The direction/type of a single quiz question. */
export type QuestionMode =
  | "de_to_en" // shown German, must recall English meaning
  | "en_to_de" // shown English, must recall German word
  | "sentence_writing"; // must write an original German sentence using the word

/** One answered question, as stored in progress history. */
export interface ReviewRecord {
  id: string;
  vocabularyEntryId: string;
  mode: QuestionMode;
  /** What the user typed, if applicable (sentence_writing always has this) */
  userAnswer: string | null;
  /** Whether the system judged the answer correct (not applicable for sentence_writing, which is self-rated only) */
  wasCorrect: boolean | null;
  /** The self-reported difficulty rating for this attempt — required for every review */
  difficultyRating: DifficultyRating;
  answeredAt: string; // ISO timestamp
}

/** Per-word spaced-repetition state, derived from the review history. */
export interface ProgressState {
  vocabularyEntryId: string;
  /** SM-2 style ease factor, starts at 2.5 */
  easeFactor: number;
  /** Current inter-repetition interval, in days */
  intervalDays: number;
  /** Number of consecutive successful repetitions */
  repetitions: number;
  nextReviewDate: string; // ISO date
  totalCorrect: number;
  totalIncorrect: number;
  lastReviewedAt: string | null; // ISO timestamp
  /** The most recent self-rating for this word — drives quiz selection (see VocabularySelectionService). */
  lastRating: DifficultyRating | null;
}

export function createInitialProgress(vocabularyEntryId: string): ProgressState {
  return {
    vocabularyEntryId,
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    nextReviewDate: new Date().toISOString(),
    totalCorrect: 0,
    totalIncorrect: 0,
    lastReviewedAt: null,
    lastRating: null,
  };
}
