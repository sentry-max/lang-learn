import { isNetworkError, offlineError } from "@domain/errors/AppError";
import { Connectivity } from "@infrastructure/offline/Connectivity";

/**
 * Read-through memory cache: while online every read goes to the server and
 * its result is remembered; while offline (or when the request fails for
 * network reasons) the last remembered result is returned instead. Lives
 * only as long as the browser tab — a reload starts empty.
 */
export class OfflineReadCache {
  private readonly store = new Map<string, unknown>();

  constructor(private readonly connectivity: Connectivity) {}

  async read<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.connectivity.isOnline()) {
      try {
        const value = await fetcher();
        this.store.set(key, value);
        return value;
      } catch (err) {
        if (!isNetworkError(err) || !this.store.has(key)) throw err;
      }
    }
    if (this.store.has(key)) return this.store.get(key) as T;
    throw offlineError();
  }

  /** Every remembered value, for offline lookups across keys. */
  values(): unknown[] {
    return Array.from(this.store.values());
  }

  clear(): void {
    this.store.clear();
  }
}

export function assertOnline(connectivity: Connectivity): void {
  if (!connectivity.isOnline()) throw offlineError();
}
