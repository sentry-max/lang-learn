import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageVocabularyRepository } from "@infrastructure/local/LocalStorageVocabularyRepository";
import { LocalStorageProgressRepository } from "@infrastructure/local/LocalStorageProgressRepository";
import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { createInitialProgress } from "@domain/entities/Review";

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

describe("LocalStorageVocabularyRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts empty", async () => {
    const repo = new LocalStorageVocabularyRepository();
    expect(await repo.getAll()).toEqual([]);
    expect(await repo.count()).toBe(0);
  });

  it("saves and retrieves entries", async () => {
    const repo = new LocalStorageVocabularyRepository();
    await repo.saveMany([makeEntry("a"), makeEntry("b")]);
    expect(await repo.count()).toBe(2);
    expect(await repo.getById("a")).toMatchObject({ id: "a" });
  });

  it("upserts by id instead of duplicating", async () => {
    const repo = new LocalStorageVocabularyRepository();
    await repo.saveMany([makeEntry("a")]);
    await repo.saveMany([{ ...makeEntry("a"), headword: "Updated" }]);
    expect(await repo.count()).toBe(1);
    expect((await repo.getById("a"))?.headword).toBe("Updated");
  });

  it("returns null for a missing id", async () => {
    const repo = new LocalStorageVocabularyRepository();
    expect(await repo.getById("missing")).toBeNull();
  });

  it("deletes a single entry by id", async () => {
    const repo = new LocalStorageVocabularyRepository();
    await repo.saveMany([makeEntry("a"), makeEntry("b")]);
    await repo.deleteById("a");
    expect(await repo.getById("a")).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it("deletes every entry", async () => {
    const repo = new LocalStorageVocabularyRepository();
    await repo.saveMany([makeEntry("a"), makeEntry("b")]);
    await repo.deleteAll();
    expect(await repo.count()).toBe(0);
  });
});

describe("LocalStorageProgressRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts empty for a new user", async () => {
    const repo = new LocalStorageProgressRepository();
    expect(await repo.getAllProgress("user-1")).toEqual([]);
  });

  it("saves and retrieves progress scoped per user", async () => {
    const repo = new LocalStorageProgressRepository();
    const progress = createInitialProgress("word-1");
    await repo.saveProgress("user-1", progress);
    expect(await repo.getProgress("user-1", "word-1")).toMatchObject({ vocabularyEntryId: "word-1" });
    expect(await repo.getProgress("user-2", "word-1")).toBeNull();
  });

  it("upserts progress by vocabularyEntryId instead of duplicating", async () => {
    const repo = new LocalStorageProgressRepository();
    await repo.saveProgress("user-1", createInitialProgress("word-1"));
    await repo.saveProgress("user-1", { ...createInitialProgress("word-1"), repetitions: 3 });
    const all = await repo.getAllProgress("user-1");
    expect(all).toHaveLength(1);
    expect(all[0].repetitions).toBe(3);
  });

  it("stores and orders review records newest first", async () => {
    const repo = new LocalStorageProgressRepository();
    await repo.addReviewRecord("user-1", {
      id: "r1",
      vocabularyEntryId: "word-1",
      mode: "de_to_en",
      userAnswer: null,
      wasCorrect: null,
      difficultyRating: "good",
      answeredAt: "2026-01-01T00:00:00Z",
    });
    await repo.addReviewRecord("user-1", {
      id: "r2",
      vocabularyEntryId: "word-1",
      mode: "de_to_en",
      userAnswer: null,
      wasCorrect: null,
      difficultyRating: "bad",
      answeredAt: "2026-01-02T00:00:00Z",
    });
    const history = await repo.getReviewHistory("user-1", "word-1");
    expect(history.map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});
