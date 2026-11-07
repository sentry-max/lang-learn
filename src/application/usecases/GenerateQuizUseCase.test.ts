import { describe, it, expect } from "vitest";
import { ReviewEvent } from "@domain/entities/Learning";
import { GenerateQuizUseCase } from "@application/usecases/GenerateQuizUseCase";
import { SubmitAnswerUseCase } from "@application/usecases/SubmitAnswerUseCase";
import { VocabularyService } from "@application/services/VocabularyService";
import { DEFAULT_QUIZ_SETTINGS, MAX_QUESTION_COUNT, QuizSettings, collectionKeyOf } from "@domain/entities/QuizSettings";
import { createSeededRandomSource } from "@domain/services/Random";
import { NOW, alphabetWords, makeProgress, makeVocabulary, makeWord } from "../../test/fixtures";
import {
  InMemoryLearningRepository,
  InMemoryVocabularyRepository,
  InMemoryWordRepository,
} from "../../test/inMemoryRepositories";

const USER = "u1";

function answerEvent(wordId: string, collectionKey: string): ReviewEvent {
  return {
    id: `e-${wordId}`, wordId, sessionId: null, mode: "source_to_target", rating: "good",
    shownAt: NOW.toISOString(), answeredAt: NOW.toISOString(), responseMs: 1000, collectionKey,
  };
}

function setup() {
  const mine = makeVocabulary("v1");
  const draft = makeVocabulary("draft", { status: "draft" });
  const downloaded = makeVocabulary("dl", { ownerId: "someone-else", sourceLanguage: "en", targetLanguages: ["fa"] });
  const vocabularies = new InMemoryVocabularyRepository([mine, draft, downloaded]);
  vocabularies.downloads.set(USER, new Set(["dl"]));

  const words = new InMemoryWordRepository([
    ...alphabetWords(2),
    makeWord("Entwurf", { id: "draft-word", vocabularyId: "draft" }),
    makeWord("apple", { id: "dl-apple", vocabularyId: "dl" }),
  ]);
  const learning = new InMemoryLearningRepository();
  const useCase = new GenerateQuizUseCase(new VocabularyService(vocabularies), words, learning, createSeededRandomSource(1), () => NOW);
  return { useCase, learning, words };
}

const settings = (overrides: Partial<QuizSettings> = {}): QuizSettings => ({
  ...DEFAULT_QUIZ_SETTINGS,
  includeSentenceWriting: false,
  ...overrides,
});

describe("GenerateQuizUseCase", () => {
  it("uses own published and downloaded vocabularies, never drafts", async () => {
    const { useCase } = setup();
    const quiz = await useCase.execute(USER, settings({ questionCount: 200 }));
    const ids = quiz.items.map((item) => item.word.id);
    expect(ids).toContain("dl-apple");
    expect(ids).not.toContain("draft-word");
    expect(quiz.poolSize).toBe(53);
    expect(quiz.items.find((item) => item.word.id === "dl-apple")?.sourceLanguage).toBe("en");
  });

  it("restricts to chosen vocabularies and letters", async () => {
    const { useCase } = setup();
    const quiz = await useCase.execute(USER, settings({ vocabularyIds: ["v1"], letters: ["B", "Q"] }));
    expect(quiz.poolSize).toBe(4);
    expect(quiz.items.every((item) => /^[BQ]/.test(item.word.headword))).toBe(true);
  });

  it("asks every word of a letter when All is chosen, beyond the usual cap", async () => {
    const vocabularies = new InMemoryVocabularyRepository([makeVocabulary("v1")]);
    const manyA = Array.from({ length: 250 }, (_, index) => makeWord(`Apfel${index}`));
    const learning = new InMemoryLearningRepository();
    const useCase = new GenerateQuizUseCase(
      new VocabularyService(vocabularies),
      new InMemoryWordRepository([...manyA, makeWord("Baum")]),
      learning,
      createSeededRandomSource(1),
      () => NOW
    );
    const letterQuiz = await useCase.execute(USER, settings({ letters: ["A"], questionCount: MAX_QUESTION_COUNT }));
    expect(letterQuiz.items).toHaveLength(250);
    const plainQuiz = await useCase.execute(USER, settings({ questionCount: MAX_QUESTION_COUNT }));
    expect(plainQuiz.items).toHaveLength(MAX_QUESTION_COUNT);
  });

  it("ignores a drafted vocabulary even when explicitly selected", async () => {
    const { useCase } = setup();
    const quiz = await useCase.execute(USER, settings({ vocabularyIds: ["draft"] }));
    expect(quiz.items).toEqual([]);
    expect(quiz.sessionId).toBeNull();
  });

  it("records a session and starts the collection's next round when every word was asked", async () => {
    const { useCase, learning, words } = setup();
    const earlier = new Date(NOW.getTime() - 60_000).toISOString();
    for (const word of words.words.values()) {
      learning.progress.set(word.id, makeProgress(word.id));
      learning.events.push({ ...answerEvent(word.id, "A"), answeredAt: earlier });
    }

    const quiz = await useCase.execute(USER, settings({ vocabularyIds: ["v1"], letters: ["A"] }));
    expect(quiz.cycleRestarted).toBe(true);
    expect(learning.roundStartByCollection.get("A")).toBe(NOW.toISOString());
    expect(learning.roundStartByCollection.has("all")).toBe(false);
    expect(learning.sessions[0]).toMatchObject({ id: quiz.sessionId, plannedCount: 2, cycleRestarted: true });
  });

  it("keeps a separate round for each letter collection but one shared progress per word", async () => {
    const { useCase, learning } = setup();
    const submit = new SubmitAnswerUseCase(learning);
    const lettersBCD = settings({ vocabularyIds: ["v1"], letters: ["B", "C", "D"], questionCount: 5 });

    const first = await useCase.execute(USER, lettersBCD);
    const [item] = first.items;
    await submit.execute({
      userId: USER, sessionId: first.sessionId, wordId: item.word.id, mode: item.mode, rating: "bad",
      shownAt: NOW, answeredAt: NOW, collectionKey: collectionKeyOf(lettersBCD.letters),
    });
    expect(learning.events[0].collectionKey).toBe("B,C,D");

    const secondBCD = await useCase.execute(USER, lettersBCD);
    expect(secondBCD.items.map((quizItem) => quizItem.word.id)).not.toContain(item.word.id);
    expect(secondBCD.cycleRestarted).toBe(false);

    for (const otherCollection of [settings({ vocabularyIds: ["v1"], questionCount: MAX_QUESTION_COUNT }), settings({ vocabularyIds: ["v1"], letters: ["A", "B", "C", "D"], questionCount: MAX_QUESTION_COUNT })]) {
      const quiz = await useCase.execute(USER, otherCollection);
      expect(quiz.items.map((quizItem) => quizItem.word.id)).toContain(item.word.id);
      expect(quiz.progressByWordId.get(item.word.id)?.lastRating).toBe("bad");
    }
  });

  it("does not ask an answered word again until the round ends, whatever its rating", async () => {
    const { useCase, learning } = setup();
    const submit = new SubmitAnswerUseCase(learning);
    const scope = settings({ vocabularyIds: ["v1"], questionCount: 5 });

    const first = await useCase.execute(USER, scope);
    expect(first.items).toHaveLength(5);
    const [easyItem, badItem] = first.items;
    const answer = (item: typeof easyItem, rating: "easy" | "bad") =>
      submit.execute({
        userId: USER, sessionId: first.sessionId, wordId: item.word.id, mode: item.mode, rating,
        shownAt: NOW, answeredAt: NOW, collectionKey: collectionKeyOf(scope.letters),
      });
    await answer(easyItem, "easy");
    await answer(badItem, "bad");

    const second = await useCase.execute(USER, scope);
    const ids = second.items.map((item) => item.word.id);
    expect(second.cycleRestarted).toBe(false);
    expect(ids).not.toContain(easyItem.word.id);
    expect(ids).not.toContain(badItem.word.id);
    expect(ids).toHaveLength(5);
  });
});
