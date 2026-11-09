import { describe, it, expect } from "vitest";
import { DEFAULT_SENTENCE_SETTINGS } from "@domain/entities/SentencePractice";
import { createSeededRandomSource } from "@domain/services/Random";
import { SentencePracticeService } from "@application/services/SentencePracticeService";
import { NOW, makeCollection } from "../../test/fixtures";
import { InMemoryLearningRepository, InMemorySentenceCollectionRepository, InMemorySentenceExerciseRepository } from "../../test/inMemoryRepositories";
import { SentenceCollectionService } from "@application/services/SentenceCollectionService";

const collection = makeCollection("c1");

function setup() {
  const exercises = new InMemorySentenceExerciseRepository();
  const learning = new InMemoryLearningRepository();
  const collections = new SentenceCollectionService(new InMemorySentenceCollectionRepository([{ ...collection, exerciseCount: 2 }]));
  const service = new SentencePracticeService(exercises, learning, collections, createSeededRandomSource(3), () => NOW);
  return { exercises, learning, service };
}

const entry = (id: string | undefined, sentence: string) => ({ id, kind: "fill_blank", sentence, answers: ["dem"], distractors: ["den"] });

describe("SentencePracticeService", () => {
  it("updates an exercise re-imported with the same id and skips the same sentence under another id", async () => {
    const { exercises, service } = setup();
    await service.importExercises("u1", collection, [entry("a", "Mit ___ Bus.")]);
    const result = await service.importExercises("u1", collection, [entry("a", "Mit ___ Zug."), entry("b", "Mit ___ Zug."), { kind: "jumble" }]);

    expect(result).toMatchObject({ importedCount: 0, updatedCount: 1, duplicateSentences: ["Mit ___ Zug."] });
    expect(result.errors.map((problem) => problem.code)).toEqual(["sentenceMissing"]);
    expect(Array.from(exercises.exercises.values()).map((exercise) => exercise.content.sentence)).toEqual(["Mit ___ Zug."]);
  });

  it("practices sentences of the chosen kind and records each graded answer", async () => {
    const { learning, service } = setup();
    await service.importExercises("u1", collection, [entry("a", "Mit ___ Bus."), { kind: "transform", sentence: "Er geht.", task: "question", answers: ["Geht er?"] }]);

    const { items } = await service.start("u1", { ...DEFAULT_SENTENCE_SETTINGS, collectionIds: ["c1"] });
    expect(items.map((item) => item.exercise.content.kind)).toEqual(["fill_blank"]);
    expect(items[0].tiles.map((tile) => tile.text).sort()).toEqual(["dem", "den"]);

    const { grade } = await service.submit({
      userId: "u1",
      sessionId: "s1",
      item: items[0],
      settings: DEFAULT_SENTENCE_SETTINGS,
      answer: { kind: "fill_blank", chosen: ["den"] },
      timedOut: false,
      shownAt: new Date(NOW.getTime() - 4000),
      answeredAt: NOW,
    });
    expect(grade.errorCount).toBe(1);
    expect(learning.sentenceAttempts).toEqual([expect.objectContaining({ errorCount: 1, maxErrors: 1, responseMs: 4000, sessionId: "s1" })]);
    expect((await service.statsByKind("u1")).fill_blank).toEqual({ attemptCount: 1, score: 0 });
    const [historyEntry] = await service.history("u1");
    expect(historyEntry.grade?.marks.find((mark) => mark.status === "wrong")).toEqual({ status: "wrong", actual: "den", expected: "dem" });
  });
});
