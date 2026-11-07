import { WordProblem, WordProblemCode } from "@domain/services/WordParser";
import { UiStringKey, translate } from "@presentation/i18n/translations";

type Translate = (key: UiStringKey, values?: Parameters<typeof translate>[2]) => string;

const PROBLEM_KEYS: Record<WordProblemCode, UiStringKey> = {
  notAnObject: "wordProblemNotAnObject",
  idTooLong: "wordProblemIdTooLong",
  headwordMissing: "wordProblemHeadwordMissing",
  headwordTooLong: "wordProblemHeadwordTooLong",
  wordTypeInvalid: "wordProblemWordTypeInvalid",
  translationsMissing: "wordProblemTranslationsMissing",
  translationsTooLong: "wordProblemTranslationsTooLong",
  sentencesNotAnArray: "wordProblemSentencesNotAnArray",
  sentenceInvalid: "wordProblemSentenceInvalid",
  sentencesTooLong: "wordProblemSentencesTooLong",
  levelInvalid: "wordProblemLevelInvalid",
  tagsTooLong: "wordProblemTagsTooLong",
  nounFormsInvalid: "wordProblemNounFormsInvalid",
  articleInvalid: "wordProblemArticleInvalid",
  verbFormsMissing: "wordProblemVerbFormsMissing",
  verbFormsInvalid: "wordProblemVerbFormsInvalid",
  vocabularyFull: "wordProblemVocabularyFull",
  fileNotAnArray: "wordProblemFileNotAnArray",
};

/** The problem alone, for the word form, where the entry is obvious. */
export function describeWordProblemBody(t: Translate, problem: WordProblem): string {
  return t(PROBLEM_KEYS[problem.code], { detail: problem.detail ?? "" });
}

/** The problem with the file entry it belongs to, for import reports. */
export function describeWordProblem(t: Translate, problem: WordProblem): string {
  const body = describeWordProblemBody(t, problem);
  if (problem.entryNumber === null) return body;
  return problem.headword
    ? t("wordProblemInNamedEntry", { entry: problem.entryNumber, word: problem.headword, problem: body })
    : t("wordProblemInEntry", { entry: problem.entryNumber, problem: body });
}
