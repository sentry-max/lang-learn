import { describe, it, expect } from "vitest";
import { parseWordInput } from "@domain/services/WordParser";

const valid = {
  id: "b1-noun-haus",
  wordType: "noun",
  headword: " Haus ",
  translations: { en: ["house"], fa: ["خانه"] },
  nounForms: { article: "das", plural: "¨-er" },
  sentences: [{ german: "Das ist mein Haus.", translations: { en: "This is my house." } }],
  level: "B1",
  tags: ["home", "home", " "],
};

describe("parseWordInput", () => {
  it("accepts a valid v1 German entry and cleans it up", () => {
    const result = parseWordInput(valid, 0, "de");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.word.headword).toBe("Haus");
    expect(result.word.externalId).toBe("b1-noun-haus");
    expect(result.word.sentences).toEqual([{ text: "Das ist mein Haus.", translations: { en: "This is my house." } }]);
    expect(result.word.tags).toEqual(["home"]);
  });

  it("requires at least one translation in another language", () => {
    const result = parseWordInput({ ...valid, translations: { de: ["Haus"] } }, 2, "de");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/Entry 3.*translations/);
  });

  it("rejects bad word types, levels and articles", () => {
    const badType = parseWordInput({ ...valid, wordType: "thing", level: "Z9" }, 0, "de");
    expect(!badType.ok && badType.errors).toHaveLength(2);
    const badArticle = parseWordInput({ ...valid, nounForms: { article: "le" } }, 0, "de");
    expect(!badArticle.ok && badArticle.errors[0]).toMatch(/der, die, das/);
  });

  it("requires verb forms for German verbs but not for English ones", () => {
    const verb = { wordType: "verb", headword: "go", translations: { fa: ["رفتن"] } };
    expect(parseWordInput(verb, 0, "de").ok).toBe(false);
    expect(parseWordInput(verb, 0, "en").ok).toBe(true);
  });

  it("accepts words without example sentences but rejects malformed ones", () => {
    expect(parseWordInput({ ...valid, sentences: undefined }, 0, "de").ok).toBe(true);
    expect(parseWordInput({ ...valid, sentences: [{ nope: 1 }] }, 0, "de").ok).toBe(false);
  });

  it("drops articles for languages without them", () => {
    const result = parseWordInput({ ...valid, translations: { fa: ["خانه"] }, nounForms: { article: "the", plural: "houses" } }, 0, "en");
    expect(result.ok && result.word.nounForms).toEqual({ article: null, plural: "houses" });
  });

  it("rejects non-objects", () => {
    expect(parseWordInput("x", 0, "de").ok).toBe(false);
  });
});
