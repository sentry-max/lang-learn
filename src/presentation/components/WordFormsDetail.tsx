import { LanguageCode } from "@domain/entities/Language";
import { Word, displayForm, getSentenceTranslation, getTranslations } from "@domain/entities/Word";
import WordInflections from "@presentation/components/WordInflections";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { WORD_TYPE_KEYS } from "@presentation/i18n/grammarLabels";

interface BodyProps {
  word: Word;
  sourceLanguage: LanguageCode;
  primaryLanguage: LanguageCode;
}

/** Everything known about a word besides the word and its meaning. Shared by the word dialog and the quiz answer. */
export function WordDetailsBody({ word, sourceLanguage, primaryLanguage }: BodyProps) {
  const { t } = useLanguage();
  const tags = word.tags.filter((tag) => tag.trim());
  return (
    <div className="word-details">
      <p className="muted">
        {t(WORD_TYPE_KEYS[word.wordType])}
        {word.level ? ` · ${word.level}` : ""}
      </p>
      <WordInflections word={word} sourceLanguage={sourceLanguage} />
      {word.sentences
        .filter((sentence) => sentence.text?.trim())
        .map((sentence, index) => {
          const translation = getSentenceTranslation(sentence, primaryLanguage);
          return (
            <p key={index} className="muted word-details-sentence" dir="auto">
              {sentence.text}
              {translation && (
                <>
                  <br />
                  <em>{translation}</em>
                </>
              )}
            </p>
          );
        })}
      {tags.length > 0 && (
        <p>
          {tags.map((tag) => (
            <span key={tag} className="pill" style={{ marginInlineEnd: 4 }}>
              #{tag}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export default function WordFormsDetail({ word, sourceLanguage }: { word: Word; sourceLanguage: LanguageCode }) {
  const { profile } = useProfile();
  const primaryLanguage = profile.primaryLanguage;
  const meaning = getTranslations(word, primaryLanguage).join("، ");
  return (
    <div>
      <p className="word-title" dir="auto">
        {displayForm(word)}
      </p>
      {meaning && (
        <p style={{ fontWeight: 600 }} dir="auto">
          {meaning}
        </p>
      )}
      <WordDetailsBody word={word} sourceLanguage={sourceLanguage} primaryLanguage={primaryLanguage} />
    </div>
  );
}
