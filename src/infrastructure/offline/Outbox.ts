import { ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { QuizSessionRecord } from "@domain/repositories/LearningRepository";

/** A learning write waiting to be sent to the server. Every kind is safe to send twice. */
export type OutboxOperation =
  | { kind: "startSession"; userId: string; session: QuizSessionRecord }
  | { kind: "recordReview"; userId: string; event: ReviewEvent; progress: WordProgress }
  | { kind: "restartCycle"; userId: string; wordIds: string[] }
  | { kind: "completeSession"; userId: string; sessionId: string };

interface Entry {
  operation: OutboxOperation;
  /** Failed attempts for reasons other than connectivity */
  attempts: number;
}

/**
 * FIFO queue of pending writes. It is mirrored to localStorage so answers
 * given offline survive even an accidental reload; if storage is
 * unavailable it silently works in memory only.
 */
export class Outbox {
  private entries: Entry[];

  constructor(
    private readonly storageKey: string,
    private readonly storage: Storage | null = safeLocalStorage()
  ) {
    this.entries = this.load();
  }

  get size(): number {
    return this.entries.length;
  }

  operations(): OutboxOperation[] {
    return this.entries.map((e) => e.operation);
  }

  push(operation: OutboxOperation): void {
    this.entries.push({ operation, attempts: 0 });
    this.save();
  }

  peek(): Entry | undefined {
    return this.entries[0];
  }

  /** Removes the first entry (sent or given up on). */
  shift(): void {
    this.entries.shift();
    this.save();
  }

  recordFailure(): number {
    const first = this.entries[0];
    if (!first) return 0;
    first.attempts += 1;
    this.save();
    return first.attempts;
  }

  private load(): Entry[] {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as Entry[]).filter((e) => e && typeof e === "object" && e.operation) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      if (this.entries.length === 0) this.storage?.removeItem(this.storageKey);
      else this.storage?.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch {
      // Storage full or blocked: the queue still works for this tab.
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
