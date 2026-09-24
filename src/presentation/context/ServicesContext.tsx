import { ReactNode, createContext, useContext, useMemo } from "react";
import { supabase } from "@infrastructure/supabase/client";
import { getAppMode } from "@infrastructure/config/appMode";
import { SupabaseVocabularyRepository } from "@infrastructure/supabase/SupabaseVocabularyRepository";
import { SupabaseProgressRepository } from "@infrastructure/supabase/SupabaseProgressRepository";
import { LocalStorageVocabularyRepository } from "@infrastructure/local/LocalStorageVocabularyRepository";
import { LocalStorageProgressRepository } from "@infrastructure/local/LocalStorageProgressRepository";
import { SyncingVocabularyRepository } from "@infrastructure/sync/SyncingVocabularyRepository";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { ProgressRepository } from "@domain/repositories/ProgressRepository";
import { SyncCoordinator } from "@domain/repositories/SyncCoordinator";
import { GenerateQuizUseCase } from "@application/usecases/GenerateQuizUseCase";
import { SubmitAnswerUseCase } from "@application/usecases/SubmitAnswerUseCase";
import { GetStatsUseCase } from "@application/usecases/GetStatsUseCase";
import { ImportVocabularyUseCase } from "@application/usecases/ImportVocabularyUseCase";
import { ListVocabularyUseCase } from "@application/usecases/ListVocabularyUseCase";
import { DeleteVocabularyEntryUseCase } from "@application/usecases/DeleteVocabularyEntryUseCase";
import { DeleteAllVocabularyUseCase } from "@application/usecases/DeleteAllVocabularyUseCase";
import { VocabularySyncUseCase } from "@application/usecases/VocabularySyncUseCase";

/**
 * Composition root: the only place in the app that decides which backend
 * (Supabase, local-storage-only offline mode, or the merged offline-first
 * sync mode) is wired up. Everything downstream (pages, use cases)
 * depends on the repository interfaces only.
 *
 * Cloud mode (the default) uses SyncingVocabularyRepository: there is one
 * vocabulary dataset, cached locally for instant/offline reads and
 * mirrored to Supabase in the background — not two separate databases.
 * Standalone offline mode (VITE_APP_MODE=offline, no account at all)
 * skips Supabase entirely and just uses the local cache directly, so
 * `vocabularySync` is null there — nothing to sync to.
 */
interface Services {
  generateQuiz: GenerateQuizUseCase;
  submitAnswer: SubmitAnswerUseCase;
  getStats: GetStatsUseCase;
  importVocabulary: ImportVocabularyUseCase;
  listVocabulary: ListVocabularyUseCase;
  deleteVocabularyEntry: DeleteVocabularyEntryUseCase;
  deleteAllVocabulary: DeleteAllVocabularyUseCase;
  vocabularySync: VocabularySyncUseCase | null;
}

const ServicesContext = createContext<Services | null>(null);

function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function ServicesProvider({ children }: { children: ReactNode }) {
  const services = useMemo<Services>(() => {
    const isStandaloneOffline = getAppMode() === "offline";

    let vocabularyRepository: VocabularyRepository;
    let syncCoordinator: SyncCoordinator | null = null;

    if (isStandaloneOffline) {
      vocabularyRepository = new LocalStorageVocabularyRepository();
    } else {
      const local = new LocalStorageVocabularyRepository();
      const remote = new SupabaseVocabularyRepository(supabase);
      const syncing = new SyncingVocabularyRepository(local, remote, isBrowserOnline);
      vocabularyRepository = syncing;
      syncCoordinator = syncing;
    }

    const progressRepository: ProgressRepository = isStandaloneOffline
      ? new LocalStorageProgressRepository()
      : new SupabaseProgressRepository(supabase);

    return {
      generateQuiz: new GenerateQuizUseCase(vocabularyRepository, progressRepository),
      submitAnswer: new SubmitAnswerUseCase(progressRepository),
      getStats: new GetStatsUseCase(vocabularyRepository, progressRepository),
      importVocabulary: new ImportVocabularyUseCase(vocabularyRepository),
      listVocabulary: new ListVocabularyUseCase(vocabularyRepository),
      deleteVocabularyEntry: new DeleteVocabularyEntryUseCase(vocabularyRepository),
      deleteAllVocabulary: new DeleteAllVocabularyUseCase(vocabularyRepository),
      vocabularySync: syncCoordinator ? new VocabularySyncUseCase(syncCoordinator) : null,
    };
  }, []);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within a ServicesProvider");
  return ctx;
}
