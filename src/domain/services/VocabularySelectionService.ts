import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { DifficultyRating, ProgressState } from "@domain/entities/Review";
import { LetterFilter } from "@domain/entities/QuizSettings";

/** Ratings meaning "still needs practice" — always prioritized into every session. */
const WEAK_RATINGS: DifficultyRating[] = ["very_bad", "bad", "good"];

/** Ratings meaning "mastered enough for now" — held back until the rest of the vocabulary has been seen. */
const STRONG_RATINGS: DifficultyRating[] = ["very_easy", "easy"];

const SEVERITY_ORDER: Record<DifficultyRating, number> = {
  very_bad: 0,
  bad: 1,
  good: 2,
  easy: 3,
  very_easy: 4,
};

/** Sanitizes a raw letter-filter input: letters only, single character, last one typed wins. */
export function sanitizeLetterInput(raw: string): string {
  const lettersOnly = raw.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
  if (lettersOnly.length === 0) return "";
  return lettersOnly.slice(-1).toLocaleLowerCase("de");
}

export interface LetterFilterResult {
  candidates: VocabularyEntry[];
  /** True when only `from` was given (no `to`, no `toEnd`) — a focused single-letter session. */
  isSingleLetterMode: boolean;
}

/**
 * Filters vocabulary by starting letter. With only `from` set, matches that
 * exact letter and flags single-letter mode (the caller should then include
 * every match, ignoring both the question-count cap and the rating-based
 * exclusion rules). With `to` or `toEnd` also set, matches the inclusive
 * letter range instead.
 */
export function filterByLetterRange(
  entries: VocabularyEntry[],
  filter?: LetterFilter
): LetterFilterResult {
  const from = filter?.from ? sanitizeLetterInput(filter.from) : "";
  if (!from) return { candidates: entries, isSingleLetterMode: false };

  const isSingleLetterMode = !filter?.to && !filter?.toEnd;

  if (isSingleLetterMode) {
    const candidates = entries.filter(
      (e) => e.headword.charAt(0).toLocaleLowerCase("de") === from
    );
    return { candidates, isSingleLetterMode: true };
  }

  const to = filter?.toEnd ? "z" : sanitizeLetterInput(filter?.to ?? "z") || "z";
  const candidates = entries.filter((e) => {
    const letter = e.headword.charAt(0).toLocaleLowerCase("de");
    return letter.localeCompare(from, "de") >= 0 && letter.localeCompare(to, "de") <= 0;
  });
  return { candidates, isSingleLetterMode: false };
}

/**
 * Picks which words go into a quiz session, in priority order:
 * 1. Words previously rated very_bad/bad/good — always included first, so
 *    the user keeps practicing what they struggle with.
 * 2. Never-attempted words — fill the rest of the quota.
 * 3. Words previously rated easy/very_easy — only pulled in if there
 *    weren't enough unseen words to fill the quota (i.e. the user has
 *    worked through the rest of the vocabulary already).
 *
 * `includeAllRegardlessOfRating` bypasses all of this and simply returns
 * every candidate — used for single-letter focused sessions.
 */
export function selectQuizEntries(
  candidates: VocabularyEntry[],
  progressByEntryId: Map<string, ProgressState>,
  quota: number,
  includeAllRegardlessOfRating: boolean
): VocabularyEntry[] {
  if (includeAllRegardlessOfRating) return candidates;

  const weak: VocabularyEntry[] = [];
  const unseen: VocabularyEntry[] = [];
  const strong: VocabularyEntry[] = [];

  for (const entry of candidates) {
    const rating = progressByEntryId.get(entry.id)?.lastRating ?? null;
    if (rating === null) {
      unseen.push(entry);
    } else if (WEAK_RATINGS.includes(rating)) {
      weak.push(entry);
    } else if (STRONG_RATINGS.includes(rating)) {
      strong.push(entry);
    } else {
      unseen.push(entry);
    }
  }

  weak.sort((a, b) => {
    const ratingA = progressByEntryId.get(a.id)?.lastRating ?? "good";
    const ratingB = progressByEntryId.get(b.id)?.lastRating ?? "good";
    return SEVERITY_ORDER[ratingA] - SEVERITY_ORDER[ratingB];
  });

  const selected: VocabularyEntry[] = [];
  for (const pool of [weak, unseen, strong]) {
    for (const entry of pool) {
      if (selected.length >= quota) return selected;
      selected.push(entry);
    }
  }
  return selected;
}
