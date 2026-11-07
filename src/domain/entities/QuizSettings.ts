/**
 * How translation-direction questions are drawn for a quiz session.
 * "mix" lets the algorithm pick per word, favouring the direction the user
 * is weaker at.
 */
export type QuizDirection = "source_to_target" | "target_to_source" | "mix";

export const QUIZ_DIRECTIONS: QuizDirection[] = ["source_to_target", "target_to_source", "mix"];

/**
 * - none: classic, no time limit
 * - quiz: one countdown for the whole quiz; words not reached stay untouched
 * - word: a countdown per word; running out counts as "very bad"
 */
export type TimerMode = "none" | "quiz" | "word";

export const TIMER_MODES: TimerMode[] = ["none", "quiz", "word"];

export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 200;

/** Allowed timer range: 1 second to 5 hours. */
export const MIN_TIMER_SECONDS = 1;
export const MAX_TIMER_SECONDS = 5 * 60 * 60;

export interface QuizSettings {
  questionCount: number;
  direction: QuizDirection;
  includeSentenceWriting: boolean;
  /** Vocabularies to draw from; empty means "all quiz-eligible vocabularies" */
  vocabularyIds: string[];
  /** Upper-cased starting letters to restrict to; empty means "any letter" */
  letters: string[];
  timerMode: TimerMode;
  /** Whole-quiz time limit, used when timerMode is "quiz" */
  quizTimerSeconds: number;
  /** Per-word time limit, used when timerMode is "word" */
  wordTimerSeconds: number;
}

export const ALL_LETTERS_COLLECTION = "all";

/** The collection a quiz belongs to: "all", or its letters sorted ("B", "A,B"). Each collection has its own rounds. */
export function collectionKeyOf(letters: readonly string[]): string {
  if (letters.length === 0) return ALL_LETTERS_COLLECTION;
  // Code-point order, the same as the backfill migration's collate "C".
  return Array.from(new Set(letters.map((letter) => letter.toLocaleUpperCase()))).sort().join(",");
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  questionCount: 20,
  direction: "mix",
  includeSentenceWriting: true,
  vocabularyIds: [],
  letters: [],
  timerMode: "none",
  quizTimerSeconds: 5 * 60,
  wordTimerSeconds: 10,
};

export function clampQuestionCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_QUIZ_SETTINGS.questionCount;
  return Math.min(MAX_QUESTION_COUNT, Math.max(MIN_QUESTION_COUNT, Math.round(value)));
}

// "All" is stored as MAX_QUESTION_COUNT; in a letter quiz it means every word of those letters, with no cap.
export function questionQuota(settings: Pick<QuizSettings, "questionCount" | "letters">, poolSize: number): number {
  if (settings.letters.length > 0 && settings.questionCount >= MAX_QUESTION_COUNT) return poolSize;
  return Math.min(clampQuestionCount(settings.questionCount), poolSize);
}

export function isValidTimerSeconds(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TIMER_SECONDS && value <= MAX_TIMER_SECONDS;
}

export function clampTimerSeconds(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, Math.round(value)));
}

/** The active time limit in seconds, or null for an untimed quiz. */
export function activeTimerSeconds(settings: Pick<QuizSettings, "timerMode" | "quizTimerSeconds" | "wordTimerSeconds">): number | null {
  if (settings.timerMode === "quiz") return settings.quizTimerSeconds;
  if (settings.timerMode === "word") return settings.wordTimerSeconds;
  return null;
}

/** Coerces persisted/unknown settings into a valid QuizSettings. */
export function normalizeQuizSettings(value: unknown): QuizSettings {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_QUIZ_SETTINGS };
  const raw = value as Record<string, unknown>;
  const defaults = DEFAULT_QUIZ_SETTINGS;
  return {
    questionCount: clampQuestionCount(Number(raw.questionCount ?? defaults.questionCount)),
    direction: QUIZ_DIRECTIONS.includes(raw.direction as QuizDirection) ? (raw.direction as QuizDirection) : defaults.direction,
    includeSentenceWriting:
      typeof raw.includeSentenceWriting === "boolean" ? raw.includeSentenceWriting : defaults.includeSentenceWriting,
    vocabularyIds: Array.isArray(raw.vocabularyIds)
      ? raw.vocabularyIds.filter((value): value is string => typeof value === "string")
      : [],
    letters: Array.isArray(raw.letters) ? raw.letters.filter((value): value is string => typeof value === "string") : [],
    timerMode: TIMER_MODES.includes(raw.timerMode as TimerMode) ? (raw.timerMode as TimerMode) : defaults.timerMode,
    quizTimerSeconds: clampTimerSeconds(Number(raw.quizTimerSeconds ?? defaults.quizTimerSeconds), defaults.quizTimerSeconds),
    wordTimerSeconds: clampTimerSeconds(Number(raw.wordTimerSeconds ?? defaults.wordTimerSeconds), defaults.wordTimerSeconds),
  };
}
