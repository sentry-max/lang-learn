import { TimerMode } from "@domain/entities/QuizSettings";
import { SentenceExerciseKind } from "@domain/entities/SentenceExercise";

/** What the user gave as the answer to one sentence exercise, as text. */
export type SentenceAnswer =
  /** The word put in each blank, in order; null for a blank left empty */
  | { kind: "fill_blank"; chosen: (string | null)[] }
  /** The words in the order the user placed them */
  | { kind: "jumble"; placed: string[] }
  | { kind: "transform"; text: string };

/** One answered sentence exercise. Its score is worked out from the errors, never stored. */
export interface SentenceAttempt {
  id: string;
  exerciseId: string;
  /** Groups the attempts of one practice run */
  sessionId: string;
  kind: SentenceExerciseKind;
  timerMode: TimerMode;
  errorCount: number;
  /** The most errors this exercise allows: the benchmark the score is measured against */
  maxErrors: number;
  /** The time per sentence ran out and what was there was graded */
  timedOut: boolean;
  answer: SentenceAnswer;
  shownAt: string;
  answeredAt: string;
  responseMs: number | null;
}

export const MIN_SENTENCE_COUNT = 1;
export const MAX_SENTENCE_COUNT = 100;

export interface SentencePracticeSettings {
  kind: SentenceExerciseKind;
  sentenceCount: number;
  /** Jumbled sentences only: mix in words that don't belong to the sentence */
  includeDistractors: boolean;
  /** Misspelt words in a rewritten sentence are marked but not counted */
  tolerateTypos: boolean;
  /** Sentence collections to draw from; empty means nothing chosen yet */
  collectionIds: string[];
  /** "quiz" is the total time, "word" the time per sentence */
  timerMode: TimerMode;
  quizTimerSeconds: number;
  wordTimerSeconds: number;
}

export const DEFAULT_SENTENCE_SETTINGS: SentencePracticeSettings = {
  kind: "fill_blank",
  sentenceCount: 10,
  includeDistractors: false,
  tolerateTypos: true,
  collectionIds: [],
  timerMode: "none",
  quizTimerSeconds: 5 * 60,
  wordTimerSeconds: 30,
};

/** 0..1: how much of the allowed errors were avoided. More errors than allowed (typed extra words) score 0. */
export function scoreOf(result: Pick<SentenceAttempt, "errorCount" | "maxErrors">): number {
  if (result.maxErrors <= 0) return 1;
  return Math.max(0, 1 - result.errorCount / result.maxErrors);
}

/** The score of several attempts together: all errors against all allowed errors. */
export function totalScore(results: readonly Pick<SentenceAttempt, "errorCount" | "maxErrors">[]): number | null {
  const maxErrors = results.reduce((sum, result) => sum + result.maxErrors, 0);
  if (maxErrors === 0) return null;
  const errorCount = results.reduce((sum, result) => sum + Math.min(result.errorCount, result.maxErrors), 0);
  return 1 - errorCount / maxErrors;
}

/** Coerces a stored answer into a SentenceAnswer of the given kind. */
export function normalizeSentenceAnswer(value: unknown, kind: SentenceExerciseKind): SentenceAnswer {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []);
  if (kind === "fill_blank") {
    const chosen = Array.isArray(raw.chosen) ? raw.chosen.map((item) => (typeof item === "string" ? item : null)) : [];
    return { kind, chosen };
  }
  if (kind === "jumble") return { kind, placed: strings(raw.placed) };
  return { kind, text: typeof raw.text === "string" ? raw.text : "" };
}
