import { ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { Vocabulary, VocabularyInput, VocabularyStatus } from "@domain/entities/Vocabulary";
import { Word } from "@domain/entities/Word";
import { LearningRepository, QuizSessionRecord } from "@domain/repositories/LearningRepository";
import { FeedQuery, Page, VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { WordRepository } from "@domain/repositories/WordRepository";

/** Simple in-memory implementations of the repository ports, for use-case tests. */

export class InMemoryWordRepository implements WordRepository {
  readonly words = new Map<string, Word>();
  listCalls = 0;

  constructor(words: Word[] = []) {
    for (const word of words) this.words.set(word.id, word);
  }

  async listByVocabularies(ids: string[]): Promise<Word[]> {
    this.listCalls += 1;
    return Array.from(this.words.values()).filter((word) => ids.includes(word.vocabularyId));
  }

  async getByIds(ids: string[]): Promise<Word[]> {
    return ids.map((id) => this.words.get(id)).filter((word): word is Word => !!word);
  }

  async saveMany(words: Word[]): Promise<void> {
    for (const word of words) this.words.set(word.id, word);
  }

  async softDelete(words: Pick<Word, "id">[]): Promise<void> {
    for (const word of words) this.words.delete(word.id);
  }
}

export class InMemoryVocabularyRepository implements VocabularyRepository {
  readonly vocabularies = new Map<string, Vocabulary>();
  readonly downloads = new Map<string, Set<string>>();

  constructor(vocabularies: Vocabulary[] = []) {
    for (const vocabulary of vocabularies) this.vocabularies.set(vocabulary.id, vocabulary);
  }

  async listOwned(userId: string): Promise<Vocabulary[]> {
    return Array.from(this.vocabularies.values()).filter((vocabulary) => vocabulary.ownerId === userId);
  }

  async listDownloaded(userId: string): Promise<Vocabulary[]> {
    const ids = this.downloads.get(userId) ?? new Set();
    return Array.from(this.vocabularies.values()).filter((vocabulary) => ids.has(vocabulary.id) && vocabulary.status === "published");
  }

  async listPublished(query: FeedQuery): Promise<Page<Vocabulary>> {
    const items = Array.from(this.vocabularies.values()).filter((vocabulary) => vocabulary.status === "published");
    return { items: items.slice(query.page * query.pageSize, (query.page + 1) * query.pageSize), total: items.length };
  }

  async getById(id: string): Promise<Vocabulary | null> {
    return this.vocabularies.get(id) ?? null;
  }

  async create(ownerId: string, id: string, input: VocabularyInput): Promise<Vocabulary> {
    const vocabulary: Vocabulary = {
      id,
      ownerId,
      ownerName: null,
      ...input,
      status: "draft",
      wordCount: 0,
      downloadCount: 0,
      ratingAvg: 0,
      ratingCount: 0,
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
      publishedAt: null,
    };
    this.vocabularies.set(id, vocabulary);
    return vocabulary;
  }

  async update(id: string, input: VocabularyInput): Promise<Vocabulary> {
    const updated = { ...this.vocabularies.get(id)!, ...input };
    this.vocabularies.set(id, updated);
    return updated;
  }

  async setStatus(id: string, status: VocabularyStatus): Promise<Vocabulary> {
    const updated = { ...this.vocabularies.get(id)!, status };
    this.vocabularies.set(id, updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    this.vocabularies.delete(id);
  }

  async listDownloadedIds(userId: string): Promise<Set<string>> {
    return new Set(this.downloads.get(userId) ?? []);
  }

  async download(userId: string, vocabularyId: string): Promise<void> {
    const set = this.downloads.get(userId) ?? new Set();
    set.add(vocabularyId);
    this.downloads.set(userId, set);
  }

  async removeDownload(userId: string, vocabularyId: string): Promise<void> {
    this.downloads.get(userId)?.delete(vocabularyId);
  }
}

export class InMemoryLearningRepository implements LearningRepository {
  readonly progress = new Map<string, WordProgress>();
  readonly events: ReviewEvent[] = [];
  readonly sessions: QuizSessionRecord[] = [];
  restartedCycles: string[][] = [];

  constructor(progress: WordProgress[] = []) {
    for (const currentProgress of progress) this.progress.set(currentProgress.wordId, currentProgress);
  }

  async getAllProgress(): Promise<WordProgress[]> {
    return Array.from(this.progress.values());
  }

  async getProgress(_userId: string, wordId: string): Promise<WordProgress | null> {
    return this.progress.get(wordId) ?? null;
  }

  async recordReview(_userId: string, event: ReviewEvent, progress: WordProgress): Promise<void> {
    this.events.push(event);
    this.progress.set(progress.wordId, progress);
  }

  async getEvents(_userId: string, wordIds: string[]): Promise<ReviewEvent[]> {
    return this.events.filter((reviewEvent) => wordIds.includes(reviewEvent.wordId));
  }

  async resetProgress(_userId: string, wordIds: string[] | null): Promise<number> {
    const ids = wordIds ?? Array.from(this.progress.keys());
    let count = 0;
    for (const id of ids) if (this.progress.delete(id)) count += 1;
    return count;
  }

  async restartCycle(_userId: string, wordIds: string[]): Promise<void> {
    this.restartedCycles.push(wordIds);
    for (const id of wordIds) {
      const progress = this.progress.get(id);
      if (progress) this.progress.set(id, { ...progress, seenInCycle: false });
    }
  }

  async startSession(_userId: string, session: QuizSessionRecord): Promise<void> {
    this.sessions.push(session);
  }

  async completeSession(): Promise<void> {}
}
