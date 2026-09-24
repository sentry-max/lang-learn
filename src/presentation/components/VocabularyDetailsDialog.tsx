import { VocabularyEntry, displayForm } from "@domain/entities/VocabularyEntry";
import { useLanguage } from "@presentation/context/LanguageContext";
import Modal from "@presentation/components/Modal";
import WordFormsDetail from "@presentation/components/WordFormsDetail";

interface Props {
  entry: VocabularyEntry;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function VocabularyDetailsDialog({ entry, onClose, onEdit, onDelete }: Props) {
  const { t } = useLanguage();
  return (
    <Modal title={displayForm(entry)} onClose={onClose}>
      <WordFormsDetail entry={entry} />
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onEdit}>
          {t("edit")}
        </button>
        <button
          className="btn btn-secondary"
          style={{ color: "var(--color-danger)" }}
          onClick={onDelete}
        >
          {t("delete")}
        </button>
      </div>
    </Modal>
  );
}
