import { SyncCoordinator, SyncStatus } from "@domain/repositories/SyncCoordinator";

export class VocabularySyncUseCase {
  constructor(private readonly syncCoordinator: SyncCoordinator) {}

  async getStatus(): Promise<SyncStatus> {
    return this.syncCoordinator.getStatus();
  }

  async resync(): Promise<SyncStatus> {
    return this.syncCoordinator.resync();
  }
}
