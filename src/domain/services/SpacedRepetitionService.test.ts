import { describe, it, expect } from "vitest";
import { scheduleNextReview, isDue, weaknessScore } from "@domain/services/SpacedRepetitionService";
import { createInitialProgress } from "@domain/entities/Review";

describe("scheduleNextReview", () => {
  it("schedules a 1-day interval on the first successful review", () => {
    const progress = createInitialProgress("word-1");
    const result = scheduleNextReview(progress, "good", new Date("2026-01-01T00:00:00Z"));
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.totalCorrect).toBe(1);
  });

  it("schedules a 6-day interval on the second successful review", () => {
    const progress = { ...createInitialProgress("word-1"), repetitions: 1, intervalDays: 1 };
    const result = scheduleNextReview(progress, "easy", new Date("2026-01-01T00:00:00Z"));
    expect(result.repetitions).toBe(2);
    expect(result.intervalDays).toBe(6);
  });

  it("grows the interval using the ease factor after the third repetition", () => {
    const progress = { ...createInitialProgress("word-1"), repetitions: 2, intervalDays: 6, easeFactor: 2.5 };
    const result = scheduleNextReview(progress, "very_easy", new Date("2026-01-01T00:00:00Z"));
    expect(result.repetitions).toBe(3);
    expect(result.intervalDays).toBeGreaterThan(6);
  });

  it("resets repetitions and shortens the interval on a bad rating", () => {
    const progress = { ...createInitialProgress("word-1"), repetitions: 4, intervalDays: 30, easeFactor: 2.5 };
    const result = scheduleNextReview(progress, "very_bad", new Date("2026-01-01T00:00:00Z"));
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.totalIncorrect).toBe(1);
  });

  it("never lets the ease factor drop below the minimum floor", () => {
    let progress = createInitialProgress("word-1");
    for (let i = 0; i < 10; i++) {
      progress = scheduleNextReview(progress, "very_bad", new Date("2026-01-01T00:00:00Z"));
    }
    expect(progress.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
});

describe("isDue", () => {
  it("is due when the next review date has passed", () => {
    const progress = { ...createInitialProgress("word-1"), nextReviewDate: "2025-01-01T00:00:00Z" };
    expect(isDue(progress, new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("is not due when the next review date is in the future", () => {
    const progress = { ...createInitialProgress("word-1"), nextReviewDate: "2027-01-01T00:00:00Z" };
    expect(isDue(progress, new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("weaknessScore", () => {
  it("scores a never-attempted word in the middle range", () => {
    const progress = createInitialProgress("word-1");
    const score = weaknessScore(progress, new Date(progress.nextReviewDate));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("scores a word with poor accuracy higher than one with perfect accuracy", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const weak = {
      ...createInitialProgress("weak"),
      totalCorrect: 1,
      totalIncorrect: 9,
      nextReviewDate: now.toISOString(),
    };
    const strong = {
      ...createInitialProgress("strong"),
      totalCorrect: 9,
      totalIncorrect: 1,
      nextReviewDate: now.toISOString(),
    };
    expect(weaknessScore(weak, now)).toBeGreaterThan(weaknessScore(strong, now));
  });

  it("boosts the score for overdue words", () => {
    const now = new Date("2026-01-15T00:00:00Z");
    const overdue = {
      ...createInitialProgress("overdue"),
      totalCorrect: 5,
      totalIncorrect: 5,
      nextReviewDate: "2026-01-01T00:00:00Z",
    };
    const onTime = {
      ...createInitialProgress("on-time"),
      totalCorrect: 5,
      totalIncorrect: 5,
      nextReviewDate: "2026-01-15T00:00:00Z",
    };
    expect(weaknessScore(overdue, now)).toBeGreaterThan(weaknessScore(onTime, now));
  });
});
