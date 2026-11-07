/** A source of uniform random numbers in [0, 1). Injected so selection is testable. */
export type RandomSource = () => number;

export const defaultRandomSource: RandomSource = () => Math.random();

/** Small deterministic PRNG (mulberry32) for reproducible tests. */
export function createSeededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unbiased Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], randomSource: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(randomSource() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
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
  randomSource: RandomSource
): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return shuffle(items, randomSource);

  const keyed = items.map((item) => {
    const itemWeight = Math.max(weight(item), 1e-6);
    // Guard against rng() returning exactly 0, which would make every key 0.
    const uniform = Math.max(randomSource(), Number.EPSILON);
    return { item, key: Math.pow(uniform, 1 / itemWeight) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((entry) => entry.item);
}
