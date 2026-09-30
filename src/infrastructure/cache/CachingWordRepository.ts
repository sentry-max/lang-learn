import { Word } from "@domain/entities/Word";
import { isNetworkError, offlineError } from "@domain/errors/AppError";
import { WordRepository } from "@domain/repositories/WordRepository";
import { Connectivity } from "@infrastructure/offline/Connectivity";
import { assertOnline } from "@infrastructure/offline/OfflineReadCache";

interface Entry {
  words: Word[];
  loadedAt: number;
}

const ALWAYS_ONLINE: Connectivity = { isOnline: () => true, subscribe: () => () => {} };

/**
 * Keeps words per vocabulary in memory for the life of the tab.
 *
 * - Online: entries are refreshed after `ttlMs`; concurrent requests for the
 *   same vocabulary share one network call.
 * - Offline (or the request fails for network reasons): the last loaded
 *   words are served, so downloaded vocabularies stay fully usable.
 * - Writes need a connection and mark the affected vocabularies stale.
 */
export class CachingWordRepository implements WordRepository {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<Word[]>>();

  constructor(
    private readonly inner: WordRepository,
    private readonly ttlMs = 5 * 60 * 1000,
    private readonly clock: () => number = () => Date.now(),
    private readonly connectivity: Connectivity = ALWAYS_ONLINE
  ) {}

  async listByVocabularies(vocabularyIds: string[]): Promise<Word[]> {
    const ids = Array.from(new Set(vocabularyIds));
    const now = this.clock();

    const stale = ids.filter((id) => !this.isFresh(id, now) && !this.pending.has(id));
    if (stale.length > 0 && this.connectivity.isOnline()) {
      const grouped = this.inner.listByVocabularies(stale).then(groupByVocabulary);
      for (const id of stale) {
        const promise = grouped.then((groups) => {
          const words = groups.get(id) ?? [];
          this.entries.set(id, { words, loadedAt: now });
          return words;
        });
        this.pending.set(id, promise);
        const clear = () => {
          if (this.pending.get(id) === promise) this.pending.delete(id);
        };
        promise.then(clear, clear);
      }
    }

    let anyAvailable = false;
    const lists = await Promise.all(
      ids.map(async (id) => {
        const inFlight = this.pending.get(id);
        if (inFlight) {
          try {
            const words = await inFlight;
            anyAvailable = true;
            return words;
          } catch (err) {
            if (!isNetworkError(err)) throw err;
          }
        }
        const entry = this.entries.get(id);
        if (entry) anyAvailable = true;
        return entry?.words ?? [];
      })
    );

    // Offline with none of the requested vocabularies ever loaded: say so instead of "no words".
    if (!anyAvailable && ids.length > 0) throw offlineError();
    return lists.flat();
  }

  async getByIds(ids: string[]): Promise<Word[]> {
    if (this.connectivity.isOnline()) {
      try {
        return await this.inner.getByIds(ids);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    const wanted = new Set(ids);
    return Array.from(this.entries.values()).flatMap((entry) => entry.words.filter((w) => wanted.has(w.id)));
  }

  async saveMany(words: Word[]): Promise<void> {
    assertOnline(this.connectivity);
    try {
      await this.inner.saveMany(words);
    } finally {
      this.invalidate(words.map((w) => w.vocabularyId));
    }
  }

  async softDelete(words: Pick<Word, "id" | "vocabularyId">[]): Promise<void> {
    assertOnline(this.connectivity);
    try {
      await this.inner.softDelete(words);
    } finally {
      this.invalidate(words.map((w) => w.vocabularyId));
    }
  }

  /**
   * Marks vocabularies (or everything) stale so the next online read
   * refetches them. The words stay available as an offline fallback.
   */
  invalidate(vocabularyIds?: string[]): void {
    const ids = vocabularyIds ?? Array.from(this.entries.keys());
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) entry.loadedAt = Number.NEGATIVE_INFINITY;
    }
  }

  private isFresh(id: string, now: number): boolean {
    const entry = this.entries.get(id);
    return entry !== undefined && now - entry.loadedAt < this.ttlMs;
  }
}

function groupByVocabulary(words: Word[]): Map<string, Word[]> {
  const groups = new Map<string, Word[]>();
  for (const word of words) {
    const list = groups.get(word.vocabularyId);
    if (list) list.push(word);
    else groups.set(word.vocabularyId, [word]);
  }
  return groups;
}
