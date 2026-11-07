import { GRAMMAR_PROFILES, LanguageCode } from "@domain/entities/Language";
import {
  CEFR_LEVELS,
  CefrLevel,
  NounForms,
  VerbForms,
  WORD_TYPES,
  WordDraft,
  WordType,
  normalizeSentences,
  normalizeTranslationsMap,
} from "@domain/entities/Word";

/**
 * Validates one raw word (from a JSON import or the word form) and turns
 * it into a clean WordDraft. Rejects anything malformed with per-entry
 * problems, which the UI words in the user's language, instead of letting
 * bad data into the database.
 */

export type WordProblemCode =
  | "notAnObject"
  | "idTooLong"
  | "headwordMissing"
  | "headwordTooLong"
  | "wordTypeInvalid"
  | "translationsMissing"
  | "translationsTooLong"
  | "sentencesNotAnArray"
  | "sentenceInvalid"
  | "sentencesTooLong"
  | "levelInvalid"
  | "tagsTooLong"
  | "nounFormsInvalid"
  | "articleInvalid"
  | "verbFormsMissing"
  | "verbFormsInvalid"
  | "vocabularyFull"
  | "fileNotAnArray";

export interface WordProblem {
  code: WordProblemCode;
  /** 1-based position in the imported file, null for a problem with the whole file */
  entryNumber: number | null;
  headword: string | null;
  /** The allowed articles, or the vocabulary's word limit */
  detail?: string;
}

export const WORD_LIMITS = {
  externalIdMax: 200,
  headwordMax: 200,
  translationsPerLanguage: 20,
  translationMax: 200,
  sentences: 10,
  sentenceMax: 500,
  tags: 20,
  tagMax: 40,
} as const;

export type ParseResult = { ok: true; word: WordDraft } | { ok: false; errors: WordProblem[] };

export function parseWordInput(raw: unknown, index: number, sourceLanguage: LanguageCode): ParseResult {
  const entryNumber = index + 1;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ code: "notAnObject", entryNumber, headword: null }] };
  }
  const entry = raw as Record<string, unknown>;
  const headword = typeof entry.headword === "string" ? entry.headword.trim() : "";
  const errors: WordProblem[] = [];
  const addProblem = (code: WordProblemCode, detail?: string) => errors.push({ code, entryNumber, headword: headword || null, detail });

  const externalId = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
  if (externalId && externalId.length > WORD_LIMITS.externalIdMax) addProblem("idTooLong");

  if (!headword) addProblem("headwordMissing");
  else if (headword.length > WORD_LIMITS.headwordMax) addProblem("headwordTooLong");

  const wordType = entry.wordType as WordType;
  if (!WORD_TYPES.includes(wordType)) addProblem("wordTypeInvalid");

  const translations = normalizeTranslationsMap(entry.translations);
  delete translations[sourceLanguage];
  const translationCount = Object.keys(translations).length;
  if (translationCount === 0) {
    addProblem("translationsMissing");
  }
  for (const values of Object.values(translations)) {
    if (values!.length > WORD_LIMITS.translationsPerLanguage || values!.some((value) => value.length > WORD_LIMITS.translationMax)) {
      addProblem("translationsTooLong");
      break;
    }
  }

  if (entry.sentences !== undefined && !Array.isArray(entry.sentences)) {
    addProblem("sentencesNotAnArray");
  }
  const sentences = normalizeSentences(entry.sentences);
  if (Array.isArray(entry.sentences) && sentences.length !== entry.sentences.length) {
    addProblem("sentenceInvalid");
  }
  if (sentences.length > WORD_LIMITS.sentences || sentences.some((sentence) => sentence.text.length > WORD_LIMITS.sentenceMax)) {
    addProblem("sentencesTooLong");
  }

  let level: CefrLevel | null = null;
  if (entry.level !== undefined && entry.level !== null && entry.level !== "") {
    if (CEFR_LEVELS.includes(entry.level as CefrLevel)) level = entry.level as CefrLevel;
    else addProblem("levelInvalid");
  }

  const tags = Array.isArray(entry.tags)
    ? Array.from(new Set(entry.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)))
    : [];
  if (tags.length > WORD_LIMITS.tags || tags.some((tag) => tag.length > WORD_LIMITS.tagMax)) {
    addProblem("tagsTooLong");
  }

  const grammar = GRAMMAR_PROFILES[sourceLanguage];
  const nounForms = wordType === "noun" ? parseNounForms(entry.nounForms, grammar.articles, addProblem) : undefined;
  const verbForms =
    wordType === "verb" ? parseVerbForms(entry.verbForms, headword, grammar.verbFormsRequired, addProblem) : undefined;

  const regionalVariant =
    typeof entry.regionalVariant === "string" && entry.regionalVariant.trim() ? entry.regionalVariant.trim().slice(0, 20) : undefined;

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    word: {
      externalId,
      wordType,
      headword,
      translations,
      nounForms,
      verbForms,
      sentences,
      level,
      tags,
      regionalVariant,
    },
  };
}

function parseNounForms(
  value: unknown,
  articles: string[] | null,
  addProblem: (code: WordProblemCode, detail?: string) => void
): NounForms | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") {
    addProblem("nounFormsInvalid");
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const article = typeof raw.article === "string" && raw.article.trim() ? raw.article.trim() : null;
  if (article && articles && !articles.includes(article)) {
    addProblem("articleInvalid", articles.join(", "));
  }
  const plural = typeof raw.plural === "string" && raw.plural.trim() ? raw.plural.trim() : null;
  return { article: articles ? article : null, plural };
}

/** Verb forms are required for German verbs (where they matter most) and optional elsewhere. */
function parseVerbForms(
  value: unknown,
  headword: string,
  required: boolean,
  addProblem: (code: WordProblemCode, detail?: string) => void
): VerbForms | undefined {
  if (value === undefined || value === null) {
    if (required) addProblem("verbFormsMissing");
    return undefined;
  }
  if (typeof value !== "object") {
    addProblem("verbFormsInvalid");
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");
  return {
    infinitive: text("infinitive") || headword,
    presentThirdPerson: text("presentThirdPerson"),
    simplePast: text("simplePast"),
    perfect: text("perfect"),
    passive: text("passive") || null,
    auxiliaryIsSein: raw.auxiliaryIsSein === true,
    separable: raw.separable === true,
  };
}
