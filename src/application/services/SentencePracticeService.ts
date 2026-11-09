import { randomId } from "@application/util/randomId";
import { AppError } from "@domain/errors/AppError";
import { SENTENCE_EXERCISE_KINDS, SentenceExercise, SentenceExerciseKind, sentenceKey } from "@domain/entities/SentenceExercise";
import {
  MAX_SENTENCE_COUNT,
  MIN_SENTENCE_COUNT,
  SentenceAnswer,
  SentenceAttempt,
  SentencePracticeSettings,
  totalScore,
} from "@domain/entities/SentencePractice";
import { SentenceCollection } from "@domain/entities/SentenceCollection";
import { SENTENCE_LIMITS, SentenceProblem, parseSentenceInput } from "@domain/services/SentenceParser";
import { SentenceGrade, gradeAnswer } from "@domain/services/SentenceGrading";
import { SentenceInsights, analyzeSentenceAttempts } from "@domain/services/SentenceInsights";
import { SentenceCollectionService } from "@application/services/SentenceCollectionService";
import { PracticeItem, buildTiles, selectSentences } from "@domain/services/SentenceSelectionService";
import { RandomSource, defaultRandomSource } from "@domain/services/Random";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { SentenceExerciseRepository } from "@domain/repositories/SentenceExerciseRepository";

export interface SentenceImportResult {
  importedCount: number;
  updatedCount: number;
  errors: SentenceProblem[];
  /** Sentences skipped because the collection already has them */
  duplicateSentences: string[];
}

export interface SentenceKindStats {
  attemptCount: number;
  /** All errors against all allowed errors; null before the first attempt */
  score: number | null;
}

/** One answered sentence for the history, with its exercise and grade when the exercise is still available. */
export interface SentenceHistoryEntry {
  attempt: SentenceAttempt;
  exercise: SentenceExercise | null;
  grade: SentenceGrade | null;
}

export interface SentenceAnswerInput {
  userId: string;
  sessionId: string;
  item: PracticeItem;
  settings: SentencePracticeSettings;
  answer: SentenceAnswer;
  timedOut: boolean;
  shownAt: Date;
  answeredAt: Date;
}

/** Importing sentence exercises, choosing them for practice, grading and recording answers. */
export class SentencePracticeService {
  constructor(
    private readonly exercises: SentenceExerciseRepository,
    private readonly learning: LearningRepository,
    private readonly collections: SentenceCollectionService,
    private readonly randomSource: RandomSource = defaultRandomSource,
    private readonly clock: () => Date = () => new Date()
  ) {}

  listByCollections(collectionIds: string[]): Promise<SentenceExercise[]> {
    return collectionIds.length > 0 ? this.exercises.listByCollections(collectionIds) : Promise.resolve([]);
  }

  /** A new practice run: its id and items, chosen from what the user's attempts say they need most. */
  async start(userId: string, settings: SentencePracticeSettings): Promise<{ sessionId: string; items: PracticeItem[] }> {
    const [exercises, attempts] = await Promise.all([this.listByCollections(settings.collectionIds), this.learning.getSentenceAttempts(userId)]);
    const pool = exercises.filter((exercise) => exercise.content.kind === settings.kind);
    const count = Math.min(MAX_SENTENCE_COUNT, Math.max(MIN_SENTENCE_COUNT, Math.round(settings.sentenceCount)));
    const chosen = selectSentences({ exercises: pool, attempts, count, now: this.clock(), randomSource: this.randomSource });
    const items = chosen.map((exercise, index) => ({
      key: `${exercise.id}:${index}`,
      exercise,
      tiles: buildTiles(exercise, settings.includeDistractors, this.randomSource),
    }));
    return { sessionId: randomId(), items };
  }

  /** Grades the answer and records it (through the offline outbox), returning the grade to show and the attempt. */
  async submit(input: SentenceAnswerInput): Promise<{ grade: SentenceGrade; attempt: SentenceAttempt }> {
    const grade = gradeAnswer(input.item.exercise.content, input.answer, { tolerateTypos: input.settings.tolerateTypos });
    const attempt: SentenceAttempt = {
      id: randomId(),
      exerciseId: input.item.exercise.id,
      sessionId: input.sessionId,
      kind: input.item.exercise.content.kind,
      timerMode: input.settings.timerMode,
      errorCount: grade.errorCount,
      maxErrors: grade.maxErrors,
      timedOut: input.timedOut,
      answer: input.answer,
      shownAt: input.shownAt.toISOString(),
      answeredAt: input.answeredAt.toISOString(),
      responseMs: Math.max(0, input.answeredAt.getTime() - input.shownAt.getTime()),
    };
    await this.learning.recordSentenceAttempt(input.userId, attempt);
    return { grade, attempt };
  }

  /** Every answered sentence, newest first. */
  async history(userId: string): Promise<SentenceHistoryEntry[]> {
    const [attempts, exercises] = await Promise.all([this.learning.getSentenceAttempts(userId), this.libraryExercises(userId)]);
    const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    return [...attempts]
      .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt))
      .map((attempt) => {
        const exercise = exercisesById.get(attempt.exerciseId) ?? null;
        const grade = exercise && exercise.content.kind === attempt.answer.kind ? gradeAnswer(exercise.content, attempt.answer) : null;
        return { attempt, exercise, grade };
      });
  }

  async insights(userId: string): Promise<SentenceInsights> {
    const [attempts, exercises] = await Promise.all([this.learning.getSentenceAttempts(userId), this.libraryExercises(userId)]);
    return analyzeSentenceAttempts(attempts, exercises, this.clock());
  }

  private async libraryExercises(userId: string): Promise<SentenceExercise[]> {
    const library = await this.collections.listLibrary(userId);
    return this.listByCollections(library.map((collection) => collection.id));
  }

  async statsByKind(userId: string): Promise<Record<SentenceExerciseKind, SentenceKindStats>> {
    const attempts = await this.learning.getSentenceAttempts(userId);
    const statsEntries = SENTENCE_EXERCISE_KINDS.map((kind) => {
      const ofKind = attempts.filter((attempt) => attempt.kind === kind);
      return [kind, { attemptCount: ofKind.length, score: totalScore(ofKind) }] as const;
    });
    return Object.fromEntries(statsEntries) as Record<SentenceExerciseKind, SentenceKindStats>;
  }

  /**
   * Imports a parsed JSON array into one collection. An entry whose "id" matches an exercise already imported
   * updates it; a different entry with the same kind and sentence is skipped as a duplicate.
   */
  async importExercises(userId: string, collection: SentenceCollection, rawEntries: unknown): Promise<SentenceImportResult> {
    if (collection.ownerId !== userId) throw new AppError("forbidden", "Only the owner can change this collection's sentences.");
    const result: SentenceImportResult = { importedCount: 0, updatedCount: 0, errors: [], duplicateSentences: [] };
    if (!Array.isArray(rawEntries)) {
      result.errors.push({ code: "fileNotAnArray", entryNumber: null, sentence: null });
      return result;
    }

    const existing = await this.exercises.listByCollections([collection.id]);
    const byExternalId = new Map(existing.filter((exercise) => exercise.externalId).map((exercise) => [exercise.externalId!, exercise]));
    const byKey = new Map(existing.map((exercise) => [sentenceKey(exercise), exercise]));
    let capacity = SENTENCE_LIMITS.perCollection - existing.length;
    const toSave = new Map<string, SentenceExercise>();

    rawEntries.forEach((raw, index) => {
      const parsed = parseSentenceInput(raw, index);
      if (!parsed.ok) {
        result.errors.push(...parsed.errors);
        return;
      }
      const draft = parsed.exercise;
      const key = sentenceKey(draft);
      const sameId = draft.externalId ? byExternalId.get(draft.externalId) : undefined;
      const sameKey = byKey.get(key);
      if (sameKey && sameKey !== sameId) {
        result.duplicateSentences.push(draft.content.sentence);
        return;
      }
      if (!sameId && capacity <= 0) {
        const detail = String(SENTENCE_LIMITS.perCollection);
        result.errors.push({ code: "collectionFull", entryNumber: index + 1, sentence: draft.content.sentence, detail });
        return;
      }

      const exercise: SentenceExercise = { ...draft, id: sameId?.id ?? randomId(), collectionId: collection.id };
      if (sameId) {
        byKey.delete(sentenceKey(sameId));
        result.updatedCount += 1;
      } else {
        capacity -= 1;
        result.importedCount += 1;
      }
      byKey.set(key, exercise);
      if (exercise.externalId) byExternalId.set(exercise.externalId, exercise);
      toSave.set(exercise.id, exercise);
    });

    if (toSave.size > 0) await this.exercises.saveMany(Array.from(toSave.values()));
    return result;
  }
}
