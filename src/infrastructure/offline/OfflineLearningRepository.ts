import { ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { isNetworkError, offlineError, toAppError } from "@domain/errors/AppError";
import { LearningRepository, QuizSessionRecord } from "@domain/repositories/LearningRepository";
import { SentenceAttempt } from "@domain/entities/SentencePractice";
import { Connectivity } from "@infrastructure/offline/Connectivity";
import { Outbox, OutboxOperation } from "@infrastructure/offline/Outbox";

/** Give up on a change the server keeps rejecting (not for connectivity reasons) after this many tries. */
const MAX_REJECTED_ATTEMPTS = 5;
const RETRY_DELAY_MS = 15_000;
/** Data loaded this recently is served from memory; this tab's own changes are already in it. */
const FRESH_FOR_MS = 90_000;

export interface LearningSyncState {
  pending: number;
  syncing: boolean;
  lastSyncedAt: string | null;
}

/**
 * Offline-first decorator for learning data.
 *
 * - Progress and each letter collection's round are mirrored in memory. Answers, new rounds and quiz sessions
 *   are applied to that mirror immediately and queued in the Outbox, so a
 *   quiz keeps working — and keeps learning — with no connection.
 * - The Outbox is sent in order whenever the connection allows, and
 *   retried automatically; every operation is idempotent server-side.
 * - Reads are served from the mirror while it is fresh (FRESH_FOR_MS); otherwise they go to the server when online
 *   (after sending pending changes, with anything still pending laid on top), and fall back to the mirror.
 */
export class OfflineLearningRepository implements LearningRepository {
  private progress: Map<string, WordProgress> | null = null;
  /** Operations made while a progress fetch is in flight, re-applied on top of its result */
  private madeDuringFetch: OutboxOperation[] | null = null;
  private readonly eventsByWord = new Map<string, ReviewEvent[]>();
  private readonly askedByCollection = new Map<string, Set<string>>();
  private sentenceAttempts: SentenceAttempt[] | null = null;
  private progressLoadedAt = Number.NEGATIVE_INFINITY;
  private attemptsLoadedAt = Number.NEGATIVE_INFINITY;
  private readonly listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;
  private lastSyncedAt: string | null = null;

  constructor(
    private readonly remote: LearningRepository,
    private readonly connectivity: Connectivity,
    private readonly outbox: Outbox,
    private readonly clock: () => number = () => Date.now()
  ) {}

  // ---------------------------------------------------------------- reads

  async getAllProgress(userId: string): Promise<WordProgress[]> {
    if (this.progress && this.isFresh(this.progressLoadedAt)) return Array.from(this.progress.values());
    if (this.connectivity.isOnline()) {
      await this.flush();
      const madeDuringFetch: OutboxOperation[] = [];
      this.madeDuringFetch = madeDuringFetch;
      try {
        const list = await this.remote.getAllProgress(userId);
        const map = new Map(list.map((progress) => [progress.wordId, progress]));
        for (const operation of [...this.outbox.operations(), ...madeDuringFetch]) applyLocally(map, operation);
        this.progress = map;
        this.progressLoadedAt = this.clock();
        return Array.from(map.values());
      } catch (error) {
        if (!isNetworkError(error)) throw error;
      } finally {
        if (this.madeDuringFetch === madeDuringFetch) this.madeDuringFetch = null;
      }
    }
    if (this.progress) return Array.from(this.progress.values());
    throw offlineError();
  }

  async getProgress(userId: string, wordId: string): Promise<WordProgress | null> {
    if (this.progress) return this.progress.get(wordId) ?? null;
    const all = await this.getAllProgress(userId);
    return all.find((progress) => progress.wordId === wordId) ?? null;
  }

  async getEvents(userId: string, wordIds: string[]): Promise<ReviewEvent[]> {
    if (this.connectivity.isOnline()) {
      await this.flush();
      try {
        const events = await this.remote.getEvents(userId, wordIds);
        for (const id of wordIds) this.eventsByWord.set(id, []);
        for (const event of events) this.eventsByWord.get(event.wordId)?.push(event);
        return [...events, ...this.pendingEvents(wordIds)];
      } catch (error) {
        if (!isNetworkError(error)) throw error;
      }
    }
    const cached = wordIds.flatMap((id) => this.eventsByWord.get(id) ?? []);
    return [...cached, ...this.pendingEvents(wordIds)];
  }

  async getAskedInRound(userId: string, collectionKey: string): Promise<string[]> {
    let asked: Set<string> | null = null;
    if (this.connectivity.isOnline()) {
      await this.flush();
      try {
        asked = new Set(await this.remote.getAskedInRound(userId, collectionKey));
      } catch (error) {
        if (!isNetworkError(error)) throw error;
      }
    }
    if (!asked) {
      const cached = this.askedByCollection.get(collectionKey);
      if (cached) return Array.from(cached);
      // shortcut: a collection never loaded in this tab starts offline from the queued answers only, so words asked
      // on another day may repeat; upgrade by preloading every collection's round in PrepareOfflineUseCase.
      asked = new Set();
    }
    const roundByCollection = new Map([[collectionKey, asked]]);
    for (const operation of this.outbox.operations()) applyToRounds(roundByCollection, operation);
    const current = roundByCollection.get(collectionKey)!;
    this.askedByCollection.set(collectionKey, current);
    return Array.from(current);
  }

  async getSentenceAttempts(userId: string): Promise<SentenceAttempt[]> {
    if (this.connectivity.isOnline() && !(this.sentenceAttempts && this.isFresh(this.attemptsLoadedAt))) {
      await this.flush();
      try {
        this.sentenceAttempts = await this.remote.getSentenceAttempts(userId);
        this.attemptsLoadedAt = this.clock();
      } catch (error) {
        if (!isNetworkError(error)) throw error;
      }
    }
    const pending = this.outbox
      .operations()
      .flatMap((operation) => (operation.kind === "recordSentenceAttempt" ? [operation.attempt] : []));
    const stored = (this.sentenceAttempts ?? []).filter((attempt) => !pending.some((queued) => queued.id === attempt.id));
    return [...stored, ...pending];
  }

  // --------------------------------------------------------------- writes

  async recordReview(userId: string, event: ReviewEvent, progress: WordProgress): Promise<void> {
    this.enqueue({ kind: "recordReview", userId, event, progress });
  }

  async startRound(userId: string, collectionKey: string, startedAt: string): Promise<void> {
    this.enqueue({ kind: "startRound", userId, collectionKey, startedAt });
  }

  async startSession(userId: string, session: QuizSessionRecord): Promise<void> {
    this.enqueue({ kind: "startSession", userId, session });
  }

  async completeSession(userId: string, sessionId: string): Promise<void> {
    this.enqueue({ kind: "completeSession", userId, sessionId });
  }

  async recordSentenceAttempt(userId: string, attempt: SentenceAttempt): Promise<void> {
    this.enqueue({ kind: "recordSentenceAttempt", userId, attempt });
  }

  /** Resetting history is deliberate and destructive-looking, so it needs a live connection. */
  async resetProgress(userId: string, wordIds: string[] | null): Promise<number> {
    if (!this.connectivity.isOnline()) throw offlineError();
    await this.flush();
    if (this.outbox.size > 0) throw offlineError();

    const count = await this.remote.resetProgress(userId, wordIds);
    // Reset answers no longer count as asked; the next read reloads each round.
    this.askedByCollection.clear();
    if (wordIds === null) {
      this.progress?.clear();
      this.eventsByWord.clear();
    } else {
      for (const id of wordIds) {
        this.progress?.delete(id);
        this.eventsByWord.delete(id);
      }
    }
    return count;
  }

  // ----------------------------------------------------------------- sync

  /** After a reconnect, data may have changed on another device: the next reads go to the server. */
  markStale(): void {
    this.progressLoadedAt = Number.NEGATIVE_INFINITY;
    this.attemptsLoadedAt = Number.NEGATIVE_INFINITY;
  }

  private isFresh(loadedAt: number): boolean {
    return this.clock() - loadedAt < FRESH_FOR_MS;
  }

  getSyncState(): LearningSyncState {
    return { pending: this.outbox.size, syncing: this.syncing, lastSyncedAt: this.lastSyncedAt };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sends queued changes in order. Never rejects; connectivity problems schedule a retry. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.outbox.size === 0 || !this.connectivity.isOnline()) return Promise.resolve();

    this.flushing = this.drain().finally(() => {
      this.flushing = null;
      this.syncing = false;
      this.notify();
    });
    return this.flushing;
  }

  private async drain(): Promise<void> {
    this.syncing = true;
    this.notify();

    while (this.outbox.size > 0 && this.connectivity.isOnline()) {
      const entry = this.outbox.peek()!;
      try {
        await this.send(entry.operation);
        this.outbox.shift();
        this.lastSyncedAt = new Date().toISOString();
        this.notify();
      } catch (caughtError) {
        const error = toAppError(caughtError);
        if (error.code === "network" || error.code === "auth") {
          // Offline, server unreachable or session being refreshed: keep everything and try later.
          this.scheduleRetry();
          return;
        }
        if (this.outbox.recordFailure() >= MAX_REJECTED_ATTEMPTS) {
           
          console.warn("Dropping a learning change the server keeps rejecting:", entry.operation, error);
          this.outbox.shift();
        } else {
          this.scheduleRetry();
          return;
        }
      }
    }
  }

  private send(operation: OutboxOperation): Promise<void> {
    switch (operation.kind) {
      case "startSession":
        return this.remote.startSession(operation.userId, operation.session);
      case "recordReview":
        return this.remote.recordReview(operation.userId, operation.event, operation.progress);
      case "startRound":
        return this.remote.startRound(operation.userId, operation.collectionKey, operation.startedAt);
      case "completeSession":
        return this.remote.completeSession(operation.userId, operation.sessionId);
      case "recordSentenceAttempt":
        return this.remote.recordSentenceAttempt(operation.userId, operation.attempt);
      default:
        // A change saved by an older app version that no longer exists (the global "restartCycle"): nothing to send.
        return Promise.resolve();
    }
  }

  private enqueue(operation: OutboxOperation): void {
    if (this.progress) applyLocally(this.progress, operation);
    applyToRounds(this.askedByCollection, operation);
    this.madeDuringFetch?.push(operation);
    this.outbox.push(operation);
    this.notify();
    void this.flush();
  }

  private pendingEvents(wordIds: string[]): ReviewEvent[] {
    const wanted = new Set(wordIds);
    return this.outbox
      .operations()
      .flatMap((operation) => (operation.kind === "recordReview" && wanted.has(operation.event.wordId) ? [operation.event] : []));
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, RETRY_DELAY_MS);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The local effect of a queued operation on the progress mirror. */
function applyLocally(progress: Map<string, WordProgress>, operation: OutboxOperation): void {
  if (operation.kind === "recordReview") progress.set(operation.progress.wordId, operation.progress);
}

/** The local effect of a queued operation on the mirrored rounds of letter collections. */
function applyToRounds(askedByCollection: Map<string, Set<string>>, operation: OutboxOperation): void {
  if (operation.kind === "startRound") {
    askedByCollection.set(operation.collectionKey, new Set());
  } else if (operation.kind === "recordReview" && operation.event.collectionKey) {
    askedByCollection.get(operation.event.collectionKey)?.add(operation.event.wordId);
  }
}
