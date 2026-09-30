import { WordProgress, createInitialProgress } from "@domain/entities/Learning";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { Word } from "@domain/entities/Word";

export const NOW = new Date("2026-09-30T12:00:00.000Z");

export function makeWord(headword: string, overrides: Partial<Word> = {}): Word {
  return {
    id: `w-${headword}`,
    vocabularyId: "v1",
    externalId: null,
    wordType: "noun",
    headword,
    translations: { en: [`${headword}-en`], fa: [`${headword}-fa`] },
    sentences: [],
    level: "B1",
    tags: [],
    ...overrides,
  };
}

export function makeProgress(wordId: string, overrides: Partial<WordProgress> = {}): WordProgress {
  return {
    ...createInitialProgress(wordId, NOW),
    timesSeen: 1,
    totalCorrect: 1,
    repetitions: 1,
    lastRating: "good",
    lastReviewedAt: new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
    seenInCycle: true,
    ...overrides,
  };
}

export function makeVocabulary(id: string, overrides: Partial<Vocabulary> = {}): Vocabulary {
  return {
    id,
    ownerId: "u1",
    ownerName: "owner",
    name: `Vocabulary ${id}`,
    description: "",
    sourceLanguage: "de",
    targetLanguages: ["en", "fa"],
    status: "published",
    wordCount: 60,
    downloadCount: 0,
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Headwords starting with every letter A..Z, `perLetter` each: "Aa0", "Aa1", ... "Za9". */
export function alphabetWords(perLetter: number): Word[] {
  const words: Word[] = [];
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    for (let i = 0; i < perLetter; i++) words.push(makeWord(`${letter}${letter.toLowerCase()}${i}`));
  }
  return words;
}
