/**
 * A sentence exercise inside a sentence collection. The collection decides its language; what the user must do
 * depends on its `content.kind`.
 */

import { CefrLevel, SentenceTranslationMap } from "@domain/entities/Word";

export type SentenceExerciseKind = "fill_blank" | "jumble" | "transform";

export const SENTENCE_EXERCISE_KINDS: SentenceExerciseKind[] = ["fill_blank", "jumble", "transform"];

export function isSentenceExerciseKind(value: unknown): value is SentenceExerciseKind {
  return typeof value === "string" && (SENTENCE_EXERCISE_KINDS as string[]).includes(value);
}

/** What a transformation exercise asks the user to change the sentence into. */
export type TransformTask =
  | "present"
  | "simple_past"
  | "present_perfect"
  | "past_perfect"
  | "future"
  | "future_perfect"
  | "negative"
  | "question"
  | "passive"
  | "active";

export const TRANSFORM_TASKS: TransformTask[] = [
  "present",
  "simple_past",
  "present_perfect",
  "past_perfect",
  "future",
  "future_perfect",
  "negative",
  "question",
  "passive",
  "active",
];

/** Marks a blank in a fill-in-the-blank sentence. */
export const BLANK_MARK = "___";

export const MAX_BLANKS = 2;

export type SentenceContent =
  /** `sentence` holds one or two BLANK_MARKs; `answers` has one word per blank, in order */
  | { kind: "fill_blank"; sentence: string; answers: string[]; distractors: string[] }
  /** `alternatives` are other accepted word orders of the same words */
  | { kind: "jumble"; sentence: string; alternatives: string[]; distractors: string[] }
  /** `answers` are the accepted results; the first is shown as the correct one */
  | { kind: "transform"; sentence: string; task: TransformTask; answers: string[] };

export interface SentenceExercise {
  id: string;
  collectionId: string;
  /** Stable id from an imported JSON file; re-importing the same id updates the exercise */
  externalId: string | null;
  content: SentenceContent;
  /** Translations of the complete (target) sentence, shown as help */
  translations: SentenceTranslationMap;
  /** A short hint in any language, written by the author */
  hint: string;
  level: CefrLevel | null;
  tags: string[];
}

export type SentenceExerciseDraft = Omit<SentenceExercise, "id" | "collectionId">;

/** Detects the same exercise imported twice without an id. */
export function sentenceKey(exercise: Pick<SentenceExercise, "content">): string {
  const { content } = exercise;
  const task = content.kind === "transform" ? `:${content.task}` : "";
  return `${content.kind}${task}:${content.sentence.trim().normalize("NFC").toLocaleLowerCase()}`;
}

/** Splits a sentence into word tiles; a sentence-final mark (. ? !) is returned apart so it never gives away the last tile. */
export function splitJumble(sentence: string): { tokens: string[]; ending: string } {
  const trimmed = sentence.trim();
  const ending = /[.?!…]+$/u.exec(trimmed)?.[0] ?? "";
  const tokens = trimmed.slice(0, trimmed.length - ending.length).split(/\s+/u).filter(Boolean);
  return { tokens, ending };
}

/** The sentence split around its blanks: `parts.length` is always the number of blanks + 1. */
export function splitBlanks(sentence: string): string[] {
  return sentence.split(BLANK_MARK);
}
