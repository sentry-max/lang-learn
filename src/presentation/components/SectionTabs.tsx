import { Section } from "@presentation/hooks/useSection";
import { useLanguage } from "@presentation/context/LanguageContext";
import { Tabs } from "@presentation/components/ui/Controls";
import Icon from "@presentation/components/ui/Icon";
import { UiStringKey } from "@presentation/i18n/translations";

interface Props {
  value: Section;
  onChange: (section: Section) => void;
  /** What the words half is called on this page: "Words" or "Vocabularies" */
  wordsLabel: UiStringKey;
  /** Pages that manage or list conversations offer them as a third tab */
  hasConversations?: boolean;
}

/** The tabs that switch a page between its words, its sentences and (where offered) its conversations. */
export default function SectionTabs({ value, onChange, wordsLabel, hasConversations = false }: Props) {
  const { t } = useLanguage();
  return (
    <div className="section-tabs">
      <Tabs
        tabs={[
          { value: "words", label: t(wordsLabel), icon: <Icon name="book" size={18} /> },
          { value: "sentences", label: t("navSentences"), icon: <Icon name="sentence" size={18} /> },
          ...(hasConversations ? [{ value: "conversations" as const, label: t("navConversations"), icon: <Icon name="mic" size={18} /> }] : []),
        ]}
        value={value}
        onChange={onChange}
        ariaLabel={t("sectionTabsLabel")}
      />
    </div>
  );
}
