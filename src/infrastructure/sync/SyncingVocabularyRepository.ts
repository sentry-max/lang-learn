import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { SyncCoordinator, SyncStatus } from "@domain/repositories/SyncCoordinator";
import { toAppError } from "@domain/errors/AppError";

const PENDING_KEY = "b1-vocab-trainer:sync:pending";
const LAST_SYNCED_KEY = "b1-vocab-trainer:sync:last-synced";

interface PendingChanges {
  upsertIds: string[];
  deleteIds: string[];
  deleteAll: boolean;
}

function readPending(): PendingChanges {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return { upsertIds: [], deleteIds: [], deleteAll: false };
    const parsed = JSON.parse(raw);
    return {
      upsertIds: Array.isArray(parsed.upsertIds) ? parsed.upsertIds : [],
      deleteIds: Array.isArray(parsed.deleteIds) ? parsed.deleteIds : [],
      deleteAll: Boolean(parsed.deleteAll),
    };
  } catch {
    return { upsertIds: [], deleteIds: [], deleteAll: false };
  }
}

function writePending(pending: PendingChanges): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Best-effort — worst case, the next resync just re-checks everything.
  }
}

function markSyncedNow(): void {
  try {
    window.localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
  } catch {
    // Non-critical — status display just won't show a timestamp.
  }
}

function readLastSyncedAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_SYNCED_KEY);
  } catch {
    return null;
  }
}

/**
 * There is exactly one vocabulary dataset — this class is what makes that
 * true. It always reads and writes the local cache immediately (so the
 * app works offline and edits never feel slow), and mirrors every change
 * to the remote (Supabase) in the background when online. Changes made
 * while offline are queued and pushed automatically once the connection
 * returns, or on demand via resync() (the manual "re-sync" button).
 */
export class SyncingVocabularyRepository implements VocabularyRepository, SyncCoordinator {
  constructor(
    private readonly local: VocabularyRepository,
    private readonly remote: VocabularyRepository,
    private readonly isOnline: () => boolean
  ) {}

  async getAll(): Promise<VocabularyEntry[]> {
    return this.local.getAll();
  }

  async getById(id: string): Promise<VocabularyEntry | null> {
    return this.local.getById(id);
  }

  async saveMany(entries: VocabularyEntry[]): Promise<void> {
    await this.local.saveMany(entries);

    const pending = readPending();
    const upsertIds = new Set(pending.upsertIds);
    const deleteIds = new Set(pending.deleteIds);
    entries.forEach((e) => {
      upsertIds.add(e.id);
      deleteIds.delete(e.id); // a fresh save supersedes any queued delete for the same id
    });

    if (this.isOnline()) {
      try {
        await this.remote.saveMany(entries);
        entries.forEach((e) => upsertIds.delete(e.id));
        markSyncedNow();
      } catch {
        // Stays queued in upsertIds; will retry on the next resync.
      }
    }

    writePending({ upsertIds: Array.from(upsertIds), deleteIds: Array.from(deleteIds), deleteAll: pending.deleteAll });
  }

  async deleteById(id: string): Promise<void> {
    await this.local.deleteById(id);

    const pending = readPending();
    const upsertIds = pending.upsertIds.filter((existing) => existing !== id);
    const deleteIds = new Set(pending.deleteIds);

    if (this.isOnline()) {
      try {
        await this.remote.deleteById(id);
        markSyncedNow();
      } catch {
        deleteIds.add(id);
      }
    } else {
      deleteIds.add(id);
    }

    writePending({ upsertIds, deleteIds: Array.from(deleteIds), deleteAll: pending.deleteAll });
  }

  async deleteAll(): Promise<void> {
    await this.local.deleteAll();

    if (this.isOnline()) {
      try {
        await this.remote.deleteAll();
        markSyncedNow();
        writePending({ upsertIds: [], deleteIds: [], deleteAll: false });
        return;
      } catch {
        // Fall through — queue it instead.
      }
    }

    // Deleting everything makes any other queued change moot.
    writePending({ upsertIds: [], deleteIds: [], deleteAll: true });
  }

  async count(): Promise<number> {
    return this.local.count();
  }

  async getStatus(): Promise<SyncStatus> {
    const pending = readPending();
    const pendingCount = pending.upsertIds.length + pending.deleteIds.length + (pending.deleteAll ? 1 : 0);
    return { pendingCount, lastSyncedAt: readLastSyncedAt(), isOnline: this.isOnline() };
  }

  /**
   * Pushes queued local changes to the remote, then pulls the remote's
   * data as the new local cache. Push-before-pull means changes made
   * offline are never silently lost by an overwrite.
   */
  async resync(): Promise<SyncStatus> {
    if (!this.isOnline()) {
      return this.getStatus();
    }

    try {
      const pending = readPending();

      if (pending.deleteAll) {
        await this.remote.deleteAll();
      } else if (pending.deleteIds.length > 0) {
        for (const id of pending.deleteIds) {
          await this.remote.deleteById(id);
        }
      }

      if (pending.upsertIds.length > 0) {
        const localAll = await this.local.getAll();
        const toPush = localAll.filter((entry) => pending.upsertIds.includes(entry.id));
        if (toPush.length > 0) await this.remote.saveMany(toPush);
      }

      writePending({ upsertIds: [], deleteIds: [], deleteAll: false });

      const remoteAll = await this.remote.getAll();
      await this.local.deleteAll();
      if (remoteAll.length > 0) await this.local.saveMany(remoteAll);

      markSyncedNow();
      return this.getStatus();
    } catch (err) {
      throw toAppError(err, "Failed to sync vocabulary.");
    }
  }
}
