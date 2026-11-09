import { useLanguage } from "@presentation/context/LanguageContext";

/** One imported file's outcome, already worded for the screen. */
export interface FileImport {
  fileName: string;
  importedCount: number;
  updatedCount: number;
  duplicateMessage: string | null;
  problems: string[];
  /** Set when the whole file could not be read */
  failureMessage?: string;
}

export type ImportOutcome = Omit<FileImport, "fileName" | "failureMessage">;

/** The outcome of each imported file: counts, skipped duplicates and per-entry problems. */
export default function ImportResults({ imports }: { imports: FileImport[] }) {
  const { t } = useLanguage();
  return (
    <>
      {imports.map(({ fileName, importedCount, updatedCount, duplicateMessage, problems, failureMessage }) => (
        <div key={fileName} className="import-result">
          <strong dir="auto">{fileName}</strong>
          <p className={importedCount + updatedCount > 0 ? "feedback-correct" : "feedback-incorrect"}>
            {t("importSummary", { imported: importedCount, updated: updatedCount })}
          </p>
          {duplicateMessage && (
            <p className="muted" dir="auto">
              {duplicateMessage}
            </p>
          )}
          {failureMessage && <p className="feedback-incorrect">{failureMessage}</p>}
          {problems.length > 0 && (
            <ul className="muted small">
              {problems.slice(0, 20).map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
              {problems.length > 20 && <li>{t("moreErrors", { count: problems.length - 20 })}</li>}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}
