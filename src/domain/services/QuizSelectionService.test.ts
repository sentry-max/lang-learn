import { describe, it, expect } from "vitest";
import {
  QuizCandidate,
  adaptiveWeakShare,
  bucketOf,
  chooseMode,
  selectQuizWords,
} from "@domain/services/QuizSelectionService";
import { createSeededRng } from "@domain/services/Random";
import { firstLetter, filterByLetters } from "@domain/services/LetterService";
import { NOW, alphabetWords, makeProgress, makeWord } from "../../test/fixtures";

function fresh(words = alphabetWords(10)): QuizCandidate[] {
  return words.map((word) => ({ word, progress: null }));
}

function ids(candidates: QuizCandidate[]): string[] {
  return candidates.map((c) => c.word.id);
}

describe("bucketOf", () => {
  it("classifies never-seen, weak, parked and released words", () => {
    expect(bucketOf(null)).toBe("fresh");
    expect(bucketOf(makeProgress("a", { lastRating: "very_bad" }))).toBe("weak");
    expect(bucketOf(makeProgress("a", { lastRating: "bad", seenInCycle: false }))).toBe("weak");
    for (const rating of ["good", "easy", "very_easy"] as const) {
      expect(bucketOf(makeProgress("a", { lastRating: rating, seenInCycle: true }))).toBe("parked");
      expect(bucketOf(makeProgress("a", { lastRating: rating, seenInCycle: false }))).toBe("fresh");
    }
  });
});

describe("selectQuizWords — randomness", () => {
  it("draws from the whole alphabet, not from the first letters", () => {
    const candidates = fresh();
    const lettersSeen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { selected } = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRng(seed) });
      expect(selected).toHaveLength(10);
      selected.forEach((c) => lettersSeen.add(firstLetter(c.word.headword)));
    }
    // 200 picks over 26 letters: essentially every letter should show up.
    expect(lettersSeen.size).toBeGreaterThanOrEqual(24);
  });

  it("does not favour the start of the list", () => {
    const candidates = fresh();
    let firstHalf = 0;
    const half = new Set(ids(candidates.slice(0, candidates.length / 2)));
    for (let seed = 1; seed <= 50; seed++) {
      const { selected } = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRng(seed) });
      firstHalf += selected.filter((c) => half.has(c.word.id)).length;
    }
    // 500 picks, expected ~250 in the first half.
    expect(firstHalf).toBeGreaterThan(200);
    expect(firstHalf).toBeLessThan(300);
  });

  it("picks random words within a single chosen letter", () => {
    const pool = filterByLetters(alphabetWords(30), (w) => w.headword, ["K"]);
    const candidates = fresh(pool);
    const picks = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const { selected } = selectQuizWords({ candidates, quota: 5, now: NOW, rng: createSeededRng(seed) });
      expect(selected.every((c) => c.word.headword.startsWith("K"))).toBe(true);
      ids(selected).forEach((id) => picks.add(id));
    }
    expect(picks.size).toBeGreaterThan(15);
  });

  it("returns nothing for an empty pool and caps the quota at the pool size", () => {
    expect(selectQuizWords({ candidates: [], quota: 10, now: NOW, rng: createSeededRng(1) }).selected).toEqual([]);
    const small = fresh(alphabetWords(1).slice(0, 3));
    expect(selectQuizWords({ candidates: small, quota: 10, now: NOW, rng: createSeededRng(1) }).selected).toHaveLength(3);
  });
});

describe("selectQuizWords — rounds", () => {
  it("never shows good/easy/very easy words again while unseen words remain", () => {
    const words = alphabetWords(2);
    const candidates: QuizCandidate[] = words.map((word, i) => ({
      word,
      progress: i < 30 ? makeProgress(word.id, { lastRating: (["good", "easy", "very_easy"] as const)[i % 3] }) : null,
    }));
    const parkedIds = new Set(ids(candidates.slice(0, 30)));

    for (let seed = 1; seed <= 20; seed++) {
      const result = selectQuizWords({ candidates, quota: 20, now: NOW, rng: createSeededRng(seed) });
      expect(result.cycleRestarted).toBe(false);
      expect(result.selected.some((c) => parkedIds.has(c.word.id))).toBe(false);
    }
  });

  it("starts a new round once every word has been shown, releasing parked words", () => {
    const words = alphabetWords(1);
    const candidates: QuizCandidate[] = words.map((word) => ({ word, progress: makeProgress(word.id) }));
    const result = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRng(3) });
    expect(result.cycleRestarted).toBe(true);
    expect(result.selected).toHaveLength(10);
    expect(new Set(result.releasedWordIds)).toEqual(new Set(ids(candidates)));
  });

  it("finishes the round and continues into the next one to fill a session", () => {
    const words = alphabetWords(1).slice(0, 13);
    const candidates: QuizCandidate[] = words.map((word, i) => ({
      word,
      progress: i < 10 ? makeProgress(word.id, { lastRating: "easy" }) : null,
    }));
    const unseen = ids(candidates.slice(10));
    const result = selectQuizWords({ candidates, quota: 8, now: NOW, rng: createSeededRng(9) });
    expect(result.selected).toHaveLength(8);
    expect(result.cycleRestarted).toBe(true);
    // All 3 remaining unseen words are in the session before any released word.
    expect(unseen.every((id) => ids(result.selected).includes(id))).toBe(true);
    expect(result.releasedWordIds).toHaveLength(10);
  });

  it("does not restart the round when only weak words remain alongside unseen ones", () => {
    const words = alphabetWords(1).slice(0, 6);
    const candidates: QuizCandidate[] = words.map((word, i) => ({
      word,
      progress: i < 3 ? makeProgress(word.id, { lastRating: "bad" }) : null,
    }));
    const result = selectQuizWords({ candidates, quota: 6, now: NOW, rng: createSeededRng(1) });
    expect(result.cycleRestarted).toBe(false);
    expect(result.selected).toHaveLength(6);
  });
});

describe("selectQuizWords — weak words", () => {
  it("always includes weak words, even when many unseen words exist", () => {
    const words = alphabetWords(4);
    const candidates: QuizCandidate[] = words.map((word, i) => ({
      word,
      progress: i < 5 ? makeProgress(word.id, { lastRating: "very_bad", totalCorrect: 0, totalIncorrect: 1 }) : null,
    }));
    const weakIds = new Set(ids(candidates.slice(0, 5)));
    const result = selectQuizWords({ candidates, quota: 10, now: NOW, rng: createSeededRng(5) });
    const weakPicked = result.selected.filter((c) => weakIds.has(c.word.id)).length;
    expect(weakPicked).toBeGreaterThanOrEqual(2);
    // …but leaves room for new words too.
    expect(result.selected.length - weakPicked).toBeGreaterThanOrEqual(5);
  });

  it("fills with weak words when no unseen words are left", () => {
    const words = alphabetWords(1).slice(0, 10);
    const candidates: QuizCandidate[] = words.map((word, i) => ({
      word,
      progress: makeProgress(word.id, { lastRating: i < 4 ? "bad" : "good" }),
    }));
    const result = selectQuizWords({ candidates, quota: 4, now: NOW, rng: createSeededRng(2) });
    // No fresh words -> round restarts; weak words still get their share.
    expect(result.selected).toHaveLength(4);
  });

  it("gives struggling users more review and confident users more new words", () => {
    const words = alphabetWords(2);
    const recent = new Date(NOW.getTime() - 3600 * 1000).toISOString();
    const struggling: QuizCandidate[] = words.map((word, i) => ({
      word,
      progress: i < 10 ? makeProgress(word.id, { lastRating: "very_bad", lastReviewedAt: recent }) : null,
    }));
    const confident: QuizCandidate[] = words.map((word, i) => ({
      word,
      progress: i < 10 ? makeProgress(word.id, { lastRating: i === 0 ? "bad" : "easy", lastReviewedAt: recent }) : null,
    }));
    expect(adaptiveWeakShare(struggling, 10, 10, NOW)).toBeGreaterThan(adaptiveWeakShare(confident, 1, 10, NOW));
  });
});

describe("chooseMode", () => {
  const word = makeWord("Haus");

  it("respects a fixed direction", () => {
    const rng = createSeededRng(1);
    for (let i = 0; i < 20; i++) {
      expect(chooseMode({ word, progress: null }, { direction: "target_to_source", includeSentenceWriting: false }, rng)).toBe(
        "target_to_source"
      );
    }
  });

  it("never asks for a sentence about a word the user doesn't know yet", () => {
    const rng = createSeededRng(1);
    for (let i = 0; i < 50; i++) {
      const mode = chooseMode({ word, progress: null }, { direction: "mix", includeSentenceWriting: true }, rng);
      expect(mode).not.toBe("sentence_writing");
      const weak = makeProgress(word.id, { lastRating: "very_bad" });
      expect(chooseMode({ word, progress: weak }, { direction: "mix", includeSentenceWriting: true }, rng)).not.toBe(
        "sentence_writing"
      );
    }
  });

  it("asks the direction the user struggles with more often", () => {
    const progress = makeProgress(word.id, {
      modeStats: { source_to_target: { correct: 10, incorrect: 0 }, target_to_source: { correct: 1, incorrect: 9 } },
    });
    const rng = createSeededRng(7);
    let reverse = 0;
    for (let i = 0; i < 200; i++) {
      if (chooseMode({ word, progress }, { direction: "mix", includeSentenceWriting: false }, rng) === "target_to_source") {
        reverse += 1;
      }
    }
    expect(reverse).toBeGreaterThan(140);
  });
});
