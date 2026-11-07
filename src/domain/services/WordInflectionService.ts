import { WordInflection } from "@domain/entities/Inflection";
import { LanguageCode } from "@domain/entities/Language";
import { Word } from "@domain/entities/Word";
import { inflectEnglishNoun, inflectEnglishVerb } from "@domain/services/EnglishInflection";
import { inflectGermanNoun, inflectGermanVerb } from "@domain/services/GermanInflection";

type InflectableWord = Pick<Word, "wordType" | "headword" | "nounForms" | "verbForms">;

const hasText = (text: string | null | undefined): text is string => !!text?.trim();

function inflect(word: InflectableWord, sourceLanguage: LanguageCode): WordInflection | null {
  const { wordType, nounForms, verbForms } = word;
  const headword = word.headword.trim();
  if (wordType === "verb") {
    if (sourceLanguage === "de") return inflectGermanVerb(headword, verbForms);
    return sourceLanguage === "en" ? inflectEnglishVerb(headword, verbForms) : null;
  }
  if (wordType !== "noun") return null;
  if (sourceLanguage === "de") return inflectGermanNoun(headword, nounForms?.article ?? null, nounForms?.plural ?? null);
  if (sourceLanguage === "en") return inflectEnglishNoun(headword, nounForms?.plural ?? null);
  return hasText(nounForms?.plural) ? { kind: "noun", plural: nounForms.plural, singularCases: [], pluralCases: [] } : null;
}

/**
 * Every form of a word, or null when its type or language has none to show.
 * Blank forms, empty tables and an inflection with nothing left are dropped, so the UI shows only what exists.
 */
export function inflectWord(word: InflectableWord, sourceLanguage: LanguageCode): WordInflection | null {
  if (!hasText(word.headword)) return null;
  const inflection = inflect(word, sourceLanguage);
  if (inflection?.kind === "noun") {
    const plural = hasText(inflection.plural) ? inflection.plural : null;
    const hasForms = plural || inflection.singularCases.length > 0;
    return hasForms ? { ...inflection, plural } : null;
  }
  if (!inflection) return null;
  const principalParts = inflection.principalParts.filter((part) => hasText(part.form));
  const tables = inflection.tables
    .map((table) => ({ ...table, rows: table.rows.filter((row) => hasText(row.form)) }))
    .filter((table) => table.rows.length > 0);
  return principalParts.length > 0 || tables.length > 0 ? { ...inflection, principalParts, tables } : null;
}
