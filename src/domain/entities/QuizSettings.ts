/**
 * How translation-direction questions are drawn for a quiz session.
 * "mix" alternates between both directions.
 */
export type QuizDirection = "de_to_target" | "target_to_de" | "mix";

export const QUIZ_DIRECTIONS: QuizDirection[] = ["de_to_target", "target_to_de", "mix"];

export const MIN_QUESTION_COUNT = 10;
export const MAX_QUESTION_COUNT = 200;

/**
 * Filters vocabulary by starting letter. `from` alone (no `to`, `toEnd`
 * false) means "only this exact letter, include every match". Supplying
 * `to` or setting `toEnd` means "everything from `from` through `to`
 * (or through the end of the alphabet)".
 */
export interface LetterFilter {
  from?: string;
  to?: string;
  toEnd?: boolean;
}

export interface QuizSettings {
  questionCount: number;
  direction: QuizDirection;
  includeSentenceWriting: boolean;
  letterFilter?: LetterFilter;
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  questionCount: 10,
  direction: "mix",
  includeSentenceWriting: true,
};
