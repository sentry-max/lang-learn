import { FormEvent, useMemo, useRef, useState } from "react";
import { GRAMMAR_PROFILES, LanguageCode, SUPPORTED_LANGUAGES, languageLabel } from "@domain/entities/Language";
import { Vocabulary } from "@domain/entities/Vocabulary";
import { CEFR_LEVELS, WORD_TYPES, Word, WordType } from "@domain/entities/Word";
import { WordTarget } from "@application/services/WordService";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { useProfile } from "@presentation/context/ProfileContext";
import { useToast } from "@presentation/context/FeedbackContext";
import Modal from "@presentation/components/Modal";

const AUTO = "auto";

interface Props {
  /** Fixed vocabulary (detail page / edit). null lets the user pick one or use automatic placement. */
  vocabulary: Vocabulary | null;
  /** The user's own vocabularies, for the picker when `vocabulary` is null */
  ownedVocabularies?: Vocabulary[];
  /** Present when editing */
  word?: Word;
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface FormState {
  wordType: WordType;
  level: string;
  headword: string;
  translations: Partial<Record<LanguageCode, string>>;
  article: string;
  plural: string;
  presentThirdPerson: string;
  simplePast: string;
  perfect: string;
  passive: string;
  auxiliaryIsSein: boolean;
  separable: boolean;
  sentence: string;
  sentenceTranslations: Partial<Record<LanguageCode, string>>;
  tags: string;
}

function initialState(word?: Word): FormState {
  const translations: FormState["translations"] = {};
  for (const [code, values] of Object.entries(word?.translations ?? {})) translations[code as LanguageCode] = values!.join(", ");
  return {
    wordType: word?.wordType ?? "noun",
    level: word?.level ?? "",
    headword: word?.headword ?? "",
    translations,
    article: word?.nounForms?.article ?? "",
    plural: word?.nounForms?.plural ?? "",
    presentThirdPerson: word?.verbForms?.presentThirdPerson ?? "",
    simplePast: word?.verbForms?.simplePast ?? "",
    perfect: word?.verbForms?.perfect ?? "",
    passive: word?.verbForms?.passive ?? "",
    auxiliaryIsSein: word?.verbForms?.auxiliaryIsSein ?? false,
    separable: word?.verbForms?.separable ?? false,
    sentence: word?.sentences[0]?.text ?? "",
    sentenceTranslations: { ...(word?.sentences[0]?.translations ?? {}) },
    tags: (word?.tags ?? []).join(", "),
  };
}

const splitList = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

export default function WordFormDialog({ vocabulary, ownedVocabularies = [], word, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const user = useCurrentUser();
  const { words } = useServices();
  const errorMessage = useErrorMessage();
  const { preferences } = useProfile();
  const toast = useToast();
  const isEdit = word !== undefined;
  const headwordRef = useRef<HTMLInputElement>(null);
  const [keepAdding, setKeepAdding] = useState(preferences.continuousAdd);
  const [addedCount, setAddedCount] = useState(0);

  const [form, setForm] = useState<FormState>(() => initialState(word));
  const [target, setTarget] = useState<string>(vocabulary?.id ?? AUTO);
  const [autoLanguage, setAutoLanguage] = useState<LanguageCode>(ownedVocabularies[0]?.sourceLanguage ?? "de");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const chosenVocabulary = vocabulary ?? ownedVocabularies.find((v) => v.id === target) ?? null;
  const sourceLanguage = chosenVocabulary?.sourceLanguage ?? autoLanguage;
  const grammar = GRAMMAR_PROFILES[sourceLanguage];
  const otherLanguages = useMemo(() => SUPPORTED_LANGUAGES.filter((l) => l !== sourceLanguage), [sourceLanguage]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function buildRaw(): Record<string, unknown> {
    const translations: Record<string, string[]> = {};
    const sentenceTranslations: Record<string, string> = {};
    for (const code of otherLanguages) {
      const values = splitList(form.translations[code] ?? "");
      if (values.length) translations[code] = values;
      const sentence = form.sentenceTranslations[code]?.trim();
      if (sentence) sentenceTranslations[code] = sentence;
    }
    const raw: Record<string, unknown> = {
      id: word?.externalId ?? undefined,
      wordType: form.wordType,
      headword: form.headword,
      translations,
      sentences: form.sentence.trim() ? [{ text: form.sentence.trim(), translations: sentenceTranslations }] : [],
      level: form.level || null,
      tags: splitList(form.tags),
    };
    if (form.wordType === "noun") raw.nounForms = { article: form.article || null, plural: form.plural || null };
    if (form.wordType === "verb" && grammar.hasVerbForms) {
      raw.verbForms = {
        infinitive: form.headword.trim(),
        presentThirdPerson: form.presentThirdPerson,
        simplePast: form.simplePast,
        perfect: form.perfect,
        passive: form.passive || null,
        auxiliaryIsSein: grammar.hasAuxiliaryChoice && form.auxiliaryIsSein,
        separable: grammar.hasSeparableVerbs && form.separable,
      };
    }
    return raw;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    const parsed = words.parse(buildRaw(), sourceLanguage);
    if (!parsed.ok) {
      setErrors(parsed.errors.map((err) => err.replace(/^Entry 1( \([^)]*\))?: /, "")));
      return;
    }

    setSaving(true);
    try {
      if (word && chosenVocabulary) {
        await words.updateWord(user.id, chosenVocabulary, word, parsed.word);
        onSaved(t("wordSaved"));
      } else {
        const wordTarget: WordTarget = chosenVocabulary
          ? { kind: "vocabulary", vocabulary: chosenVocabulary }
          : { kind: "auto", sourceLanguage };
        const result = await words.addWord(user.id, parsed.word, wordTarget);
        const message = result.createdVocabulary
          ? t("wordAddedToNewVocabulary", { name: result.vocabulary.name })
          : t("wordAddedTo", { name: result.vocabulary.name });
        onSaved(message);
        if (keepAdding) {
          // Ready for the next word: keep type, level, tags and target; clear the rest.
          toast(message);
          setAddedCount((n) => n + 1);
          setForm((f) => ({ ...initialState(), wordType: f.wordType, level: f.level, tags: f.tags }));
          if (result.createdVocabulary) setTarget(AUTO);
          headwordRef.current?.focus();
          return;
        }
      }
      onClose();
    } catch (err) {
      setErrors([errorMessage(err, "wordSaveError")]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? t("editWordTitle") : t("addWordTitle")} onClose={onClose} wide>
      <form onSubmit={handleSubmit} noValidate>
        {errors.length > 0 && (
          <div className="error-banner" style={{ display: "block" }} role="alert">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}

        {!vocabulary && (
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="wf-target">{t("vocabularyLabel")}</label>
              <select id="wf-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value={AUTO}>{t("placementAuto")}</option>
                {ownedVocabularies.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({languageLabel(v.sourceLanguage)})
                  </option>
                ))}
              </select>
            </div>
            {target === AUTO && (
              <div className="form-field">
                <label htmlFor="wf-lang">{t("wordLanguageLabel")}</label>
                <select id="wf-lang" value={autoLanguage} onChange={(e) => setAutoLanguage(e.target.value as LanguageCode)}>
                  {SUPPORTED_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {languageLabel(code)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        {!vocabulary && target === AUTO && <p className="muted form-hint">{t("placementAutoHint")}</p>}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="wf-type">{t("wordTypeLabel")}</label>
            <select id="wf-type" value={form.wordType} onChange={(e) => set("wordType", e.target.value as WordType)}>
              {WORD_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {wt}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="wf-level">{t("levelLabel")}</label>
            <select id="wf-level" value={form.level} onChange={(e) => set("level", e.target.value)}>
              <option value="">—</option>
              {CEFR_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="wf-headword">
            {t("headwordLabel")} ({languageLabel(sourceLanguage)})
          </label>
          <input
            id="wf-headword"
            ref={headwordRef}
            data-autofocus
            type="text"
            dir="auto"
            required
            maxLength={200}
            value={form.headword}
            onChange={(e) => set("headword", e.target.value)}
          />
        </div>

        {otherLanguages.map((code) => (
          <div className="form-field" key={code}>
            <label htmlFor={`wf-tr-${code}`}>{t("translationsLabel", { lang: languageLabel(code) })}</label>
            <input
              id={`wf-tr-${code}`}
              type="text"
              dir="auto"
              value={form.translations[code] ?? ""}
              onChange={(e) => set("translations", { ...form.translations, [code]: e.target.value })}
            />
          </div>
        ))}

        {form.wordType === "noun" && (
          <div className="form-row">
            {grammar.articles && (
              <div className="form-field">
                <label htmlFor="wf-article">{t("articleLabel")}</label>
                <select id="wf-article" value={form.article} onChange={(e) => set("article", e.target.value)}>
                  <option value="">{t("articleNone")}</option>
                  {grammar.articles.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {grammar.hasPlural && (
              <div className="form-field">
                <label htmlFor="wf-plural">{t("pluralLabel")}</label>
                <input id="wf-plural" type="text" dir="auto" value={form.plural} onChange={(e) => set("plural", e.target.value)} />
              </div>
            )}
          </div>
        )}

        {form.wordType === "verb" && grammar.hasVerbForms && (
          <>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="wf-present">{t("presentLabel")}</label>
                <input
                  id="wf-present"
                  type="text"
                  dir="auto"
                  value={form.presentThirdPerson}
                  onChange={(e) => set("presentThirdPerson", e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="wf-past">{t("simplePastLabel")}</label>
                <input id="wf-past" type="text" dir="auto" value={form.simplePast} onChange={(e) => set("simplePast", e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="wf-perfect">{t("perfectLabel")}</label>
                <input id="wf-perfect" type="text" dir="auto" value={form.perfect} onChange={(e) => set("perfect", e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="wf-passive">{t("passiveLabel")}</label>
                <input id="wf-passive" type="text" dir="auto" value={form.passive} onChange={(e) => set("passive", e.target.value)} />
              </div>
            </div>
            {(grammar.hasAuxiliaryChoice || grammar.hasSeparableVerbs) && (
              <div className="form-row checkbox-row">
                {grammar.hasAuxiliaryChoice && (
                  <label>
                    <input
                      type="checkbox"
                      checked={form.auxiliaryIsSein}
                      onChange={(e) => set("auxiliaryIsSein", e.target.checked)}
                    />
                    {t("auxiliaryLabel")}
                  </label>
                )}
                {grammar.hasSeparableVerbs && (
                  <label>
                    <input type="checkbox" checked={form.separable} onChange={(e) => set("separable", e.target.checked)} />
                    {t("separableLabel")}
                  </label>
                )}
              </div>
            )}
          </>
        )}

        <div className="form-field">
          <label htmlFor="wf-sentence">
            {t("sentenceLabel", { lang: languageLabel(sourceLanguage) })} <span className="muted">({t("optional")})</span>
          </label>
          <input
            id="wf-sentence"
            type="text"
            dir="auto"
            maxLength={500}
            value={form.sentence}
            onChange={(e) => set("sentence", e.target.value)}
          />
        </div>
        {form.sentence.trim() &&
          otherLanguages.map((code) => (
            <div className="form-field" key={code}>
              <label htmlFor={`wf-st-${code}`}>{t("sentenceTranslationLabel", { lang: languageLabel(code) })}</label>
              <input
                id={`wf-st-${code}`}
                type="text"
                dir="auto"
                maxLength={500}
                value={form.sentenceTranslations[code] ?? ""}
                onChange={(e) => set("sentenceTranslations", { ...form.sentenceTranslations, [code]: e.target.value })}
              />
            </div>
          ))}

        <div className="form-field">
          <label htmlFor="wf-tags">{t("tagsLabel")}</label>
          <input id="wf-tags" type="text" dir="auto" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
        </div>

        <div className="form-actions">
          {!isEdit && (
            <label className="checkbox-label keep-adding">
              <input type="checkbox" checked={keepAdding} onChange={(e) => setKeepAdding(e.target.checked)} />
              {t("keepAddingLabel")}
              {addedCount > 0 && <span className="pill">{t("addedSoFar", { count: addedCount })}</span>}
            </label>
          )}
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {addedCount > 0 ? t("done") : t("cancelButton")}
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t("saving") : t("saveButton")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
