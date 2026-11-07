import { LANGUAGES, LanguageCode } from "@domain/entities/Language";
import { Vocabulary, VocabularyInput, isFull } from "@domain/entities/Vocabulary";
import { Word, WordDraft, headwordKey, translationLanguages } from "@domain/entities/Word";

/**
 * Decides which of the user's own vocabularies a newly added word belongs
 * in — or that a new vocabulary is needed.
 *
 *  1. Only the user's vocabularies with the word's language and room left.
 *  2. If one already has this word, it's a duplicate (reported, not added).
 *  3. Otherwise score each: same CEFR level as most of its words, shared
 *     tags, covers the word's translation languages, already published (so
 *     the word shows up in quizzes right away). Ties go to the most recently
 *     updated vocabulary.
 *  4. No candidate at all -> propose a new vocabulary.
 */

export interface PlacementCandidate {
  vocabulary: Vocabulary;
  words: Pick<Word, "wordType" | "headword" | "level" | "tags">[];
}

export type PlacementDecision =
  | { kind: "existing"; vocabularyId: string }
  | { kind: "duplicate"; vocabularyId: string }
  | { kind: "create"; input: VocabularyInput };

export function decidePlacement(
  word: WordDraft,
  sourceLanguage: LanguageCode,
  candidates: readonly PlacementCandidate[]
): PlacementDecision {
  const sameLanguage = candidates.filter((candidate) => candidate.vocabulary.sourceLanguage === sourceLanguage);
  const key = headwordKey(word);

  const duplicate = sameLanguage.find((candidate) => candidate.words.some((word) => headwordKey(word) === key));
  if (duplicate) return { kind: "duplicate", vocabularyId: duplicate.vocabulary.id };

  const withRoom = sameLanguage.filter((candidate) => !isFull(candidate.vocabulary));
  if (withRoom.length === 0) {
    return { kind: "create", input: suggestNewVocabulary(word, sourceLanguage, candidates) };
  }

  const scored = withRoom
    .map((candidate) => ({ candidate, score: placementScore(word, candidate) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.candidate.vocabulary.updatedAt.localeCompare(a.candidate.vocabulary.updatedAt)
    );
  return { kind: "existing", vocabularyId: scored[0].candidate.vocabulary.id };
}

export function placementScore(word: WordDraft, candidate: PlacementCandidate): number {
  let score = 0;

  const dominantLevel = mostCommon(candidate.words.map((word) => word.level).filter((level): level is NonNullable<typeof level> => !!level));
  if (word.level && dominantLevel === word.level) score += 3;

  if (word.tags.length > 0) {
    const vocabularyTags = new Set(candidate.words.flatMap((word) => word.tags.map((tag) => tag.toLocaleLowerCase())));
    const shared = word.tags.filter((tag) => vocabularyTags.has(tag.toLocaleLowerCase())).length;
    score += 2 * (shared / word.tags.length);
  }

  const wordLanguages = translationLanguages(word);
  if (wordLanguages.length > 0 && wordLanguages.every((language) => candidate.vocabulary.targetLanguages.includes(language))) {
    score += 1;
  }

  if (candidate.vocabulary.status === "published") score += 0.5;
  return score;
}

function suggestNewVocabulary(
  word: WordDraft,
  sourceLanguage: LanguageCode,
  existing: readonly PlacementCandidate[]
): VocabularyInput {
  const base = [LANGUAGES[sourceLanguage].englishName, word.level ?? "", "words"].filter(Boolean).join(" ");
  const taken = new Set(existing.map((candidate) => candidate.vocabulary.name.toLocaleLowerCase()));
  let name = base;
  for (let suffix = 2; taken.has(name.toLocaleLowerCase()); suffix++) name = `${base} (${suffix})`;

  return {
    name,
    description: "",
    sourceLanguage,
    targetLanguages: translationLanguages(word).filter((language) => language !== sourceLanguage),
  };
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
