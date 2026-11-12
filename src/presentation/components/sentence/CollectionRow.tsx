import { ReactNode } from "react";
import { languageLabel } from "@domain/entities/Language";
import { SentenceCollection } from "@domain/entities/SentenceCollection";
import { useLanguage } from "@presentation/context/LanguageContext";
import { StatusPill } from "@presentation/components/VocabularyBadges";
import { formatNumber } from "@presentation/format";

interface Props {
  collection: SentenceCollection;
  /** Show the author (for other people's collections) instead of the draft/published status */
  isOthers: boolean;
  children: ReactNode;
}

/** One sentence collection in a list: name, status or author, language and size, description, and its actions. */
export default function CollectionRow({ collection, isOthers, children }: Props) {
  const { t, language } = useLanguage();
  const details = [languageLabel(collection.language), t("exerciseCountLabel", { count: formatNumber(collection.exerciseCount, language) })];
  if (isOthers && collection.ownerName) details.push(t("byAuthor", { name: collection.ownerName }));
  return (
    <div className="vocab-row collection-row">
      <div className="vocab-row-main">
        <div className="vocab-row-headword" dir="auto">
          {collection.name} {!isOthers && <StatusPill vocabulary={collection} />}
        </div>
        <div className="vocab-row-translation">{details.join(" · ")}</div>
        {collection.description && (
          <div className="muted small" dir="auto">
            {collection.description}
          </div>
        )}
      </div>
      <div className="vocab-row-actions">{children}</div>
    </div>
  );
}
