import { VocabularyEntry, WordType } from "@domain/entities/VocabularyEntry";
import { SUPPORTED_LANGUAGES } from "@domain/entities/Language";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";

export interface ImportResult {
  importedCount: number;
  errors: string[];
  /** Headwords skipped because they already exist under a different id — not treated as errors. */
  duplicateHeadwords: string[];
}

const VALID_WORD_TYPES: WordType[] = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "pronoun",
  "numeral",
  "phrase",
  "other",
];

/**
 * Validates raw parsed JSON against the VocabularyEntry shape before
 * writing anything, so a malformed import file fails loudly with
 * per-entry error messages instead of corrupting the vocabulary set.
 * Also rejects duplicate words (same word type + headword, different id)
 * against both the existing vocabulary and the rest of the current
 * import batch — an entry re-imported under its own id is an edit, not
 * a duplicate, and is allowed through.
 */
export class ImportVocabularyUseCase {
  constructor(private readonly vocabularyRepository: VocabularyRepository) {}

  async execute(rawEntries: unknown): Promise<ImportResult> {
    if (!Array.isArray(rawEntries)) {
      return {
        importedCount: 0,
        errors: ["Import file must contain a JSON array of entries."],
        duplicateHeadwords: [],
      };
    }

    const existing = await this.vocabularyRepository.getAll();
    const existingIdByKey = new Map(existing.map((e) => [headwordKey(e), e.id]));
    const seenIdByKey = new Map<string, string>();

    const valid: VocabularyEntry[] = [];
    const errors: string[] = [];
    const duplicateHeadwords: string[] = [];

    rawEntries.forEach((raw, index) => {
      const result = validateEntry(raw, index);
      if (!result.ok) {
        errors.push(...result.errors);
        return;
      }

      const entry = result.entry;
      const key = headwordKey(entry);

      const existingId = existingIdByKey.get(key);
      const batchId = seenIdByKey.get(key);
      const isDuplicate = (existingId !== undefined && existingId !== entry.id) ||
        (batchId !== undefined && batchId !== entry.id);

      if (isDuplicate) {
        duplicateHeadwords.push(entry.headword);
        return;
      }

      seenIdByKey.set(key, entry.id);
      valid.push(entry);
    });

    if (valid.length > 0) {
      await this.vocabularyRepository.saveMany(valid);
    }

    return { importedCount: valid.length, errors, duplicateHeadwords };
  }
}

/** Normalized key used to detect duplicate words regardless of casing/whitespace. */
function headwordKey(entry: VocabularyEntry): string {
  return `${entry.wordType}:${entry.headword.trim().toLocaleLowerCase("de")}`;
}

type ValidationResult =
  | { ok: true; entry: VocabularyEntry }
  | { ok: false; errors: string[] };

/** translations must be an object with at least one non-empty language array. */
function hasAtLeastOneTranslation(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).some(
    (key) =>
      SUPPORTED_LANGUAGES.includes(key as (typeof SUPPORTED_LANGUAGES)[number]) &&
      Array.isArray(obj[key]) &&
      (obj[key] as unknown[]).length > 0
  );
}

/** Each sentence needs "german" plus a "translations" object with at least one language. */
function isValidSentence(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.german !== "string") return false;
  if (typeof s.translations !== "object" || s.translations === null) return false;
  const translations = s.translations as Record<string, unknown>;
  return Object.values(translations).some((v) => typeof v === "string" && v.trim() !== "");
}

function validateEntry(raw: unknown, index: number): ValidationResult {
  const errors: string[] = [];
  const prefix = `Entry ${index}`;

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: [`${prefix}: not an object.`] };
  }
  const e = raw as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.trim() === "") errors.push(`${prefix}: missing "id".`);
  if (typeof e.headword !== "string" || e.headword.trim() === "")
    errors.push(`${prefix}: missing "headword".`);
  if (!VALID_WORD_TYPES.includes(e.wordType as WordType))
    errors.push(`${prefix} (${e.id ?? "?"}): invalid "wordType".`);
  if (!hasAtLeastOneTranslation(e.translations))
    errors.push(
      `${prefix} (${e.id ?? "?"}): "translations" must be an object with at least one non-empty language array, e.g. { "fa": [...], "en": [...] }.`
    );
  if (!Array.isArray(e.sentences) || e.sentences.length === 0) {
    errors.push(`${prefix} (${e.id ?? "?"}): "sentences" must be a non-empty array.`);
  } else {
    e.sentences.forEach((s, sIndex) => {
      if (!isValidSentence(s)) {
        errors.push(
          `${prefix} (${e.id ?? "?"}): sentence ${sIndex} needs "german" and a "translations" object with at least one language.`
        );
      }
    });
  }
  if (e.wordType === "verb" && (typeof e.verbForms !== "object" || e.verbForms === null)) {
    errors.push(`${prefix} (${e.id ?? "?"}): verbs require "verbForms".`);
  }
  if (e.wordType === "noun" && (typeof e.nounForms !== "object" || e.nounForms === null)) {
    errors.push(`${prefix} (${e.id ?? "?"}): nouns require "nounForms".`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    entry: {
      id: e.id as string,
      wordType: e.wordType as WordType,
      headword: e.headword as string,
      translations: e.translations as VocabularyEntry["translations"],
      nounForms: e.nounForms as VocabularyEntry["nounForms"],
      verbForms: e.verbForms as VocabularyEntry["verbForms"],
      sentences: e.sentences as VocabularyEntry["sentences"],
      level: (e.level as VocabularyEntry["level"]) ?? "B1",
      tags: Array.isArray(e.tags) ? (e.tags as string[]) : [],
      regionalVariant: e.regionalVariant as string | undefined,
    },
  };
}
