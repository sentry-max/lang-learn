/** Whether the app should try the network, and notifications when that changes. */
export interface Connectivity {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

/**
 * Backed by `navigator.onLine` and the window's online/offline events. Window
 * listeners exist only while someone is subscribed.
 */
export class BrowserConnectivity implements Connectivity {
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor(private readonly target: Window = window) {}

  isOnline(): boolean {
    return typeof navigator === "undefined" ? true : navigator.onLine;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    if (this.listeners.size === 0) {
      this.target.addEventListener("online", this.handleChange);
      this.target.addEventListener("offline", this.handleChange);
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.target.removeEventListener("online", this.handleChange);
        this.target.removeEventListener("offline", this.handleChange);
      }
    };
  }

  private readonly handleChange = () => {
    const online = this.isOnline();
    for (const listener of this.listeners) listener(online);
  };
}

/** Manually controlled connectivity, for tests. */
export class ManualConnectivity implements Connectivity {
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor(private online = true) {}

  isOnline(): boolean {
    return this.online;
  }

  set(online: boolean): void {
    this.online = online;
    for (const listener of this.listeners) listener(online);
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
