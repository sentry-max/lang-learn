import { useState } from "react";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import { FileImport, ImportOutcome } from "@presentation/components/ImportResults";

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const EMPTY_IMPORT: ImportOutcome = { importedCount: 0, updatedCount: 0, duplicateMessage: null, problems: [] };

/** Reads picked JSON files one by one, hands each parsed file to `importParsed`, and keeps the worded outcomes. */
export function useFileImport() {
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const [imports, setImports] = useState<FileImport[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  async function importFiles(files: FileList, importParsed: (parsed: unknown) => Promise<ImportOutcome>): Promise<void> {
    setIsImporting(true);
    const results: FileImport[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_IMPORT_FILE_BYTES) {
          results.push({ fileName: file.name, ...EMPTY_IMPORT, failureMessage: t("importFileTooLarge") });
          continue;
        }
        try {
          const parsed: unknown = JSON.parse(await file.text());
          results.push({ fileName: file.name, ...(await importParsed(parsed)) });
        } catch (error) {
          const failureMessage = error instanceof SyntaxError ? t("importInvalidJson") : errorMessage(error, "importError");
          results.push({ fileName: file.name, ...EMPTY_IMPORT, failureMessage });
        }
      }
      setImports(results);
    } finally {
      setIsImporting(false);
    }
  }

  return { imports, isImporting, importFiles };
}
