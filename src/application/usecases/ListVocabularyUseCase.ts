import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";

export class ListVocabularyUseCase {
  constructor(private readonly vocabularyRepository: VocabularyRepository) {}

  async execute(): Promise<VocabularyEntry[]> {
    return this.vocabularyRepository.getAll();
  }
}
