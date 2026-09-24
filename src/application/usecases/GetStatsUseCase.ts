import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { ProgressState } from "@domain/entities/Review";
import { weaknessScore } from "@domain/services/SpacedRepetitionService";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { ProgressRepository } from "@domain/repositories/ProgressRepository";

export interface WordStat {
  entry: VocabularyEntry;
  progress: ProgressState | null;
  accuracy: number | null; // 0-1, null if never attempted
}

export interface StatsSummary {
  totalWords: number;
  wordsStarted: number;
  dueToday: number;
  overallAccuracy: number | null;
  strongestWords: WordStat[];
  weakestWords: WordStat[];
}

/**
 * Aggregates per-word progress into the strengths/weaknesses view the user
 * asked for, so the app can visibly show "you're good at X, weak at Y" and
 * feed that same weakness signal into quiz generation.
 */
export class GetStatsUseCase {
  constructor(
    private readonly vocabularyRepository: VocabularyRepository,
    private readonly progressRepository: ProgressRepository
  ) {}

  async execute(userId: string): Promise<StatsSummary> {
    const [entries, progressList] = await Promise.all([
      this.vocabularyRepository.getAll(),
      this.progressRepository.getAllProgress(userId),
    ]);

    const progressById = new Map(progressList.map((p) => [p.vocabularyEntryId, p]));
    const now = new Date();

    const attempted: WordStat[] = [];
    let totalCorrect = 0;
    let totalAttempts = 0;
    let dueToday = 0;

    for (const entry of entries) {
      const progress = progressById.get(entry.id) ?? null;
      if (!progress || progress.totalCorrect + progress.totalIncorrect === 0) continue;

      const attempts = progress.totalCorrect + progress.totalIncorrect;
      totalCorrect += progress.totalCorrect;
      totalAttempts += attempts;
      if (new Date(progress.nextReviewDate) <= now) dueToday += 1;

      attempted.push({ entry, progress, accuracy: progress.totalCorrect / attempts });
    }

    const byWeakness = [...attempted].sort(
      (a, b) => weaknessScore(b.progress!, now) - weaknessScore(a.progress!, now)
    );

    return {
      totalWords: entries.length,
      wordsStarted: attempted.length,
      dueToday,
      overallAccuracy: totalAttempts === 0 ? null : totalCorrect / totalAttempts,
      strongestWords: [...byWeakness].reverse().slice(0, 10),
      weakestWords: byWeakness.slice(0, 10),
    };
  }
}
