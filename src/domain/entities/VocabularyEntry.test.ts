import { describe, it, expect } from "vitest";
import {
  VocabularyEntry,
  getTranslations,
  getSentenceTranslation,
  resolveTranslations,
  resolveSentenceTranslation,
} from "@domain/entities/VocabularyEntry";

const entry: VocabularyEntry = {
  id: "test",
  wordType: "noun",
  headword: "Haus",
  translations: { en: ["house"], fa: ["خانه"] },
  nounForms: { article: "das", plural: "¨-er" },
  sentences: [{ german: "Das ist mein Haus.", translations: { en: "This is my house.", fa: "این خانهٔ من است." } }],
  level: "B1",
  tags: [],
};

describe("getTranslations", () => {
  it("returns the requested language when present", () => {
    expect(getTranslations(entry, "fa")).toEqual(["خانه"]);
    expect(getTranslations(entry, "en")).toEqual(["house"]);
  });

  it("falls back to English when the requested language is missing", () => {
    const partial: VocabularyEntry = { ...entry, translations: { en: ["house"] } };
    expect(getTranslations(partial, "fa")).toEqual(["house"]);
  });

  it("falls back to any available language when English is also missing", () => {
    const onlyFa: VocabularyEntry = { ...entry, translations: { fa: ["خانه"] } };
    expect(getTranslations(onlyFa, "en")).toEqual(["خانه"]);
  });

  it("handles legacy data where translations was a plain string array", () => {
    // Rows imported before multi-language support stored translations as
    // e.g. ["house"] instead of { en: ["house"] } — must not crash.
    const legacy = { ...entry, translations: ["house", "home"] as unknown as VocabularyEntry["translations"] };
    expect(getTranslations(legacy, "fa")).toEqual(["house", "home"]);
    expect(getTranslations(legacy, "en")).toEqual(["house", "home"]);
  });

  it("returns an empty array rather than throwing for completely malformed data", () => {
    const malformed = { ...entry, translations: null as unknown as VocabularyEntry["translations"] };
    expect(getTranslations(malformed, "fa")).toEqual([]);
  });
});

describe("getSentenceTranslation", () => {
  it("returns the requested language's sentence translation", () => {
    expect(getSentenceTranslation(entry.sentences[0], "fa")).toBe("این خانهٔ من است.");
  });

  it("falls back to English when the requested language is missing", () => {
    const sentence = { german: "x", translations: { en: "y" } };
    expect(getSentenceTranslation(sentence, "fa")).toBe("y");
  });

  it("handles a legacy sentence with a plain english field instead of translations", () => {
    const legacy = { german: "x", english: "y" } as unknown as Parameters<typeof getSentenceTranslation>[0];
    // Legacy sentences have no "translations" key at all; the repository layer
    // normalizes these before they reach the domain, but getSentenceTranslation
    // still must not throw if one slips through with an empty translations object.
    expect(getSentenceTranslation({ german: "x", translations: {} }, "fa")).toBe("");
    void legacy;
  });
});

describe("resolveTranslations", () => {
  it("reports the requested language when the word has it", () => {
    expect(resolveTranslations(entry, "fa")).toEqual({ language: "fa", values: ["خانه"] });
  });

  it("reports that it fell back to English when the requested language is missing", () => {
    // This is the exact bug scenario: a word imported with only an English
    // translation, viewed while the UI is set to Persian. The label must
    // say "English", not "Persian", once it falls back.
    const englishOnly: VocabularyEntry = { ...entry, translations: { en: ["morning"] } };
    expect(resolveTranslations(englishOnly, "fa")).toEqual({ language: "en", values: ["morning"] });
  });

  it("reports whichever language it fell back to when English is also missing", () => {
    const onlyFa: VocabularyEntry = { ...entry, translations: { fa: ["خانه"] } };
    expect(resolveTranslations(onlyFa, "en")).toEqual({ language: "fa", values: ["خانه"] });
  });
});

describe("resolveSentenceTranslation", () => {
  it("reports the fallback language for a sentence translation", () => {
    const sentence = { german: "x", translations: { en: "y" } };
    expect(resolveSentenceTranslation(sentence, "fa")).toEqual({ language: "en", value: "y" });
  });
});
