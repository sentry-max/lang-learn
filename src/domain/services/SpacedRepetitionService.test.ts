import { describe, it, expect } from "vitest";
import { createInitialProgress } from "@domain/entities/Learning";
import {
  difficultyScore,
  effectiveQuality,
  isDue,
  isSlowAnswer,
  scheduleNextReview,
} from "@domain/services/SpacedRepetitionService";
import { NOW, makeProgress } from "../../test/fixtures";

const signal = (rating: Parameters<typeof scheduleNextReview>[1]["rating"], responseMs: number | null = 2000) => ({
  rating,
  mode: "source_to_target" as const,
  responseMs,
});

describe("scheduleNextReview", () => {
  it("follows SM-2 intervals for successive successes", () => {
    let p = createInitialProgress("w", NOW);
    p = scheduleNextReview(p, signal("easy"), NOW);
    expect(p.intervalDays).toBe(1);
    p = scheduleNextReview(p, signal("easy"), NOW);
    expect(p.intervalDays).toBe(6);
    p = scheduleNextReview(p, signal("easy"), NOW);
    expect(p.intervalDays).toBe(Math.round(6 * 2.5));
    expect(p.repetitions).toBe(3);
    expect(p.streak).toBe(3);
  });

  it("brings failed words back within minutes and counts a lapse for known words", () => {
    const known = makeProgress("w", { repetitions: 3, intervalDays: 15 });
    const failed = scheduleNextReview(known, signal("very_bad"), NOW);
    expect(failed.repetitions).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.streak).toBe(0);
    expect(new Date(failed.nextReviewAt).getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
    expect(failed.easeFactor).toBeLessThan(known.easeFactor);
  });

  it("marks the word as seen in the current round and tracks per-direction stats", () => {
    const p = scheduleNextReview(createInitialProgress("w", NOW), signal("bad"), NOW);
    expect(p.seenInCycle).toBe(true);
    expect(p.timesSeen).toBe(1);
    expect(p.modeStats.source_to_target).toEqual({ correct: 0, incorrect: 1 });
  });

  it("learns the user's pace and ignores walked-away answers", () => {
    let p = scheduleNextReview(createInitialProgress("w", NOW), signal("good", 4000), NOW);
    expect(p.avgResponseMs).toBe(4000);
    p = scheduleNextReview(p, signal("good", 6000), NOW);
    expect(p.avgResponseMs).toBe(4600);
    p = scheduleNextReview(p, signal("good", 10 * 60 * 1000), NOW);
    expect(p.avgResponseMs).toBe(4600);
  });

  it("schedules a hesitant 'easy' more cautiously than a quick one", () => {
    const base = makeProgress("w", { repetitions: 2, intervalDays: 6, avgResponseMs: 3000 });
    const quick = scheduleNextReview(base, signal("easy", 2000), NOW);
    const slow = scheduleNextReview(base, signal("easy", 20000), NOW);
    expect(slow.intervalDays).toBeLessThanOrEqual(quick.intervalDays);
    expect(slow.easeFactor).toBeLessThan(quick.easeFactor);
    // The user's own rating is still what's stored.
    expect(slow.lastRating).toBe("easy");
  });

  it("keeps ease within bounds and rounds it for storage", () => {
    let p = createInitialProgress("w", NOW);
    for (let i = 0; i < 20; i++) p = scheduleNextReview(p, signal("very_bad"), NOW);
    expect(p.easeFactor).toBe(1.3);
    for (let i = 0; i < 40; i++) p = scheduleNextReview(p, signal("very_easy"), NOW);
    expect(p.easeFactor).toBeLessThanOrEqual(5);
    expect(p.intervalDays).toBeLessThanOrEqual(3650);
    expect(Number.isInteger(p.easeFactor * 100)).toBe(true);
  });
});

describe("helpers", () => {
  it("detects slow answers relative to the user's own pace", () => {
    expect(isSlowAnswer(null, 3000)).toBe(false);
    expect(isSlowAnswer(9000, 3000)).toBe(true);
    expect(isSlowAnswer(9000, 6000)).toBe(false);
    expect(isSlowAnswer(5 * 60 * 1000, 3000)).toBe(false);
  });

  it("only softens strong ratings", () => {
    expect(effectiveQuality("very_easy", true)).toBe(4);
    expect(effectiveQuality("good", true)).toBe(3);
    expect(effectiveQuality("bad", true)).toBe(2);
  });

  it("scores forgotten, hesitant words as harder", () => {
    const easy = makeProgress("a", { totalCorrect: 10, totalIncorrect: 0, easeFactor: 2.8, avgResponseMs: 2000 });
    const hard = makeProgress("b", { totalCorrect: 2, totalIncorrect: 6, easeFactor: 1.4, lapses: 3, avgResponseMs: 14000 });
    expect(difficultyScore(hard)).toBeGreaterThan(difficultyScore(easy));
  });

  it("isDue compares against now", () => {
    expect(isDue({ nextReviewAt: new Date(NOW.getTime() - 1).toISOString() }, NOW)).toBe(true);
    expect(isDue({ nextReviewAt: new Date(NOW.getTime() + 1).toISOString() }, NOW)).toBe(false);
  });
});
