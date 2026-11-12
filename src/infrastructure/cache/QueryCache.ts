import { isNetworkError, offlineError } from "@domain/errors/AppError";
import { Connectivity } from "@infrastructure/offline/Connectivity";

interface Entry {
  value: unknown;
  /** Epoch ms of the last successful fetch */
  fetchedAt: number;
  /** A write changed this data: the next online read waits for the server instead of showing it */
  mustRefetch: boolean;
}

export interface QueryCacheOptions {
  /** How long a result is served without asking the server */
  ttlMs?: number;
  clock?: () => number;
  /** Where results are kept between visits; null keeps them in memory only */
  storage?: Storage | null;
  storageKey?: string;
}

const DEFAULT_TTL_MS = 90_000;
const SAVE_DELAY_MS = 500;
// shortcut: localStorage holds a few MB, so only small results are kept across reloads; move to IndexedDB to also keep word lists.
const MAX_STORED_ENTRY_CHARS = 300_000;
const MAX_STORED_TOTAL_CHARS = 2_000_000;

/**
 * The app's read cache, shared by every repository that reads lists from the server.
 *
 * - A result younger than `ttlMs` is returned at once, without a request.
 * - An older one is returned at once too, and refreshed in the background; listeners hear about it only when the
 *   data actually changed, so screens update without flicker.
 * - `invalidate` after a write makes the next online read wait for the server, so the user sees their change.
 * - Offline, or when a request fails for network reasons, the last result is served.
 * - Results are kept in storage per user, so a reload starts with yesterday's lists on screen while they refresh.
 * Concurrent reads of the same key share one request.
 */
export class QueryCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly listeners = new Set<() => void>();
  private readonly ttlMs: number;
  private readonly clock: () => number;
  private readonly storage: Storage | null;
  private readonly storageKey: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly connectivity: Connectivity,
    options: QueryCacheOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.clock = options.clock ?? (() => Date.now());
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey ?? "lang-learn:cache";
    this.load();
  }

  async read<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (!this.connectivity.isOnline()) {
      if (entry) return entry.value as T;
      throw offlineError();
    }
    if (entry && !entry.mustRefetch) {
      if (this.clock() - entry.fetchedAt >= this.ttlMs) void this.fetch(key, fetcher).catch(() => {});
      return entry.value as T;
    }
    try {
      return await this.fetch(key, fetcher);
    } catch (error) {
      if (entry && isNetworkError(error)) return entry.value as T;
      throw error;
    }
  }

  /** Stores a value the app already has (e.g. what a write returned), so the next read needs no request. */
  put(key: string, value: unknown): void {
    this.entries.set(key, { value, fetchedAt: this.clock(), mustRefetch: false });
    this.scheduleSave();
  }

  /** After a write: every key starting with `prefix` is fetched again on its next online read. */
  invalidate(prefix: string): void {
    for (const [key, entry] of this.entries) if (key.startsWith(prefix)) entry.mustRefetch = true;
  }

  /** Back online or synced: everything may be out of date, but stays on screen while it refreshes. */
  markAllStale(): void {
    for (const entry of this.entries.values()) entry.fetchedAt = Number.NEGATIVE_INFINITY;
  }

  /** Every remembered value, for offline lookups across keys. */
  values(): unknown[] {
    return Array.from(this.entries.values(), (entry) => entry.value);
  }

  /** Called when a background refresh brought different data. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight as Promise<T>;
    const request = fetcher()
      .then((value) => {
        const previous = this.entries.get(key);
        const hasChanged = previous !== undefined && !previous.mustRefetch && JSON.stringify(previous.value) !== JSON.stringify(value);
        this.entries.set(key, { value, fetchedAt: this.clock(), mustRefetch: false });
        this.scheduleSave();
        if (hasChanged) for (const listener of this.listeners) listener();
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (!stored || typeof stored !== "object") return;
      for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
        // Stored data is from an earlier visit: show it, but refresh it on first use.
        this.entries.set(key, { value, fetchedAt: Number.NEGATIVE_INFINITY, mustRefetch: false });
      }
    } catch {
      // Unreadable or blocked storage: start empty.
    }
  }

  private scheduleSave(): void {
    if (!this.storage || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_DELAY_MS);
  }

  private save(): void {
    const stored: Record<string, unknown> = {};
    let total = 0;
    for (const [key, entry] of this.entries) {
      const size = JSON.stringify(entry.value)?.length ?? 0;
      if (size > MAX_STORED_ENTRY_CHARS || total + size > MAX_STORED_TOTAL_CHARS) continue;
      stored[key] = entry.value;
      total += size;
    }
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(stored));
    } catch {
      // Storage full or blocked: the cache still works for this tab.
    }
  }
}
