import { VocabularyService } from "@application/services/VocabularyService";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { WordRepository } from "@domain/repositories/WordRepository";

/**
 * Loads everything a quiz needs — the quiz library, all its words and the
 * user's progress — so it's already in memory if the connection drops.
 */
export class PrepareOfflineUseCase {
  constructor(
    private readonly vocabularyService: VocabularyService,
    private readonly words: WordRepository,
    private readonly learning: LearningRepository
  ) {}

  async execute(userId: string): Promise<void> {
    const [library] = await Promise.all([
      this.vocabularyService.listQuizLibrary(userId),
      this.learning.getAllProgress(userId),
    ]);
    if (library.length > 0) await this.words.listByVocabularies(library.map((v) => v.id));
  }
}
