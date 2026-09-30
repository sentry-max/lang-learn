import {
  DifficultyRating,
  ModeStats,
  QuestionMode,
  WordProgress,
  accuracyOf,
} from "@domain/entities/Learning";

/**
 * Maps the 5-level self-rating onto SM-2's 0–5 recall quality. This is the
 * single place that translates the product rating into scheduling math.
 */
const RATING_TO_QUALITY: Record<DifficultyRating, number> = {
  very_easy: 5,
  easy: 4,
  good: 3,
  bad: 2,
  very_bad: 0,
};

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 5;
const MAX_INTERVAL_DAYS = 3650;
const VERY_EASY_BONUS = 1.3;
/** Failed words come back quickly: very bad after 10 minutes, bad after an hour. */
const RELEARN_MINUTES: Record<"bad" | "very_bad", number> = { very_bad: 10, bad: 60 };

/** An answer slower than this (and than 2× the user's own average) counts as hesitant. */
const SLOW_RESPONSE_FLOOR_MS = 8000;
/** Response times above this are treated as "walked away" and ignored for learning. */
const MAX_TRACKED_RESPONSE_MS = 120_000;
const RESPONSE_EMA_ALPHA = 0.3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AnswerSignal {
  rating: DifficultyRating;
  mode: QuestionMode;
  /** Time from the question appearing to the rating, if measured */
  responseMs: number | null;
}

/**
 * A hesitant answer: slower than both a fixed floor and twice the user's
 * usual pace for this word. Used to temper over-confident "easy" ratings.
 */
export function isSlowAnswer(responseMs: number | null, avgResponseMs: number | null): boolean {
  if (responseMs === null || responseMs > MAX_TRACKED_RESPONSE_MS) return false;
  const threshold = Math.max(SLOW_RESPONSE_FLOOR_MS, (avgResponseMs ?? 0) * 2);
  return responseMs > threshold;
}

/**
 * Recall quality actually fed into the scheduler. A slow "easy"/"very easy"
 * is scheduled one step more cautiously; the stored rating is untouched, so
 * the user's own judgement still decides whether the word is parked.
 */
export function effectiveQuality(rating: DifficultyRating, slow: boolean): number {
  const quality = RATING_TO_QUALITY[rating];
  return slow && quality >= 4 ? quality - 1 : quality;
}

/**
 * Computes the next learning state from the current one and one answer.
 * SM-2 based, extended with lapses, streaks, response-time learning and
 * per-direction accuracy. Pure: no I/O.
 */
export function scheduleNextReview(
  current: WordProgress,
  signal: AnswerSignal,
  now: Date = new Date()
): WordProgress {
  const responseMs = sanitizeResponseMs(signal.responseMs);
  const slow = isSlowAnswer(responseMs, current.avgResponseMs);
  const quality = effectiveQuality(signal.rating, slow);
  const isSuccess = quality >= 3;

  let repetitions: number;
  let intervalDays: number;
  let nextReviewAt: Date;
  let lapses = current.lapses;

  if (!isSuccess) {
    if (current.repetitions > 0 || current.totalCorrect > 0) lapses += 1;
    repetitions = 0;
    intervalDays = 0;
    const minutes = RELEARN_MINUTES[signal.rating === "very_bad" ? "very_bad" : "bad"];
    nextReviewAt = new Date(now.getTime() + minutes * 60 * 1000);
  } else {
    repetitions = current.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = quality >= 4 ? 6 : 3;
    } else {
      intervalDays = Math.round(Math.max(1, current.intervalDays) * current.easeFactor);
    }
    if (signal.rating === "very_easy" && !slow) intervalDays = Math.round(intervalDays * VERY_EASY_BONUS);
    intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, intervalDays));
    nextReviewAt = new Date(now.getTime() + intervalDays * MS_PER_DAY);
  }

  const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const easeFactor = round2(clamp(current.easeFactor + easeDelta, MIN_EASE_FACTOR, MAX_EASE_FACTOR));

  return {
    ...current,
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    timesSeen: current.timesSeen + 1,
    totalCorrect: current.totalCorrect + (isSuccess ? 1 : 0),
    totalIncorrect: current.totalIncorrect + (isSuccess ? 0 : 1),
    streak: isSuccess ? current.streak + 1 : 0,
    lastRating: signal.rating,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: nextReviewAt.toISOString(),
    avgResponseMs: nextAverageResponse(current.avgResponseMs, responseMs),
    seenInCycle: true,
    modeStats: nextModeStats(current.modeStats, signal.mode, isSuccess),
  };
}

export function isDue(progress: Pick<WordProgress, "nextReviewAt">, now: Date = new Date()): boolean {
  return new Date(progress.nextReviewAt).getTime() <= now.getTime();
}

export function overdueDays(progress: Pick<WordProgress, "nextReviewAt">, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - new Date(progress.nextReviewAt).getTime()) / MS_PER_DAY);
}

/**
 * How hard this word is *for this user*, 0 (trivial) .. 1 (very hard),
 * learned from accuracy, ease, lapses and hesitation.
 */
export function difficultyScore(progress: WordProgress): number {
  const accuracy = accuracyOf(progress) ?? 0.5;
  const easePart = clamp((2.5 - progress.easeFactor) / 1.2, 0, 1);
  const lapsePart = Math.min(1, progress.lapses / 4);
  const slowPart = progress.avgResponseMs === null ? 0 : clamp((progress.avgResponseMs - 4000) / 12000, 0, 1);
  return clamp(0.4 * (1 - accuracy) + 0.25 * easePart + 0.2 * lapsePart + 0.15 * slowPart, 0, 1);
}

/** 0..1 score for the dashboard's weakest/strongest lists: hard and overdue words score higher. */
export function weaknessScore(progress: WordProgress, now: Date = new Date()): number {
  const overdueBoost = Math.min(1, overdueDays(progress, now) / 14);
  return 0.8 * difficultyScore(progress) + 0.2 * overdueBoost;
}

/** Laplace-smoothed error rate for one question direction. */
export function modeErrorRate(stats: ModeStats, mode: QuestionMode): number {
  const stat = stats[mode];
  if (!stat) return 0.5;
  return (stat.incorrect + 1) / (stat.correct + stat.incorrect + 2);
}

function nextModeStats(stats: ModeStats, mode: QuestionMode, success: boolean): ModeStats {
  const previous = stats[mode] ?? { correct: 0, incorrect: 0 };
  return {
    ...stats,
    [mode]: {
      correct: previous.correct + (success ? 1 : 0),
      incorrect: previous.incorrect + (success ? 0 : 1),
    },
  };
}

function nextAverageResponse(previous: number | null, responseMs: number | null): number | null {
  if (responseMs === null || responseMs > MAX_TRACKED_RESPONSE_MS) return previous;
  if (previous === null) return responseMs;
  return Math.round(previous + RESPONSE_EMA_ALPHA * (responseMs - previous));
}

function sanitizeResponseMs(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
