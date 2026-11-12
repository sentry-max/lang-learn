import { RecordingGateway } from "@application/ports/RecordingGateway";
import { isNetworkError } from "@domain/errors/AppError";
import { Connectivity } from "@infrastructure/offline/Connectivity";

/**
 * Keeps this tab's recordings in memory: they play back at once, and uploads that fail for lack of a connection are
 * retried when it returns. Upload never rejects, so saving a line never waits on or fails because of its audio.
 */
export class OfflineRecordingGateway implements RecordingGateway {
  // shortcut: audio waiting for a connection lives only in this tab (too big for localStorage); move it to
  // IndexedDB when recordings must survive a reload while offline.
  private readonly pending = new Map<string, Blob>();
  private readonly localUrlByPath = new Map<string, string>();
  private stopWatching: (() => void) | null = null;

  constructor(
    private readonly remote: RecordingGateway,
    private readonly connectivity: Connectivity,
    private readonly createUrl: (audio: Blob) => string = (audio) => URL.createObjectURL(audio)
  ) {}

  async upload(path: string, audio: Blob): Promise<void> {
    if (!this.localUrlByPath.has(path)) this.localUrlByPath.set(path, this.createUrl(audio));
    this.pending.set(path, audio);
    await this.send(path);
  }

  async playbackUrl(path: string): Promise<string> {
    return this.localUrlByPath.get(path) ?? this.remote.playbackUrl(path);
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  private async send(path: string): Promise<void> {
    const audio = this.pending.get(path);
    if (!audio) return;
    if (!this.connectivity.isOnline()) return this.waitForConnection();
    try {
      await this.remote.upload(path, audio);
      this.pending.delete(path);
    } catch (error) {
      if (isNetworkError(error)) return this.waitForConnection();
      this.pending.delete(path);
      console.warn("Dropping a recording the server rejected:", path, error);
    }
  }

  private waitForConnection(): void {
    if (this.stopWatching) return;
    this.stopWatching = this.connectivity.subscribe((online) => {
      if (!online) return;
      this.stopWatching?.();
      this.stopWatching = null;
      for (const path of Array.from(this.pending.keys())) void this.send(path);
    });
  }
}
