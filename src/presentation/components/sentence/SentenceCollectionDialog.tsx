import { FormEvent, useId, useState } from "react";
import { LanguageCode, SUPPORTED_LANGUAGES, languageLabel } from "@domain/entities/Language";
import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_NAME_MAX,
  CollectionValidationError,
  SentenceCollection,
  normalizeCollectionInput,
  validateCollectionInput,
} from "@domain/entities/SentenceCollection";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import Modal from "@presentation/components/Modal";
import ErrorBanner from "@presentation/components/ErrorBanner";
import { Spinner } from "@presentation/components/ui/Loader";
import { UiStringKey } from "@presentation/i18n/translations";

const VALIDATION_KEYS: Record<CollectionValidationError, UiStringKey> = {
  name_required: "vocabNameRequired",
  name_too_long: "vocabNameTooLong",
  description_too_long: "vocabDescriptionTooLong",
  invalid_language: "errorInvalidInput",
};

interface Props {
  /** The collection to edit; absent to create a new one */
  collection?: SentenceCollection;
  defaultLanguage: LanguageCode;
  onClose: () => void;
  onSaved: (collection: SentenceCollection) => void;
}

/** Create a sentence collection or edit its name, description and language. */
export default function SentenceCollectionDialog({ collection, defaultLanguage, onClose, onSaved }: Props) {
  const user = useCurrentUser();
  const { sentenceCollections } = useServices();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const formId = useId();
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [language, setLanguage] = useState<LanguageCode>(collection?.language ?? defaultLanguage);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (isSaving) return;
    const input = normalizeCollectionInput({ name, description, language });
    const problems = validateCollectionInput(input);
    if (problems.length > 0) {
      setErrors(problems.map((problem) => t(VALIDATION_KEYS[problem])));
      return;
    }
    setIsSaving(true);
    setErrors([]);
    try {
      const saved = collection
        ? await sentenceCollections.update(user.id, collection, input)
        : await sentenceCollections.create(user.id, input);
      onSaved(saved);
    } catch (error) {
      setErrors([errorMessage(error, "sentenceCollectionSaveError")]);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title={collection ? t("editSentenceCollection") : t("newSentenceCollection")}
      onClose={() => !isSaving && onClose()}
      footer={(close) => (
        <div className="button-row">
          <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={close}>
            {t("cancelButton")}
          </button>
          <button type="submit" className="btn" form={formId} disabled={isSaving}>
            {isSaving && <Spinner />} {isSaving ? t("saving") : t("saveButton")}
          </button>
        </div>
      )}
    >
      <form id={formId} onSubmit={save} noValidate>
        {errors.map((error) => (
          <ErrorBanner key={error} message={error} />
        ))}
        <div className="form-field">
          <label htmlFor={`${formId}-name`}>
            {t("vocabNameLabel")} <span className="required">*</span>
          </label>
          <input
            id={`${formId}-name`}
            type="text"
            dir="auto"
            required
            maxLength={COLLECTION_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`${formId}-description`}>
            {t("vocabDescriptionLabel")} <span className="muted">({t("optional")})</span>
          </label>
          <textarea
            id={`${formId}-description`}
            rows={3}
            dir="auto"
            maxLength={COLLECTION_DESCRIPTION_MAX}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`${formId}-language`}>{t("sentencesLanguageLabel")}</label>
          <select id={`${formId}-language`} value={language} onChange={(event) => setLanguage(event.target.value as LanguageCode)}>
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))}
          </select>
        </div>
        {!collection && <p className="muted form-hint">{t("newSentenceCollectionHint")}</p>}
      </form>
    </Modal>
  );
}
