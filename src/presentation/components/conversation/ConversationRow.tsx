import { ReactNode } from "react";
import { Conversation, conversationText, conversationTitle } from "@domain/entities/Conversation";
import { languageLabel } from "@domain/entities/Language";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useProfile } from "@presentation/context/ProfileContext";
import { StatusPill } from "@presentation/components/VocabularyBadges";
import { formatNumber } from "@presentation/format";

interface Props {
  conversation: Conversation;
  /** Show the author (for other people's conversations) instead of the draft/published status */
  isOthers: boolean;
  children: ReactNode;
}

/** One conversation in a list: title with level, status or author, language and roles, description, and its actions. */
export default function ConversationRow({ conversation, isOthers, children }: Props) {
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const { description } = conversationText(conversation, profile.primaryLanguage);
  const details = [
    languageLabel(conversation.language),
    t("conversationRoleCount", { count: formatNumber(conversation.roles.length, language) }),
  ];
  if (isOthers && conversation.ownerName) details.push(t("byAuthor", { name: conversation.ownerName }));
  return (
    <div className="vocab-row collection-row">
      <div className="vocab-row-main">
        <div className="vocab-row-headword" dir="auto">
          {conversationTitle(conversation)} {!isOthers && <StatusPill vocabulary={conversation} />}
        </div>
        <div className="vocab-row-translation">{details.join(" · ")}</div>
        {description && (
          <div className="muted small" dir="auto">
            {description}
          </div>
        )}
      </div>
      <div className="vocab-row-actions">{children}</div>
    </div>
  );
}
