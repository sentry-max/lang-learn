import { GrammaticalCase, PrincipalPartName, TenseName } from "@domain/entities/Inflection";
import { WordType } from "@domain/entities/Word";
import { UiStringKey } from "@presentation/i18n/translations";

export const WORD_TYPE_KEYS: Record<WordType, UiStringKey> = {
  noun: "wordTypeNoun",
  verb: "wordTypeVerb",
  adjective: "wordTypeAdjective",
  adverb: "wordTypeAdverb",
  preposition: "wordTypePreposition",
  conjunction: "wordTypeConjunction",
  pronoun: "wordTypePronoun",
  numeral: "wordTypeNumeral",
  phrase: "wordTypePhrase",
  other: "wordTypeOther",
};

export const CASE_KEYS: Record<GrammaticalCase, UiStringKey> = {
  nominative: "caseNominative",
  accusative: "caseAccusative",
  dative: "caseDative",
};

export const PRINCIPAL_PART_KEYS: Record<PrincipalPartName, UiStringKey> = {
  infinitive: "partInfinitive",
  thirdPerson: "partThirdPerson",
  simplePast: "partSimplePast",
  pastParticiple: "partPastParticiple",
  presentParticiple: "partPresentParticiple",
  auxiliary: "partAuxiliary",
};

export const TENSE_KEYS: Record<TenseName, UiStringKey> = {
  present: "tensePresent",
  preterite: "tensePreterite",
  perfect: "tensePerfect",
  pluperfect: "tensePluperfect",
  futureOne: "tenseFutureOne",
  futureTwo: "tenseFutureTwo",
  subjunctiveOne: "tenseSubjunctiveOne",
  subjunctiveTwo: "tenseSubjunctiveTwo",
  subjunctiveTwoPast: "tenseSubjunctiveTwoPast",
  presentSimple: "tensePresentSimple",
  presentContinuous: "tensePresentContinuous",
  pastSimple: "tensePastSimple",
  pastContinuous: "tensePastContinuous",
  presentPerfect: "tensePresentPerfect",
  presentPerfectContinuous: "tensePresentPerfectContinuous",
  pastPerfect: "tensePastPerfect",
  pastPerfectContinuous: "tensePastPerfectContinuous",
  futureSimple: "tenseFutureSimple",
  futureContinuous: "tenseFutureContinuous",
  futurePerfect: "tenseFuturePerfect",
  futurePerfectContinuous: "tenseFuturePerfectContinuous",
  conditional: "tenseConditional",
  conditionalPerfect: "tenseConditionalPerfect",
  imperative: "tenseImperative",
  passivePresent: "tensePassivePresent",
  passivePast: "tensePassivePast",
  passivePerfect: "tensePassivePerfect",
};
