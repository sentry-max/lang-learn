import { describe, it, expect } from "vitest";
import {
  QuizCandidate,
  adaptiveWeakShare,
  bucketOf,
  chooseMode,
  selectQuizWords,
} from "@domain/services/QuizSelectionService";
import { createSeededRandomSource } from "@domain/services/Random";
import { firstLetter, filterByLetters } from "@domain/services/LetterService";
import { NOW, alphabetWords, makeProgress, makeWord } from "../../test/fixtures";

function fresh(words = alphabetWords(10)): QuizCandidate[] {
  return words.map((word) => ({ word, progress: null, askedInRound: false }));
}

function ids(candidates: QuizCandidate[]): string[] {
  return candidates.map((candidate) => candidate.word.id);
}

describe("bucketOf", () => {
  it("parks every word asked this round, whatever its rating, and splits the rest into weak and fresh", () => {
    expect(bucketOf({ progress: null, askedInRound: false })).toBe("fresh");
    expect(bucketOf({ progress: makeProgress("a", { lastRating: "very_bad" }), askedInRound: false })).toBe("weak");
    expect(bucketOf({ progress: makeProgress("a", { lastRating: "good" }), askedInRound: false })).toBe("fresh");
    for (const rating of ["very_bad", "bad", "good", "easy", "very_easy"] as const) {
      expect(bucketOf({ progress: makeProgress("a", { lastRating: rating }), askedInRound: true })).toBe("parked");
    }
  });
});

describe("selectQuizWords — randomness", () => {
  it("draws from the whole alphabet, not from the first letters", () => {
    const candidates = fresh();
    const lettersSeen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { selected } = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRandomSource(seed) });
      expect(selected).toHaveLength(10);
      selected.forEach((candidate) => lettersSeen.add(firstLetter(candidate.word.headword)));
    }
    // 200 picks over 26 letters: essentially every letter should show up.
    expect(lettersSeen.size).toBeGreaterThanOrEqual(24);
  });

  it("does not favour the start of the list", () => {
    const candidates = fresh();
    let firstHalf = 0;
    const half = new Set(ids(candidates.slice(0, candidates.length / 2)));
    for (let seed = 1; seed <= 50; seed++) {
      const { selected } = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRandomSource(seed) });
      firstHalf += selected.filter((candidate) => half.has(candidate.word.id)).length;
    }
    // 500 picks, expected ~250 in the first half.
    expect(firstHalf).toBeGreaterThan(200);
    expect(firstHalf).toBeLessThan(300);
  });

  it("picks random words within a single chosen letter", () => {
    const pool = filterByLetters(alphabetWords(30), (word) => word.headword, ["K"]);
    const candidates = fresh(pool);
    const picks = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const { selected } = selectQuizWords({ candidates, quota: 5, now: NOW, rng: createSeededRandomSource(seed) });
      expect(selected.every((candidate) => candidate.word.headword.startsWith("K"))).toBe(true);
      ids(selected).forEach((id) => picks.add(id));
    }
    expect(picks.size).toBeGreaterThan(15);
  });

  it("returns nothing for an empty pool and caps the quota at the pool size", () => {
    expect(selectQuizWords({ candidates: [], quota: 10, now: NOW, rng: createSeededRandomSource(1) }).selected).toEqual([]);
    const small = fresh(alphabetWords(1).slice(0, 3));
    expect(selectQuizWords({ candidates: small, quota: 10, now: NOW, rng: createSeededRandomSource(1) }).selected).toHaveLength(3);
  });
});

describe("selectQuizWords — rounds", () => {
  it("never asks a word again while unasked words remain", () => {
    const words = alphabetWords(2);
    const candidates: QuizCandidate[] = words.map((word, index) => ({
      word,
      progress: index < 30 ? makeProgress(word.id, { lastRating: (["very_bad", "bad", "good", "easy", "very_easy"] as const)[index % 5] }) : null,
      askedInRound: index < 30,
    }));
    const parkedIds = new Set(ids(candidates.slice(0, 30)));

    for (let seed = 1; seed <= 20; seed++) {
      const result = selectQuizWords({ candidates, quota: 20, now: NOW, rng: createSeededRandomSource(seed) });
      expect(result.cycleRestarted).toBe(false);
      expect(result.selected.some((candidate) => parkedIds.has(candidate.word.id))).toBe(false);
    }
  });

  it("starts a new round once every word has been shown, releasing parked words", () => {
    const words = alphabetWords(1);
    const candidates: QuizCandidate[] = words.map((word) => ({ word, progress: makeProgress(word.id), askedInRound: true }));
    const result = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRandomSource(3) });
    expect(result.cycleRestarted).toBe(true);
    expect(result.selected).toHaveLength(10);
  });

  it("finishes the round and continues into the next one to fill a session", () => {
    const words = alphabetWords(1).slice(0, 13);
    const candidates: QuizCandidate[] = words.map((word, index) => ({
      word,
      progress: index < 10 ? makeProgress(word.id, { lastRating: "easy" }) : null,
      askedInRound: index < 10,
    }));
    const unseen = ids(candidates.slice(10));
    const result = selectQuizWords({ candidates, quota: 8, now: NOW, rng: createSeededRandomSource(9) });
    expect(result.selected).toHaveLength(8);
    expect(result.cycleRestarted).toBe(true);
    // All 3 remaining unseen words are in the session before any released word.
    expect(unseen.every((id) => ids(result.selected).includes(id))).toBe(true);
  });

  it("does not restart the round while unasked weak words remain", () => {
    const words = alphabetWords(1).slice(0, 6);
    const candidates: QuizCandidate[] = words.map((word, index) => ({
      word,
      progress: index < 3 ? makeProgress(word.id, { lastRating: "bad" }) : makeProgress(word.id),
      askedInRound: index >= 3,
    }));
    const result = selectQuizWords({ candidates, quota: 3, now: NOW, rng: createSeededRandomSource(1) });
    expect(result.cycleRestarted).toBe(false);
    expect(ids(result.selected).sort()).toEqual(ids(candidates.slice(0, 3)).sort());
  });
});

describe("selectQuizWords — weak words", () => {
  it("always includes weak words, even when many unseen words exist", () => {
    const words = alphabetWords(4);
    const candidates: QuizCandidate[] = words.map((word, index) => ({
      word,
      progress: index < 5 ? makeProgress(word.id, { lastRating: "very_bad", totalCorrect: 0, totalIncorrect: 1 }) : null,
      askedInRound: false,
    }));
    const weakIds = new Set(ids(candidates.slice(0, 5)));
    const result = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRandomSource(5) });
    const weakPicked = result.selected.filter((candidate) => weakIds.has(candidate.word.id)).length;
    expect(weakPicked).toBeGreaterThanOrEqual(2);
    // …but leaves room for new words too.
    expect(result.selected.length - weakPicked).toBeGreaterThanOrEqual(5);
  });

  it("fills with unasked weak words when no fresh words are left", () => {
    const words = alphabetWords(1).slice(0, 10);
    const candidates: QuizCandidate[] = words.map((word, index) => ({
      word,
      progress: makeProgress(word.id, { lastRating: index < 4 ? "bad" : "good" }),
      askedInRound: index >= 4,
    }));
    const result = selectQuizWords({ candidates, quota: 4, now: NOW, rng: createSeededRandomSource(2) });
    expect(ids(result.selected).sort()).toEqual(ids(candidates.slice(0, 4)).sort());
    expect(result.cycleRestarted).toBe(false);
  });

  it("gives struggling users more review and confident users more new words", () => {
    const words = alphabetWords(2);
    const recent = new Date(NOW.getTime() - 3600 * 1000).toISOString();
    const struggling: QuizCandidate[] = words.map((word, index) => ({
      word,
      progress: index < 10 ? makeProgress(word.id, { lastRating: "very_bad", lastReviewedAt: recent }) : null,
      askedInRound: false,
    }));
    const confident: QuizCandidate[] = words.map((word, index) => ({
      word,
      progress: index < 10 ? makeProgress(word.id, { lastRating: index === 0 ? "bad" : "easy", lastReviewedAt: recent }) : null,
      askedInRound: false,
    }));
    expect(adaptiveWeakShare(struggling, 10, 10, NOW)).toBeGreaterThan(adaptiveWeakShare(confident, 1, 10, NOW));
  });
});

describe("chooseMode", () => {
  const word = makeWord("Haus");

  it("respects a fixed direction", () => {
    const randomSource = createSeededRandomSource(1);
    for (let index = 0; index < 20; index++) {
      expect(chooseMode({ word, progress: null }, { direction: "target_to_source", includeSentenceWriting: false }, randomSource)).toBe(
        "target_to_source"
      );
    }
  });

  it("never asks for a sentence about a word the user doesn't know yet", () => {
    const randomSource = createSeededRandomSource(1);
    for (let index = 0; index < 50; index++) {
      const mode = chooseMode({ word, progress: null }, { direction: "mix", includeSentenceWriting: true }, randomSource);
      expect(mode).not.toBe("sentence_writing");
      const weak = makeProgress(word.id, { lastRating: "very_bad" });
      expect(chooseMode({ word, progress: weak }, { direction: "mix", includeSentenceWriting: true }, randomSource)).not.toBe(
        "sentence_writing"
      );
    }
  });

  it("asks the direction the user struggles with more often", () => {
    const progress = makeProgress(word.id, {
      modeStats: { source_to_target: { correct: 10, incorrect: 0 }, target_to_source: { correct: 1, incorrect: 9 } },
    });
    const randomSource = createSeededRandomSource(7);
    let reverse = 0;
    for (let index = 0; index < 200; index++) {
      if (chooseMode({ word, progress }, { direction: "mix", includeSentenceWriting: false }, randomSource) === "target_to_source") {
        reverse += 1;
      }
    }
    expect(reverse).toBeGreaterThan(140);
  });
});
