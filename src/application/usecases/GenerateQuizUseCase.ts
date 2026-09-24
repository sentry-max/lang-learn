import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { QuestionMode } from "@domain/entities/Review";
import { QuizSettings } from "@domain/entities/QuizSettings";
import { filterByLetterRange, selectQuizEntries } from "@domain/services/VocabularySelectionService";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { ProgressRepository } from "@domain/repositories/ProgressRepository";

export interface QuizQuestion {
  entry: VocabularyEntry;
  mode: QuestionMode;
}

export interface GenerateQuizOptions extends QuizSettings {
  userId: string;
}

/** Maps the chosen translation direction (+ sentence toggle) onto the internal question modes to cycle through. */
function resolveModes(settings: QuizSettings): QuestionMode[] {
  const directionModes: QuestionMode[] =
    settings.direction === "de_to_target"
      ? ["de_to_en"]
      : settings.direction === "target_to_de"
      ? ["en_to_de"]
      : ["de_to_en", "en_to_de"];
  return settings.includeSentenceWriting ? [...directionModes, "sentence_writing"] : directionModes;
}

/**
 * Builds a quiz session: filters vocabulary by the optional letter range,
 * then selects words using the rating-aware priority in
 * VocabularySelectionService (struggling words first, then unseen words,
 * then mastered words only if needed to fill the quota) — except in
 * single-letter mode, which includes every matching word regardless of
 * question count or prior rating.
 */
export class GenerateQuizUseCase {
  constructor(
    private readonly vocabularyRepository: VocabularyRepository,
    private readonly progressRepository: ProgressRepository
  ) {}

  async execute(options: GenerateQuizOptions): Promise<QuizQuestion[]> {
    const [entries, progressList] = await Promise.all([
      this.vocabularyRepository.getAll(),
      this.progressRepository.getAllProgress(options.userId),
    ]);

    if (entries.length === 0) return [];

    const { candidates, isSingleLetterMode } = filterByLetterRange(entries, options.letterFilter);
    if (candidates.length === 0) return [];

    const progressById = new Map(progressList.map((p) => [p.vocabularyEntryId, p]));
    const quota = isSingleLetterMode
      ? candidates.length
      : Math.min(options.questionCount, candidates.length);

    const selected = selectQuizEntries(candidates, progressById, quota, isSingleLetterMode);

    const modes = resolveModes(options);
    return selected.map((entry, index) => ({ entry, mode: modes[index % modes.length] }));
  }
}
