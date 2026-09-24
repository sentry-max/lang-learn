import { useState } from "react";
import { VocabularyEntry, WordType } from "@domain/entities/VocabularyEntry";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useServices } from "@presentation/context/ServicesContext";

interface Props {
  /** null = "add" mode; a VocabularyEntry = "edit" mode, prefilled from it */
  existingEntry: VocabularyEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

const WORD_TYPES: WordType[] = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "pronoun",
  "numeral",
  "phrase",
  "other",
];

const LEVELS: VocabularyEntry["level"][] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function slugify(text: string): string {
  return text
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

function generateEntryId(wordType: string, headword: string): string {
  return `custom-${wordType}-${slugify(headword) || "word"}-${Date.now().toString(36)}`;
}

function joinList(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

export default function VocabularyFormDialog({ existingEntry, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const { importVocabulary } = useServices();
  const isEdit = existingEntry !== null;

  const [wordType, setWordType] = useState<WordType>(existingEntry?.wordType ?? "noun");
  const [headword, setHeadword] = useState(existingEntry?.headword ?? "");
  const [translationsEn, setTranslationsEn] = useState(joinList(existingEntry?.translations.en));
  const [translationsFa, setTranslationsFa] = useState(joinList(existingEntry?.translations.fa));
  const [article, setArticle] = useState(existingEntry?.nounForms?.article ?? "");
  const [plural, setPlural] = useState(existingEntry?.nounForms?.plural ?? "");
  const [presentThirdPerson, setPresentThirdPerson] = useState(
    existingEntry?.verbForms?.presentThirdPerson ?? ""
  );
  const [simplePast, setSimplePast] = useState(existingEntry?.verbForms?.simplePast ?? "");
  const [perfect, setPerfect] = useState(existingEntry?.verbForms?.perfect ?? "");
  const [passive, setPassive] = useState(existingEntry?.verbForms?.passive ?? "");
  const [auxiliaryIsSein, setAuxiliaryIsSein] = useState(
    existingEntry?.verbForms?.auxiliaryIsSein ?? false
  );
  const [separable, setSeparable] = useState(existingEntry?.verbForms?.separable ?? false);
  const [sentenceGerman, setSentenceGerman] = useState(existingEntry?.sentences[0]?.german ?? "");
  const [sentenceEn, setSentenceEn] = useState(existingEntry?.sentences[0]?.translations.en ?? "");
  const [sentenceFa, setSentenceFa] = useState(existingEntry?.sentences[0]?.translations.fa ?? "");
  const [level, setLevel] = useState<VocabularyEntry["level"]>(existingEntry?.level ?? "B1");
  const [tags, setTags] = useState(joinList(existingEntry?.tags));

  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSaving(true);

    const translations: Record<string, string[]> = {};
    const en = translationsEn.split(",").map((s) => s.trim()).filter(Boolean);
    const fa = translationsFa.split(",").map((s) => s.trim()).filter(Boolean);
    if (en.length) translations.en = en;
    if (fa.length) translations.fa = fa;

    const sentenceTranslations: Record<string, string> = {};
    if (sentenceEn.trim()) sentenceTranslations.en = sentenceEn.trim();
    if (sentenceFa.trim()) sentenceTranslations.fa = sentenceFa.trim();

    const raw: Record<string, unknown> = {
      id: existingEntry?.id ?? generateEntryId(wordType, headword),
      wordType,
      headword: headword.trim(),
      translations,
      sentences: sentenceGerman.trim()
        ? [{ german: sentenceGerman.trim(), translations: sentenceTranslations }]
        : [],
      level,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
    };

    if (wordType === "noun") {
      raw.nounForms = { article: article || null, plural: plural.trim() || null };
    }
    if (wordType === "verb") {
      raw.verbForms = {
        infinitive: headword.trim(),
        presentThirdPerson: presentThirdPerson.trim(),
        simplePast: simplePast.trim(),
        perfect: perfect.trim(),
        passive: passive.trim() || null,
        auxiliaryIsSein,
        separable,
      };
    }

    try {
      const result = await importVocabulary.execute([raw]);
      if (result.importedCount === 1) {
        onSaved();
        onClose();
        return;
      }
      if (result.duplicateHeadwords.length > 0) {
        setErrors([t("duplicateSkipped", { words: result.duplicateHeadwords.join(", ") })]);
      } else {
        setErrors(result.errors);
      }
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{isEdit ? t("editWordTitle") : t("addWordTitle")}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("close")}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {errors.length > 0 && (
              <div className="error-banner" style={{ display: "block" }}>
                {errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}

            <div className="form-row">
              <div className="form-field">
                <label>{t("wordTypeLabel")}</label>
                <select value={wordType} onChange={(e) => setWordType(e.target.value as WordType)}>
                  {WORD_TYPES.map((wt) => (
                    <option key={wt} value={wt}>
                      {wt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>{t("levelLabel")}</label>
                <select value={level} onChange={(e) => setLevel(e.target.value as VocabularyEntry["level"])}>
                  {LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>{t("headwordLabel")}</label>
              <input type="text" required value={headword} onChange={(e) => setHeadword(e.target.value)} />
            </div>

            <div className="form-field">
              <label>{t("translationsEnLabel")}</label>
              <input type="text" value={translationsEn} onChange={(e) => setTranslationsEn(e.target.value)} />
            </div>
            <div className="form-field">
              <label>{t("translationsFaLabel")}</label>
              <input type="text" value={translationsFa} onChange={(e) => setTranslationsFa(e.target.value)} />
            </div>

            {wordType === "noun" && (
              <div className="form-row">
                <div className="form-field">
                  <label>{t("articleLabel")}</label>
                  <select value={article} onChange={(e) => setArticle(e.target.value as typeof article)}>
                    <option value="">{t("articleNone")}</option>
                    <option value="der">der</option>
                    <option value="die">die</option>
                    <option value="das">das</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>{t("pluralLabel")}</label>
                  <input type="text" value={plural} onChange={(e) => setPlural(e.target.value)} />
                </div>
              </div>
            )}

            {wordType === "verb" && (
              <>
                <div className="form-row">
                  <div className="form-field">
                    <label>{t("presentLabel")}</label>
                    <input
                      type="text"
                      value={presentThirdPerson}
                      onChange={(e) => setPresentThirdPerson(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>{t("simplePastLabel")}</label>
                    <input type="text" value={simplePast} onChange={(e) => setSimplePast(e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>{t("perfectLabel")}</label>
                    <input type="text" value={perfect} onChange={(e) => setPerfect(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label>{t("passiveLabel")}</label>
                    <input type="text" value={passive} onChange={(e) => setPassive(e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={auxiliaryIsSein}
                      onChange={(e) => setAuxiliaryIsSein(e.target.checked)}
                    />
                    {t("auxiliaryLabel")}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={separable} onChange={(e) => setSeparable(e.target.checked)} />
                    {t("separableLabel")}
                  </label>
                </div>
              </>
            )}

            <div className="form-field">
              <label>{t("sentenceGermanLabel")}</label>
              <input
                type="text"
                required
                value={sentenceGerman}
                onChange={(e) => setSentenceGerman(e.target.value)}
              />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>{t("sentenceEnLabel")}</label>
                <input type="text" value={sentenceEn} onChange={(e) => setSentenceEn(e.target.value)} />
              </div>
              <div className="form-field">
                <label>{t("sentenceFaLabel")}</label>
                <input type="text" value={sentenceFa} onChange={(e) => setSentenceFa(e.target.value)} />
              </div>
            </div>

            <div className="form-field">
              <label>{t("tagsLabel")}</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" className="btn" disabled={saving}>
                {t("saveButton")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t("cancelButton")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
