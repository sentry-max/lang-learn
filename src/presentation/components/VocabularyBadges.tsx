import { languageLabel } from "@domain/entities/Language";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { useLanguage } from "@presentation/context/LanguageContext";

export function StatusPill({ vocabulary }: { vocabulary: Pick<Vocabulary, "status"> }) {
  const { t } = useLanguage();
  return (
    <span className={`pill status-pill ${vocabulary.status}`}>
      {vocabulary.status === "published" ? t("statusPublished") : t("statusDraft")}
    </span>
  );
}

/** "Deutsch → فارسی, English" */
export function LanguagePair({ vocabulary }: { vocabulary: Pick<Vocabulary, "sourceLanguage" | "targetLanguages"> }) {
  const targets = vocabulary.targetLanguages.map(languageLabel).join("، ");
  return (
    <span className="pill" dir="auto">
      {languageLabel(vocabulary.sourceLanguage)}
      {targets ? ` → ${targets}` : ""}
    </span>
  );
}
