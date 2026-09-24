import { randomId } from "@application/util/randomId";
import { DifficultyRating, QuestionMode, ReviewRecord, createInitialProgress } from "@domain/entities/Review";
import { scheduleNextReview } from "@domain/services/SpacedRepetitionService";
import { ProgressRepository } from "@domain/repositories/ProgressRepository";

export interface SubmitAnswerInput {
  userId: string;
  vocabularyEntryId: string;
  mode: QuestionMode;
  userAnswer: string | null;
  /** System-graded correctness for de_to_en / en_to_de; null for sentence_writing (self-rated only) */
  wasCorrect: boolean | null;
  difficultyRating: DifficultyRating;
}

/**
 * Records a single answered question: stores the review record and
 * advances the word's spaced-repetition schedule based on the user's
 * own difficulty rating.
 */
export class SubmitAnswerUseCase {
  constructor(private readonly progressRepository: ProgressRepository) {}

  async execute(input: SubmitAnswerInput): Promise<void> {
    const record: ReviewRecord = {
      id: randomId(),
      vocabularyEntryId: input.vocabularyEntryId,
      mode: input.mode,
      userAnswer: input.userAnswer,
      wasCorrect: input.wasCorrect,
      difficultyRating: input.difficultyRating,
      answeredAt: new Date().toISOString(),
    };
    await this.progressRepository.addReviewRecord(input.userId, record);

    const current =
      (await this.progressRepository.getProgress(input.userId, input.vocabularyEntryId)) ??
      createInitialProgress(input.vocabularyEntryId);

    const updated = scheduleNextReview(current, input.difficultyRating);
    await this.progressRepository.saveProgress(input.userId, updated);
  }
}
