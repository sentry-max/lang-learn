import { SyncGateway, SyncStatus } from "@application/ports/SyncGateway";
import { Connectivity } from "@infrastructure/offline/Connectivity";
import { OfflineLearningRepository } from "@infrastructure/offline/OfflineLearningRepository";

/**
 * Coordinates going offline and coming back:
 *   back online -> send queued learning changes -> mark cached data stale
 *   -> bump `version` so open pages refetch fresh data.
 */
export class OfflineSyncManager implements SyncGateway {
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private status: SyncStatus;

  constructor(
    private readonly connectivity: Connectivity,
    private readonly learning: OfflineLearningRepository,
    /** Marks every in-memory cache stale (kept as offline fallback) */
    private readonly invalidateCaches: () => void
  ) {
    this.status = this.computeStatus();
  }

  /** Starts watching connectivity and the outbox; returns the matching stop function. */
  start(): () => void {
    const unsubscribers = [
      this.connectivity.subscribe((online) => {
        this.refreshStatus();
        if (online) void this.syncNow();
      }),
      this.learning.subscribe(() => this.refreshStatus()),
    ];
    this.refreshStatus();
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async syncNow(): Promise<void> {
    if (!this.connectivity.isOnline()) return;
    await this.learning.flush();
    if (!this.connectivity.isOnline()) return;
    this.invalidateCaches();
    this.version += 1;
    this.refreshStatus();
  }

  private refreshStatus(): void {
    const next = this.computeStatus();
    const current = this.status;
    if (
      next.online === current.online &&
      next.pending === current.pending &&
      next.syncing === current.syncing &&
      next.lastSyncedAt === current.lastSyncedAt &&
      next.version === current.version
    ) {
      return;
    }
    this.status = next;
    for (const listener of this.listeners) listener();
  }

  private computeStatus(): SyncStatus {
    return { online: this.connectivity.isOnline(), ...this.learning.getSyncState(), version: this.version };
  }
}
