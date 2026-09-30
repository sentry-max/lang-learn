import { randomId } from "@application/util/randomId";
import { AppError } from "@domain/errors/AppError";
import {
  Vocabulary,
  VocabularyInput,
  isQuizEligible,
  normalizeVocabularyInput,
  publishBlocker,
  validateVocabularyInput,
} from "@domain/entities/Vocabulary";
import { FeedQuery, Page, VocabularyRepository } from "@domain/repositories/VocabularyRepository";

/**
 * Everything about vocabularies as collections: creating, editing,
 * publishing, soft-deleting, browsing the public feed and downloading.
 */
export class VocabularyService {
  constructor(private readonly vocabularies: VocabularyRepository) {}

  listOwned(userId: string): Promise<Vocabulary[]> {
    return this.vocabularies.listOwned(userId);
  }

  listDownloaded(userId: string): Promise<Vocabulary[]> {
    return this.vocabularies.listDownloaded(userId);
  }

  /** Vocabularies a quiz may draw from: own published ones plus downloaded ones. */
  async listQuizLibrary(userId: string): Promise<Vocabulary[]> {
    const [owned, downloaded] = await Promise.all([
      this.vocabularies.listOwned(userId),
      this.vocabularies.listDownloaded(userId),
    ]);
    const byId = new Map<string, Vocabulary>();
    for (const vocabulary of [...owned, ...downloaded]) {
      if (isQuizEligible(vocabulary)) byId.set(vocabulary.id, vocabulary);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  browse(query: FeedQuery): Promise<Page<Vocabulary>> {
    return this.vocabularies.listPublished(query);
  }

  listDownloadedIds(userId: string): Promise<Set<string>> {
    return this.vocabularies.listDownloadedIds(userId);
  }

  async get(id: string): Promise<Vocabulary> {
    const vocabulary = await this.vocabularies.getById(id);
    if (!vocabulary) throw new AppError("not_found", "Vocabulary not found.", { reason: "vocabulary_not_found" });
    return vocabulary;
  }

  async create(ownerId: string, input: VocabularyInput): Promise<Vocabulary> {
    const clean = this.validated(input);
    return this.vocabularies.create(ownerId, randomId(), clean);
  }

  async update(id: string, input: VocabularyInput): Promise<Vocabulary> {
    return this.vocabularies.update(id, this.validated(input));
  }

  async publish(vocabulary: Vocabulary): Promise<Vocabulary> {
    if (publishBlocker(vocabulary.wordCount)) {
      throw new AppError("validation", "A vocabulary needs 50 to 5000 words to be published.", {
        reason: "publish_word_limit",
      });
    }
    return this.vocabularies.setStatus(vocabulary.id, "published");
  }

  unpublish(id: string): Promise<Vocabulary> {
    return this.vocabularies.setStatus(id, "draft");
  }

  delete(id: string): Promise<void> {
    return this.vocabularies.softDelete(id);
  }

  async download(userId: string, vocabulary: Vocabulary): Promise<void> {
    if (vocabulary.ownerId === userId) {
      throw new AppError("validation", "You can't download your own vocabulary.", { reason: "invalid_input" });
    }
    return this.vocabularies.download(userId, vocabulary.id);
  }

  removeDownload(userId: string, vocabularyId: string): Promise<void> {
    return this.vocabularies.removeDownload(userId, vocabularyId);
  }

  private validated(input: VocabularyInput): VocabularyInput {
    const clean = normalizeVocabularyInput(input);
    const errors = validateVocabularyInput(clean);
    if (errors.length > 0) {
      throw new AppError("validation", `Invalid vocabulary: ${errors.join(", ")}.`, { reason: "invalid_input" });
    }
    return clean;
  }
}
