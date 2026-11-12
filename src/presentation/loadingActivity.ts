/**
 * Counts the data loads in progress anywhere in the app, so one indicator under the top bar can show that something
 * is loading, even when the screen already shows older data while it refreshes.
 */
let activeCount = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Marks a load as started; call the returned function once when it ends, however it ends. */
export function beginLoading(): () => void {
  activeCount += 1;
  notify();
  let hasEnded = false;
  return () => {
    if (hasEnded) return;
    hasEnded = true;
    activeCount -= 1;
    notify();
  };
}

export function subscribeLoading(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLoadingAnything(): boolean {
  return activeCount > 0;
}
