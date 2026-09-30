import { ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { AppError, isNetworkError, offlineError, toAppError } from "@domain/errors/AppError";
import { LearningRepository, QuizSessionRecord } from "@domain/repositories/LearningRepository";
import { Connectivity } from "@infrastructure/offline/Connectivity";
import { Outbox, OutboxOperation } from "@infrastructure/offline/Outbox";

/** Give up on a change the server keeps rejecting (not for connectivity reasons) after this many tries. */
const MAX_REJECTED_ATTEMPTS = 5;
const RETRY_DELAY_MS = 15_000;

export interface LearningSyncState {
  pending: number;
  syncing: boolean;
  lastSyncedAt: string | null;
}

/**
 * Offline-first decorator for learning data.
 *
 * - Progress is mirrored in memory. Answers, new rounds and quiz sessions
 *   are applied to that mirror immediately and queued in the Outbox, so a
 *   quiz keeps working — and keeps learning — with no connection.
 * - The Outbox is sent in order whenever the connection allows, and
 *   retried automatically; every operation is idempotent server-side.
 * - Reads go to the server when online (after sending pending changes, with
 *   anything still pending laid on top), and fall back to the mirror
 *   otherwise.
 */
export class OfflineLearningRepository implements LearningRepository {
  private progress: Map<string, WordProgress> | null = null;
  /** Operations made while a progress fetch is in flight, re-applied on top of its result */
  private madeDuringFetch: OutboxOperation[] | null = null;
  private readonly eventsByWord = new Map<string, ReviewEvent[]>();
  private readonly listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;
  private lastSyncedAt: string | null = null;

  constructor(
    private readonly remote: LearningRepository,
    private readonly connectivity: Connectivity,
    private readonly outbox: Outbox
  ) {}

  // ---------------------------------------------------------------- reads

  async getAllProgress(userId: string): Promise<WordProgress[]> {
    if (this.connectivity.isOnline()) {
      await this.flush();
      const madeDuringFetch: OutboxOperation[] = [];
      this.madeDuringFetch = madeDuringFetch;
      try {
        const list = await this.remote.getAllProgress(userId);
        const map = new Map(list.map((p) => [p.wordId, p]));
        for (const operation of [...this.outbox.operations(), ...madeDuringFetch]) applyLocally(map, operation);
        this.progress = map;
        return Array.from(map.values());
      } catch (err) {
        if (!isNetworkError(err)) throw err;
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
    return all.find((p) => p.wordId === wordId) ?? null;
  }

  async getEvents(userId: string, wordIds: string[]): Promise<ReviewEvent[]> {
    if (this.connectivity.isOnline()) {
      await this.flush();
      try {
        const events = await this.remote.getEvents(userId, wordIds);
        for (const id of wordIds) this.eventsByWord.set(id, []);
        for (const event of events) this.eventsByWord.get(event.wordId)?.push(event);
        return [...events, ...this.pendingEvents(wordIds)];
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    const cached = wordIds.flatMap((id) => this.eventsByWord.get(id) ?? []);
    return [...cached, ...this.pendingEvents(wordIds)];
  }

  // --------------------------------------------------------------- writes

  async recordReview(userId: string, event: ReviewEvent, progress: WordProgress): Promise<void> {
    this.enqueue({ kind: "recordReview", userId, event, progress });
  }

  async restartCycle(userId: string, wordIds: string[]): Promise<void> {
    if (wordIds.length > 0) this.enqueue({ kind: "restartCycle", userId, wordIds });
  }

  async startSession(userId: string, session: QuizSessionRecord): Promise<void> {
    this.enqueue({ kind: "startSession", userId, session });
  }

  async completeSession(userId: string, sessionId: string): Promise<void> {
    this.enqueue({ kind: "completeSession", userId, sessionId });
  }

  /** Resetting history is deliberate and destructive-looking, so it needs a live connection. */
  async resetProgress(userId: string, wordIds: string[] | null): Promise<number> {
    if (!this.connectivity.isOnline()) throw offlineError();
    await this.flush();
    if (this.outbox.size > 0) throw offlineError();

    const count = await this.remote.resetProgress(userId, wordIds);
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
      } catch (err) {
        const error = toAppError(err);
        if (error.code === "network" || error.code === "auth") {
          // Offline, server unreachable or session being refreshed: keep everything and try later.
          this.scheduleRetry();
          return;
        }
        if (this.outbox.recordFailure() >= MAX_REJECTED_ATTEMPTS) {
          // eslint-disable-next-line no-console
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
      case "restartCycle":
        return this.remote.restartCycle(operation.userId, operation.wordIds);
      case "completeSession":
        return this.remote.completeSession(operation.userId, operation.sessionId);
      default:
        throw new AppError("unknown", "Unknown change type.");
    }
  }

  private enqueue(operation: OutboxOperation): void {
    if (this.progress) applyLocally(this.progress, operation);
    this.madeDuringFetch?.push(operation);
    this.outbox.push(operation);
    this.notify();
    void this.flush();
  }

  private pendingEvents(wordIds: string[]): ReviewEvent[] {
    const wanted = new Set(wordIds);
    return this.outbox
      .operations()
      .flatMap((op) => (op.kind === "recordReview" && wanted.has(op.event.wordId) ? [op.event] : []));
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
  if (operation.kind === "recordReview") {
    progress.set(operation.progress.wordId, operation.progress);
  } else if (operation.kind === "restartCycle") {
    for (const id of operation.wordIds) {
      const current = progress.get(id);
      if (current) progress.set(id, { ...current, seenInCycle: false });
    }
  }
}
