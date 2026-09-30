import { DifficultyRating, QuestionMode, isWeakRating } from "@domain/entities/Learning";
import { LanguageCode } from "@domain/entities/Language";
import { Word } from "@domain/entities/Word";

/**
 * In-session behaviour, as immutable state + pure transitions (React
 * friendly). A word rated bad / very bad comes back once more a few
 * questions later in the same session, so the user gets a second go while
 * the answer is still fresh.
 */

export interface QuizItem {
  key: string;
  word: Word;
  sourceLanguage: LanguageCode;
  mode: QuestionMode;
  /** 0 for the first time in this session, 1 for the in-session retry */
  attempt: number;
}

export interface QuizAnswer {
  key: string;
  wordId: string;
  rating: DifficultyRating;
  /** The per-word time limit ran out before the user answered */
  timedOut: boolean;
}

/** Why a session ended before every item was answered. */
export type EndReason = "time_up" | "exited";

export interface QuizSessionState {
  items: QuizItem[];
  index: number;
  answers: QuizAnswer[];
  endedEarly: EndReason | null;
}

/** Questions to wait before a missed word comes back. */
export const RETRY_GAP = 3;
export const MAX_RETRIES_PER_WORD = 1;

export function createQuizSession(items: QuizItem[]): QuizSessionState {
  return { items, index: 0, answers: [], endedEarly: null };
}

export function currentItem(state: QuizSessionState): QuizItem | null {
  if (state.endedEarly) return null;
  return state.items[state.index] ?? null;
}

export function isFinished(state: QuizSessionState): boolean {
  return state.endedEarly !== null || state.index >= state.items.length;
}

/**
 * Ends the session now (time limit reached or the user left). Items not yet
 * answered are simply not recorded — those words stay untouched.
 */
export function endSession(state: QuizSessionState, reason: EndReason): QuizSessionState {
  if (isFinished(state)) return state;
  return { ...state, endedEarly: reason };
}

export function answerCurrent(
  state: QuizSessionState,
  rating: DifficultyRating,
  options: { timedOut?: boolean } = {}
): QuizSessionState {
  const item = currentItem(state);
  if (!item) return state;

  const answers = [...state.answers, { key: item.key, wordId: item.word.id, rating, timedOut: options.timedOut ?? false }];
  let items = state.items;

  if (isWeakRating(rating) && item.attempt < MAX_RETRIES_PER_WORD) {
    const retry: QuizItem = {
      ...item,
      key: `${item.key}#retry${item.attempt + 1}`,
      attempt: item.attempt + 1,
      // Recognition first: a failed sentence prompt is retried as a plain translation.
      mode: item.mode === "sentence_writing" ? "source_to_target" : item.mode,
    };
    const insertAt = Math.min(state.index + 1 + RETRY_GAP, items.length);
    items = [...items.slice(0, insertAt), retry, ...items.slice(insertAt)];
  }

  return { ...state, items, index: state.index + 1, answers };
}

export function willRetry(item: QuizItem, rating: DifficultyRating): boolean {
  return isWeakRating(rating) && item.attempt < MAX_RETRIES_PER_WORD;
}

export interface SessionSummary {
  answered: number;
  uniqueWords: number;
  byRating: Record<DifficultyRating, number>;
  timedOut: number;
  /** Questions never reached because the session ended early */
  notReached: number;
  /** Share of answers rated good or better, 0..1 (null with no answers) */
  successRate: number | null;
  endedEarly: EndReason | null;
}

export function summarize(state: QuizSessionState): SessionSummary {
  const byRating: Record<DifficultyRating, number> = { very_easy: 0, easy: 0, good: 0, bad: 0, very_bad: 0 };
  for (const answer of state.answers) byRating[answer.rating] += 1;
  const answered = state.answers.length;
  const good = byRating.very_easy + byRating.easy + byRating.good;
  return {
    answered,
    uniqueWords: new Set(state.answers.map((a) => a.wordId)).size,
    byRating,
    timedOut: state.answers.filter((a) => a.timedOut).length,
    notReached: Math.max(0, state.items.length - state.index),
    successRate: answered === 0 ? null : good / answered,
    endedEarly: state.endedEarly,
  };
}
