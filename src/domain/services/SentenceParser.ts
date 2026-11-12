import {
  BLANK_MARK,
  MAX_BLANKS,
  SentenceContent,
  SentenceExerciseDraft,
  TRANSFORM_TASKS,
  TransformTask,
  isSentenceExerciseKind,
  splitBlanks,
  splitJumble,
} from "@domain/entities/SentenceExercise";
import { CEFR_LEVELS, CefrLevel, normalizeSentenceTranslationsMap } from "@domain/entities/Word";

/**
 * Validates one raw sentence exercise from a JSON import and turns it into a clean draft. Anything malformed
 * is rejected with per-entry problems, which the UI words in the user's language.
 */

export type SentenceProblemCode =
  | "notAnObject"
  | "idTooLong"
  | "kindInvalid"
  | "sentenceMissing"
  | "sentenceTooLong"
  | "blanksInvalid"
  | "wordCountInvalid"
  | "answersInvalid"
  | "distractorsInvalid"
  | "alternativeInvalid"
  | "taskInvalid"
  | "translationsTooLong"
  | "hintTooLong"
  | "levelInvalid"
  | "tagsTooLong"
  | "collectionFull"
  | "fileNotAnArray";

export interface SentenceProblem {
  code: SentenceProblemCode;
  /** 1-based position in the imported file, null for a problem with the whole file */
  entryNumber: number | null;
  sentence: string | null;
  /** The limit that was broken */
  detail?: string;
}

export const SENTENCE_LIMITS = {
  externalIdMax: 200,
  sentenceMax: 300,
  wordMax: 60,
  jumbleWordsMin: 2,
  jumbleWordsMax: 25,
  answers: 10,
  distractors: 10,
  alternatives: 10,
  translationMax: 500,
  hintMax: 500,
  tags: 20,
  tagMax: 40,
  perCollection: 2000,
} as const;

export type SentenceParseResult = { ok: true; exercise: SentenceExerciseDraft } | { ok: false; errors: SentenceProblem[] };

export function parseSentenceInput(raw: unknown, index: number): SentenceParseResult {
  const entryNumber = index + 1;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ code: "notAnObject", entryNumber, sentence: null }] };
  }
  const entry = raw as Record<string, unknown>;
  const sentence = typeof entry.sentence === "string" ? entry.sentence.trim().replace(/\s+/gu, " ") : "";
  const errors: SentenceProblem[] = [];
  const addProblem = (code: SentenceProblemCode, detail?: string) => errors.push({ code, entryNumber, sentence: sentence || null, detail });

  const externalId = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
  if (externalId && externalId.length > SENTENCE_LIMITS.externalIdMax) addProblem("idTooLong");

  if (!sentence) addProblem("sentenceMissing");
  else if (sentence.length > SENTENCE_LIMITS.sentenceMax) addProblem("sentenceTooLong", String(SENTENCE_LIMITS.sentenceMax));

  let content: SentenceContent | null = null;
  if (!isSentenceExerciseKind(entry.kind)) addProblem("kindInvalid");
  else if (sentence) content = parseContent(entry.kind, sentence, entry, addProblem);

  const translations = normalizeSentenceTranslationsMap(entry.translations);
  if (Object.values(translations).some((translation) => translation!.length > SENTENCE_LIMITS.translationMax)) {
    addProblem("translationsTooLong", String(SENTENCE_LIMITS.translationMax));
  }

  const hint = typeof entry.hint === "string" ? entry.hint.trim() : "";
  if (hint.length > SENTENCE_LIMITS.hintMax) addProblem("hintTooLong", String(SENTENCE_LIMITS.hintMax));

  let level: CefrLevel | null = null;
  if (entry.level !== undefined && entry.level !== null && entry.level !== "") {
    if (CEFR_LEVELS.includes(entry.level as CefrLevel)) level = entry.level as CefrLevel;
    else addProblem("levelInvalid");
  }

  const tags = Array.from(new Set(cleanStrings(entry.tags)));
  if (tags.length > SENTENCE_LIMITS.tags || tags.some((tag) => tag.length > SENTENCE_LIMITS.tagMax)) addProblem("tagsTooLong");

  if (errors.length > 0 || !content) return { ok: false, errors };
  return { ok: true, exercise: { externalId, content, translations, hint, level, tags } };
}

function parseContent(
  kind: SentenceContent["kind"],
  sentence: string,
  entry: Record<string, unknown>,
  addProblem: (code: SentenceProblemCode, detail?: string) => void
): SentenceContent | null {
  const answers = cleanStrings(entry.answers);
  const distractors = Array.from(new Set(cleanStrings(entry.distractors)));
  const tooManyOrLong = (values: string[], max: number, lengthMax: number) => values.length > max || values.some((value) => value.length > lengthMax);
  let hasProblem = false;
  const add = (code: SentenceProblemCode, detail?: string) => {
    hasProblem = true;
    addProblem(code, detail);
  };

  if (kind === "fill_blank") {
    const blankCount = splitBlanks(sentence).length - 1;
    if (blankCount < 1 || blankCount > MAX_BLANKS) add("blanksInvalid", BLANK_MARK);
    else if (answers.length !== blankCount || tooManyOrLong(answers, MAX_BLANKS, SENTENCE_LIMITS.wordMax)) add("answersInvalid");
    if (distractors.length === 0 || tooManyOrLong(distractors, SENTENCE_LIMITS.distractors, SENTENCE_LIMITS.wordMax)) {
      add("distractorsInvalid", String(SENTENCE_LIMITS.distractors));
    }
    // A distractor that is also an answer would be marked wrong while being right.
    const usable = distractors.filter((distractor) => !answers.includes(distractor));
    return hasProblem ? null : { kind, sentence, answers, distractors: usable };
  }

  if (kind === "jumble") {
    const { tokens } = splitJumble(sentence);
    if (tokens.length < SENTENCE_LIMITS.jumbleWordsMin || tokens.length > SENTENCE_LIMITS.jumbleWordsMax) {
      add("wordCountInvalid", `${SENTENCE_LIMITS.jumbleWordsMin}–${SENTENCE_LIMITS.jumbleWordsMax}`);
    }
    const wordSet = sortedWords(tokens);
    const alternatives = Array.from(new Set(cleanStrings(entry.alternatives).map((alternative) => alternative.replace(/\s+/gu, " "))));
    if (alternatives.length > SENTENCE_LIMITS.alternatives || alternatives.some((alternative) => sortedWords(splitJumble(alternative).tokens) !== wordSet)) {
      add("alternativeInvalid");
    }
    if (tooManyOrLong(distractors, SENTENCE_LIMITS.distractors, SENTENCE_LIMITS.wordMax)) add("distractorsInvalid", String(SENTENCE_LIMITS.distractors));
    const lowerTokens = new Set(tokens.map((token) => token.toLocaleLowerCase()));
    return hasProblem
      ? null
      : {
          kind,
          sentence,
          alternatives: alternatives.filter((alternative) => alternative !== sentence),
          distractors: distractors.filter((distractor) => !lowerTokens.has(distractor.toLocaleLowerCase())),
        };
  }

  const task = entry.task as TransformTask;
  if (!TRANSFORM_TASKS.includes(task)) add("taskInvalid");
  if (answers.length === 0 || tooManyOrLong(answers, SENTENCE_LIMITS.answers, SENTENCE_LIMITS.sentenceMax)) add("answersInvalid");
  return hasProblem ? null : { kind, sentence, task, answers: answers.map((answer) => answer.replace(/\s+/gu, " ")) };
}

/** The words of a sentence regardless of order and case, to check that an alternative uses the same words. */
function sortedWords(tokens: string[]): string {
  return tokens
    .map((token) => token.toLocaleLowerCase())
    .sort()
    .join("\u0000");
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}
