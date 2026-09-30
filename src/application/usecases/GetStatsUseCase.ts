import { VocabularyService } from "@application/services/VocabularyService";
import { DifficultyRating, WordProgress, accuracyOf } from "@domain/entities/Learning";
import { Word } from "@domain/entities/Word";
import { bucketOf } from "@domain/services/QuizSelectionService";
import { isDue, weaknessScore } from "@domain/services/SpacedRepetitionService";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { WordRepository } from "@domain/repositories/WordRepository";

export interface WordStat {
  word: Word;
  progress: WordProgress;
  accuracy: number | null;
}

export interface StatsSummary {
  totalWords: number;
  wordsStarted: number;
  dueToday: number;
  overallAccuracy: number | null;
  /** Words shown in the current round, out of all quiz words */
  seenThisRound: number;
  byLastRating: Record<DifficultyRating, number>;
  strongestWords: WordStat[];
  weakestWords: WordStat[];
}

/** Aggregates learned progress over the user's quiz library for the dashboard. */
export class GetStatsUseCase {
  constructor(
    private readonly vocabularyService: VocabularyService,
    private readonly words: WordRepository,
    private readonly learning: LearningRepository
  ) {}

  async execute(userId: string, now: Date = new Date()): Promise<StatsSummary> {
    const library = await this.vocabularyService.listQuizLibrary(userId);
    const [words, progressList] = await Promise.all([
      this.words.listByVocabularies(library.map((v) => v.id)),
      this.learning.getAllProgress(userId),
    ]);
    const progressById = new Map(progressList.map((p) => [p.wordId, p]));

    const byLastRating: Record<DifficultyRating, number> = { very_easy: 0, easy: 0, good: 0, bad: 0, very_bad: 0 };
    const attempted: WordStat[] = [];
    let totalCorrect = 0;
    let totalAttempts = 0;
    let dueToday = 0;
    let seenThisRound = 0;

    for (const word of words) {
      const progress = progressById.get(word.id);
      if (!progress || progress.timesSeen === 0) continue;
      if (bucketOf(progress) !== "fresh") seenThisRound += 1;
      if (progress.lastRating) byLastRating[progress.lastRating] += 1;
      totalCorrect += progress.totalCorrect;
      totalAttempts += progress.totalCorrect + progress.totalIncorrect;
      if (isDue(progress, now)) dueToday += 1;
      attempted.push({ word, progress, accuracy: accuracyOf(progress) });
    }

    const byWeakness = [...attempted].sort((a, b) => weaknessScore(b.progress, now) - weaknessScore(a.progress, now));

    return {
      totalWords: words.length,
      wordsStarted: attempted.length,
      dueToday,
      overallAccuracy: totalAttempts === 0 ? null : totalCorrect / totalAttempts,
      seenThisRound,
      byLastRating,
      strongestWords: [...byWeakness].reverse().slice(0, 10),
      weakestWords: byWeakness.slice(0, 10),
    };
  }
}
