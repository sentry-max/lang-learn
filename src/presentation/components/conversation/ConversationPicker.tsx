import { useMemo, useState } from "react";
import { Conversation, conversationText } from "@domain/entities/Conversation";
import { LanguageCode, languageLabel } from "@domain/entities/Language";
import { CEFR_LEVELS, CefrLevel } from "@domain/entities/Word";
import { useLanguage } from "@presentation/context/LanguageContext";
import { Segmented } from "@presentation/components/ui/Controls";
import ScorePill from "@presentation/components/sentence/ScorePill";
import Icon from "@presentation/components/ui/Icon";
import { formatNumber } from "@presentation/format";

interface Props {
  conversations: Conversation[];
  lastScoreById: Map<string, number>;
  /** The learner's own language, for translated titles */
  primaryLanguage: LanguageCode;
  onPick: (conversation: Conversation) => void;
}

type Filter<T extends string> = T | "all";

/** The list of ready-made dialogues, filtered by their language and level. */
export default function ConversationPicker({ conversations, lastScoreById, primaryLanguage, onPick }: Props) {
  const { t, language } = useLanguage();
  const [languageFilter, setLanguageFilter] = useState<Filter<LanguageCode>>("all");
  const [levelFilter, setLevelFilter] = useState<Filter<CefrLevel>>("all");

  const languages = useMemo(() => Array.from(new Set(conversations.map((conversation) => conversation.language))), [conversations]);
  const levels = useMemo(() => CEFR_LEVELS.filter((level) => conversations.some((conversation) => conversation.level === level)), [conversations]);
  const shown = conversations.filter(
    (conversation) => (languageFilter === "all" || conversation.language === languageFilter) && (levelFilter === "all" || conversation.level === levelFilter)
  );

  return (
    <div className="card">
      <h2 className="card-title">{t("conversationPickTitle")}</h2>
      <p className="muted">{t("conversationPickHint")}</p>

      {languages.length > 1 && (
        <section className="start-section">
          <span className="field-label">{t("conversationLanguageFilter")}</span>
          <Segmented<Filter<LanguageCode>>
            options={[{ value: "all", label: t("conversationFilterAll") }, ...languages.map((code) => ({ value: code, label: languageLabel(code) }))]}
            value={languageFilter}
            onChange={setLanguageFilter}
            ariaLabel={t("conversationLanguageFilter")}
          />
        </section>
      )}
      {levels.length > 1 && (
        <section className="start-section">
          <span className="field-label">{t("levelLabel")}</span>
          <Segmented<Filter<CefrLevel>>
            options={[{ value: "all", label: t("conversationFilterAll") }, ...levels.map((level) => ({ value: level, label: level }))]}
            value={levelFilter}
            onChange={setLevelFilter}
            ariaLabel={t("levelLabel")}
          />
        </section>
      )}

      {shown.length === 0 ? (
        <p className="muted">{t("conversationNoMatches")}</p>
      ) : (
        <ul className="conversation-list">
          {shown.map((conversation) => {
            const translated = conversationText(conversation, primaryLanguage);
            const score = lastScoreById.get(conversation.id);
            return (
              <li key={conversation.id}>
                <button type="button" className="vocab-row conversation-row" onClick={() => onPick(conversation)}>
                  <span className="vocab-row-main">
                    <span className="vocab-row-headword" dir="auto">
                      {conversation.title}
                    </span>
                    {translated.title !== conversation.title && (
                      <span className="vocab-row-translation" dir="auto">
                        {translated.title}
                      </span>
                    )}
                    <span className="pill-row">
                      <span className="pill">{conversation.level}</span>
                      <span className="pill">{languageLabel(conversation.language)}</span>
                      <span className="pill">{t("conversationRoleCount", { count: formatNumber(conversation.roles.length, language) })}</span>
                    </span>
                  </span>
                  {score !== undefined && <ScorePill score={score} />}
                  <Icon name="arrowRight" size={18} className="flip-rtl" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
