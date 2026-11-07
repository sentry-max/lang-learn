const UMLAUTS: Record<string, string> = { a: "ä", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü", au: "äu", Au: "Äu" };

function withUmlaut(word: string): string {
  return word.replace(/(au|Au|[aouAOU])(?=[^aouAOU]*$)/, (vowel) => UMLAUTS[vowel]);
}

/**
 * Turns a dictionary plural into the full word: "-e" → Tage, "¨-er" → Häuser,
 * "-" → unchanged. Anything else is already a full plural; a leading article is dropped.
 */
export function expandPlural(headword: string, notation: string | null | undefined): string | null {
  const plural = notation?.trim();
  if (!plural) return null;
  const match = /^(¨)?[-–—]?([\p{L}]*)$/u.exec(plural);
  if (match && /^[¨\-–—]/.test(plural)) return `${match[1] ? withUmlaut(headword) : headword}${match[2]}`;
  return plural.replace(/^die\s+/, "");
}
