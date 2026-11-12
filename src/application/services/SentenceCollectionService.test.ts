import { describe, it, expect } from "vitest";
import { SentenceCollectionService } from "@application/services/SentenceCollectionService";
import { makeCollection } from "../../test/fixtures";
import { InMemorySentenceCollectionRepository } from "../../test/inMemoryRepositories";

describe("SentenceCollectionService", () => {
  it("refuses to publish a collection without exercises", async () => {
    const service = new SentenceCollectionService(new InMemorySentenceCollectionRepository([makeCollection("c1")]));
    await expect(service.publish("u1", makeCollection("c1"))).rejects.toMatchObject({ reason: "collection_empty" });
    await expect(service.publish("u1", makeCollection("c1", { exerciseCount: 3 }))).resolves.toMatchObject({ status: "published" });
  });

  it("practices own drafts and downloaded collections, but never an empty one", async () => {
    const repository = new InMemorySentenceCollectionRepository([
      makeCollection("own-draft", { exerciseCount: 2, name: "B" }),
      makeCollection("own-empty"),
      makeCollection("theirs", { ownerId: "u2", status: "published", exerciseCount: 5, name: "A" }),
      makeCollection("not-downloaded", { ownerId: "u2", status: "published", exerciseCount: 5 }),
    ]);
    repository.downloadedIds.add("theirs");
    const library = await new SentenceCollectionService(repository).listLibrary("u1");
    expect(library.map((collection) => collection.id)).toEqual(["theirs", "own-draft"]);
  });

  it("rejects a blank name and only lets the owner change a collection", async () => {
    const service = new SentenceCollectionService(new InMemorySentenceCollectionRepository([]));
    await expect(service.create("u1", { name: "  ", description: "", language: "de" })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(service.delete("u2", makeCollection("c1"))).rejects.toMatchObject({ code: "forbidden" });
  });
});
