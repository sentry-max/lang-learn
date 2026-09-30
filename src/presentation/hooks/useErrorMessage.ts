import { useCallback } from "react";
import { AppErrorReason, toAppError } from "@domain/errors/AppError";
import { useLanguage } from "@presentation/context/LanguageContext";
import { UiStringKey } from "@presentation/i18n/translations";

const REASON_KEYS: Record<AppErrorReason, UiStringKey> = {
  publish_word_limit: "errorPublishLimit",
  vocabulary_word_limit: "errorVocabularyFull",
  vocabulary_language_locked: "errorLanguageLocked",
  vocabulary_not_found: "errorVocabularyNotFound",
  duplicate_word: "errorDuplicateWord",
  not_quiz_eligible: "errorNotQuizEligible",
  invalid_input: "errorInvalidInput",
  offline: "errorOffline",
};

/** Turns any error into a message in the UI language. */
export function useErrorMessage() {
  const { t } = useLanguage();
  return useCallback(
    (err: unknown, fallbackKey: UiStringKey): string => {
      const error = toAppError(err, t(fallbackKey));
      if (error.reason) return t(REASON_KEYS[error.reason]);
      switch (error.code) {
        case "network":
          return t("errorNetwork");
        case "auth":
          return t("errorAuth");
        case "forbidden":
          return t("errorForbidden");
        case "not_found":
          return t("errorNotFound");
        case "unknown":
          return t(fallbackKey);
        default:
          return error.message;
      }
    },
    [t]
  );
}
