import { SentenceContent, splitBlanks, splitJumble } from "@domain/entities/SentenceExercise";
import { SentenceAnswer } from "@domain/entities/SentencePractice";

/**
 * Grades a sentence exercise by counting errors against the most errors it allows:
 * - fill in the blank: one per blank, wrong or empty;
 * - jumbled sentence: one per position holding the wrong word (or none), against the closest accepted order;
 * - transformation: word-level edits (wrong, missing, extra words) to the closest accepted sentence,
 *   out of that sentence's word count. With typos tolerated, a misspelt word is marked but not counted.
 */

/**
 * - given: text that was part of the exercise
 * - correct / wrong: a word the user gave, right or not
 * - missing: a word the user left out
 * - extra: a word the user added that does not belong
 * - typo: the right word, misspelt; shown with its spelling but not counted as an error
 */
export type MarkStatus = "given" | "correct" | "wrong" | "missing" | "extra" | "typo";

export interface GradeOptions {
  tolerateTypos: boolean;
}

/** How many marks of each kind an answer got, to show at a glance. */
export function countMarks(marks: readonly TokenMark[]): Record<MarkStatus, number> {
  const counts: Record<MarkStatus, number> = { given: 0, correct: 0, wrong: 0, missing: 0, extra: 0, typo: 0 };
  for (const mark of marks) counts[mark.status] += 1;
  return counts;
}

/** Marks that count as errors. */
export function isErrorMark(mark: TokenMark): boolean {
  return mark.status === "wrong" || mark.status === "missing" || mark.status === "extra";
}

export interface TokenMark {
  status: MarkStatus;
  /** What the user gave; null for a missing word */
  actual: string | null;
  /** What belongs here; null for an extra word */
  expected: string | null;
}

export interface SentenceGrade {
  errorCount: number;
  maxErrors: number;
  marks: TokenMark[];
  /** The accepted sentence closest to the answer */
  correctSentence: string;
}

export function gradeAnswer(content: SentenceContent, answer: SentenceAnswer, options: GradeOptions = { tolerateTypos: true }): SentenceGrade {
  if (content.kind === "fill_blank" && answer.kind === "fill_blank") return gradeFillBlank(content, answer.chosen);
  if (content.kind === "jumble" && answer.kind === "jumble") return gradeJumble(content, answer.placed);
  if (content.kind === "transform" && answer.kind === "transform") return gradeTransform(content, answer.text, options);
  throw new Error(`A ${answer.kind} answer can't grade a ${content.kind} exercise.`);
}

function gradeFillBlank(content: Extract<SentenceContent, { kind: "fill_blank" }>, chosen: (string | null)[]): SentenceGrade {
  const parts = splitBlanks(content.sentence);
  const marks: TokenMark[] = [];
  parts.forEach((part, index) => {
    if (part) marks.push({ status: "given", actual: part, expected: part });
    if (index >= content.answers.length) return;
    const expected = content.answers[index];
    const actual = chosen[index] ?? null;
    marks.push({ status: actual === null ? "missing" : actual === expected ? "correct" : "wrong", actual, expected });
  });
  const blankMarks = marks.filter((mark) => mark.status !== "given");
  return {
    errorCount: blankMarks.filter((mark) => mark.status !== "correct").length,
    maxErrors: content.answers.length,
    marks,
    correctSentence: parts.map((part, index) => part + (content.answers[index] ?? "")).join(""),
  };
}

function gradeJumble(content: Extract<SentenceContent, { kind: "jumble" }>, placed: string[]): SentenceGrade {
  const accepted = [content.sentence, ...content.alternatives].map(splitJumble);
  const sameWord = (a: string | undefined, b: string) => a !== undefined && a.toLocaleLowerCase() === b.toLocaleLowerCase();
  const errorsAgainst = (tokens: string[]) => tokens.filter((token, index) => !sameWord(placed[index], token)).length;

  const best = accepted.reduce((closest, candidate) => (errorsAgainst(candidate.tokens) < errorsAgainst(closest.tokens) ? candidate : closest));
  const marks: TokenMark[] = best.tokens.map((expected, index) => {
    const actual = placed[index];
    if (actual === undefined) return { status: "missing", actual: null, expected };
    return { status: sameWord(actual, expected) ? "correct" : "wrong", actual, expected };
  });
  return {
    errorCount: errorsAgainst(best.tokens),
    maxErrors: best.tokens.length,
    marks,
    correctSentence: best.tokens.join(" ") + best.ending,
  };
}

function gradeTransform(content: Extract<SentenceContent, { kind: "transform" }>, text: string, options: GradeOptions): SentenceGrade {
  const typed = tokenizeSentence(text);
  const grades = content.answers.map((answer) => {
    const expected = tokenizeSentence(answer);
    const aligned = alignTokens(typed, expected);
    const marks = options.tolerateTypos ? aligned.map((mark, index) => markTypo(mark, index === aligned.findIndex((first) => first.expected !== null))) : aligned;
    return {
      errorCount: marks.filter(isErrorMark).length,
      maxErrors: expected.length,
      marks,
      correctSentence: answer,
    };
  });
  return grades.reduce((closest, grade) => (grade.errorCount < closest.errorCount ? grade : closest));
}

function markTypo(mark: TokenMark, isFirstWord: boolean): TokenMark {
  return mark.status === "wrong" && isTypo(mark.actual!, mark.expected!, isFirstWord) ? { ...mark, status: "typo" } : mark;
}

/**
 * Whether `actual` is `expected` misspelt rather than a different word or form. Grammar lives in word endings
 * (spielt/spielte, den/dem, keine/keinen), so a different ending is never a typo, and neither is a short word.
 * Capitals only count as a typo on the first word: elsewhere they change meaning (sie/Sie) or break a noun rule.
 */
export function isTypo(actual: string, expected: string, isFirstWord: boolean): boolean {
  if (actual === expected) return false;
  if (actual.toLocaleLowerCase() === expected.toLocaleLowerCase()) return isFirstWord;
  const typed = keyboardSpelling(actual);
  const wanted = keyboardSpelling(expected);
  if (Math.min(typed.length, wanted.length) < 4 || typed.slice(-2) !== wanted.slice(-2)) return false;
  return editDistance(typed, wanted) <= (wanted.length >= 8 ? 2 : 1);
}

/** Lower case, with ß and umlauts written the way a keyboard without them would (ss, ae, oe, ue). */
function keyboardSpelling(word: string): string {
  return word
    .toLocaleLowerCase()
    .replace(/ß/gu, "ss")
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue");
}

/** Optimal string alignment distance: insertions, deletions, substitutions and swaps of neighbouring letters. */
function editDistance(first: string, second: string): number {
  const a = Array.from(first);
  const b = Array.from(second);
  const distances = Array.from({ length: a.length + 1 }, (_, row) => Array.from({ length: b.length + 1 }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)));
  for (let row = 1; row <= a.length; row++) {
    for (let column = 1; column <= b.length; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(distances[row - 1][column] + 1, distances[row][column - 1] + 1, distances[row - 1][column - 1] + cost);
      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
        distances[row][column] = Math.min(distances[row][column], distances[row - 2][column - 2] + 1);
      }
    }
  }
  return distances[a.length][b.length];
}

/** Words and punctuation marks as separate tokens; curly apostrophes count as straight ones. */
export function tokenizeSentence(text: string): string[] {
  return text.normalize("NFC").replace(/[’‘]/gu, "'").match(/[\p{L}\p{N}\p{M}'-]+|[^\s\p{L}\p{N}\p{M}]/gu) ?? [];
}

/** The fewest word edits (Levenshtein over tokens) that turn `actual` into `expected`, as marks in reading order. */
export function alignTokens(actual: string[], expected: string[]): TokenMark[] {
  const costs: number[][] = Array.from({ length: actual.length + 1 }, (_, row) =>
    Array.from({ length: expected.length + 1 }, (_, column) => (row === 0 ? column : column === 0 ? row : 0))
  );
  for (let row = 1; row <= actual.length; row++) {
    for (let column = 1; column <= expected.length; column++) {
      const substitution = costs[row - 1][column - 1] + (actual[row - 1] === expected[column - 1] ? 0 : 1);
      costs[row][column] = Math.min(substitution, costs[row - 1][column] + 1, costs[row][column - 1] + 1);
    }
  }

  const marks: TokenMark[] = [];
  let row = actual.length;
  let column = expected.length;
  while (row > 0 || column > 0) {
    const cost = costs[row][column];
    if (row > 0 && column > 0 && actual[row - 1] === expected[column - 1] && cost === costs[row - 1][column - 1]) {
      marks.push({ status: "correct", actual: actual[row - 1], expected: expected[column - 1] });
      row--;
      column--;
    } else if (column > 0 && cost === costs[row][column - 1] + 1) {
      // On a tie a missing or extra word beats a substitution: it keeps more of the user's words matched.
      marks.push({ status: "missing", actual: null, expected: expected[column - 1] });
      column--;
    } else if (row > 0 && cost === costs[row - 1][column] + 1) {
      marks.push({ status: "extra", actual: actual[row - 1], expected: null });
      row--;
    } else {
      marks.push({ status: "wrong", actual: actual[row - 1], expected: expected[column - 1] });
      row--;
      column--;
    }
  }
  return marks.reverse();
}
