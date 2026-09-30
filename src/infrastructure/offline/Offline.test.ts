import { describe, it, expect, vi } from "vitest";
import { AppError } from "@domain/errors/AppError";
import { DEFAULT_QUIZ_SETTINGS } from "@domain/entities/QuizSettings";
import { ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { createSeededRng } from "@domain/services/Random";
import { VocabularyService } from "@application/services/VocabularyService";
import { GenerateQuizUseCase } from "@application/usecases/GenerateQuizUseCase";
import { SubmitAnswerUseCase } from "@application/usecases/SubmitAnswerUseCase";
import { PrepareOfflineUseCase } from "@application/usecases/PrepareOfflineUseCase";
import { ManualConnectivity } from "@infrastructure/offline/Connectivity";
import { Outbox } from "@infrastructure/offline/Outbox";
import { OfflineLearningRepository } from "@infrastructure/offline/OfflineLearningRepository";
import { OfflineReadCache } from "@infrastructure/offline/OfflineReadCache";
import { OfflineSyncManager } from "@infrastructure/offline/OfflineSyncManager";
import { OfflineVocabularyRepository } from "@infrastructure/offline/OfflineVocabularyRepository";
import { CachingWordRepository } from "@infrastructure/cache/CachingWordRepository";
import { NOW, alphabetWords, makeProgress, makeVocabulary, makeWord } from "../../test/fixtures";
import {
  InMemoryLearningRepository,
  InMemoryVocabularyRepository,
  InMemoryWordRepository,
} from "../../test/inMemoryRepositories";

const USER = "u1";
const networkError = () => new AppError("network", "down");

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function event(wordId: string, id = `e-${wordId}`): ReviewEvent {
  return { id, wordId, sessionId: null, mode: "source_to_target", rating: "good", shownAt: NOW.toISOString(), answeredAt: NOW.toISOString(), responseMs: 1000 };
}

function setupLearning(online = true) {
  const connectivity = new ManualConnectivity(online);
  const storage = new MemoryStorage() as unknown as Storage;
  const remote = new InMemoryLearningRepository([makeProgress("w1")]);
  const learning = new OfflineLearningRepository(remote, connectivity, new Outbox("outbox", storage));
  return { connectivity, storage, remote, learning };
}

describe("OfflineReadCache", () => {
  it("returns fresh data online and the last result offline", async () => {
    const connectivity = new ManualConnectivity(true);
    const cache = new OfflineReadCache(connectivity);
    expect(await cache.read("k", async () => 1)).toBe(1);
    connectivity.set(false);
    expect(await cache.read("k", async () => 2)).toBe(1);
    await expect(cache.read("other", async () => 3)).rejects.toMatchObject({ reason: "offline" });
  });

  it("falls back when the request fails for network reasons only", async () => {
    const cache = new OfflineReadCache(new ManualConnectivity(true));
    await cache.read("k", async () => "cached");
    expect(await cache.read("k", async () => Promise.reject(networkError()))).toBe("cached");
    await expect(cache.read("k", async () => Promise.reject(new AppError("forbidden", "no")))).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("CachingWordRepository offline", () => {
  it("keeps serving loaded vocabularies offline and refuses writes", async () => {
    const connectivity = new ManualConnectivity(true);
    const inner = new InMemoryWordRepository([makeWord("a"), makeWord("b", { vocabularyId: "v2" })]);
    const cache = new CachingWordRepository(inner, 1000, () => 0, connectivity);
    await cache.listByVocabularies(["v1"]);

    connectivity.set(false);
    cache.invalidate();
    expect(await cache.listByVocabularies(["v1"])).toHaveLength(1);
    expect(await cache.listByVocabularies(["v1", "v2"])).toHaveLength(1); // partial: v2 was never loaded
    await expect(cache.listByVocabularies(["v2"])).rejects.toMatchObject({ reason: "offline" });
    expect(await cache.getByIds(["w-a"])).toHaveLength(1);
    await expect(cache.saveMany([makeWord("c")])).rejects.toMatchObject({ reason: "offline" });
    expect(inner.listCalls).toBe(1);
  });

  it("serves stale words when the server is unreachable", async () => {
    const inner = new InMemoryWordRepository([makeWord("a")]);
    let now = 0;
    const cache = new CachingWordRepository(inner, 1000, () => now, new ManualConnectivity(true));
    await cache.listByVocabularies(["v1"]);
    inner.listByVocabularies = async () => Promise.reject(networkError());
    now = 5000;
    expect(await cache.listByVocabularies(["v1"])).toHaveLength(1);
  });
});

describe("OfflineLearningRepository", () => {
  it("applies answers locally while offline and persists the queue", async () => {
    const { connectivity, storage, remote, learning } = setupLearning();
    await learning.getAllProgress(USER);
    connectivity.set(false);

    await learning.recordReview(USER, event("w2"), makeProgress("w2", { lastRating: "bad" }));
    await learning.restartCycle(USER, ["w1"]);

    const local = await learning.getAllProgress(USER);
    expect(local.find((p) => p.wordId === "w2")?.lastRating).toBe("bad");
    expect(local.find((p) => p.wordId === "w1")?.seenInCycle).toBe(false);
    expect(remote.events).toHaveLength(0);
    expect(learning.getSyncState().pending).toBe(2);

    // A reload while offline must not lose anything.
    const reloaded = new Outbox("outbox", storage);
    expect(reloaded.operations().map((op) => op.kind)).toEqual(["recordReview", "restartCycle"]);
  });

  it("sends queued changes in order once back online", async () => {
    const { connectivity, remote, learning } = setupLearning(false);
    const calls: string[] = [];
    const original = { start: remote.startSession.bind(remote), record: remote.recordReview.bind(remote) };
    remote.startSession = async (u, s) => {
      calls.push("startSession");
      return original.start(u, s);
    };
    remote.recordReview = async (u, e, p) => {
      calls.push("recordReview");
      return original.record(u, e, p);
    };

    await learning.startSession(USER, {
      id: "s1", settings: DEFAULT_QUIZ_SETTINGS, vocabularyIds: [], plannedCount: 1, cycleRestarted: false, startedAt: NOW.toISOString(),
    });
    await learning.recordReview(USER, event("w1"), makeProgress("w1", { lastRating: "easy" }));
    expect(calls).toEqual([]);

    connectivity.set(true);
    await learning.flush();
    expect(calls).toEqual(["startSession", "recordReview"]);
    expect(remote.progress.get("w1")?.lastRating).toBe("easy");
    expect(learning.getSyncState()).toMatchObject({ pending: 0, syncing: false });
  });

  it("keeps changes when the server is unreachable and overlays them on fresh reads", async () => {
    vi.useFakeTimers();
    try {
      const { remote, learning } = setupLearning(true);
      remote.recordReview = async () => Promise.reject(networkError());
      await learning.recordReview(USER, event("w1"), makeProgress("w1", { lastRating: "very_bad" }));
      await learning.flush();
      expect(learning.getSyncState().pending).toBe(1);

      const progress = await learning.getAllProgress(USER);
      expect(progress.find((p) => p.wordId === "w1")?.lastRating).toBe("very_bad");
      const events = await learning.getEvents(USER, ["w1"]);
      expect(events.map((e) => e.id)).toContain("e-w1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up on a change the server keeps rejecting, without blocking later ones", async () => {
    const { remote, learning } = setupLearning(true);
    let rejectFirst = true;
    const original = remote.recordReview.bind(remote);
    remote.recordReview = async (u, e, p) => {
      if (rejectFirst && e.id === "bad") throw new AppError("validation", "rejected");
      return original(u, e, p);
    };
    await learning.recordReview(USER, event("w1", "bad"), makeProgress("w1"));
    await learning.recordReview(USER, event("w2", "good"), makeProgress("w2"));
    for (let i = 0; i < 5; i++) await learning.flush();
    rejectFirst = false;
    expect(learning.getSyncState().pending).toBe(0);
    expect(remote.events.map((e) => e.id)).toEqual(["good"]);
  });

  it("requires a connection to reset history", async () => {
    const { connectivity, learning } = setupLearning(false);
    await expect(learning.resetProgress(USER, null)).rejects.toMatchObject({ reason: "offline" });
    connectivity.set(true);
    expect(await learning.resetProgress(USER, null)).toBe(1);
  });
});

describe("offline quiz, end to end", () => {
  it("keeps quizzing and learning offline, then syncs and refetches when back online", async () => {
    const connectivity = new ManualConnectivity(true);
    const vocabularies = new OfflineVocabularyRepository(new InMemoryVocabularyRepository([makeVocabulary("v1")]), connectivity);
    const remoteWords = new InMemoryWordRepository(alphabetWords(2));
    const words = new CachingWordRepository(remoteWords, 60_000, () => 0, connectivity);
    const remoteLearning = new InMemoryLearningRepository();
    const learning = new OfflineLearningRepository(remoteLearning, connectivity, new Outbox("o", new MemoryStorage() as unknown as Storage));
    const vocabularyService = new VocabularyService(vocabularies);
    const generate = new GenerateQuizUseCase(vocabularyService, words, learning, createSeededRng(3), () => NOW);
    const submit = new SubmitAnswerUseCase(learning);
    const invalidate = vi.fn(() => words.invalidate());
    const sync = new OfflineSyncManager(connectivity, learning, invalidate);
    const stop = sync.start();

    // Online: everything the quiz needs is loaded into memory.
    await new PrepareOfflineUseCase(vocabularyService, words, learning).execute(USER);

    connectivity.set(false);
    expect(sync.getStatus().online).toBe(false);

    const scope = { ...DEFAULT_QUIZ_SETTINGS, includeSentenceWriting: false, letters: ["A", "B", "C", "D", "E", "F"], questionCount: 5 };
    const first = await generate.execute(USER, scope);
    expect(first.items).toHaveLength(5);
    for (const item of first.items) {
      await submit.execute({
        userId: USER, sessionId: first.sessionId, wordId: item.word.id, mode: item.mode,
        rating: "easy", shownAt: NOW, answeredAt: NOW, previous: first.progressByWordId.get(item.word.id),
      });
    }

    // Still offline: a new quiz knows those 5 words are parked for this round.
    const second = await generate.execute(USER, { ...scope, questionCount: 5 });
    const answered = new Set(first.items.map((i) => i.word.id));
    expect(second.items).toHaveLength(5);
    expect(second.cycleRestarted).toBe(false);
    expect(second.items.every((i) => !answered.has(i.word.id))).toBe(true);
    expect(remoteLearning.events).toHaveLength(0);
    expect(sync.getStatus().pending).toBe(7); // 2 sessions + 5 answers

    // Back online: queue is sent, caches are marked stale, pages refetch.
    connectivity.set(true);
    await vi.waitFor(() => expect(sync.getStatus().version).toBe(1));
    expect(sync.getStatus().pending).toBe(0);
    expect(remoteLearning.sessions).toHaveLength(2);
    expect(remoteLearning.events).toHaveLength(5);
    expect(invalidate).toHaveBeenCalled();

    const progressAfter: WordProgress[] = await learning.getAllProgress(USER);
    expect(progressAfter.filter((p) => p.lastRating === "easy")).toHaveLength(5);
    stop();
  });
});
