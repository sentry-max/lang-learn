import { LearningRepository } from "@domain/repositories/LearningRepository";

export class CompleteQuizSessionUseCase {
  constructor(private readonly learning: LearningRepository) {}

  execute(userId: string, sessionId: string): Promise<void> {
    return this.learning.completeSession(userId, sessionId);
  }
}
