import { describe, it, expect } from "vitest";
import { MAX_QUESTION_COUNT, collectionKeyOf, questionQuota } from "@domain/entities/QuizSettings";

describe("collectionKeyOf", () => {
  it("names no letters 'all' and the same letters the same collection in any order or case", () => {
    expect(collectionKeyOf([])).toBe("all");
    expect(collectionKeyOf(["B"])).toBe("B");
    expect(collectionKeyOf(["b", "A", "B"])).toBe("A,B");
    expect(collectionKeyOf(["A", "B"])).not.toBe(collectionKeyOf(["B"]));
  });
});

describe("questionQuota", () => {
  it("lets All cover every word of chosen letters but keeps the cap without letters", () => {
    expect(questionQuota({ questionCount: MAX_QUESTION_COUNT, letters: ["A"] }, 500)).toBe(500);
    expect(questionQuota({ questionCount: MAX_QUESTION_COUNT, letters: [] }, 500)).toBe(MAX_QUESTION_COUNT);
    expect(questionQuota({ questionCount: 20, letters: ["A"] }, 500)).toBe(20);
    expect(questionQuota({ questionCount: 20, letters: ["A"] }, 7)).toBe(7);
  });
});
