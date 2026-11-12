import { SentenceExercise, SentenceExerciseKind, TransformTask } from "@domain/entities/SentenceExercise";
import { SentenceAttempt, totalScore } from "@domain/entities/SentencePractice";
import { SentenceGrade, gradeAnswer } from "@domain/services/SentenceGrading";

/**
 * What the user's sentence attempts say about them: scores per exercise kind, per grammar topic (the author's tags)
 * and per transformation task, which kinds of mistakes they make, which words they keep getting wrong, and how
 * they are doing lately. Everything is worked out from the stored attempts; nothing extra is saved.
 */

export type InsightTopic =
  | { kind: "tag"; tag: string }
  | { kind: "task"; task: TransformTask }
  | { kind: "exerciseKind"; exerciseKind: SentenceExerciseKind };

export interface TopicScore {
  /** Stable key: "tag:dative", "task:negative", "kind:jumble" */
  key: string;
  topic: InsightTopic;
  attemptCount: number;
  score: number;
}

export interface ErrorBreakdown {
  wrong: number;
  missing: number;
  extra: number;
  /** Misspellings that were forgiven */
  typo: number;
}

export interface TroubleWord {
  word: string;
  missCount: number;
}

export interface DailyActivity {
  /** Local calendar day, YYYY-MM-DD */
  day: string;
  attemptCount: number;
  score: number | null;
}

export interface SentenceInsights {
  attemptCount: number;
  score: number | null;
  /** The last 7 days, and the 7 before, to show the trend */
  recentScore: number | null;
  previousScore: number | null;
  averageResponseMs: number | null;
  byKind: TopicScore[];
  /** Grammar topics and transformation tasks, weakest first */
  topics: TopicScore[];
  /** Topics with enough attempts and a low score: what to practice next */
  weakAreas: TopicScore[];
  errors: ErrorBreakdown;
  troubleWords: TroubleWord[];
  /** The last 14 days, oldest first */
  activity: DailyActivity[];
}

const DAY_MS = 24 * 3600 * 1000;
const WEAK_SCORE = 0.75;
const WEAK_MIN_ATTEMPTS = 2;
const TROUBLE_WORD_COUNT = 8;
const ACTIVITY_DAYS = 14;

/** The topics an exercise trains: its tags and, for a transformation, its task. */
export function topicKeysOf(exercise: SentenceExercise): string[] {
  const keys = exercise.tags.map((tag) => `tag:${tag}`);
  if (exercise.content.kind === "transform") keys.push(`task:${exercise.content.task}`);
  return keys;
}

/** How often each word (lower case) was put wrong or left out, over the attempts whose exercise is known. */
export function missedWordCounts(attempts: readonly SentenceAttempt[], exercisesById: ReadonlyMap<string, SentenceExercise>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    const grade = regrade(attempt, exercisesById);
    for (const mark of grade?.marks ?? []) {
      if ((mark.status !== "wrong" && mark.status !== "missing") || !mark.expected) continue;
      const word = wordKey(mark.expected);
      if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return counts;
}

/** The words of an exercise's correct answers, as missedWordCounts keys them. */
export function answerWordsOf(exercise: SentenceExercise): Set<string> {
  const { content } = exercise;
  const texts = content.kind === "fill_blank" ? content.answers : content.kind === "jumble" ? [content.sentence] : content.answers;
  return new Set(texts.flatMap((text) => text.split(/\s+/u)).map(wordKey).filter(Boolean));
}

export function analyzeSentenceAttempts(
  attempts: readonly SentenceAttempt[],
  exercises: readonly SentenceExercise[],
  now: Date
): SentenceInsights {
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const attemptsByKey = new Map<string, { topic: InsightTopic; attempts: SentenceAttempt[] }>();
  const addTo = (key: string, topic: InsightTopic, attempt: SentenceAttempt) => {
    const group = attemptsByKey.get(key) ?? { topic, attempts: [] };
    group.attempts.push(attempt);
    attemptsByKey.set(key, group);
  };

  const errors: ErrorBreakdown = { wrong: 0, missing: 0, extra: 0, typo: 0 };
  for (const attempt of attempts) {
    addTo(`kind:${attempt.kind}`, { kind: "exerciseKind", exerciseKind: attempt.kind }, attempt);
    const exercise = exercisesById.get(attempt.exerciseId);
    if (exercise) {
      for (const tag of exercise.tags) addTo(`tag:${tag}`, { kind: "tag", tag }, attempt);
      if (exercise.content.kind === "transform") addTo(`task:${exercise.content.task}`, { kind: "task", task: exercise.content.task }, attempt);
    }
    for (const mark of regrade(attempt, exercisesById)?.marks ?? []) {
      if (mark.status === "wrong" || mark.status === "missing" || mark.status === "extra" || mark.status === "typo") errors[mark.status] += 1;
    }
  }

  const scores: TopicScore[] = Array.from(attemptsByKey, ([key, group]) => ({
    key,
    topic: group.topic,
    attemptCount: group.attempts.length,
    score: totalScore(group.attempts) ?? 1,
  }));
  const topics = scores.filter((score) => score.topic.kind !== "exerciseKind").sort((a, b) => a.score - b.score || b.attemptCount - a.attemptCount);

  const daysAgo = (attempt: SentenceAttempt) => (now.getTime() - new Date(attempt.answeredAt).getTime()) / DAY_MS;
  const timed = attempts.flatMap((attempt) => (attempt.responseMs === null ? [] : [attempt.responseMs]));
  const troubleWords = Array.from(missedWordCounts(attempts, exercisesById), ([word, missCount]) => ({ word, missCount }))
    .filter((troubleWord) => troubleWord.missCount >= 2)
    .sort((a, b) => b.missCount - a.missCount || a.word.localeCompare(b.word))
    .slice(0, TROUBLE_WORD_COUNT);

  return {
    attemptCount: attempts.length,
    score: totalScore(attempts),
    recentScore: totalScore(attempts.filter((attempt) => daysAgo(attempt) < 7)),
    previousScore: totalScore(attempts.filter((attempt) => daysAgo(attempt) >= 7 && daysAgo(attempt) < 14)),
    averageResponseMs: timed.length ? Math.round(timed.reduce((sum, value) => sum + value, 0) / timed.length) : null,
    byKind: scores.filter((score) => score.topic.kind === "exerciseKind"),
    topics,
    weakAreas: topics.filter((score) => score.attemptCount >= WEAK_MIN_ATTEMPTS && score.score < WEAK_SCORE).slice(0, 5),
    errors,
    troubleWords,
    activity: activityOf(attempts, now),
  };
}

function activityOf(attempts: readonly SentenceAttempt[], now: Date): DailyActivity[] {
  const days: DailyActivity[] = [];
  for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset--) {
    const day = localDay(new Date(now.getTime() - offset * DAY_MS));
    const ofDay = attempts.filter((attempt) => localDay(new Date(attempt.answeredAt)) === day);
    days.push({ day, attemptCount: ofDay.length, score: totalScore(ofDay) });
  }
  return days;
}

function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function regrade(attempt: SentenceAttempt, exercisesById: ReadonlyMap<string, SentenceExercise>): SentenceGrade | null {
  const exercise = exercisesById.get(attempt.exerciseId);
  if (!exercise || exercise.content.kind !== attempt.answer.kind) return null;
  return gradeAnswer(exercise.content, attempt.answer);
}

/** A word without surrounding punctuation, in lower case; empty for punctuation alone. */
function wordKey(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLocaleLowerCase();
}
