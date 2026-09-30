import { describe, it, expect } from "vitest";
import { decidePlacement } from "@domain/services/VocabularyPlacementService";
import { WordDraft } from "@domain/entities/Word";
import { makeVocabulary, makeWord } from "../../test/fixtures";

const draft = (overrides: Partial<WordDraft> = {}): WordDraft => {
  const { id: _id, vocabularyId: _v, ...rest } = makeWord("Neu", overrides);
  return rest;
};

describe("decidePlacement", () => {
  it("proposes a new vocabulary when the user has none in that language", () => {
    const decision = decidePlacement(draft(), "de", [
      { vocabulary: makeVocabulary("en1", { sourceLanguage: "en", name: "English" }), words: [] },
    ]);
    expect(decision.kind).toBe("create");
    if (decision.kind === "create") {
      expect(decision.input.sourceLanguage).toBe("de");
      expect(decision.input.name).toBe("German B1 words");
      expect(decision.input.targetLanguages.sort()).toEqual(["en", "fa"]);
    }
  });

  it("reports a duplicate instead of adding the same word twice", () => {
    const decision = decidePlacement(draft(), "de", [
      { vocabulary: makeVocabulary("a"), words: [makeWord("neu")] },
    ]);
    expect(decision).toEqual({ kind: "duplicate", vocabularyId: "a" });
  });

  it("prefers the vocabulary matching the word's level and tags", () => {
    const a1 = makeVocabulary("a1", { updatedAt: "2026-09-01T00:00:00Z" });
    const b1 = makeVocabulary("b1", { updatedAt: "2026-01-01T00:00:00Z" });
    const decision = decidePlacement(draft({ level: "B1", tags: ["food"] }), "de", [
      { vocabulary: a1, words: [makeWord("x", { level: "A1" })] },
      { vocabulary: b1, words: [makeWord("y", { level: "B1", tags: ["food"] })] },
    ]);
    expect(decision).toEqual({ kind: "existing", vocabularyId: "b1" });
  });

  it("skips full vocabularies and avoids name clashes for the new one", () => {
    const full = makeVocabulary("full", { wordCount: 5000, name: "German B1 words" });
    const decision = decidePlacement(draft(), "de", [{ vocabulary: full, words: [] }]);
    expect(decision.kind).toBe("create");
    if (decision.kind === "create") expect(decision.input.name).toBe("German B1 words (2)");
  });
});
