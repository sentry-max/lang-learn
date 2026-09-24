import { describe, it, expect, beforeEach } from "vitest";
import { SyncingVocabularyRepository } from "@infrastructure/sync/SyncingVocabularyRepository";
import { LocalStorageVocabularyRepository } from "@infrastructure/local/LocalStorageVocabularyRepository";
import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";

function makeEntry(id: string, headword = id): VocabularyEntry {
  return {
    id,
    wordType: "noun",
    headword,
    translations: { en: ["x"] },
    nounForms: { article: "das", plural: null },
    sentences: [{ german: "x", translations: { en: "y" } }],
    level: "B1",
    tags: [],
  };
}

/** A minimal in-memory stand-in for the Supabase repository, with a switch to simulate failures. */
class FakeRemoteRepository implements VocabularyRepository {
  entries = new Map<string, VocabularyEntry>();
  shouldFail = false;

  async getAll(): Promise<VocabularyEntry[]> {
    if (this.shouldFail) throw new Error("network down");
    return Array.from(this.entries.values());
  }
  async getById(id: string): Promise<VocabularyEntry | null> {
    return this.entries.get(id) ?? null;
  }
  async saveMany(entries: VocabularyEntry[]): Promise<void> {
    if (this.shouldFail) throw new Error("network down");
    for (const e of entries) this.entries.set(e.id, e);
  }
  async deleteById(id: string): Promise<void> {
    if (this.shouldFail) throw new Error("network down");
    this.entries.delete(id);
  }
  async deleteAll(): Promise<void> {
    if (this.shouldFail) throw new Error("network down");
    this.entries.clear();
  }
  async count(): Promise<number> {
    return this.entries.size;
  }
}

describe("SyncingVocabularyRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("saves locally and pushes to remote immediately when online", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    const repo = new SyncingVocabularyRepository(local, remote, () => true);

    await repo.saveMany([makeEntry("a")]);

    expect(await local.getById("a")).not.toBeNull();
    expect(await remote.getById("a")).not.toBeNull();
    const status = await repo.getStatus();
    expect(status.pendingCount).toBe(0);
  });

  it("saves locally and queues the change when offline", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    const repo = new SyncingVocabularyRepository(local, remote, () => false);

    await repo.saveMany([makeEntry("a")]);

    expect(await local.getById("a")).not.toBeNull();
    expect(await remote.getById("a")).toBeNull();
    const status = await repo.getStatus();
    expect(status.pendingCount).toBe(1);
  });

  it("pushes queued changes to remote on resync once back online", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    const repo = new SyncingVocabularyRepository(local, remote, () => false);
    await repo.saveMany([makeEntry("a")]);
    expect(await remote.getById("a")).toBeNull();

    const onlineRepo = new SyncingVocabularyRepository(local, remote, () => true);
    const status = await onlineRepo.resync();

    expect(await remote.getById("a")).not.toBeNull();
    expect(status.pendingCount).toBe(0);
  });

  it("keeps changes queued if the remote push fails during saveMany", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    remote.shouldFail = true;
    const repo = new SyncingVocabularyRepository(local, remote, () => true);

    await repo.saveMany([makeEntry("a")]);

    expect(await local.getById("a")).not.toBeNull();
    const status = await repo.getStatus();
    expect(status.pendingCount).toBe(1);
  });

  it("deletes locally and remotely when online", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    const repo = new SyncingVocabularyRepository(local, remote, () => true);
    await repo.saveMany([makeEntry("a")]);

    await repo.deleteById("a");

    expect(await local.getById("a")).toBeNull();
    expect(await remote.getById("a")).toBeNull();
  });

  it("resync pulls remote data as the new local cache after pushing pending changes", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    // Remote already has a word from another device.
    remote.entries.set("from-remote", makeEntry("from-remote"));

    const repo = new SyncingVocabularyRepository(local, remote, () => true);
    const status = await repo.resync();

    expect(await local.getById("from-remote")).not.toBeNull();
    expect(status.pendingCount).toBe(0);
  });

  it("does nothing on resync when offline", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    remote.entries.set("from-remote", makeEntry("from-remote"));
    const repo = new SyncingVocabularyRepository(local, remote, () => false);

    await repo.resync();

    expect(await local.getById("from-remote")).toBeNull();
  });

  it("queues deleteAll when offline and applies it to remote on the next resync", async () => {
    const local = new LocalStorageVocabularyRepository();
    const remote = new FakeRemoteRepository();
    remote.entries.set("existing", makeEntry("existing"));
    const offlineRepo = new SyncingVocabularyRepository(local, remote, () => false);

    await offlineRepo.deleteAll();
    expect(await remote.getById("existing")).not.toBeNull(); // not yet pushed

    const onlineRepo = new SyncingVocabularyRepository(local, remote, () => true);
    await onlineRepo.resync();

    expect(await remote.getById("existing")).toBeNull();
  });
});
