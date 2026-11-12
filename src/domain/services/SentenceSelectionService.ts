import { SentenceExercise, splitBlanks, splitJumble } from "@domain/entities/SentenceExercise";
import { SentenceAnswer, SentenceAttempt, scoreOf } from "@domain/entities/SentencePractice";
import { RandomSource, shuffle, weightedSample } from "@domain/services/Random";
import { answerWordsOf, missedWordCounts, topicKeysOf } from "@domain/services/SentenceInsights";

/** A word the user can pick in a fill-in-the-blank or jumbled sentence. Ids keep repeated words apart. */
export interface Tile {
  id: string;
  text: string;
}

export interface PracticeItem {
  key: string;
  exercise: SentenceExercise;
  /** Shuffled once when the practice starts; empty for a transformation */
  tiles: Tile[];
}

/** The user's answer while they work on it: tile ids per blank (fill in) or in placed order (jumble), or typed text. */
export interface AnswerDraft {
  tileIds: (string | null)[];
  text: string;
}

export function emptyDraft(item: PracticeItem): AnswerDraft {
  const { content } = item.exercise;
  const blankCount = content.kind === "fill_blank" ? splitBlanks(content.sentence).length - 1 : 0;
  return { tileIds: Array<string | null>(blankCount).fill(null), text: "" };
}

/** Submit is allowed once every blank is filled, enough words are placed, or something is typed. */
export function isDraftComplete(item: PracticeItem, draft: AnswerDraft): boolean {
  const { content } = item.exercise;
  if (content.kind === "fill_blank") return draft.tileIds.every((tileId) => tileId !== null);
  if (content.kind === "jumble") return draft.tileIds.length === splitJumble(content.sentence).tokens.length;
  return draft.text.trim().length > 0;
}

/**
 * Puts a tile in place. Fill in the blank: into `targetBlank` when given, else the first empty blank, else the last
 * blank — a word already there goes back, so with one blank a new pick simply replaces the old one.
 * Jumble: after the last placed word.
 */
export function placeTile(item: PracticeItem, draft: AnswerDraft, tileId: string, targetBlank: number | null = null): AnswerDraft {
  if (item.exercise.content.kind !== "fill_blank") {
    return draft.tileIds.includes(tileId) ? draft : { ...draft, tileIds: [...draft.tileIds, tileId] };
  }
  const emptyIndex = draft.tileIds.indexOf(null);
  const target = targetBlank ?? (emptyIndex >= 0 ? emptyIndex : draft.tileIds.length - 1);
  if (target < 0) return draft;
  return { ...draft, tileIds: draft.tileIds.map((current, index) => (index === target ? tileId : current === tileId ? null : current)) };
}

/** Sends the tile at a position back: its blank empties, or the later words move up. */
export function removeTileAt(item: PracticeItem, draft: AnswerDraft, position: number): AnswerDraft {
  if (item.exercise.content.kind === "fill_blank") {
    return { ...draft, tileIds: draft.tileIds.map((current, index) => (index === position ? null : current)) };
  }
  return { ...draft, tileIds: draft.tileIds.filter((_, index) => index !== position) };
}

/** Moves a placed word to another position; the words in between shift over. */
export function moveTile(draft: AnswerDraft, from: number, to: number): AnswerDraft {
  if (from === to || from < 0 || from >= draft.tileIds.length) return draft;
  const tileIds = [...draft.tileIds];
  const [moved] = tileIds.splice(from, 1);
  tileIds.splice(Math.max(0, Math.min(to, tileIds.length)), 0, moved);
  return { ...draft, tileIds };
}

export function draftToAnswer(item: PracticeItem, draft: AnswerDraft): SentenceAnswer {
  const textById = new Map(item.tiles.map((tile) => [tile.id, tile.text]));
  const textOf = (tileId: string | null) => (tileId === null ? null : (textById.get(tileId) ?? null));
  const { kind } = item.exercise.content;
  if (kind === "fill_blank") return { kind, chosen: draft.tileIds.map(textOf) };
  if (kind === "jumble") return { kind, placed: draft.tileIds.flatMap((tileId) => textOf(tileId) ?? []) };
  return { kind, text: draft.text };
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** A score this high counts as mastered, and each mastered attempt in a row doubles the rest before it comes back. */
const MASTERED_SCORE = 0.9;

interface ExerciseHistory {
  lastScore: number;
  /** Recent attempts count more */
  recentScore: number;
  masteredInRow: number;
  lastAnsweredAt: number;
  averageResponseMs: number | null;
}

/**
 * Picks the exercises for a practice run by weighted random sampling, with weights learned from the user's attempts:
 * - low last and recent scores raise the weight, and so does a topic (a tag or a transformation task) the user
 *   scores low on overall, and words the user keeps getting wrong;
 * - mastered exercises rest for 1, 2, 4, 8 … days and then come back gradually;
 * - exercises the user is slow on come back a little more often;
 * - never-tried exercises get a steady share, and an exercise answered in the last few minutes almost never repeats.
 */
export function selectSentences(input: {
  exercises: readonly SentenceExercise[];
  attempts: readonly SentenceAttempt[];
  count: number;
  now: Date;
  randomSource: RandomSource;
}): SentenceExercise[] {
  const { exercises, attempts, count, now, randomSource } = input;
  const historyById = summarizeAttempts(attempts);
  const topicScores = topicScoresOf(exercises, attempts);
  const missedCounts = missedWordCounts(attempts, new Map(exercises.map((exercise) => [exercise.id, exercise])));
  const responseTimes = Array.from(historyById.values()).flatMap((history) => (history.averageResponseMs === null ? [] : [history.averageResponseMs]));
  const typicalResponseMs = median(responseTimes);

  const weight = (exercise: SentenceExercise): number => {
    const weakestTopic = Math.min(1, ...topicKeysOf(exercise).map((key) => topicScores.get(key) ?? 1));
    const troubleWordCount = Array.from(answerWordsOf(exercise)).filter((word) => (missedCounts.get(word) ?? 0) >= 2).length;
    const topicFactor = (2 - weakestTopic) * (1 + 0.25 * Math.min(4, troubleWordCount));
    const history = historyById.get(exercise.id);
    if (!history) return 1.5 * topicFactor;

    const need = (1 - history.lastScore) * 2 + (1 - history.recentScore);
    const restDays = 2 ** history.masteredInRow;
    const due = Math.min((now.getTime() - history.lastAnsweredAt) / DAY_MS / restDays, 3);
    const slowFactor = typicalResponseMs !== null && history.averageResponseMs !== null && history.averageResponseMs > typicalResponseMs * 1.5 ? 1.3 : 1;
    const restFactor = now.getTime() - history.lastAnsweredAt < 10 * MINUTE_MS ? 0.1 : 1;
    return (0.2 + need * 2 + due * 0.5) * topicFactor * slowFactor * restFactor;
  };

  return weightedSample(exercises, count, weight, randomSource);
}

/** The words to pick from: the answers (or the sentence's words) mixed with the distractors, shuffled. */
export function buildTiles(exercise: SentenceExercise, includeDistractors: boolean, randomSource: RandomSource): Tile[] {
  const { content } = exercise;
  if (content.kind === "transform") return [];
  const words =
    content.kind === "fill_blank"
      ? [...content.answers, ...content.distractors]
      : [...splitJumble(content.sentence).tokens, ...(includeDistractors ? content.distractors : [])];
  return shuffle(
    words.map((text, index) => ({ id: `${exercise.id}:${index}`, text })),
    randomSource
  );
}

function summarizeAttempts(attempts: readonly SentenceAttempt[]): Map<string, ExerciseHistory> {
  const byExercise = new Map<string, SentenceAttempt[]>();
  for (const attempt of attempts) byExercise.set(attempt.exerciseId, [...(byExercise.get(attempt.exerciseId) ?? []), attempt]);

  const historyById = new Map<string, ExerciseHistory>();
  for (const [exerciseId, list] of byExercise) {
    const ordered = [...list].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
    let recentScore = scoreOf(ordered[0]);
    let masteredInRow = 0;
    for (const attempt of ordered) {
      const score = scoreOf(attempt);
      recentScore = recentScore * 0.5 + score * 0.5;
      masteredInRow = score >= MASTERED_SCORE ? masteredInRow + 1 : 0;
    }
    const timed = ordered.flatMap((attempt) => (attempt.responseMs === null ? [] : [attempt.responseMs]));
    const last = ordered[ordered.length - 1];
    historyById.set(exerciseId, {
      lastScore: scoreOf(last),
      recentScore,
      masteredInRow,
      lastAnsweredAt: new Date(last.answeredAt).getTime(),
      averageResponseMs: timed.length ? timed.reduce((sum, value) => sum + value, 0) / timed.length : null,
    });
  }
  return historyById;
}

/** The user's average score per topic key, over every attempt on an exercise with that topic. */
function topicScoresOf(exercises: readonly SentenceExercise[], attempts: readonly SentenceAttempt[]): Map<string, number> {
  const topicsById = new Map(exercises.map((exercise) => [exercise.id, topicKeysOf(exercise)]));
  const totalsByTopic = new Map<string, { sum: number; count: number }>();
  for (const attempt of attempts) {
    for (const key of topicsById.get(attempt.exerciseId) ?? []) {
      const total = totalsByTopic.get(key) ?? { sum: 0, count: 0 };
      totalsByTopic.set(key, { sum: total.sum + scoreOf(attempt), count: total.count + 1 });
    }
  }
  return new Map(Array.from(totalsByTopic, ([key, total]) => [key, total.sum / total.count]));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
