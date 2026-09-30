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
 * messages instead of letting bad data into the database.
 */

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

export type ParseResult = { ok: true; word: WordDraft } | { ok: false; errors: string[] };

export function parseWordInput(raw: unknown, index: number, sourceLanguage: LanguageCode): ParseResult {
  const prefix = `Entry ${index + 1}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [`${prefix}: not an object.`] };
  }
  const e = raw as Record<string, unknown>;
  const label = typeof e.headword === "string" && e.headword.trim() ? `${prefix} ("${e.headword.trim()}")` : prefix;
  const errors: string[] = [];

  const externalId = typeof e.id === "string" && e.id.trim() ? e.id.trim() : null;
  if (externalId && externalId.length > WORD_LIMITS.externalIdMax) errors.push(`${label}: "id" is too long.`);

  const headword = typeof e.headword === "string" ? e.headword.trim() : "";
  if (!headword) errors.push(`${label}: missing "headword".`);
  else if (headword.length > WORD_LIMITS.headwordMax) errors.push(`${label}: "headword" is too long.`);

  const wordType = e.wordType as WordType;
  if (!WORD_TYPES.includes(wordType)) errors.push(`${label}: invalid "wordType".`);

  const translations = normalizeTranslationsMap(e.translations);
  delete translations[sourceLanguage];
  const translationCount = Object.keys(translations).length;
  if (translationCount === 0) {
    errors.push(`${label}: "translations" needs at least one language other than the word's own, e.g. { "fa": [...], "en": [...] }.`);
  }
  for (const values of Object.values(translations)) {
    if (values!.length > WORD_LIMITS.translationsPerLanguage || values!.some((v) => v.length > WORD_LIMITS.translationMax)) {
      errors.push(`${label}: too many or too long translations.`);
      break;
    }
  }

  if (e.sentences !== undefined && !Array.isArray(e.sentences)) {
    errors.push(`${label}: "sentences" must be an array.`);
  }
  const sentences = normalizeSentences(e.sentences);
  if (Array.isArray(e.sentences) && sentences.length !== e.sentences.length) {
    errors.push(`${label}: every sentence needs "text" (or "german") and translations.`);
  }
  if (sentences.length > WORD_LIMITS.sentences || sentences.some((s) => s.text.length > WORD_LIMITS.sentenceMax)) {
    errors.push(`${label}: too many or too long sentences.`);
  }

  let level: CefrLevel | null = null;
  if (e.level !== undefined && e.level !== null && e.level !== "") {
    if (CEFR_LEVELS.includes(e.level as CefrLevel)) level = e.level as CefrLevel;
    else errors.push(`${label}: invalid "level".`);
  }

  const tags = Array.isArray(e.tags)
    ? Array.from(new Set(e.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)))
    : [];
  if (tags.length > WORD_LIMITS.tags || tags.some((t) => t.length > WORD_LIMITS.tagMax)) {
    errors.push(`${label}: too many or too long tags.`);
  }

  const grammar = GRAMMAR_PROFILES[sourceLanguage];
  const nounForms = wordType === "noun" ? parseNounForms(e.nounForms, grammar.articles, label, errors) : undefined;
  const verbForms =
    wordType === "verb" ? parseVerbForms(e.verbForms, headword, grammar.verbFormsRequired, label, errors) : undefined;

  const regionalVariant =
    typeof e.regionalVariant === "string" && e.regionalVariant.trim() ? e.regionalVariant.trim().slice(0, 20) : undefined;

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
  label: string,
  errors: string[]
): NounForms | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") {
    errors.push(`${label}: "nounForms" must be an object.`);
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const article = typeof raw.article === "string" && raw.article.trim() ? raw.article.trim() : null;
  if (article && articles && !articles.includes(article)) {
    errors.push(`${label}: article must be one of ${articles.join(", ")}.`);
  }
  const plural = typeof raw.plural === "string" && raw.plural.trim() ? raw.plural.trim() : null;
  return { article: articles ? article : null, plural };
}

/** Verb forms are required for German verbs (where they matter most) and optional elsewhere. */
function parseVerbForms(
  value: unknown,
  headword: string,
  required: boolean,
  label: string,
  errors: string[]
): VerbForms | undefined {
  if (value === undefined || value === null) {
    if (required) errors.push(`${label}: verbs require "verbForms".`);
    return undefined;
  }
  if (typeof value !== "object") {
    errors.push(`${label}: "verbForms" must be an object.`);
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
