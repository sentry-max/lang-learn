/**
 * Starting-letter helpers that work for any script (Latin, Arabic/Persian…).
 */

const NO_LETTER = "#";

/**
 * The first letter of a headword, upper-cased. Leading punctuation, digits
 * and brackets are skipped, so "(sich) freuen" files under "S".
 */
export function firstLetter(headword: string): string {
  const match = headword.normalize("NFC").match(/\p{L}/u);
  return match ? match[0].toLocaleUpperCase() : NO_LETTER;
}

export function sortLetters(letters: Iterable<string>): string[] {
  return Array.from(new Set(letters)).sort((a, b) => {
    if (a === NO_LETTER) return 1;
    if (b === NO_LETTER) return -1;
    return a.localeCompare(b);
  });
}

/** Keeps items whose headword starts with one of `letters`; an empty list keeps everything. */
export function filterByLetters<T>(items: readonly T[], headwordOf: (item: T) => string, letters: readonly string[]): T[] {
  if (letters.length === 0) return [...items];
  const wanted = new Set(letters.map((l) => l.toLocaleUpperCase()));
  return items.filter((item) => wanted.has(firstLetter(headwordOf(item))));
}

/** Count of items per starting letter, sorted by letter. */
export function countByLetter<T>(items: readonly T[], headwordOf: (item: T) => string): { letter: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const letter = firstLetter(headwordOf(item));
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return sortLetters(counts.keys()).map((letter) => ({ letter, count: counts.get(letter)! }));
}
