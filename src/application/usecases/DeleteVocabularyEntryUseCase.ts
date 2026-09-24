import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";

export class DeleteVocabularyEntryUseCase {
  constructor(private readonly vocabularyRepository: VocabularyRepository) {}

  async execute(id: string): Promise<void> {
    await this.vocabularyRepository.deleteById(id);
  }
}
