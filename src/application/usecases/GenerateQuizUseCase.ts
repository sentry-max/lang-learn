import { randomId } from "@application/util/randomId";
import { VocabularyService } from "@application/services/VocabularyService";
import { WordProgress } from "@domain/entities/Learning";
import { QuizSettings, clampQuestionCount } from "@domain/entities/QuizSettings";
import { filterByLetters } from "@domain/services/LetterService";
import { QuizCandidate, chooseMode, selectQuizWords } from "@domain/services/QuizSelectionService";
import { QuizItem } from "@domain/services/QuizSession";
import { Rng, defaultRng } from "@domain/services/Random";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { WordRepository } from "@domain/repositories/WordRepository";

export interface GeneratedQuiz {
  sessionId: string | null;
  items: QuizItem[];
  /** Latest known progress per word in the quiz (null = never seen) */
  progressByWordId: Map<string, WordProgress | null>;
  /** This quiz completed a round over the pool and started a new one */
  cycleRestarted: boolean;
  /** Words matching the chosen vocabularies and letters */
  poolSize: number;
}

/**
 * Builds a quiz session from the chosen published/downloaded vocabularies
 * (optionally narrowed to some starting letters) using the adaptive
 * selection in QuizSelectionService, then records the session.
 */
export class GenerateQuizUseCase {
  constructor(
    private readonly vocabularyService: VocabularyService,
    private readonly words: WordRepository,
    private readonly learning: LearningRepository,
    private readonly rng: Rng = defaultRng,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async execute(userId: string, settings: QuizSettings): Promise<GeneratedQuiz> {
    const library = await this.vocabularyService.listQuizLibrary(userId);
    const wanted = new Set(settings.vocabularyIds);
    const chosen = wanted.size > 0 ? library.filter((v) => wanted.has(v.id)) : library;
    if (chosen.length === 0) return emptyQuiz();

    const [words, progressList] = await Promise.all([
      this.words.listByVocabularies(chosen.map((v) => v.id)),
      this.learning.getAllProgress(userId),
    ]);

    const pool = filterByLetters(words, (w) => w.headword, settings.letters);
    if (pool.length === 0) return emptyQuiz();

    const progressById = new Map(progressList.map((p) => [p.wordId, p]));
    const candidates: QuizCandidate[] = pool.map((word) => ({ word, progress: progressById.get(word.id) ?? null }));

    const now = this.clock();
    const selection = selectQuizWords({
      candidates,
      quota: clampQuestionCount(settings.questionCount),
      now,
      rng: this.rng,
    });

    if (selection.releasedWordIds.length > 0) {
      await this.learning.restartCycle(userId, selection.releasedWordIds);
      for (const id of selection.releasedWordIds) {
        const progress = progressById.get(id);
        if (progress) progressById.set(id, { ...progress, seenInCycle: false });
      }
    }

    const languageByVocabulary = new Map(chosen.map((v) => [v.id, v.sourceLanguage]));
    const items: QuizItem[] = selection.selected.map((candidate, index) => ({
      key: `${candidate.word.id}:${index}`,
      word: candidate.word,
      sourceLanguage: languageByVocabulary.get(candidate.word.vocabularyId)!,
      mode: chooseMode(candidate, settings, this.rng),
      attempt: 0,
    }));

    const sessionId = randomId();
    await this.learning.startSession(userId, {
      id: sessionId,
      settings,
      vocabularyIds: chosen.map((v) => v.id),
      plannedCount: items.length,
      cycleRestarted: selection.cycleRestarted,
      startedAt: now.toISOString(),
    });

    return {
      sessionId,
      items,
      progressByWordId: new Map(items.map((item) => [item.word.id, progressById.get(item.word.id) ?? null])),
      cycleRestarted: selection.cycleRestarted,
      poolSize: pool.length,
    };
  }
}

function emptyQuiz(): GeneratedQuiz {
  return { sessionId: null, items: [], progressByWordId: new Map(), cycleRestarted: false, poolSize: 0 };
}
