import { DifficultyRating, ReviewEvent, WordProgress } from "@domain/entities/Learning";
import { Word } from "@domain/entities/Word";
import { countByLetter, firstLetter } from "@domain/services/LetterService";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { WordRepository } from "@domain/repositories/WordRepository";

export interface HistoryWord {
  wordId: string;
  /** null when the word is no longer readable (e.g. its vocabulary was unpublished) */
  word: Word | null;
  letter: string;
  progress: WordProgress;
}

export interface HistoryOverview {
  words: HistoryWord[];
  letters: { letter: string; count: number }[];
}

const UNAVAILABLE_LETTER = "?";

/** The History tab: every word the user has seen, grouped by letter, with resets. */
export class LearningHistoryService {
  constructor(
    private readonly learning: LearningRepository,
    private readonly words: WordRepository
  ) {}

  async getOverview(userId: string): Promise<HistoryOverview> {
    const progress = (await this.learning.getAllProgress(userId)).filter((progress) => progress.timesSeen > 0);
    const words = await this.words.getByIds(progress.map((progress) => progress.wordId));
    const wordById = new Map(words.map((word) => [word.id, word]));

    const entries: HistoryWord[] = progress.map((progress) => {
      const word = wordById.get(progress.wordId) ?? null;
      return { wordId: progress.wordId, word, letter: word ? firstLetter(word.headword) : UNAVAILABLE_LETTER, progress: progress };
    });
    entries.sort((a, b) => (a.word?.headword ?? "").localeCompare(b.word?.headword ?? ""));

    return { words: entries, letters: countByLetter(entries, (entry) => (entry.word ? entry.word.headword : UNAVAILABLE_LETTER)) };
  }

  /** Answer history per word, newest first. */
  async getEvents(userId: string, wordIds: string[]): Promise<Map<string, ReviewEvent[]>> {
    const events = await this.learning.getEvents(userId, wordIds);
    const byWord = new Map<string, ReviewEvent[]>();
    for (const event of events) {
      const list = byWord.get(event.wordId) ?? [];
      list.push(event);
      byWord.set(event.wordId, list);
    }
    for (const list of byWord.values()) list.sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
    return byWord;
  }

  resetAll(userId: string): Promise<number> {
    return this.learning.resetProgress(userId, null);
  }

  async resetWords(userId: string, wordIds: string[]): Promise<number> {
    if (wordIds.length === 0) return 0;
    return this.learning.resetProgress(userId, wordIds);
  }
}

export function wordIdsForLetter(overview: HistoryOverview, letter: string): string[] {
  return overview.words.filter((entry) => entry.letter === letter).map((entry) => entry.wordId);
}

/** Words whose most recent answer was `rating`, optionally only under one letter. */
export function wordIdsForRating(overview: HistoryOverview, rating: DifficultyRating, letter?: string): string[] {
  return overview.words
    .filter((entry) => entry.progress.lastRating === rating && (letter === undefined || entry.letter === letter))
    .map((entry) => entry.wordId);
}
