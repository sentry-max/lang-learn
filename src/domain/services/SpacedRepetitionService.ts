import { DifficultyRating, ProgressState } from "@domain/entities/Review";

/**
 * Maps the user's 5-level self-rating onto the 0-5 "quality of recall" scale
 * used by the SM-2 algorithm (Wozniak, SuperMemo). This is the single place
 * that translates the product's user-facing rating into the scheduling math,
 * so it stays easy to tune without touching the algorithm itself.
 */
const RATING_TO_QUALITY: Record<DifficultyRating, number> = {
  very_easy: 5,
  easy: 4,
  good: 3,
  bad: 2,
  very_bad: 0,
};

const MIN_EASE_FACTOR = 1.3;

/**
 * Computes the next spaced-repetition state for a vocabulary item, given
 * its current state and the user's self-rated difficulty for this attempt.
 * Pure function: no I/O, fully unit-testable.
 */
export function scheduleNextReview(
  current: ProgressState,
  rating: DifficultyRating,
  now: Date = new Date()
): ProgressState {
  const quality = RATING_TO_QUALITY[rating];
  const isSuccess = quality >= 3;

  let repetitions: number;
  let intervalDays: number;

  if (!isSuccess) {
    // A failed / "bad" or "very bad" review resets the streak so the word
    // resurfaces soon, but does not zero out the ease factor entirely.
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = current.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(current.intervalDays * current.easeFactor);
    }
  }

  const easeFactor = Math.max(
    MIN_EASE_FACTOR,
    current.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

  return {
    ...current,
    easeFactor,
    intervalDays,
    repetitions,
    nextReviewDate: nextReviewDate.toISOString(),
    totalCorrect: current.totalCorrect + (isSuccess ? 1 : 0),
    totalIncorrect: current.totalIncorrect + (isSuccess ? 0 : 1),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
  };
}

/** A word is "due" once its scheduled review date has arrived. */
export function isDue(progress: ProgressState, now: Date = new Date()): boolean {
  return new Date(progress.nextReviewDate).getTime() <= now.getTime();
}

/**
 * A 0-1 "weakness score" used to prioritize quiz question selection.
 * Words that are overdue and/or have a poor correct/incorrect ratio score higher.
 */
export function weaknessScore(progress: ProgressState, now: Date = new Date()): number {
  const total = progress.totalCorrect + progress.totalIncorrect;
  const accuracy = total === 0 ? 0.5 : progress.totalCorrect / total;
  const daysOverdue = Math.max(
    0,
    (now.getTime() - new Date(progress.nextReviewDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const overdueBoost = Math.min(1, daysOverdue / 14);
  return 0.7 * (1 - accuracy) + 0.3 * overdueBoost;
}
