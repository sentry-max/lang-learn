import { SentenceProblem, SentenceProblemCode } from "@domain/services/SentenceParser";
import { UiStringKey, translate } from "@presentation/i18n/translations";

type Translate = (key: UiStringKey, values?: Parameters<typeof translate>[2]) => string;

const PROBLEM_KEYS: Record<SentenceProblemCode, UiStringKey> = {
  notAnObject: "sentenceProblemNotAnObject",
  idTooLong: "wordProblemIdTooLong",
  kindInvalid: "sentenceProblemKindInvalid",
  sentenceMissing: "sentenceProblemSentenceMissing",
  sentenceTooLong: "sentenceProblemSentenceTooLong",
  blanksInvalid: "sentenceProblemBlanksInvalid",
  wordCountInvalid: "sentenceProblemWordCountInvalid",
  answersInvalid: "sentenceProblemAnswersInvalid",
  distractorsInvalid: "sentenceProblemDistractorsInvalid",
  alternativeInvalid: "sentenceProblemAlternativeInvalid",
  taskInvalid: "sentenceProblemTaskInvalid",
  translationsTooLong: "sentenceProblemTranslationsTooLong",
  hintTooLong: "sentenceProblemHintTooLong",
  levelInvalid: "wordProblemLevelInvalid",
  tagsTooLong: "wordProblemTagsTooLong",
  collectionFull: "sentenceProblemCollectionFull",
  fileNotAnArray: "sentenceProblemFileNotAnArray",
};

/** The problem with the file entry it belongs to, for import reports. */
export function describeSentenceProblem(t: Translate, problem: SentenceProblem): string {
  const body = t(PROBLEM_KEYS[problem.code], { detail: problem.detail ?? "" });
  if (problem.entryNumber === null) return body;
  return problem.sentence
    ? t("wordProblemInNamedEntry", { entry: problem.entryNumber, word: problem.sentence, problem: body })
    : t("wordProblemInEntry", { entry: problem.entryNumber, problem: body });
}
