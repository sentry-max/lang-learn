import { describe, it, expect } from "vitest";
import { GenerateQuizUseCase } from "@application/usecases/GenerateQuizUseCase";
import { SubmitAnswerUseCase } from "@application/usecases/SubmitAnswerUseCase";
import { VocabularyService } from "@application/services/VocabularyService";
import { DEFAULT_QUIZ_SETTINGS, QuizSettings } from "@domain/entities/QuizSettings";
import { createSeededRng } from "@domain/services/Random";
import { NOW, alphabetWords, makeProgress, makeVocabulary, makeWord } from "../../test/fixtures";
import {
  InMemoryLearningRepository,
  InMemoryVocabularyRepository,
  InMemoryWordRepository,
} from "../../test/inMemoryRepositories";

const USER = "u1";

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
  const useCase = new GenerateQuizUseCase(new VocabularyService(vocabularies), words, learning, createSeededRng(1), () => NOW);
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
    const ids = quiz.items.map((i) => i.word.id);
    expect(ids).toContain("dl-apple");
    expect(ids).not.toContain("draft-word");
    expect(quiz.poolSize).toBe(53);
    expect(quiz.items.find((i) => i.word.id === "dl-apple")?.sourceLanguage).toBe("en");
  });

  it("restricts to chosen vocabularies and letters", async () => {
    const { useCase } = setup();
    const quiz = await useCase.execute(USER, settings({ vocabularyIds: ["v1"], letters: ["B", "Q"] }));
    expect(quiz.poolSize).toBe(4);
    expect(quiz.items.every((i) => /^[BQ]/.test(i.word.headword))).toBe(true);
  });

  it("ignores a drafted vocabulary even when explicitly selected", async () => {
    const { useCase } = setup();
    const quiz = await useCase.execute(USER, settings({ vocabularyIds: ["draft"] }));
    expect(quiz.items).toEqual([]);
    expect(quiz.sessionId).toBeNull();
  });

  it("records a session and persists a new round when every word was seen", async () => {
    const { useCase, learning, words } = setup();
    for (const word of words.words.values()) learning.progress.set(word.id, makeProgress(word.id));

    const quiz = await useCase.execute(USER, settings({ vocabularyIds: ["v1"], letters: ["A"] }));
    expect(quiz.cycleRestarted).toBe(true);
    expect(learning.restartedCycles).toHaveLength(1);
    expect(learning.sessions[0]).toMatchObject({ id: quiz.sessionId, plannedCount: 2, cycleRestarted: true });
    expect(quiz.progressByWordId.get(quiz.items[0].word.id)?.seenInCycle).toBe(false);
  });

  it("learns from answers: a word rated easy is not asked again until the round ends", async () => {
    const { useCase, learning } = setup();
    const submit = new SubmitAnswerUseCase(learning);
    const scope = settings({ vocabularyIds: ["v1"], letters: ["C", "D", "E"], questionCount: 5 });

    const first = await useCase.execute(USER, scope);
    expect(first.items).toHaveLength(5);
    const [easyItem, badItem] = first.items;
    const answer = (item: typeof easyItem, rating: "easy" | "bad") =>
      submit.execute({ userId: USER, sessionId: first.sessionId, wordId: item.word.id, mode: item.mode, rating, shownAt: NOW, answeredAt: NOW });
    await answer(easyItem, "easy");
    await answer(badItem, "bad");

    const second = await useCase.execute(USER, scope);
    const ids = second.items.map((i) => i.word.id);
    expect(second.cycleRestarted).toBe(false);
    expect(ids).not.toContain(easyItem.word.id);
    expect(ids).toContain(badItem.word.id);
    expect(ids).toHaveLength(5);
  });
});
