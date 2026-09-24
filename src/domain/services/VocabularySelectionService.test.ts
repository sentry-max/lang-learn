import { describe, it, expect } from "vitest";
import {
  sanitizeLetterInput,
  filterByLetterRange,
  selectQuizEntries,
} from "@domain/services/VocabularySelectionService";
import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { ProgressState, createInitialProgress, DifficultyRating } from "@domain/entities/Review";

function makeEntry(id: string, headword: string): VocabularyEntry {
  return {
    id,
    wordType: "noun",
    headword,
    translations: { en: ["x"] },
    nounForms: { article: "das", plural: null },
    sentences: [{ german: "x", translations: { en: "y" } }],
    level: "B1",
    tags: [],
  };
}

describe("sanitizeLetterInput", () => {
  it("keeps a single letter as-is", () => {
    expect(sanitizeLetterInput("a")).toBe("a");
  });

  it("strips digits and punctuation", () => {
    expect(sanitizeLetterInput("a1!")).toBe("a");
  });

  it("takes the last letter typed when multiple letters are entered", () => {
    // Matches the literal spec example: typing "hello" should resolve to "o".
    expect(sanitizeLetterInput("hello")).toBe("o");
  });

  it("lowercases the result", () => {
    expect(sanitizeLetterInput("B")).toBe("b");
  });

  it("returns an empty string for input with no letters", () => {
    expect(sanitizeLetterInput("123")).toBe("");
  });
});

describe("filterByLetterRange", () => {
  const entries = [
    makeEntry("a1", "Apfel"),
    makeEntry("a2", "Auto"),
    makeEntry("b1", "Banane"),
    makeEntry("c1", "Café"),
  ];

  it("returns everything unfiltered when no filter is given", () => {
    expect(filterByLetterRange(entries).candidates).toHaveLength(4);
  });

  it("matches only the exact starting letter in single-letter mode", () => {
    const result = filterByLetterRange(entries, { from: "a" });
    expect(result.isSingleLetterMode).toBe(true);
    expect(result.candidates.map((e) => e.id).sort()).toEqual(["a1", "a2"]);
  });

  it("matches an inclusive range when 'to' is given", () => {
    const result = filterByLetterRange(entries, { from: "a", to: "b" });
    expect(result.isSingleLetterMode).toBe(false);
    expect(result.candidates.map((e) => e.id).sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("matches through the end of the alphabet when toEnd is set", () => {
    const result = filterByLetterRange(entries, { from: "b", toEnd: true });
    expect(result.candidates.map((e) => e.id).sort()).toEqual(["b1", "c1"]);
  });
});

describe("selectQuizEntries", () => {
  function withRating(id: string, rating: DifficultyRating | null): ProgressState {
    return { ...createInitialProgress(id), lastRating: rating };
  }

  it("includes everything when includeAllRegardlessOfRating is true", () => {
    const entries = [makeEntry("a", "A"), makeEntry("b", "B")];
    const progress = new Map([["a", withRating("a", "very_easy")]]);
    const result = selectQuizEntries(entries, progress, 1, true);
    expect(result).toHaveLength(2);
  });

  it("prioritizes weak-rated words before unseen words", () => {
    const entries = [makeEntry("unseen", "U"), makeEntry("weak", "W")];
    const progress = new Map([["weak", withRating("weak", "bad")]]);
    const result = selectQuizEntries(entries, progress, 2, false);
    expect(result[0].id).toBe("weak");
  });

  it("orders weak words by severity: very_bad, then bad, then good", () => {
    const entries = [makeEntry("g", "G"), makeEntry("vb", "V"), makeEntry("b", "B")];
    const progress = new Map([
      ["g", withRating("g", "good")],
      ["vb", withRating("vb", "very_bad")],
      ["b", withRating("b", "bad")],
    ]);
    const result = selectQuizEntries(entries, progress, 3, false);
    expect(result.map((e) => e.id)).toEqual(["vb", "b", "g"]);
  });

  it("excludes easy/very_easy words when there are enough unseen words to fill the quota", () => {
    const entries = [makeEntry("unseen1", "U1"), makeEntry("unseen2", "U2"), makeEntry("mastered", "M")];
    const progress = new Map([["mastered", withRating("mastered", "very_easy")]]);
    const result = selectQuizEntries(entries, progress, 2, false);
    expect(result.map((e) => e.id)).not.toContain("mastered");
  });

  it("falls back to easy/very_easy words once unseen words run out", () => {
    const entries = [makeEntry("unseen1", "U1"), makeEntry("mastered", "M")];
    const progress = new Map([["mastered", withRating("mastered", "easy")]]);
    const result = selectQuizEntries(entries, progress, 2, false);
    expect(result.map((e) => e.id).sort()).toEqual(["mastered", "unseen1"]);
  });

  it("caps the result at the quota", () => {
    const entries = [makeEntry("a", "A"), makeEntry("b", "B"), makeEntry("c", "C")];
    const result = selectQuizEntries(entries, new Map(), 2, false);
    expect(result).toHaveLength(2);
  });
});
