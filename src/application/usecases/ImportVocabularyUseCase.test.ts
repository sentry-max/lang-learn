import { describe, it, expect, vi } from "vitest";
import { ImportVocabularyUseCase } from "@application/usecases/ImportVocabularyUseCase";
import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";

function makeFakeRepository(existing: VocabularyEntry[] = []): VocabularyRepository {
  return {
    getAll: vi.fn().mockResolvedValue(existing),
    getById: vi.fn().mockResolvedValue(null),
    saveMany: vi.fn().mockResolvedValue(undefined),
    deleteById: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
  };
}

const validNoun = {
  id: "test-noun",
  wordType: "noun",
  headword: "Haus",
  translations: { en: ["house"], fa: ["خانه"] },
  nounForms: { article: "das", plural: "¨-er" },
  sentences: [{ german: "Das ist mein Haus.", translations: { en: "This is my house.", fa: "این خانهٔ من است." } }],
  level: "B1",
  tags: [],
};

describe("ImportVocabularyUseCase", () => {
  it("rejects non-array input", async () => {
    const repo = makeFakeRepository();
    const useCase = new ImportVocabularyUseCase(repo);
    const result = await useCase.execute({ not: "an array" });
    expect(result.importedCount).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(repo.saveMany).not.toHaveBeenCalled();
  });

  it("imports a valid entry", async () => {
    const repo = makeFakeRepository();
    const useCase = new ImportVocabularyUseCase(repo);
    const result = await useCase.execute([validNoun]);
    expect(result.importedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(repo.saveMany).toHaveBeenCalledTimes(1);
  });

  it("rejects an entry missing required fields and reports the reason", async () => {
    const repo = makeFakeRepository();
    const useCase = new ImportVocabularyUseCase(repo);
    const { id, ...withoutId } = validNoun;
    void id;
    const result = await useCase.execute([withoutId]);
    expect(result.importedCount).toBe(0);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("requires verbForms for verb entries", async () => {
    const repo = makeFakeRepository();
    const useCase = new ImportVocabularyUseCase(repo);
    const badVerb = { ...validNoun, id: "test-verb", wordType: "verb", nounForms: undefined };
    const result = await useCase.execute([badVerb]);
    expect(result.importedCount).toBe(0);
    expect(result.errors.some((e) => e.includes("verbForms"))).toBe(true);
  });

  it("imports the valid entries in a mixed batch and reports errors for the rest", async () => {
    const repo = makeFakeRepository();
    const useCase = new ImportVocabularyUseCase(repo);
    const invalid = { id: "bad", wordType: "noun" }; // missing translations/sentences
    const result = await useCase.execute([validNoun, invalid]);
    expect(result.importedCount).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("skips a word that already exists under a different id and reports it as a duplicate", async () => {
    const existing: VocabularyEntry = { ...validNoun, id: "already-here" } as VocabularyEntry;
    const repo = makeFakeRepository([existing]);
    const useCase = new ImportVocabularyUseCase(repo);
    const result = await useCase.execute([validNoun]); // same headword/type, different id
    expect(result.importedCount).toBe(0);
    expect(result.duplicateHeadwords).toEqual(["Haus"]);
    expect(repo.saveMany).not.toHaveBeenCalled();
  });

  it("treats re-importing the same id as an edit, not a duplicate", async () => {
    const existing: VocabularyEntry = { ...validNoun } as VocabularyEntry;
    const repo = makeFakeRepository([existing]);
    const useCase = new ImportVocabularyUseCase(repo);
    const result = await useCase.execute([{ ...validNoun, headword: "Haus" }]); // same id as existing
    expect(result.importedCount).toBe(1);
    expect(result.duplicateHeadwords).toHaveLength(0);
  });

  it("detects duplicates within the same import batch", async () => {
    const repo = makeFakeRepository();
    const useCase = new ImportVocabularyUseCase(repo);
    const second = { ...validNoun, id: "test-noun-2" }; // same headword/type, different id
    const result = await useCase.execute([validNoun, second]);
    expect(result.importedCount).toBe(1);
    expect(result.duplicateHeadwords).toEqual(["Haus"]);
  });

  it("is case-insensitive when detecting duplicate headwords", async () => {
    const existing: VocabularyEntry = { ...validNoun, id: "already-here", headword: "haus" } as VocabularyEntry;
    const repo = makeFakeRepository([existing]);
    const useCase = new ImportVocabularyUseCase(repo);
    const result = await useCase.execute([{ ...validNoun, headword: "HAUS" }]);
    expect(result.importedCount).toBe(0);
    expect(result.duplicateHeadwords).toEqual(["HAUS"]);
  });
});
