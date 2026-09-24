import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";

export class DeleteAllVocabularyUseCase {
  constructor(private readonly vocabularyRepository: VocabularyRepository) {}

  async execute(): Promise<void> {
    await this.vocabularyRepository.deleteAll();
  }
}
