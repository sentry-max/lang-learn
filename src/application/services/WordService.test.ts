import { describe, it, expect } from "vitest";
import { WordService } from "@application/services/WordService";
import { AppError } from "@domain/errors/AppError";
import { WordDraft } from "@domain/entities/Word";
import { makeVocabulary, makeWord } from "../../test/fixtures";
import { InMemoryVocabularyRepository, InMemoryWordRepository } from "../../test/inMemoryRepositories";

const USER = "u1";

function entry(id: string, headword: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    wordType: "adverb",
    headword,
    translations: { en: [`${headword}-en`] },
    ...extra,
  };
}

function setup() {
  const vocabulary = makeVocabulary("v1", { wordCount: 1 });
  const vocabularies = new InMemoryVocabularyRepository([vocabulary]);
  const words = new InMemoryWordRepository([makeWord("heute", { id: "existing", externalId: "adv-heute", wordType: "adverb" })]);
  return { service: new WordService(words, vocabularies), words, vocabularies, vocabulary };
}

describe("WordService.importWords", () => {
  it("imports new words, updates re-imported ids and skips duplicates", async () => {
    const { service, words, vocabulary } = setup();
    const result = await service.importWords(USER, vocabulary, [
      entry("adv-morgen", "morgen"),
      entry("adv-heute", "heute", { tags: ["updated"] }),
      entry("other-id", "Heute"),
      entry("adv-morgen-2", "morgen"),
      { wordType: "bogus" },
    ]);

    expect(result.importedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.duplicateHeadwords).toEqual(["Heute", "morgen"]);
    expect(result.errors.every((e) => e.startsWith("Entry 5"))).toBe(true);
    expect(words.words.get("existing")?.tags).toEqual(["updated"]);
    expect(words.words.size).toBe(2);
  });

  it("rejects a non-array file", async () => {
    const { service, vocabulary } = setup();
    const result = await service.importWords(USER, vocabulary, { words: [] });
    expect(result.errors[0]).toMatch(/JSON array/);
  });

  it("refuses to change someone else's vocabulary", async () => {
    const { service, vocabulary } = setup();
    await expect(service.importWords("intruder", vocabulary, [])).rejects.toBeInstanceOf(AppError);
  });
});

describe("WordService.addWord", () => {
  const draft = (headword: string): WordDraft => {
    const { id: _id, vocabularyId: _v, ...rest } = makeWord(headword);
    return rest;
  };

  it("places the word in the best existing vocabulary automatically", async () => {
    const { service } = setup();
    const result = await service.addWord(USER, draft("Tisch"), { kind: "auto", sourceLanguage: "de" });
    expect(result.vocabulary.id).toBe("v1");
    expect(result.createdVocabulary).toBe(false);
  });

  it("creates a new vocabulary when none fits the word's language", async () => {
    const { service, vocabularies } = setup();
    const result = await service.addWord(USER, draft("table"), { kind: "auto", sourceLanguage: "en" });
    expect(result.createdVocabulary).toBe(true);
    expect(result.vocabulary.sourceLanguage).toBe("en");
    expect(vocabularies.vocabularies.size).toBe(2);
  });

  it("rejects duplicates in an explicitly chosen vocabulary", async () => {
    const { service, vocabulary } = setup();
    const dup = { ...draft("Heute"), wordType: "adverb" as const };
    await expect(service.addWord(USER, dup, { kind: "vocabulary", vocabulary })).rejects.toMatchObject({
      reason: "duplicate_word",
    });
  });
});
