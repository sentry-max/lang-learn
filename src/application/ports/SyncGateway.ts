export interface SyncStatus {
  online: boolean;
  /** Learning changes (answers, rounds, sessions) waiting to be sent */
  pending: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  /** Increases every time the app came back online and synced; pages refetch when it changes */
  version: number;
}

/**
 * What the UI needs to know about offline operation, without knowing how
 * it's implemented. `getStatus` returns the same object until something
 * changes (suitable for React's useSyncExternalStore).
 */
export interface SyncGateway {
  getStatus(): SyncStatus;
  subscribe(listener: () => void): () => void;
  /** Sends pending changes now and, if online, marks all data for refetch. */
  syncNow(): Promise<void>;
}
