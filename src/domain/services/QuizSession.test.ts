import { describe, it, expect } from "vitest";
import {
  QuizItem,
  RETRY_GAP,
  answerCurrent,
  createQuizSession,
  currentItem,
  endSession,
  isFinished,
  summarize,
} from "@domain/services/QuizSession";
import { makeWord } from "../../test/fixtures";

function items(count: number): QuizItem[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `k${i}`,
    word: makeWord(`W${i}`),
    sourceLanguage: "de" as const,
    mode: "source_to_target" as const,
    attempt: 0,
  }));
}

describe("QuizSession", () => {
  it("advances through items and finishes", () => {
    let state = createQuizSession(items(2));
    state = answerCurrent(state, "good");
    expect(currentItem(state)?.key).toBe("k1");
    state = answerCurrent(state, "easy");
    expect(isFinished(state)).toBe(true);
    expect(currentItem(state)).toBeNull();
  });

  it("brings a missed word back a few questions later, once", () => {
    let state = createQuizSession(items(6));
    state = answerCurrent(state, "very_bad");
    expect(state.items).toHaveLength(7);
    const retryIndex = state.items.findIndex((i) => i.key === "k0#retry1");
    expect(retryIndex).toBe(1 + RETRY_GAP);
    expect(state.items[retryIndex].attempt).toBe(1);

    // Fail the retry too: it does not come back a third time.
    while (currentItem(state)?.key !== "k0#retry1") state = answerCurrent(state, "good");
    state = answerCurrent(state, "bad");
    expect(state.items.filter((i) => i.word.id === "w-W0")).toHaveLength(2);
  });

  it("appends the retry at the end near the finish and retries sentences as translations", () => {
    const list = items(2).map((i) => ({ ...i, mode: "sentence_writing" as const }));
    let state = createQuizSession(list);
    state = answerCurrent(state, "good");
    state = answerCurrent(state, "bad");
    expect(state.items).toHaveLength(3);
    expect(currentItem(state)?.mode).toBe("source_to_target");
  });

  it("summarizes answers by rating", () => {
    let state = createQuizSession(items(3));
    state = answerCurrent(state, "good");
    state = answerCurrent(state, "bad");
    state = answerCurrent(state, "easy");
    const summary = summarize(state);
    expect(summary.answered).toBe(3);
    expect(summary.uniqueWords).toBe(3);
    expect(summary.byRating.bad).toBe(1);
  });

  it("ends early when time is up, leaving unreached words untouched", () => {
    let state = createQuizSession(items(5));
    state = answerCurrent(state, "good");
    state = answerCurrent(state, "very_bad", { timedOut: true });
    state = endSession(state, "time_up");
    expect(isFinished(state)).toBe(true);
    expect(currentItem(state)).toBeNull();
    expect(answerCurrent(state, "easy")).toBe(state);
    const summary = summarize(state);
    expect(summary).toMatchObject({ answered: 2, timedOut: 1, endedEarly: "time_up", successRate: 0.5 });
    // 3 original items plus the retry of the timed-out word were never reached.
    expect(summary.notReached).toBe(4);
  });
});
