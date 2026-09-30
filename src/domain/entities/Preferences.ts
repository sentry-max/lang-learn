import { DIFFICULTY_RATINGS, DifficultyRating } from "@domain/entities/Learning";

/** How the app looks and behaves for one user; stored in their profile. */

export type ThemePreference = "system" | "light" | "dark";
export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export type FontSizePreference = "small" | "medium" | "large" | "xlarge";
export const FONT_SIZE_PREFERENCES: FontSizePreference[] = ["small", "medium", "large", "xlarge"];

export const MIN_ADVANCE_DELAY_SECONDS = 0.5;
export const MAX_ADVANCE_DELAY_SECONDS = 60;

/** What happens after the user picks a rating. */
export interface RatingBehavior {
  /** Show the answer (translations / word) after rating */
  showAnswer: boolean;
  /** Move on automatically after `delaySeconds` instead of waiting for "Next" */
  autoAdvance: boolean;
  delaySeconds: number;
}

export interface Preferences {
  theme: ThemePreference;
  fontSize: FontSizePreference;
  /** Turns off decorative animations */
  reduceMotion: boolean;
  /** iPhone-style "Liquid Glass" look (translucent glass, iOS colors, icons and controls) in light and dark */
  liquidGlass: boolean;
  ratingBehavior: Record<DifficultyRating, RatingBehavior>;
  /** Show the example sentence right away instead of behind "Show hint" */
  autoShowHint: boolean;
  /** Short sounds for answers, time-outs and finishing — independent of pronunciation */
  soundEffects: boolean;
  /** Sound-effect volume, 0..1 */
  soundVolume: number;
  /** Short vibrations on answers and time-outs (phones that support it) */
  haptics: boolean;
  /** Read each word aloud when it appears (browser speech synthesis) */
  autoPronounce: boolean;
  /** Pronunciation speed, 0.5 (slow) .. 1.5 (fast) */
  speechRate: number;
  /** 1–5 to rate, Enter/Space for next, H for hint, P to pronounce */
  keyboardShortcuts: boolean;
  /** Keep the add-word dialog open after saving, ready for the next word */
  continuousAdd: boolean;
  /** Vocabularies pre-selected when opening the quiz; empty = choose each time */
  defaultVocabularyIds: string[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  fontSize: "medium",
  reduceMotion: false,
  liquidGlass: false,
  ratingBehavior: {
    very_easy: { showAnswer: true, autoAdvance: true, delaySeconds: 2 },
    easy: { showAnswer: true, autoAdvance: true, delaySeconds: 2 },
    good: { showAnswer: true, autoAdvance: true, delaySeconds: 2 },
    bad: { showAnswer: true, autoAdvance: false, delaySeconds: 5 },
    very_bad: { showAnswer: true, autoAdvance: false, delaySeconds: 5 },
  },
  autoShowHint: false,
  soundEffects: true,
  soundVolume: 0.6,
  haptics: true,
  autoPronounce: false,
  speechRate: 0.9,
  keyboardShortcuts: true,
  continuousAdd: false,
  defaultVocabularyIds: [],
};

export function clampAdvanceDelay(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_ADVANCE_DELAY_SECONDS, Math.max(MIN_ADVANCE_DELAY_SECONDS, Math.round(value * 10) / 10));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (value === undefined || value === null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

/** Coerces stored/unknown preferences into valid ones, filling gaps with defaults. */
export function normalizePreferences(value: unknown): Preferences {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;
  const bool = (key: keyof Preferences, fallback: boolean) => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback);

  const rawBehavior = (typeof raw.ratingBehavior === "object" && raw.ratingBehavior !== null
    ? raw.ratingBehavior
    : {}) as Record<string, unknown>;
  const ratingBehavior = {} as Record<DifficultyRating, RatingBehavior>;
  for (const rating of DIFFICULTY_RATINGS) {
    const fallback = d.ratingBehavior[rating];
    const r = (typeof rawBehavior[rating] === "object" && rawBehavior[rating] !== null
      ? rawBehavior[rating]
      : {}) as Record<string, unknown>;
    ratingBehavior[rating] = {
      showAnswer: typeof r.showAnswer === "boolean" ? r.showAnswer : fallback.showAnswer,
      autoAdvance: typeof r.autoAdvance === "boolean" ? r.autoAdvance : fallback.autoAdvance,
      delaySeconds: clampAdvanceDelay(Number(r.delaySeconds ?? fallback.delaySeconds), fallback.delaySeconds),
    };
  }

  return {
    theme: THEME_PREFERENCES.includes(raw.theme as ThemePreference) ? (raw.theme as ThemePreference) : d.theme,
    fontSize: FONT_SIZE_PREFERENCES.includes(raw.fontSize as FontSizePreference)
      ? (raw.fontSize as FontSizePreference)
      : d.fontSize,
    reduceMotion: bool("reduceMotion", d.reduceMotion),
    liquidGlass: bool("liquidGlass", d.liquidGlass),
    ratingBehavior,
    autoShowHint: bool("autoShowHint", d.autoShowHint),
    soundEffects: bool("soundEffects", d.soundEffects),
    soundVolume: clampNumber(raw.soundVolume, 0, 1, d.soundVolume),
    haptics: bool("haptics", d.haptics),
    autoPronounce: bool("autoPronounce", d.autoPronounce),
    speechRate: clampNumber(raw.speechRate, 0.5, 1.5, d.speechRate),
    keyboardShortcuts: bool("keyboardShortcuts", d.keyboardShortcuts),
    continuousAdd: bool("continuousAdd", d.continuousAdd),
    defaultVocabularyIds: Array.isArray(raw.defaultVocabularyIds)
      ? Array.from(new Set(raw.defaultVocabularyIds.filter((v): v is string => typeof v === "string"))).slice(0, 200)
      : [],
  };
}

/**
 * What the quiz does right after a rating: reveal the answer or not, and
 * move on after a delay or wait for "Next". Without a reveal there is
 * nothing to look at, so auto-advance happens at once.
 */
export interface AfterRating {
  reveal: boolean;
  /** Milliseconds until moving on, or null to wait for the user */
  advanceAfterMs: number | null;
}

export function afterRating(preferences: Preferences, rating: DifficultyRating): AfterRating {
  const behavior = preferences.ratingBehavior[rating];
  if (!behavior.autoAdvance) return { reveal: behavior.showAnswer, advanceAfterMs: null };
  return { reveal: behavior.showAnswer, advanceAfterMs: behavior.showAnswer ? behavior.delaySeconds * 1000 : 0 };
}

