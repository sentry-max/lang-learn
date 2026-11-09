import { describe, it, expect } from "vitest";
import { parseSentenceInput } from "@domain/services/SentenceParser";
import { gradeAnswer } from "@domain/services/SentenceGrading";
import { splitJumble } from "@domain/entities/SentenceExercise";
import germanSamples from "../../../data/sentences.sample.json";
import englishSamples from "../../../data/sentences.sample.en.json";

describe("parseSentenceInput", () => {
  it("rejects a fill-in-the-blank sentence whose answers don't match its blanks", () => {
    const result = parseSentenceInput({ kind: "fill_blank", sentence: "Ich ___ ___ ___.", answers: ["a"], distractors: ["b"] }, 0);
    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ code: "blanksInvalid", entryNumber: 1 })] });
  });

  it("requires distractors for a fill-in-the-blank sentence and drops one equal to an answer", () => {
    expect(parseSentenceInput({ kind: "fill_blank", sentence: "Ich ___.", answers: ["gehe"] }, 0)).toMatchObject({
      ok: false,
      errors: [{ code: "distractorsInvalid" }],
    });
    const result = parseSentenceInput({ kind: "fill_blank", sentence: "Ich ___.", answers: ["gehe"], distractors: ["gehe", "geht"] }, 0);
    expect(result.ok && result.exercise.content).toEqual({ kind: "fill_blank", sentence: "Ich ___.", answers: ["gehe"], distractors: ["geht"] });
  });

  it("rejects a jumble alternative that uses different words", () => {
    const result = parseSentenceInput({ kind: "jumble", sentence: "Ich gehe heute.", alternatives: ["Heute gehst ich."] }, 0);
    expect(result).toMatchObject({ ok: false, errors: [{ code: "alternativeInvalid" }] });
  });

  it("rejects an unknown transformation task and missing answers", () => {
    const result = parseSentenceInput({ kind: "transform", sentence: "Er spielt.", task: "plural" }, 2);
    expect(result).toMatchObject({ ok: false, errors: [{ code: "taskInvalid", entryNumber: 3 }, { code: "answersInvalid" }] });
  });

  it("treats blank, null and missing optional fields as absent", () => {
    const result = parseSentenceInput(
      { kind: "transform", sentence: " Er  spielt. ", task: "question", answers: ["Spielt er?"], hint: null, level: "", tags: null, translations: null },
      0
    );
    expect(result).toEqual({
      ok: true,
      exercise: {
        externalId: null,
        content: { kind: "transform", sentence: "Er spielt.", task: "question", answers: ["Spielt er?"] },
        translations: {},
        hint: "",
        level: null,
        tags: [],
      },
    });
  });
});

describe("the sample sentence files", () => {
  it.each([
    ["German", germanSamples],
    ["English", englishSamples],
  ] as const)("%s: every entry imports and its own answer scores full marks", (_name, samples: readonly unknown[]) => {
    const kinds = new Set<string>();
    const tasks = new Set<string>();
    samples.forEach((sample, index) => {
      const result = parseSentenceInput(sample, index);
      if (!result.ok) throw new Error(`Entry ${index + 1}: ${JSON.stringify(result.errors)}`);
      const { content } = result.exercise;
      kinds.add(content.kind);
      if (content.kind === "transform") tasks.add(content.task);
      const answer =
        content.kind === "fill_blank"
          ? { kind: "fill_blank" as const, chosen: content.answers }
          : content.kind === "jumble"
          ? { kind: "jumble" as const, placed: splitJumble(content.sentence).tokens }
          : { kind: "transform" as const, text: content.answers[0] };
      expect(gradeAnswer(content, answer).errorCount).toBe(0);
    });
    expect(kinds.size).toBe(3);
    expect(tasks.size).toBe(10);
  });
});
