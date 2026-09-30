import { randomId } from "@application/util/randomId";
import {
  DifficultyRating,
  QuestionMode,
  ReviewEvent,
  WordProgress,
  createInitialProgress,
} from "@domain/entities/Learning";
import { scheduleNextReview } from "@domain/services/SpacedRepetitionService";
import { LearningRepository } from "@domain/repositories/LearningRepository";

export interface SubmitAnswerInput {
  userId: string;
  sessionId: string | null;
  wordId: string;
  mode: QuestionMode;
  rating: DifficultyRating;
  shownAt: Date;
  answeredAt: Date;
  /**
   * The word's latest known progress, if the caller already has it (the
   * quiz does). `undefined` means "unknown — load it".
   */
  previous?: WordProgress | null;
}

/**
 * Records one answer: recalculates the word's learning state (including
 * how long the user took) and stores it together with the answer event.
 * Returns the new state so the caller can keep its copy current.
 */
export class SubmitAnswerUseCase {
  constructor(private readonly learning: LearningRepository) {}

  async execute(input: SubmitAnswerInput): Promise<WordProgress> {
    const current =
      input.previous !== undefined ? input.previous : await this.learning.getProgress(input.userId, input.wordId);
    const base = current ?? createInitialProgress(input.wordId, input.answeredAt);

    const responseMs = Math.max(0, input.answeredAt.getTime() - input.shownAt.getTime());
    const updated = scheduleNextReview(base, { rating: input.rating, mode: input.mode, responseMs }, input.answeredAt);

    const event: ReviewEvent = {
      id: randomId(),
      wordId: input.wordId,
      sessionId: input.sessionId,
      mode: input.mode,
      rating: input.rating,
      shownAt: input.shownAt.toISOString(),
      answeredAt: input.answeredAt.toISOString(),
      responseMs,
    };
    await this.learning.recordReview(input.userId, event, updated);
    return updated;
  }
}
