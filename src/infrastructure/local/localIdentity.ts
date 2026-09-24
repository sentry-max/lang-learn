const STORAGE_KEY = "b1-vocab-trainer:offline:user-id";

/**
 * Offline mode has no sign-in, but progress is still keyed by user id
 * throughout the domain/application layers. This generates one stable id
 * per browser (persisted in localStorage) so that contract keeps working
 * without any backend.
 */
export function getOrCreateLocalUserId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (e.g. disabled entirely) — fall back to a fixed id
    // rather than crash; offline mode still works within a single session.
    return "local-user";
  }
}
