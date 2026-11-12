import { describe, it, expect } from "vitest";
import { SentenceExercise } from "@domain/entities/SentenceExercise";
import { SentenceAnswer, SentenceAttempt } from "@domain/entities/SentencePractice";
import { analyzeSentenceAttempts } from "@domain/services/SentenceInsights";
import { NOW } from "../../test/fixtures";

const DAY_MS = 24 * 3600 * 1000;

const dative: SentenceExercise = {
  id: "dative",
  collectionId: "c1",
  externalId: null,
  content: { kind: "fill_blank", sentence: "Mit ___ Bus.", answers: ["dem"], distractors: ["den"] },
  translations: {},
  hint: "",
  level: null,
  tags: ["dative"],
};
const negative: SentenceExercise = {
  ...dative,
  id: "negative",
  content: { kind: "transform", sentence: "Er spielt Fußball.", task: "negative", answers: ["Er spielt keinen Fußball."] },
  tags: [],
};

function attempt(exercise: SentenceExercise, answer: SentenceAnswer, errorCount: number, maxErrors: number, daysAgo: number): SentenceAttempt {
  const answeredAt = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
  return {
    id: `${exercise.id}-${daysAgo}`,
    exerciseId: exercise.id,
    sessionId: "s",
    kind: exercise.content.kind,
    timerMode: "none",
    errorCount,
    maxErrors,
    timedOut: false,
    answer,
    shownAt: answeredAt,
    answeredAt,
    responseMs: 4000,
  };
}

describe("analyzeSentenceAttempts", () => {
  const attempts = [
    attempt(dative, { kind: "fill_blank", chosen: ["den"] }, 1, 1, 1),
    attempt(dative, { kind: "fill_blank", chosen: ["den"] }, 1, 1, 9),
    attempt(negative, { kind: "transform", text: "Er spielt nicht Fusball." }, 1, 5, 2),
  ];
  const insights = analyzeSentenceAttempts(attempts, [dative, negative], NOW);

  it("finds the weak topics, weakest first, with enough attempts", () => {
    expect(insights.topics.map((topic) => [topic.key, topic.attemptCount, topic.score])).toEqual([
      ["tag:dative", 2, 0],
      ["task:negative", 1, 0.8],
    ]);
    expect(insights.weakAreas.map((topic) => topic.key)).toEqual(["tag:dative"]);
  });

  it("counts mistake types and the words the user keeps getting wrong", () => {
    expect(insights.errors).toEqual({ wrong: 3, missing: 0, extra: 0, typo: 1 });
    expect(insights.troubleWords).toEqual([{ word: "dem", missCount: 2 }]);
  });

  it("compares the last 7 days with the 7 before and keeps 14 days of activity", () => {
    expect(insights.recentScore).toBeCloseTo(4 / 6);
    expect(insights.previousScore).toBe(0);
    expect(insights.activity).toHaveLength(14);
    expect(insights.activity.reduce((sum, day) => sum + day.attemptCount, 0)).toBe(3);
  });
});
