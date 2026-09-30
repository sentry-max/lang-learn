import { Word, displayForm, getSentenceTranslation, getTranslations } from "@domain/entities/Word";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";

export default function WordFormsDetail({ word }: { word: Word }) {
  const { t } = useLanguage();
  const { profile } = useProfile();
  const language = profile.primaryLanguage;
  return (
    <div>
      <p className="word-title" dir="auto">
        {displayForm(word)}
      </p>
      <p className="muted">
        {word.wordType}
        {word.level ? ` · ${word.level}` : ""}
      </p>
      {word.nounForms?.plural && (
        <p className="muted">
          {t("pluralLabel")}: {word.nounForms.plural}
        </p>
      )}
      {word.verbForms && (word.verbForms.presentThirdPerson || word.verbForms.simplePast || word.verbForms.perfect) && (
        <p className="muted" dir="auto">
          {[word.verbForms.presentThirdPerson, word.verbForms.simplePast, word.verbForms.perfect].filter(Boolean).join(", ")}
          {word.verbForms.passive ? ` · ${t("passiveLabel")}: ${word.verbForms.passive}` : ""}
        </p>
      )}
      <p style={{ fontWeight: 600 }} dir="auto">
        {getTranslations(word, language).join("، ")}
      </p>
      {word.sentences.map((s, i) => (
        <p key={i} className="muted" style={{ margin: "4px 0" }} dir="auto">
          {s.text}
          <br />
          <em>{getSentenceTranslation(s, language)}</em>
        </p>
      ))}
      {word.tags.length > 0 && (
        <p>
          {word.tags.map((tag) => (
            <span key={tag} className="pill" style={{ marginInlineEnd: 4 }}>
              #{tag}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
