import { describe, it, expect } from "vitest";
import { CachingWordRepository } from "@infrastructure/cache/CachingWordRepository";
import { makeWord } from "../../test/fixtures";
import { InMemoryWordRepository } from "../../test/inMemoryRepositories";

describe("CachingWordRepository", () => {
  it("serves repeated reads from memory and shares concurrent requests", async () => {
    const inner = new InMemoryWordRepository([makeWord("a"), makeWord("b", { vocabularyId: "v2" })]);
    const cache = new CachingWordRepository(inner);
    await Promise.all([cache.listByVocabularies(["v1"]), cache.listByVocabularies(["v1"])]);
    await cache.listByVocabularies(["v1"]);
    expect(inner.listCalls).toBe(1);
    expect(await cache.listByVocabularies(["v1", "v2"])).toHaveLength(2);
    expect(inner.listCalls).toBe(2);
  });

  it("invalidates a vocabulary after writes and after the TTL", async () => {
    let now = 0;
    const inner = new InMemoryWordRepository([makeWord("a")]);
    const cache = new CachingWordRepository(inner, 1000, () => now);
    await cache.listByVocabularies(["v1"]);
    await cache.saveMany([makeWord("c")]);
    expect(await cache.listByVocabularies(["v1"])).toHaveLength(2);
    expect(inner.listCalls).toBe(2);
    now = 5000;
    await cache.listByVocabularies(["v1"]);
    expect(inner.listCalls).toBe(3);
  });

  it("does not cache failures", async () => {
    const inner = new InMemoryWordRepository([makeWord("a")]);
    let fail = true;
    const original = inner.listByVocabularies.bind(inner);
    inner.listByVocabularies = async (ids) => {
      if (fail) throw new Error("offline");
      return original(ids);
    };
    const cache = new CachingWordRepository(inner);
    await expect(cache.listByVocabularies(["v1"])).rejects.toThrow("offline");
    fail = false;
    expect(await cache.listByVocabularies(["v1"])).toHaveLength(1);
  });
});
