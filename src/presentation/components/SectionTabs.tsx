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
}

/** The tabs that switch a page between its words and its sentences. */
export default function SectionTabs({ value, onChange, wordsLabel }: Props) {
  const { t } = useLanguage();
  return (
    <div className="section-tabs">
      <Tabs
        tabs={[
          { value: "words", label: t(wordsLabel), icon: <Icon name="book" size={18} /> },
          { value: "sentences", label: t("navSentences"), icon: <Icon name="sentence" size={18} /> },
        ]}
        value={value}
        onChange={onChange}
        ariaLabel={t("sectionTabsLabel")}
      />
    </div>
  );
}
