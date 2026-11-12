import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LanguageCode, SUPPORTED_LANGUAGES, languageLabel } from "@domain/entities/Language";
import {
  VOCABULARY_DESCRIPTION_MAX,
  VOCABULARY_NAME_MAX,
  Vocabulary,
  VocabularyValidationError,
  normalizeVocabularyInput,
  validateVocabularyInput,
} from "@domain/entities/Vocabulary";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import { UiStringKey } from "@presentation/i18n/translations";
import { PageLoader } from "@presentation/components/ui/Loader";

const VALIDATION_KEYS: Record<VocabularyValidationError, UiStringKey> = {
  name_required: "vocabNameRequired",
  name_too_long: "vocabNameTooLong",
  description_too_long: "vocabDescriptionTooLong",
  invalid_language: "errorInvalidInput",
  target_same_as_source: "errorInvalidInput",
};

/** Create a vocabulary (title required, description optional) or edit one's details. */
export default function VocabularyEditorPage() {
  const { id } = useParams();
  const user = useCurrentUser();
  const { profile } = useProfile();
  const { vocabularies } = useServices();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const isEdit = id !== undefined;

  const [existing, setExisting] = useState<Vocabulary | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>(profile.primaryLanguage === "de" ? "en" : "de");
  const [targetLanguages, setTargetLanguages] = useState<LanguageCode[]>([profile.primaryLanguage]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    vocabularies
      .get(id)
      .then((vocabulary) => {
        if (vocabulary.ownerId !== user.id) {
          navigate(`/vocabularies/${vocabulary.id}`, { replace: true });
          return;
        }
        setExisting(vocabulary);
        setName(vocabulary.name);
        setDescription(vocabulary.description);
        setSourceLanguage(vocabulary.sourceLanguage);
        setTargetLanguages(vocabulary.targetLanguages);
      })
      .catch((error) => setErrors([errorMessage(error, "vocabLoadError")]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleTarget(code: LanguageCode) {
    setTargetLanguages((current) => (current.includes(code) ? current.filter((languageCode) => languageCode !== code) : [...current, code]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = normalizeVocabularyInput({ name, description, sourceLanguage, targetLanguages });
    const problems = validateVocabularyInput(input);
    if (problems.length > 0) {
      setErrors(Array.from(new Set(problems.map((problem) => t(VALIDATION_KEYS[problem])))));
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const saved = existing ? await vocabularies.update(existing.id, input) : await vocabularies.create(user.id, input);
      navigate(`/vocabularies/${saved.id}`);
    } catch (error) {
      setErrors([errorMessage(error, "vocabSaveError")]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader />;
  const languageLocked = (existing?.wordCount ?? 0) > 0;

  return (
    <div className="app-main">
      <form className="card" onSubmit={submit} noValidate>
        <h2>{isEdit ? t("editVocabulary") : t("newVocabulary")}</h2>
        {errors.length > 0 && (
          <div role="alert">
            {errors.map((error) => (
              <ErrorBanner key={error} message={error} />
            ))}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="ve-name">
            {t("vocabNameLabel")} <span className="required">*</span>
          </label>
          <input
            id="ve-name"
            type="text"
            dir="auto"
            required
            maxLength={VOCABULARY_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>

        <div className="form-field">
          <label htmlFor="ve-description">
            {t("vocabDescriptionLabel")} <span className="muted">({t("optional")})</span>
          </label>
          <textarea
            id="ve-description"
            rows={4}
            dir="auto"
            maxLength={VOCABULARY_DESCRIPTION_MAX}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="ve-source">{t("wordsLanguageLabel")}</label>
          <select
            id="ve-source"
            value={sourceLanguage}
            disabled={languageLocked}
            onChange={(event) => {
              const code = event.target.value as LanguageCode;
              setSourceLanguage(code);
              setTargetLanguages((current) => current.filter((languageCode) => languageCode !== code));
            }}
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))}
          </select>
          {languageLocked && <p className="muted form-hint">{t("errorLanguageLocked")}</p>}
        </div>

        <fieldset className="form-field plain-fieldset">
          <legend className="field-label">{t("translationLanguagesLabel")}</legend>
          <div className="checkbox-row">
            {SUPPORTED_LANGUAGES.filter((code) => code !== sourceLanguage).map((code) => (
              <label key={code}>
                <input type="checkbox" checked={targetLanguages.includes(code)} onChange={() => toggleTarget(code)} />
                {languageLabel(code)}
              </label>
            ))}
          </div>
        </fieldset>

        {!isEdit && <p className="muted form-hint">{t("newVocabularyHint")}</p>}

        <div className="button-row action-bar">
          <button className="btn btn-secondary" type="button" disabled={saving} onClick={() => navigate(-1)}>
            {t("cancelButton")}
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? t("saving") : isEdit ? t("saveButton") : t("createAndAddWords")}
          </button>
        </div>
      </form>
    </div>
  );
}
