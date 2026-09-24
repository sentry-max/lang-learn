import { describe, it, expect, vi } from "vitest";
import { GenerateQuizUseCase } from "@application/usecases/GenerateQuizUseCase";
import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { ProgressState, createInitialProgress } from "@domain/entities/Review";
import { DEFAULT_QUIZ_SETTINGS } from "@domain/entities/QuizSettings";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { ProgressRepository } from "@domain/repositories/ProgressRepository";

function makeEntry(id: string): VocabularyEntry {
  return {
    id,
    wordType: "noun",
    headword: id,
    translations: { en: ["x"] },
    nounForms: { article: "das", plural: null },
    sentences: [{ german: "x", translations: { en: "y" } }],
    level: "B1",
    tags: [],
  };
}

function makeRepos(entries: VocabularyEntry[], progress: ProgressState[]) {
  const vocabularyRepository: VocabularyRepository = {
    getAll: vi.fn().mockResolvedValue(entries),
    getById: vi.fn(),
    saveMany: vi.fn(),
    deleteById: vi.fn(),
    deleteAll: vi.fn(),
    count: vi.fn(),
  };
  const progressRepository: ProgressRepository = {
    getAllProgress: vi.fn().mockResolvedValue(progress),
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
    addReviewRecord: vi.fn(),
    getReviewHistory: vi.fn(),
    getAllReviewHistory: vi.fn(),
  };
  return { vocabularyRepository, progressRepository };
}

describe("GenerateQuizUseCase", () => {
  it("returns an empty quiz when there is no vocabulary", async () => {
    const { vocabularyRepository, progressRepository } = makeRepos([], []);
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({ userId: "u1", ...DEFAULT_QUIZ_SETTINGS, questionCount: 5 });
    expect(result).toEqual([]);
  });

  it("prioritizes previously-struggled words first", async () => {
    const weak = makeEntry("weak");
    const strong = makeEntry("strong");
    const weakProgress = { ...createInitialProgress("weak"), lastRating: "bad" as const };
    const strongProgress = { ...createInitialProgress("strong"), lastRating: "easy" as const };
    const { vocabularyRepository, progressRepository } = makeRepos(
      [strong, weak],
      [weakProgress, strongProgress]
    );
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({ userId: "u1", ...DEFAULT_QUIZ_SETTINGS, questionCount: 2 });
    expect(result[0].entry.id).toBe("weak");
  });

  it("caps the number of questions at questionCount", async () => {
    const entries = [makeEntry("a"), makeEntry("b"), makeEntry("c")];
    const { vocabularyRepository, progressRepository } = makeRepos(entries, []);
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({ userId: "u1", ...DEFAULT_QUIZ_SETTINGS, questionCount: 2 });
    expect(result).toHaveLength(2);
  });

  it("cycles through de_to_en and en_to_de for a mix direction", async () => {
    const entries = [makeEntry("a"), makeEntry("b"), makeEntry("c"), makeEntry("d")];
    const { vocabularyRepository, progressRepository } = makeRepos(entries, []);
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({
      userId: "u1",
      questionCount: 4,
      direction: "mix",
      includeSentenceWriting: false,
    });
    expect(result.map((q) => q.mode)).toEqual(["de_to_en", "en_to_de", "de_to_en", "en_to_de"]);
  });

  it("uses only de_to_en for the de_to_target direction", async () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    const { vocabularyRepository, progressRepository } = makeRepos(entries, []);
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({
      userId: "u1",
      questionCount: 2,
      direction: "de_to_target",
      includeSentenceWriting: false,
    });
    expect(result.every((q) => q.mode === "de_to_en")).toBe(true);
  });

  it("appends sentence_writing to the mode rotation when the toggle is on", async () => {
    const entries = [makeEntry("a"), makeEntry("b"), makeEntry("c")];
    const { vocabularyRepository, progressRepository } = makeRepos(entries, []);
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({
      userId: "u1",
      questionCount: 3,
      direction: "de_to_target",
      includeSentenceWriting: true,
    });
    expect(result.map((q) => q.mode)).toEqual(["de_to_en", "sentence_writing", "de_to_en"]);
  });

  it("filters by a single starting letter and includes every match, ignoring the question cap", async () => {
    const entries = [
      { ...makeEntry("apple"), headword: "Apfel" },
      { ...makeEntry("auto"), headword: "Auto" },
      { ...makeEntry("banane"), headword: "Banane" },
    ];
    const { vocabularyRepository, progressRepository } = makeRepos(entries, []);
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({
      userId: "u1",
      questionCount: 1,
      direction: "de_to_target",
      includeSentenceWriting: false,
      letterFilter: { from: "a" },
    });
    expect(result).toHaveLength(2);
    expect(result.every((q) => q.entry.headword.toLowerCase().startsWith("a"))).toBe(true);
  });

  it("holds back easy/very_easy words until unseen words run short", async () => {
    const unseen = makeEntry("unseen");
    const mastered = makeEntry("mastered");
    const masteredProgress = { ...createInitialProgress("mastered"), lastRating: "very_easy" as const };
    const { vocabularyRepository, progressRepository } = makeRepos(
      [mastered, unseen],
      [masteredProgress]
    );
    const useCase = new GenerateQuizUseCase(vocabularyRepository, progressRepository);
    const result = await useCase.execute({ userId: "u1", ...DEFAULT_QUIZ_SETTINGS, questionCount: 1 });
    expect(result[0].entry.id).toBe("unseen");
  });
});
