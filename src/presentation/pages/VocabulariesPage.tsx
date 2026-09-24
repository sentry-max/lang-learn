import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { VocabularyEntry, displayForm, getTranslations } from "@domain/entities/VocabularyEntry";
import { SyncStatus } from "@domain/repositories/SyncCoordinator";
import { toAppError } from "@domain/errors/AppError";
import { ImportResult } from "@application/usecases/ImportVocabularyUseCase";
import ErrorBanner from "@presentation/components/ErrorBanner";
import VocabularyDetailsDialog from "@presentation/components/VocabularyDetailsDialog";
import VocabularyFormDialog from "@presentation/components/VocabularyFormDialog";

type DialogState =
  | { kind: "none" }
  | { kind: "details"; entry: VocabularyEntry }
  | { kind: "form"; entry: VocabularyEntry | null };

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function VocabulariesPage() {
  const { listVocabulary, deleteVocabularyEntry, deleteAllVocabulary, importVocabulary, vocabularySync } =
    useServices();
  const { language, t } = useLanguage();

  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listVocabulary.execute();
      setEntries(list);
    } catch (err) {
      setError(toAppError(err, t("vocabLoadError")).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSyncStatus = useCallback(async () => {
    if (!vocabularySync) return;
    try {
      setSyncStatus(await vocabularySync.getStatus());
    } catch {
      // Status display is best-effort — a failed check just leaves it stale.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    loadSyncStatus();
  }, [load, loadSyncStatus]);

  async function handleResync() {
    if (!vocabularySync) return;
    setSyncing(true);
    setError(null);
    try {
      const status = await vocabularySync.resync();
      setSyncStatus(status);
      await load();
    } catch (err) {
      setError(toAppError(err, "Failed to sync vocabulary.").message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleFile(file: File) {
    setImportResult(null);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const outcome = await importVocabulary.execute(parsed);
      setImportResult(outcome);
      await load();
      await loadSyncStatus();
    } catch (err) {
      setImportResult({ importedCount: 0, errors: [toAppError(err, "Could not import that file.").message], duplicateHeadwords: [] });
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm(t("confirmDeleteAll"))) return;
    setError(null);
    try {
      await deleteAllVocabulary.execute();
      await load();
      await loadSyncStatus();
    } catch (err) {
      setError(toAppError(err, "Failed to delete vocabulary.").message);
    }
  }

  async function handleDeleteOne(entry: VocabularyEntry) {
    if (!window.confirm(t("confirmDelete", { word: displayForm(entry) }))) return;
    setError(null);
    try {
      await deleteVocabularyEntry.execute(entry.id);
      setDialog({ kind: "none" });
      await load();
      await loadSyncStatus();
    } catch (err) {
      setError(toAppError(err, "Failed to delete that word.").message);
    }
  }

  const filteredGrouped = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    const filtered = query
      ? entries.filter((e) => {
          const inHeadword = e.headword.toLocaleLowerCase("de").includes(query);
          const inTranslations = getTranslations(e, language).some((v) =>
            v.toLocaleLowerCase().includes(query)
          );
          return inHeadword || inTranslations;
        })
      : entries;

    const sorted = [...filtered].sort((a, b) => a.headword.localeCompare(b.headword, "de"));

    const groups: { letter: string; items: VocabularyEntry[] }[] = [];
    for (const entry of sorted) {
      const letter = entry.headword.charAt(0).toLocaleUpperCase("de");
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.letter === letter) {
        lastGroup.items.push(entry);
      } else {
        groups.push({ letter, items: [entry] });
      }
    }
    return groups;
  }, [entries, search, language]);

  return (
    <div className="app-main">
      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="vocab-list-header">
        <h2 style={{ margin: 0 }}>{t("navVocabularies")}</h2>
        <span className="pill">{t("vocabCountLabel", { count: entries.length })}</span>
      </div>

      <div className="toolbar">
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <div className="toolbar-spacer" />
        <button className="btn btn-secondary" onClick={() => setDialog({ kind: "form", entry: null })}>
          {t("addWordButton")}
        </button>
        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
          {t("importJsonButton")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <button
          className="btn btn-secondary"
          style={{ color: "var(--color-danger)" }}
          onClick={handleDeleteAll}
        >
          {t("deleteAllButton")}
        </button>
        {vocabularySync && (
          <button className="btn btn-secondary" onClick={handleResync} disabled={syncing}>
            {syncing ? t("syncing") : t("resyncButton")}
          </button>
        )}
      </div>

      {vocabularySync && syncStatus && (
        <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
          {syncStatus.pendingCount > 0
            ? t("pendingChanges", { count: syncStatus.pendingCount })
            : syncStatus.lastSyncedAt
            ? t("lastSynced", { time: formatTime(syncStatus.lastSyncedAt) })
            : t("neverSynced")}
        </p>
      )}

      {importResult && (
        <div style={{ marginBottom: 16 }}>
          <p className={importResult.importedCount > 0 ? "feedback-correct" : "feedback-incorrect"}>
            {t("importedCount", { count: importResult.importedCount })}
          </p>
          {importResult.duplicateHeadwords.length > 0 && (
            <p className="muted">{t("duplicateSkipped", { words: importResult.duplicateHeadwords.join(", ") })}</p>
          )}
          {importResult.errors.length > 0 && (
            <ul className="muted">
              {importResult.errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        {loading && <p className="muted center-text">{t("loading")}</p>}
        {!loading && filteredGrouped.length === 0 && <p className="muted center-text">{t("noWordsFound")}</p>}
        {!loading &&
          filteredGrouped.map((group) => (
            <div key={group.letter}>
              <div className="letter-group-label">{group.letter}</div>
              {group.items.map((entry) => (
                <div
                  key={entry.id}
                  className="vocab-row"
                  onClick={() => setDialog({ kind: "details", entry })}
                >
                  <div className="vocab-row-main">
                    <div className="vocab-row-headword">{displayForm(entry)}</div>
                    <div className="vocab-row-translation">{getTranslations(entry, language).join(", ")}</div>
                  </div>
                  <div className="vocab-row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t("edit")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialog({ kind: "form", entry });
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={t("delete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteOne(entry);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>

      {dialog.kind === "details" && (
        <VocabularyDetailsDialog
          entry={dialog.entry}
          onClose={() => setDialog({ kind: "none" })}
          onEdit={() => setDialog({ kind: "form", entry: dialog.entry })}
          onDelete={() => handleDeleteOne(dialog.entry)}
        />
      )}

      {dialog.kind === "form" && (
        <VocabularyFormDialog
          existingEntry={dialog.entry}
          onClose={() => setDialog({ kind: "none" })}
          onSaved={() => {
            load();
            loadSyncStatus();
          }}
        />
      )}
    </div>
  );
}
