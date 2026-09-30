/** A source of uniform random numbers in [0, 1). Injected so selection is testable. */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

/** Small deterministic PRNG (mulberry32) for reproducible tests. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unbiased Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Picks `count` distinct items without replacement, where an item's chance
 * of being picked is proportional to its weight (Efraimidis–Spirakis A-Res).
 * Every item with a positive weight can be picked, so selection is random
 * across the whole pool rather than always taking the "top" items.
 */
export function weightedSample<T>(
  items: readonly T[],
  count: number,
  weight: (item: T) => number,
  rng: Rng
): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return shuffle(items, rng);

  const keyed = items.map((item) => {
    const w = Math.max(weight(item), 1e-6);
    // Guard against rng() returning exactly 0, which would make every key 0.
    const u = Math.max(rng(), Number.EPSILON);
    return { item, key: Math.pow(u, 1 / w) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((k) => k.item);
}
