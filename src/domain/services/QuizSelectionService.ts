import { QuestionMode, WordProgress, isWeakRating } from "@domain/entities/Learning";
import { QuizDirection } from "@domain/entities/QuizSettings";
import { Word, translationLanguages } from "@domain/entities/Word";
import { difficultyScore, isDue, isSlowAnswer, modeErrorRate, overdueDays } from "@domain/services/SpacedRepetitionService";
import { RandomSource, shuffle, weightedSample } from "@domain/services/Random";

/**
 * Adaptive quiz word selection within one letter collection's round. A word asked in the round is parked until
 * every word of the pool was asked; then a new round starts, mid-session if needed so the session stays full.
 * Unasked words are weak (last rated bad / very bad, prioritized) or fresh, and drawn by weighted random sampling.
 */

export type WordBucket = "weak" | "fresh" | "parked";

export interface QuizCandidate {
  word: Word;
  /** Learning state across every collection */
  progress: WordProgress | null;
  /** Already asked in this collection's current round */
  askedInRound: boolean;
}

export interface SelectionInput {
  candidates: readonly QuizCandidate[];
  quota: number;
  now: Date;
  rng: RandomSource;
}

export interface SelectionResult {
  selected: QuizCandidate[];
  /** True when this selection completed the collection's round and started the next one */
  cycleRestarted: boolean;
}

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_RECENT_SAMPLE = 5;

export function bucketOf({ progress, askedInRound }: Pick<QuizCandidate, "progress" | "askedInRound">): WordBucket {
  if (askedInRound) return "parked";
  return progress?.lastRating && isWeakRating(progress.lastRating) ? "weak" : "fresh";
}

export function selectQuizWords({ candidates, quota, now, rng }: SelectionInput): SelectionResult {
  const target = Math.min(Math.max(0, Math.floor(quota)), candidates.length);
  if (target === 0) return { selected: [], cycleRestarted: false };

  const weak: QuizCandidate[] = [];
  let fresh: QuizCandidate[] = [];
  let parked: QuizCandidate[] = [];
  for (const candidate of candidates) {
    const bucket = bucketOf(candidate);
    if (bucket === "weak") weak.push(candidate);
    else if (bucket === "fresh") fresh.push(candidate);
    else parked.push(candidate);
  }

  let cycleRestarted = false;
  const startNewRound = () => {
    cycleRestarted = true;
    fresh = [...fresh, ...parked];
    parked = [];
  };

  // Every word was asked this round -> start the next round.
  if (fresh.length === 0 && weak.length === 0 && parked.length > 0) startNewRound();

  const weakShare = adaptiveWeakShare(candidates, weak.length, target, now);
  const weakTarget = weak.length === 0 ? 0 : Math.min(weak.length, Math.max(1, Math.round(target * weakShare)));

  const selected = new Set<QuizCandidate>();
  const take = (pool: QuizCandidate[], count: number, weight: (candidate: QuizCandidate) => number) => {
    const available = pool.filter((candidate) => !selected.has(candidate));
    for (const candidate of weightedSample(available, count, weight, rng)) selected.add(candidate);
  };

  const weakWeightAt = (candidate: QuizCandidate) => weakWeight(candidate.progress!, now);
  const freshWeightAt = (candidate: QuizCandidate) => freshWeight(candidate.progress, now);

  take(weak, weakTarget, weakWeightAt);
  take(fresh, target - selected.size, freshWeightAt);
  // Not enough fresh words: give the remaining slots to weak words.
  if (selected.size < target) take(weak, target - selected.size, weakWeightAt);
  // Still short: this session finishes the round, so begin the next one now.
  if (selected.size < target && parked.length > 0) {
    const releasedPool = parked;
    startNewRound();
    take(releasedPool, target - selected.size, freshWeightAt);
  }

  return { selected: shuffle(Array.from(selected), rng), cycleRestarted };
}

/**
 * Share of a session reserved for weak words: 25% for a user who is doing
 * well, up to 75% for one who has been struggling recently, a bit more if
 * weak words are piling up. New words still always get some room.
 */
export function adaptiveWeakShare(
  candidates: readonly QuizCandidate[],
  weakCount: number,
  target: number,
  now: Date
): number {
  const since = now.getTime() - RECENT_WINDOW_MS;
  let recent = 0;
  let recentWeak = 0;
  for (const { progress } of candidates) {
    if (!progress?.lastReviewedAt || !progress.lastRating) continue;
    if (new Date(progress.lastReviewedAt).getTime() < since) continue;
    recent += 1;
    if (isWeakRating(progress.lastRating)) recentWeak += 1;
  }

  let share = recent < MIN_RECENT_SAMPLE ? 0.4 : 0.25 + 0.5 * (recentWeak / recent);
  if (weakCount >= 2 * target) share += 0.1;
  return Math.min(0.8, Math.max(0.2, share));
}

/** Weight of a weak word: worse, more often forgotten, hesitant and overdue words first. */
export function weakWeight(progress: WordProgress, now: Date): number {
  const severity = progress.lastRating === "very_bad" ? 3 : 2;
  const lapseBoost = 1 + Math.min(progress.lapses, 4) * 0.25;
  const overdue = overdueDays(progress, now);
  const dueFactor = isDue(progress, now) ? 1 + Math.min(overdue, 7) / 7 : 0.8;
  const minutesSince = progress.lastReviewedAt
    ? (now.getTime() - new Date(progress.lastReviewedAt).getTime()) / 60000
    : Infinity;
  // Just answered? Let it rest a little so sessions don't open with repeats.
  const recency = minutesSince < 5 ? 0.25 : minutesSince < 30 ? 0.6 : 1;
  const hesitation = progress.avgResponseMs !== null && isSlowAnswer(progress.avgResponseMs, null) ? 1.25 : 1;
  return severity * lapseBoost * dueFactor * recency * hesitation;
}

/**
 * Weight of a fresh word. Never-seen words weigh 1. Words coming back in a
 * new round weigh 0.4..2 by how hard they have been for this user, with a
 * boost when their spaced-repetition review is due — so hard words return
 * early in a round and easy ones late.
 */
export function freshWeight(progress: WordProgress | null, now: Date): number {
  if (!progress || progress.timesSeen === 0) return 1;
  const due = isDue(progress, now) ? 1.3 : 1;
  return (0.4 + 1.6 * difficultyScore(progress)) * due;
}

const SENTENCE_WRITING_PROBABILITY = 0.25;

export interface ModeOptions {
  direction: QuizDirection;
  includeSentenceWriting: boolean;
}

/**
 * Picks the question direction for one word. In "mix", the direction the
 * user gets wrong more often for this word is asked more often. Writing a
 * sentence is only asked for words the user already knows at least a bit.
 */
export function chooseMode(candidate: Pick<QuizCandidate, "word" | "progress">, options: ModeOptions, randomSource: RandomSource): QuestionMode {
  const { word, progress } = candidate;
  if (translationLanguages(word).length === 0) return "source_to_target";

  if (options.includeSentenceWriting && canWriteSentence(progress) && randomSource() < SENTENCE_WRITING_PROBABILITY) {
    return "sentence_writing";
  }
  if (options.direction !== "mix") return options.direction;

  const stats = progress?.modeStats ?? {};
  const forwardError = modeErrorRate(stats, "source_to_target");
  const reverseError = modeErrorRate(stats, "target_to_source");
  const reverseProbability = reverseError / (forwardError + reverseError);
  return randomSource() < reverseProbability ? "target_to_source" : "source_to_target";
}

function canWriteSentence(progress: WordProgress | null): boolean {
  return progress !== null && progress.timesSeen > 0 && progress.lastRating !== null && !isWeakRating(progress.lastRating);
}
