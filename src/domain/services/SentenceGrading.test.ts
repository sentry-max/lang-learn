import { describe, it, expect } from "vitest";
import { SentenceContent } from "@domain/entities/SentenceExercise";
import { scoreOf, totalScore } from "@domain/entities/SentencePractice";
import { gradeAnswer, isTypo, tokenizeSentence } from "@domain/services/SentenceGrading";

const fillBlank: SentenceContent = {
  kind: "fill_blank",
  sentence: "Wenn ich Zeit ___, ___ ich dich besuchen.",
  answers: ["hätte", "würde"],
  distractors: ["habe"],
};
const jumble: SentenceContent = {
  kind: "jumble",
  sentence: "Ich gehe morgen ins Kino.",
  alternatives: ["Morgen gehe ich ins Kino."],
  distractors: ["im"],
};
const transform: SentenceContent = {
  kind: "transform",
  sentence: "Er spielt Fußball.",
  task: "negative",
  answers: ["Er spielt keinen Fußball.", "Er spielt nicht Fußball."],
};

describe("gradeAnswer", () => {
  it("counts each wrong or empty blank as one error out of the number of blanks", () => {
    const grade = gradeAnswer(fillBlank, { kind: "fill_blank", chosen: ["habe", null] });
    expect(grade.errorCount).toBe(2);
    expect(grade.maxErrors).toBe(2);
    expect(grade.marks.filter((mark) => mark.status !== "given").map((mark) => mark.status)).toEqual(["wrong", "missing"]);
    expect(grade.correctSentence).toBe("Wenn ich Zeit hätte, würde ich dich besuchen.");
    expect(gradeAnswer(fillBlank, { kind: "fill_blank", chosen: ["hätte", "würde"] }).errorCount).toBe(0);
  });

  it("grades a jumbled sentence against the closest accepted word order, ignoring case", () => {
    const grade = gradeAnswer(jumble, { kind: "jumble", placed: ["morgen", "gehe", "ich", "ins", "Kino"] });
    expect(grade.errorCount).toBe(0);
    expect(grade.correctSentence).toBe("Morgen gehe ich ins Kino.");
  });

  it("marks every misplaced word, a distractor and an empty position in a jumbled sentence", () => {
    const grade = gradeAnswer(jumble, { kind: "jumble", placed: ["Ich", "morgen", "gehe", "im"] });
    expect(grade.marks.map((mark) => mark.status)).toEqual(["correct", "wrong", "wrong", "wrong", "missing"]);
    expect(grade.errorCount).toBe(4);
    expect(grade.maxErrors).toBe(5);
  });

  it("finds wrong, missing and extra words in a transformed sentence", () => {
    const grade = gradeAnswer(transform, { kind: "transform", text: "Er spielt kein gern Fußball" });
    expect(grade.correctSentence).toBe("Er spielt keinen Fußball.");
    expect(grade.marks.map((mark) => [mark.status, mark.actual, mark.expected])).toEqual([
      ["correct", "Er", "Er"],
      ["correct", "spielt", "spielt"],
      ["wrong", "kein", "keinen"],
      ["extra", "gern", null],
      ["correct", "Fußball", "Fußball"],
      ["missing", null, "."],
    ]);
    expect(grade.errorCount).toBe(3);
    expect(grade.maxErrors).toBe(5);
  });

  it("accepts any listed answer of a transformation", () => {
    expect(gradeAnswer(transform, { kind: "transform", text: "Er spielt nicht Fußball." }).errorCount).toBe(0);
  });
});

describe("typo tolerance", () => {
  const rewrite: SentenceContent = { kind: "transform", sentence: "Er spielt Fußball.", task: "question", answers: ["Spielt er Fußball?"] };

  it("forgives a misspelt word but marks it, and never forgives a different ending", () => {
    const grade = gradeAnswer(rewrite, { kind: "transform", text: "spielt er Fusball?" });
    expect(grade.marks.map((mark) => mark.status)).toEqual(["typo", "correct", "typo", "correct"]);
    expect(grade.errorCount).toBe(0);
    expect(gradeAnswer(rewrite, { kind: "transform", text: "Spielte er Fußball?" }).errorCount).toBe(1);
  });

  it("counts typos as errors when tolerance is off", () => {
    expect(gradeAnswer(rewrite, { kind: "transform", text: "Spielt er Fusball?" }, { tolerateTypos: false }).errorCount).toBe(1);
  });

  it.each([
    ["Fussball", "Fußball", false, true],
    ["Hausaufgbaen", "Hausaufgaben", false, true],
    ["sie", "Sie", false, false],
    ["er", "Er", true, true],
    ["keine", "keinen", false, false],
    ["den", "dem", false, false],
    ["spielt", "spielte", false, false],
  ])("isTypo(%s, %s, first word: %s) is %s", (actual, expected, isFirstWord, result) => {
    expect(isTypo(actual, expected, isFirstWord)).toBe(result);
  });
});

describe("scores", () => {
  it("never drops below zero when the answer has more errors than allowed", () => {
    expect(scoreOf({ errorCount: 9, maxErrors: 5 })).toBe(0);
    expect(scoreOf({ errorCount: 1, maxErrors: 4 })).toBe(0.75);
  });

  it("totals several attempts as all errors against all allowed errors", () => {
    expect(totalScore([{ errorCount: 1, maxErrors: 2 }, { errorCount: 0, maxErrors: 8 }])).toBe(0.9);
    expect(totalScore([])).toBeNull();
  });
});

describe("tokenizeSentence", () => {
  it("keeps contractions together and splits off punctuation", () => {
    expect(tokenizeSentence("She doesn’t like coffee, right?")).toEqual(["She", "doesn't", "like", "coffee", ",", "right", "?"]);
  });
});
