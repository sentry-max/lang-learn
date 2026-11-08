import { randomId } from "@application/util/randomId";
import { VocabularyService } from "@application/services/VocabularyService";
import { LanguageCode } from "@domain/entities/Language";
import { QuestionMode, WordProgress } from "@domain/entities/Learning";
import { QuizSettings, collectionKeyOf, questionQuota } from "@domain/entities/QuizSettings";
import { filterByLetters } from "@domain/services/LetterService";
import { ChoiceAnswer, choiceAnswerOf, pickChoiceOptions } from "@domain/services/MultipleChoiceService";
import { QuizCandidate, chooseMode, selectQuizWords } from "@domain/services/QuizSelectionService";
import { QuizItem } from "@domain/services/QuizSession";
import { RandomSource, defaultRandomSource } from "@domain/services/Random";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { WordRepository } from "@domain/repositories/WordRepository";
import { Word } from "@domain/entities/Word";

export interface GeneratedQuiz {
  sessionId: string | null;
  items: QuizItem[];
  /** Latest known progress per word in the quiz (null = never seen) */
  progressByWordId: Map<string, WordProgress | null>;
  /** This quiz completed a round over the pool and started a new one */
  cycleRestarted: boolean;
  /** Words matching the chosen vocabularies and letters */
  poolSize: number;
}

/**
 * Builds a quiz session from the chosen published/downloaded vocabularies
 * (optionally narrowed to some starting letters) using the adaptive
 * selection in QuizSelectionService, then records the session.
 */
export class GenerateQuizUseCase {
  constructor(
    private readonly vocabularyService: VocabularyService,
    private readonly words: WordRepository,
    private readonly learning: LearningRepository,
    private readonly randomSource: RandomSource = defaultRandomSource,
    private readonly clock: () => Date = () => new Date()
  ) {}

  /** `primaryLanguage` is the language translations are shown in, needed for multiple-choice options. */
  async execute(userId: string, settings: QuizSettings, primaryLanguage: LanguageCode): Promise<GeneratedQuiz> {
    const library = await this.vocabularyService.listQuizLibrary(userId);
    const wanted = new Set(settings.vocabularyIds);
    const chosen = wanted.size > 0 ? library.filter((vocabulary) => wanted.has(vocabulary.id)) : library;
    if (chosen.length === 0) return emptyQuiz();

    const collectionKey = collectionKeyOf(settings.letters);
    const [words, progressList, askedWordIds] = await Promise.all([
      this.words.listByVocabularies(chosen.map((vocabulary) => vocabulary.id)),
      this.learning.getAllProgress(userId),
      this.learning.getAskedInRound(userId, collectionKey),
    ]);

    const pool = filterByLetters(words, (word) => word.headword, settings.letters);
    if (pool.length === 0) return emptyQuiz();

    const progressById = new Map(progressList.map((progress) => [progress.wordId, progress]));
    const asked = new Set(askedWordIds);
    const candidates: QuizCandidate[] = pool.map((word) => ({
      word,
      progress: progressById.get(word.id) ?? null,
      askedInRound: asked.has(word.id),
    }));

    const now = this.clock();
    const selection = selectQuizWords({
      candidates,
      quota: questionQuota(settings, pool.length),
      now,
      rng: this.randomSource,
    });
    if (selection.cycleRestarted) await this.learning.startRound(userId, collectionKey, now.toISOString());

    const languageByVocabulary = new Map(chosen.map((vocabulary) => [vocabulary.id, vocabulary.sourceLanguage]));
    const isMultipleChoice = settings.answerFormat === "multiple_choice";
    // A written sentence has no options to pick from.
    const modeOptions = { ...settings, includeSentenceWriting: settings.includeSentenceWriting && !isMultipleChoice };
    const dictionary = isMultipleChoice ? new ChoiceDictionary(words, languageByVocabulary, primaryLanguage) : null;
    const items: QuizItem[] = selection.selected.map((candidate, index) => {
      const sourceLanguage = languageByVocabulary.get(candidate.word.vocabularyId)!;
      const mode = chooseMode(candidate, modeOptions, this.randomSource);
      return {
        key: `${candidate.word.id}:${index}`,
        word: candidate.word,
        sourceLanguage,
        mode,
        attempt: 0,
        choices: dictionary?.optionsFor(candidate.word, mode, sourceLanguage, this.randomSource) ?? null,
      };
    });

    const sessionId = randomId();
    await this.learning.startSession(userId, {
      id: sessionId,
      settings,
      vocabularyIds: chosen.map((vocabulary) => vocabulary.id),
      plannedCount: items.length,
      cycleRestarted: selection.cycleRestarted,
      startedAt: now.toISOString(),
    });

    return {
      sessionId,
      items,
      progressByWordId: new Map(items.map((item) => [item.word.id, progressById.get(item.word.id) ?? null])),
      cycleRestarted: selection.cycleRestarted,
      poolSize: pool.length,
    };
  }
}

/** Every word of the chosen vocabularies as a possible answer, worked out once per direction. */
class ChoiceDictionary {
  private readonly answersByMode = new Map<QuestionMode, ChoiceAnswer[]>();

  constructor(
    private readonly words: readonly Word[],
    private readonly languageByVocabulary: Map<string, LanguageCode>,
    private readonly primaryLanguage: LanguageCode
  ) {}

  optionsFor(word: Word, mode: QuestionMode, sourceLanguage: LanguageCode, randomSource: RandomSource) {
    const correct = choiceAnswerOf(word, mode, sourceLanguage, this.primaryLanguage);
    return correct ? pickChoiceOptions(correct, this.answersFor(mode), randomSource) : null;
  }

  private answersFor(mode: QuestionMode): ChoiceAnswer[] {
    let answers = this.answersByMode.get(mode);
    if (!answers) {
      answers = this.words.flatMap((word) => {
        const answer = choiceAnswerOf(word, mode, this.languageByVocabulary.get(word.vocabularyId)!, this.primaryLanguage);
        return answer ? [answer] : [];
      });
      this.answersByMode.set(mode, answers);
    }
    return answers;
  }
}

function emptyQuiz(): GeneratedQuiz {
  return { sessionId: null, items: [], progressByWordId: new Map(), cycleRestarted: false, poolSize: 0 };
}
