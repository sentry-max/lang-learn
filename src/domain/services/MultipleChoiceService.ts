import { LanguageCode } from "@domain/entities/Language";
import { DifficultyRating, QuestionMode } from "@domain/entities/Learning";
import { Word, displayForm, resolveTranslations } from "@domain/entities/Word";
import { RandomSource, shuffle } from "@domain/services/Random";

/**
 * Multiple-choice questions: the four options of a question and how a chosen option is rated.
 * Distractors are drawn from the quiz's dictionary, closest first: shared tags (meaning), then a
 * similar spelling, then the most shared first or last letters (3, 2, 1), then any word at random.
 */

export const CHOICE_OPTION_COUNT = 4;

/** Share of a question's time in which a correct choice is "very easy", then "easy"; the rest is "good". */
export const VERY_EASY_TIME_SHARE = 0.55;
export const EASY_TIME_SHARE = 0.8;

const SIMILAR_SPELLING_THRESHOLD = 0.5;
const MAX_SHARED_AFFIX = 3;

export interface ChoiceOption {
  text: string;
  isCorrect: boolean;
}

/** What a word looks like as the answer to a question asked in one direction. */
export interface ChoiceAnswer {
  /** Shown on the option button */
  text: string;
  /** Compared for spelling and shared letters: the headword without its article, or the translation */
  form: string;
  language: LanguageCode;
  tags: readonly string[];
  /** Texts that would also be a correct answer; a distractor matching one of them is never offered */
  equivalents: readonly string[];
}

/** The answer of `word` in `mode`, or null when it has nothing to show (no translation). */
export function choiceAnswerOf(
  word: Word,
  mode: QuestionMode,
  sourceLanguage: LanguageCode,
  primaryLanguage: LanguageCode
): ChoiceAnswer | null {
  if (mode === "target_to_source") {
    const headword = word.headword.trim();
    if (!headword) return null;
    return { text: displayForm(word), form: headword, language: sourceLanguage, tags: word.tags, equivalents: [headword, displayForm(word)] };
  }
  const translations = resolveTranslations(word, primaryLanguage);
  const first = translations.values[0];
  if (!first) return null;
  return { text: first, form: first, language: translations.language, tags: word.tags, equivalents: translations.values };
}

/** The correct answer plus up to three distractors from `dictionary`, shuffled. Never empty. */
export function pickChoiceOptions(correct: ChoiceAnswer, dictionary: readonly ChoiceAnswer[], randomSource: RandomSource): ChoiceOption[] {
  const takenKeys = new Set(correct.equivalents.map(comparisonKey));
  takenKeys.add(comparisonKey(correct.text));
  const correctTags = new Set(correct.tags.map(comparisonKey));
  const correctForm = comparisonKey(correct.form);

  const ranked = shuffle(dictionary, randomSource)
    .filter((candidate) => candidate.language === correct.language && candidate.text.trim() !== "")
    .map((candidate) => ({ candidate, ...closeness(candidate, correctTags, correctForm) }))
    .sort((a, b) => a.tier - b.tier || b.strength - a.strength);

  const distractors: string[] = [];
  for (const { candidate } of ranked) {
    if (distractors.length === CHOICE_OPTION_COUNT - 1) break;
    if (candidate.equivalents.some((text) => takenKeys.has(comparisonKey(text))) || takenKeys.has(comparisonKey(candidate.text))) continue;
    takenKeys.add(comparisonKey(candidate.text));
    distractors.push(candidate.text);
  }

  return shuffle(
    [{ text: correct.text, isCorrect: true }, ...distractors.map((text) => ({ text, isCorrect: false }))],
    randomSource
  );
}

/** Lower tier is closer; within a tier, higher strength is closer. */
function closeness(candidate: ChoiceAnswer, correctTags: Set<string>, correctForm: string): { tier: number; strength: number } {
  const form = comparisonKey(candidate.form);
  const sharedTags = candidate.tags.filter((tag) => correctTags.has(comparisonKey(tag))).length;
  if (sharedTags > 0) return { tier: 0, strength: sharedTags + spellingSimilarity(form, correctForm) / 2 };
  const similarity = spellingSimilarity(form, correctForm);
  if (similarity >= SIMILAR_SPELLING_THRESHOLD) return { tier: 1, strength: similarity };
  const sharedAffix = Math.min(MAX_SHARED_AFFIX, Math.max(sharedPrefixLength(form, correctForm), sharedPrefixLength(reverse(form), reverse(correctForm))));
  if (sharedAffix > 0) return { tier: 2, strength: sharedAffix };
  return { tier: 3, strength: 0 };
}

/** 1 for the same text, 0 for nothing in common: 1 - edit distance / longer length. */
export function spellingSimilarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  // Too different in length to reach the threshold; skips the distance on most of a large dictionary.
  if (Math.abs(a.length - b.length) / longer > 1 - SIMILAR_SPELLING_THRESHOLD) return 0;
  return 1 - editDistance(a, b) / longer;
}

function editDistance(a: string, b: string): number {
  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let rowIndex = 1; rowIndex <= a.length; rowIndex++) {
    const row = [rowIndex];
    for (let columnIndex = 1; columnIndex <= b.length; columnIndex++) {
      const substitution = previousRow[columnIndex - 1] + (a[rowIndex - 1] === b[columnIndex - 1] ? 0 : 1);
      row.push(Math.min(previousRow[columnIndex] + 1, row[columnIndex - 1] + 1, substitution));
    }
    previousRow = row;
  }
  return previousRow[b.length];
}

function sharedPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

function reverse(text: string): string {
  return Array.from(text).reverse().join("");
}

function comparisonKey(text: string): string {
  return text.trim().normalize("NFC").toLocaleLowerCase();
}

/**
 * The rating of a chosen option. Untimed: correct is "easy". Timed: correct within the first 55% of the
 * question's time is "very easy", within the next 25% "easy", later "good". A wrong choice is always "very bad".
 */
export function choiceRating(isCorrect: boolean, elapsedMs: number, limitMs: number | null): DifficultyRating {
  if (!isCorrect) return "very_bad";
  if (limitMs === null || limitMs <= 0) return "easy";
  const share = elapsedMs / limitMs;
  if (share <= VERY_EASY_TIME_SHARE) return "very_easy";
  if (share <= EASY_TIME_SHARE) return "easy";
  return "good";
}

/** A question's share of a whole-quiz timer, so every remaining question fits before the quiz ends. */
export function choiceTimeSliceMs(remainingQuizMs: number, remainingQuestions: number): number {
  return Math.max(0, remainingQuizMs) / Math.max(1, remainingQuestions);
}
