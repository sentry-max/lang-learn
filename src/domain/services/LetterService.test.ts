import { describe, it, expect } from "vitest";
import { countByLetter, filterByLetters, firstLetter } from "@domain/services/LetterService";

describe("firstLetter", () => {
  it("upper-cases Latin letters, keeps umlauts and skips punctuation", () => {
    expect(firstLetter("abend")).toBe("A");
    expect(firstLetter("Ärger")).toBe("Ä");
    expect(firstLetter("(sich) freuen")).toBe("S");
    expect(firstLetter("  'quote")).toBe("Q");
  });

  it("works for Persian", () => {
    expect(firstLetter("خانه")).toBe("خ");
  });

  it("returns # when there is no letter", () => {
    expect(firstLetter("123")).toBe("#");
  });
});

describe("filterByLetters / countByLetter", () => {
  const words = ["apple", "Anker", "Baum", "خانه"];

  it("keeps everything with no letters and filters by any of several letters", () => {
    expect(filterByLetters(words, (w) => w, [])).toHaveLength(4);
    expect(filterByLetters(words, (w) => w, ["a", "خ"])).toEqual(["apple", "Anker", "خانه"]);
  });

  it("counts per letter", () => {
    expect(countByLetter(words, (w) => w)).toEqual([
      { letter: "A", count: 2 },
      { letter: "B", count: 1 },
      { letter: "خ", count: 1 },
    ]);
  });
});
