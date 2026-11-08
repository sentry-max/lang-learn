import { describe, it, expect } from "vitest";
import {
  ChoiceAnswer,
  choiceAnswerOf,
  choiceRating,
  choiceTimeSliceMs,
  pickChoiceOptions,
  spellingSimilarity,
} from "@domain/services/MultipleChoiceService";
import { createSeededRandomSource } from "@domain/services/Random";
import { makeWord } from "../../test/fixtures";

function answer(text: string, overrides: Partial<ChoiceAnswer> = {}): ChoiceAnswer {
  return { text, form: text, language: "de", tags: [], equivalents: [text], ...overrides };
}

function distractorsOf(correct: ChoiceAnswer, dictionary: ChoiceAnswer[], seed = 1): string[] {
  return pickChoiceOptions(correct, dictionary, createSeededRandomSource(seed))
    .filter((option) => !option.isCorrect)
    .map((option) => option.text)
    .sort();
}

describe("pickChoiceOptions", () => {
  it("prefers words that share a tag with the answer", () => {
    const correct = answer("Hund", { tags: ["animal"] });
    const dictionary = [
      answer("Katze", { tags: ["animal"] }),
      answer("Pferd", { tags: ["Animal"] }),
      answer("Vogel", { tags: ["animal", "sky"] }),
      answer("Mund"),
      answer("Stuhl"),
    ];
    expect(distractorsOf(correct, dictionary)).toEqual(["Katze", "Pferd", "Vogel"]);
  });

  it("falls back to a similar spelling, then to shared first or last letters by count", () => {
    const correct = answer("Haus");
    const dictionary = [answer("Maus"), answer("Hausboot"), answer("Hand"), answer("Hose"), answer("Xylophon")];
    // Maus is similar; Hausboot shares 4 (capped at 3) first letters, Hand shares 2; Hose only 1; Xylophon none.
    expect(distractorsOf(correct, dictionary)).toEqual(["Hand", "Hausboot", "Maus"]);
  });

  it("fills the rest with random words when nothing resembles the answer", () => {
    const options = pickChoiceOptions(answer("Haus"), [answer("Xylophon"), answer("Brot"), answer("Zug")], createSeededRandomSource(3));
    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.isCorrect)).toEqual([{ text: "Haus", isCorrect: true }]);
  });

  it("never offers a synonym, a duplicate or a word in another language", () => {
    const correct = answer("dog", { equivalents: ["dog", "hound"], language: "en" });
    const dictionary = [
      answer("hound", { language: "en" }),
      answer("Dog", { language: "en" }),
      answer("cat", { language: "en" }),
      answer("cat", { language: "en" }),
      answer("Hund", { language: "de" }),
      answer("  ", { language: "en" }),
    ];
    expect(distractorsOf(correct, dictionary)).toEqual(["cat"]);
  });

  it("still offers the correct answer when the dictionary is empty", () => {
    expect(pickChoiceOptions(answer("Haus"), [], createSeededRandomSource(1))).toEqual([{ text: "Haus", isCorrect: true }]);
  });
});

describe("choiceAnswerOf", () => {
  it("answers a reverse question with the headword and its article", () => {
    const word = makeWord("Hund", { nounForms: { article: "der", plural: "Hunde" } });
    expect(choiceAnswerOf(word, "target_to_source", "de", "fa")).toMatchObject({ text: "der Hund", form: "Hund", language: "de" });
  });

  it("answers a forward question with the first translation and treats the others as correct too", () => {
    const word = makeWord("Hund", { translations: { en: ["dog", "hound"] } });
    expect(choiceAnswerOf(word, "source_to_target", "de", "en")).toMatchObject({ text: "dog", language: "en", equivalents: ["dog", "hound"] });
  });

  it("has no answer for a word without translations", () => {
    expect(choiceAnswerOf(makeWord("Hund", { translations: {} }), "source_to_target", "de", "en")).toBeNull();
  });
});

describe("choiceRating", () => {
  it("rates a correct untimed choice easy and a wrong one very bad", () => {
    expect(choiceRating(true, 60_000, null)).toBe("easy");
    expect(choiceRating(false, 100, null)).toBe("very_bad");
  });

  it("rates a timed correct choice by the share of time used", () => {
    expect(choiceRating(true, 5_500, 10_000)).toBe("very_easy");
    expect(choiceRating(true, 5_501, 10_000)).toBe("easy");
    expect(choiceRating(true, 8_000, 10_000)).toBe("easy");
    expect(choiceRating(true, 8_001, 10_000)).toBe("good");
    expect(choiceRating(false, 1_000, 10_000)).toBe("very_bad");
  });
});

describe("choiceTimeSliceMs", () => {
  it("splits the time left evenly over the questions left", () => {
    expect(choiceTimeSliceMs(60_000, 20)).toBe(3_000);
    expect(choiceTimeSliceMs(-5, 3)).toBe(0);
    expect(choiceTimeSliceMs(1_000, 0)).toBe(1_000);
  });
});

describe("spellingSimilarity", () => {
  it("scores one changed letter in four as 0.75", () => {
    expect(spellingSimilarity("haus", "maus")).toBe(0.75);
    expect(spellingSimilarity("haus", "xylophon")).toBe(0);
  });
});
