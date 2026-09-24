import { VocabularyEntry, displayForm, getSentenceTranslation, getTranslations } from "@domain/entities/VocabularyEntry";
import { useLanguage } from "@presentation/context/LanguageContext";

export default function WordFormsDetail({ entry }: { entry: VocabularyEntry }) {
  const { language } = useLanguage();
  return (
    <div>
      <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0" }}>{displayForm(entry)}</p>
      {entry.nounForms && (
        <p className="muted">Plural: {entry.nounForms.plural ?? "—"}</p>
      )}
      {entry.verbForms && (
        <p className="muted">
          {entry.verbForms.presentThirdPerson}, {entry.verbForms.simplePast}, {entry.verbForms.perfect}
          {entry.verbForms.passive ? ` · Passive: ${entry.verbForms.passive}` : ""}
        </p>
      )}
      <p style={{ fontWeight: 600 }}>{getTranslations(entry, language).join(", ")}</p>
      {entry.sentences.map((s, i) => (
        <p key={i} className="muted" style={{ margin: "4px 0" }}>
          {s.german} <br />
          <em>{getSentenceTranslation(s, language)}</em>
        </p>
      ))}
    </div>
  );
}
