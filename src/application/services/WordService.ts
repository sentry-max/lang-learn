import { randomId } from "@application/util/randomId";
import { AppError } from "@domain/errors/AppError";
import { LanguageCode } from "@domain/entities/Language";
import { MAX_VOCABULARY_WORDS, Vocabulary } from "@domain/entities/Vocabulary";
import { Word, WordDraft, headwordKey } from "@domain/entities/Word";
import { ParseResult, WordProblem, parseWordInput } from "@domain/services/WordParser";
import { PlacementCandidate, decidePlacement } from "@domain/services/VocabularyPlacementService";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { WordRepository } from "@domain/repositories/WordRepository";

export interface ImportResult {
  importedCount: number;
  updatedCount: number;
  errors: WordProblem[];
  /** Headwords skipped because the vocabulary already has them */
  duplicateHeadwords: string[];
}

export type WordTarget = { kind: "vocabulary"; vocabulary: Vocabulary } | { kind: "auto"; sourceLanguage: LanguageCode };

export interface AddWordResult {
  word: Word;
  vocabulary: Vocabulary;
  /** A new vocabulary was created to hold the word */
  createdVocabulary: boolean;
}

/** Adding, editing, importing and (soft-)deleting words. */
export class WordService {
  constructor(
    private readonly words: WordRepository,
    private readonly vocabularies: VocabularyRepository
  ) {}

  listByVocabulary(vocabularyId: string): Promise<Word[]> {
    return this.words.listByVocabularies([vocabularyId]);
  }

  listByVocabularies(vocabularyIds: string[]): Promise<Word[]> {
    return this.words.listByVocabularies(vocabularyIds);
  }

  parse(raw: unknown, sourceLanguage: LanguageCode): ParseResult {
    return parseWordInput(raw, 0, sourceLanguage);
  }

  /**
   * Adds one word. With an explicit vocabulary it goes there; with "auto"
   * the placement service picks the best of the user's vocabularies, or a
   * new one is created.
   */
  async addWord(userId: string, draft: WordDraft, target: WordTarget): Promise<AddWordResult> {
    let vocabulary: Vocabulary;
    let createdVocabulary = false;

    if (target.kind === "vocabulary") {
      vocabulary = target.vocabulary;
      this.assertOwner(userId, vocabulary);
      const existing = await this.words.listByVocabularies([vocabulary.id]);
      if (existing.some((word) => headwordKey(word) === headwordKey(draft))) throw duplicateError(draft.headword);
      if (existing.length >= MAX_VOCABULARY_WORDS) throw fullError();
    } else {
      const owned = (await this.vocabularies.listOwned(userId)).filter((vocabulary) => vocabulary.sourceLanguage === target.sourceLanguage);
      const ownedWords = await this.words.listByVocabularies(owned.map((vocabulary) => vocabulary.id));
      const candidates: PlacementCandidate[] = owned.map((vocabulary) => ({
        vocabulary: vocabulary,
        words: ownedWords.filter((word) => word.vocabularyId === vocabulary.id),
      }));

      const decision = decidePlacement(draft, target.sourceLanguage, candidates);
      if (decision.kind === "duplicate") throw duplicateError(draft.headword);
      if (decision.kind === "existing") {
        vocabulary = owned.find((vocabulary) => vocabulary.id === decision.vocabularyId)!;
      } else {
        vocabulary = await this.vocabularies.create(userId, randomId(), decision.input);
        createdVocabulary = true;
      }
    }

    const word: Word = { ...draft, id: randomId(), vocabularyId: vocabulary.id };
    await this.words.saveMany([word]);
    return { word, vocabulary, createdVocabulary };
  }

  async updateWord(userId: string, vocabulary: Vocabulary, existing: Word, draft: WordDraft): Promise<Word> {
    this.assertOwner(userId, vocabulary);
    const siblings = await this.words.listByVocabularies([vocabulary.id]);
    const key = headwordKey(draft);
    if (siblings.some((word) => word.id !== existing.id && headwordKey(word) === key)) throw duplicateError(draft.headword);

    const word: Word = { ...draft, id: existing.id, vocabularyId: existing.vocabularyId, externalId: existing.externalId };
    await this.words.saveMany([word]);
    return word;
  }

  async deleteWords(userId: string, vocabulary: Vocabulary, words: Word[]): Promise<void> {
    this.assertOwner(userId, vocabulary);
    return this.words.softDelete(words);
  }

  /**
   * Imports a parsed JSON array into one vocabulary. An entry whose "id"
   * matches a word already imported updates it; a different entry with the
   * same word type + headword is skipped as a duplicate. Stops at the
   * vocabulary's capacity and reports the rest.
   */
  async importWords(userId: string, vocabulary: Vocabulary, rawEntries: unknown): Promise<ImportResult> {
    this.assertOwner(userId, vocabulary);
    const result: ImportResult = { importedCount: 0, updatedCount: 0, errors: [], duplicateHeadwords: [] };

    if (!Array.isArray(rawEntries)) {
      result.errors.push({ code: "fileNotAnArray", entryNumber: null, headword: null });
      return result;
    }

    const existing = await this.words.listByVocabularies([vocabulary.id]);
    const byExternalId = new Map(existing.filter((word) => word.externalId).map((word) => [word.externalId!, word]));
    const byKey = new Map(existing.map((word) => [headwordKey(word), word]));
    let capacity = MAX_VOCABULARY_WORDS - existing.length;

    const toSave: Word[] = [];
    rawEntries.forEach((raw, index) => {
      const parsed = parseWordInput(raw, index, vocabulary.sourceLanguage);
      if (!parsed.ok) {
        result.errors.push(...parsed.errors);
        return;
      }
      const draft = parsed.word;
      const key = headwordKey(draft);
      const sameId = draft.externalId ? byExternalId.get(draft.externalId) : undefined;
      const sameKey = byKey.get(key);

      if (sameKey && sameKey !== sameId) {
        result.duplicateHeadwords.push(draft.headword);
        return;
      }

      if (sameId) {
        const updated: Word = { ...draft, id: sameId.id, vocabularyId: vocabulary.id };
        byKey.delete(headwordKey(sameId));
        byKey.set(key, updated);
        byExternalId.set(draft.externalId!, updated);
        replaceOrPush(toSave, updated);
        result.updatedCount += 1;
        return;
      }

      if (capacity <= 0) {
        result.errors.push({
          code: "vocabularyFull",
          entryNumber: index + 1,
          headword: draft.headword,
          detail: String(MAX_VOCABULARY_WORDS),
        });
        return;
      }

      const created: Word = { ...draft, id: randomId(), vocabularyId: vocabulary.id };
      byKey.set(key, created);
      if (created.externalId) byExternalId.set(created.externalId, created);
      toSave.push(created);
      capacity -= 1;
      result.importedCount += 1;
    });

    if (toSave.length > 0) await this.words.saveMany(toSave);
    return result;
  }

  private assertOwner(userId: string, vocabulary: Vocabulary): void {
    if (vocabulary.ownerId !== userId) {
      throw new AppError("forbidden", "Only the owner can change this vocabulary's words.");
    }
  }
}

function replaceOrPush(words: Word[], word: Word): void {
  const index = words.findIndex((currentWord) => currentWord.id === word.id);
  if (index >= 0) words[index] = word;
  else words.push(word);
}

function duplicateError(headword: string): AppError {
  return new AppError("conflict", `"${headword}" is already in this vocabulary.`, { reason: "duplicate_word" });
}

function fullError(): AppError {
  return new AppError("validation", `A vocabulary can hold at most ${MAX_VOCABULARY_WORDS} words.`, {
    reason: "vocabulary_word_limit",
  });
}
