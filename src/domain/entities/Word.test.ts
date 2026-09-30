import { describe, it, expect } from "vitest";
import {
  headwordKey,
  normalizeSentenceTranslationsMap,
  normalizeSentences,
  normalizeTranslationsMap,
  resolveSentenceTranslation,
  resolveTranslations,
} from "@domain/entities/Word";
import { makeWord } from "../../test/fixtures";

describe("resolveTranslations", () => {
  it("uses the requested language, then English, then anything", () => {
    expect(resolveTranslations(makeWord("Haus"), "fa")).toEqual({ language: "fa", values: ["Haus-fa"] });
    expect(resolveTranslations({ translations: { en: ["morning"] } }, "fa")).toEqual({ language: "en", values: ["morning"] });
    expect(resolveTranslations({ translations: { fa: ["خانه"] } }, "de")).toEqual({ language: "fa", values: ["خانه"] });
  });

  it("never throws on malformed data", () => {
    expect(resolveTranslations({ translations: null as never }, "fa").values).toEqual([]);
  });
});

describe("normalizeTranslationsMap", () => {
  it("accepts legacy arrays, single strings and drops unknown languages", () => {
    expect(normalizeTranslationsMap(["house", " "])).toEqual({ en: ["house"] });
    expect(normalizeTranslationsMap({ en: "house", xx: ["?"], fa: [] })).toEqual({ en: ["house"] });
    expect(normalizeTranslationsMap(42)).toEqual({});
  });
});

describe("sentences", () => {
  it("normalizes current, v1 and oldest sentence shapes", () => {
    expect(
      normalizeSentences([
        { text: "A", translations: { en: "a" } },
        { german: "B", translations: { fa: "ب" } },
        { german: "C", english: "c" },
        { german: " " },
      ])
    ).toEqual([
      { text: "A", translations: { en: "a" } },
      { text: "B", translations: { fa: "ب" } },
      { text: "C", translations: { en: "c" } },
    ]);
  });

  it("resolves sentence translations with fallback", () => {
    expect(resolveSentenceTranslation({ text: "x", translations: { en: "y" } }, "fa")).toEqual({ language: "en", value: "y" });
    expect(normalizeSentenceTranslationsMap("y")).toEqual({ en: "y" });
  });
});

describe("headwordKey", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(headwordKey({ wordType: "noun", headword: " Haus " })).toBe(headwordKey({ wordType: "noun", headword: "haus" }));
    expect(headwordKey({ wordType: "verb", headword: "Haus" })).not.toBe(headwordKey({ wordType: "noun", headword: "Haus" }));
  });
});
