import { describe, it, expect } from "vitest";
import {
  normalizeTranslationsMap,
  normalizeSentenceTranslationsMap,
} from "@domain/entities/VocabularyEntry";

describe("normalizeTranslationsMap", () => {
  it("passes through the current shape unchanged", () => {
    expect(normalizeTranslationsMap({ en: ["house"], fa: ["خانه"] })).toEqual({
      en: ["house"],
      fa: ["خانه"],
    });
  });

  it("wraps a legacy plain string array as English", () => {
    expect(normalizeTranslationsMap(["house", "home"])).toEqual({ en: ["house", "home"] });
  });

  it("wraps a single stray string as English", () => {
    expect(normalizeTranslationsMap("house")).toEqual({ en: ["house"] });
  });

  it("wraps a single string value under a language key into an array", () => {
    expect(normalizeTranslationsMap({ en: "house" })).toEqual({ en: ["house"] });
  });

  it("returns an empty object for null, undefined, or unrecognized shapes", () => {
    expect(normalizeTranslationsMap(null)).toEqual({});
    expect(normalizeTranslationsMap(undefined)).toEqual({});
    expect(normalizeTranslationsMap(42)).toEqual({});
  });

  it("drops empty arrays and non-string entries", () => {
    expect(normalizeTranslationsMap({ en: [], fa: ["خانه", 5] })).toEqual({ fa: ["خانه"] });
  });
});

describe("normalizeSentenceTranslationsMap", () => {
  it("passes through the current shape unchanged", () => {
    expect(normalizeSentenceTranslationsMap({ en: "This is my house." })).toEqual({
      en: "This is my house.",
    });
  });

  it("wraps a legacy stray string as English", () => {
    expect(normalizeSentenceTranslationsMap("This is my house.")).toEqual({
      en: "This is my house.",
    });
  });

  it("returns an empty object for null or unrecognized shapes", () => {
    expect(normalizeSentenceTranslationsMap(null)).toEqual({});
    expect(normalizeSentenceTranslationsMap(undefined)).toEqual({});
  });
});
