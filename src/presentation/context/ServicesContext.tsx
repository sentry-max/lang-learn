import { ReactNode, createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@infrastructure/supabase/client";
import { SupabaseVocabularyRepository } from "@infrastructure/supabase/SupabaseVocabularyRepository";
import { SupabaseWordRepository } from "@infrastructure/supabase/SupabaseWordRepository";
import { SupabaseLearningRepository } from "@infrastructure/supabase/SupabaseLearningRepository";
import { SupabaseVocabularyReviewRepository } from "@infrastructure/supabase/SupabaseVocabularyReviewRepository";
import { SupabaseProfileRepository } from "@infrastructure/supabase/SupabaseProfileRepository";
import { CachingWordRepository } from "@infrastructure/cache/CachingWordRepository";
import { BrowserConnectivity } from "@infrastructure/offline/Connectivity";
import { Outbox } from "@infrastructure/offline/Outbox";
import { OfflineLearningRepository } from "@infrastructure/offline/OfflineLearningRepository";
import { OfflineVocabularyRepository } from "@infrastructure/offline/OfflineVocabularyRepository";
import { OfflineVocabularyReviewRepository } from "@infrastructure/offline/OfflineVocabularyReviewRepository";
import { OfflineSyncManager } from "@infrastructure/offline/OfflineSyncManager";
import { SyncGateway, SyncStatus } from "@application/ports/SyncGateway";
import { VocabularyService } from "@application/services/VocabularyService";
import { WordService } from "@application/services/WordService";
import { LearningHistoryService } from "@application/services/LearningHistoryService";
import { VocabularyReviewService } from "@application/services/VocabularyReviewService";
import { ProfileService } from "@application/services/ProfileService";
import { GenerateQuizUseCase } from "@application/usecases/GenerateQuizUseCase";
import { SubmitAnswerUseCase } from "@application/usecases/SubmitAnswerUseCase";
import { CompleteQuizSessionUseCase } from "@application/usecases/CompleteQuizSessionUseCase";
import { GetStatsUseCase } from "@application/usecases/GetStatsUseCase";
import { PrepareOfflineUseCase } from "@application/usecases/PrepareOfflineUseCase";
import { useCurrentUser } from "@presentation/context/AuthContext";

export interface Services {
  vocabularies: VocabularyService;
  words: WordService;
  history: LearningHistoryService;
  reviews: VocabularyReviewService;
  profiles: ProfileService;
  generateQuiz: GenerateQuizUseCase;
  submitAnswer: SubmitAnswerUseCase;
  completeQuizSession: CompleteQuizSessionUseCase;
  getStats: GetStatsUseCase;
  prepareOffline: PrepareOfflineUseCase;
  sync: SyncGateway;
  /** Starts background syncing; returns the stop function */
  startSync: () => () => void;
}

/**
 * Composition root: the only place that decides which implementations back
 * the repository ports. Supabase is the source of truth; offline decorators
 * keep loaded data usable in memory for the life of the tab and queue
 * learning writes (persisted per user) until the connection returns.
 */
export function createServices(userId: string): Services {
  const connectivity = new BrowserConnectivity();

  const vocabularyRepository = new OfflineVocabularyRepository(new SupabaseVocabularyRepository(supabase), connectivity);
  const wordRepository = new CachingWordRepository(
    new SupabaseWordRepository(supabase),
    5 * 60 * 1000,
    () => Date.now(),
    connectivity
  );
  const learningRepository = new OfflineLearningRepository(
    new SupabaseLearningRepository(supabase),
    connectivity,
    new Outbox(`lang-learn:outbox:${userId}`)
  );
  const sync = new OfflineSyncManager(connectivity, learningRepository, () => wordRepository.invalidate());

  const vocabularies = new VocabularyService(vocabularyRepository);
  return {
    vocabularies,
    words: new WordService(wordRepository, vocabularyRepository),
    history: new LearningHistoryService(learningRepository, wordRepository),
    reviews: new VocabularyReviewService(
      new OfflineVocabularyReviewRepository(new SupabaseVocabularyReviewRepository(supabase), connectivity)
    ),
    profiles: new ProfileService(new SupabaseProfileRepository(supabase)),
    generateQuiz: new GenerateQuizUseCase(vocabularies, wordRepository, learningRepository),
    submitAnswer: new SubmitAnswerUseCase(learningRepository),
    completeQuizSession: new CompleteQuizSessionUseCase(learningRepository),
    getStats: new GetStatsUseCase(vocabularies, wordRepository, learningRepository),
    prepareOffline: new PrepareOfflineUseCase(vocabularies, wordRepository, learningRepository),
    sync,
    startSync: () => sync.start(),
  };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const services = useMemo(() => createServices(user.id), [user.id]);
  const { version } = useSyncExternalStore(services.sync.subscribe, services.sync.getStatus);

  // Watch connectivity, and send anything left from an earlier offline session.
  useEffect(() => {
    const stop = services.startSync();
    void services.sync.syncNow();
    return stop;
  }, [services]);

  // Keep the quiz library, its words and progress in memory, so quizzes keep
  // working if the connection drops. Re-done after every reconnect.
  useEffect(() => {
    services.prepareOffline.execute(user.id).catch(() => {
      // Best effort: pages load (and report errors for) what they need themselves.
    });
  }, [services, user.id, version]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within a ServicesProvider");
  return ctx;
}

export function useSyncStatus(): SyncStatus {
  const { sync } = useServices();
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}
