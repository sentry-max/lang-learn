export interface SyncStatus {
  /** Number of local changes not yet pushed to the remote database. */
  pendingCount: number;
  lastSyncedAt: string | null;
  isOnline: boolean;
}

/**
 * Implemented by infrastructure classes that keep a local cache and a
 * remote backend in sync (see infrastructure/sync/SyncingVocabularyRepository.ts).
 * Presentation code uses this to show sync status and offer a manual
 * "re-sync" action, without knowing anything about how the sync works.
 */
export interface SyncCoordinator {
  getStatus(): Promise<SyncStatus>;
  /** Pushes any pending local changes to the remote, then pulls the remote's data as the new local cache. */
  resync(): Promise<SyncStatus>;
}
