import { randomId } from "@application/util/randomId";
import { AppError } from "@domain/errors/AppError";
import {
  SentenceCollection,
  SentenceCollectionInput,
  canPublish,
  normalizeCollectionInput,
  validateCollectionInput,
} from "@domain/entities/SentenceCollection";
import { SentenceCollectionRepository } from "@domain/repositories/SentenceCollectionRepository";

/** Creating, editing, publishing, deleting and downloading sentence collections. */
export class SentenceCollectionService {
  constructor(private readonly collections: SentenceCollectionRepository) {}

  listOwned(userId: string): Promise<SentenceCollection[]> {
    return this.collections.listOwned(userId);
  }

  listDownloaded(userId: string): Promise<SentenceCollection[]> {
    return this.collections.listDownloaded(userId);
  }

  browse(userId: string, search: string): Promise<SentenceCollection[]> {
    return this.collections.listPublished(userId, search);
  }

  /** Collections to practice from: every own one (drafts too) and the downloaded ones that have exercises. */
  async listLibrary(userId: string): Promise<SentenceCollection[]> {
    const [owned, downloaded] = await Promise.all([this.collections.listOwned(userId), this.collections.listDownloaded(userId)]);
    const byId = new Map([...owned, ...downloaded].map((collection) => [collection.id, collection]));
    return Array.from(byId.values())
      .filter((collection) => collection.exerciseCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(ownerId: string, input: SentenceCollectionInput): Promise<SentenceCollection> {
    return this.collections.create(ownerId, randomId(), validated(input));
  }

  async update(userId: string, collection: SentenceCollection, input: SentenceCollectionInput): Promise<SentenceCollection> {
    assertOwner(userId, collection);
    return this.collections.update(collection.id, validated(input));
  }

  async publish(userId: string, collection: SentenceCollection): Promise<SentenceCollection> {
    assertOwner(userId, collection);
    if (!canPublish(collection)) {
      throw new AppError("validation", "A sentence collection needs at least one exercise to be published.", { reason: "collection_empty" });
    }
    return this.collections.setStatus(collection.id, "published");
  }

  async unpublish(userId: string, collection: SentenceCollection): Promise<SentenceCollection> {
    assertOwner(userId, collection);
    return this.collections.setStatus(collection.id, "draft");
  }

  async delete(userId: string, collection: SentenceCollection): Promise<void> {
    assertOwner(userId, collection);
    return this.collections.softDelete(collection.id);
  }

  async download(userId: string, collection: SentenceCollection): Promise<void> {
    if (collection.ownerId === userId) {
      throw new AppError("validation", "You can't download your own collection.", { reason: "invalid_input" });
    }
    return this.collections.download(userId, collection.id);
  }

  removeDownload(userId: string, collectionId: string): Promise<void> {
    return this.collections.removeDownload(userId, collectionId);
  }
}

function validated(input: SentenceCollectionInput): SentenceCollectionInput {
  const clean = normalizeCollectionInput(input);
  const errors = validateCollectionInput(clean);
  if (errors.length > 0) throw new AppError("validation", `Invalid collection: ${errors.join(", ")}.`, { reason: "invalid_input" });
  return clean;
}

function assertOwner(userId: string, collection: SentenceCollection): void {
  if (collection.ownerId !== userId) throw new AppError("forbidden", "Only the owner can change this collection.");
}
