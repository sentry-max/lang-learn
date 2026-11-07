/**
 * Every form of a word, worked out from its stored principal parts. Person
 * names and word forms are in the word's own language; the names of tenses,
 * cases and parts are identifiers the UI translates.
 */

export type TenseName =
  // German
  | "present"
  | "preterite"
  | "perfect"
  | "pluperfect"
  | "futureOne"
  | "futureTwo"
  | "subjunctiveOne"
  | "subjunctiveTwo"
  | "subjunctiveTwoPast"
  // English
  | "presentSimple"
  | "presentContinuous"
  | "pastSimple"
  | "pastContinuous"
  | "presentPerfect"
  | "presentPerfectContinuous"
  | "pastPerfect"
  | "pastPerfectContinuous"
  | "futureSimple"
  | "futureContinuous"
  | "futurePerfect"
  | "futurePerfectContinuous"
  | "conditional"
  | "conditionalPerfect"
  // Both
  | "imperative"
  | "passivePresent"
  | "passivePast"
  | "passivePerfect";

export type PrincipalPartName =
  | "infinitive"
  | "thirdPerson"
  | "simplePast"
  | "pastParticiple"
  | "presentParticiple"
  | "auxiliary";

export type GrammaticalCase = "nominative" | "accusative" | "dative";

export interface PrincipalPart {
  name: PrincipalPartName;
  form: string;
}

export interface PersonForm {
  person: string;
  form: string;
}

export interface TenseTable {
  tense: TenseName;
  rows: PersonForm[];
}

/** Null `indefinite` for plurals, which have no indefinite article. */
export interface CaseForms {
  grammaticalCase: GrammaticalCase;
  definite: string;
  indefinite: string | null;
  negative: string;
}

/** One personal pronoun in each case: ich · mich · mir. */
export type PronounCases = Record<GrammaticalCase, string>;

/** `pronouns` is empty for languages without a case table. */
export type WordInflection =
  | { kind: "verb"; principalParts: PrincipalPart[]; tables: TenseTable[]; pronouns: PronounCases[] }
  | { kind: "noun"; plural: string | null; singularCases: CaseForms[]; pluralCases: CaseForms[] };
