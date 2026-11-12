import { describe, it, expect } from "vitest";
import { Conversation, ConversationLineResult } from "@domain/entities/Conversation";
import { conversationProgress, followSpokenLine, gradeSpokenLine, latestRecordings, normalizeSpoken, roleScores } from "@domain/services/SpeechGrading";
import { parseConversation } from "@domain/services/ConversationParser";
import cafeFile from "../../../data/dialogue/de-a2-cafe.json";

const statuses = (expected: string, heard: string[], language: "de" | "en" | "fa" = "de") =>
  gradeSpokenLine(expected, heard, language).grade.marks.map((mark) => mark.status);

describe("gradeSpokenLine", () => {
  it("counts a perfect reading as no errors, ignoring case and punctuation", () => {
    const { grade } = gradeSpokenLine("Ist der Platz hier noch frei?", ["ist der platz hier noch frei"], "de");
    expect(grade.errorCount).toBe(0);
    expect(grade.maxErrors).toBe(6);
    expect(grade.marks[5].expected).toBe("frei?");
  });

  it("marks a skipped word as missing and an added word as extra", () => {
    expect(statuses("Ich habe dich lange nicht gesehen.", ["ich habe dich nicht gesehen"])).toEqual(["correct", "correct", "correct", "missing", "correct", "correct"]);
    expect(statuses("Thank you very much.", ["thank you very much sir"], "en")).toEqual(["correct", "correct", "correct", "correct", "extra"]);
  });

  it("ignores filler words", () => {
    expect(gradeSpokenLine("Ich nehme einen Tee.", ["ich ähm nehme äh einen tee"], "de").grade.errorCount).toBe(0);
  });

  it("accepts a digit for a number word and the other way round", () => {
    expect(gradeSpokenLine("Ich habe 3 Tassen getrunken.", ["ich habe drei tassen getrunken"], "de").grade.errorCount).toBe(0);
    expect(gradeSpokenLine("I have to give four weeks of notice.", ["i have to give 4 weeks of notice"], "en").grade.errorCount).toBe(0);
  });

  it("accepts a compound heard as two words, and two written words heard as one", () => {
    expect(gradeSpokenLine("Der Apfelkuchen ist frisch.", ["der apfel kuchen ist frisch"], "de").grade.errorCount).toBe(0);
    expect(gradeSpokenLine("I work at a travel agency.", ["i work at a travelagency"], "en").grade.errorCount).toBe(0);
  });

  it("treats Persian spelling variants and a missing ZWNJ as the same word", () => {
    expect(gradeSpokenLine("نوشیدنی‌ها الان می‌رسند.", ["نوشیدنیها الان میرسند"], "fa").grade.errorCount).toBe(0);
    expect(gradeSpokenLine("یک چای می‌خواهم.", ["يك چاي مي خواهم"], "fa").grade.errorCount).toBe(0);
    expect(normalizeSpoken("۳ فنجان", "fa")).toEqual(["3", "فنجان"]);
  });

  it("counts a near miss as half an error", () => {
    const { grade } = gradeSpokenLine("Wir könnten ins Kino gehen.", ["wir konnten ins kino gehen"], "de");
    expect(grade.marks[1].status).toBe("typo");
    expect(grade.errorCount).toBe(0.5);
  });

  it("keeps the alternative with the fewest errors", () => {
    const result = gradeSpokenLine("Wie geht es dir?", ["wie geht es tier", "wie geht es dir"], "de");
    expect(result.transcript).toBe("wie geht es dir");
    expect(result.grade.errorCount).toBe(0);
  });

  it("marks every word missing when nothing was heard", () => {
    expect(statuses("Guten Tag.", [])).toEqual(["missing", "missing"]);
  });
});

const line = (overrides: Partial<ConversationLineResult>): ConversationLineResult => ({
  id: "line",
  attemptId: "attempt-1",
  conversationId: "de-a2-cafe",
  roleId: "lena",
  lineId: "r1-lena",
  expectedText: "Wie geht es dir?",
  transcript: "wie geht es dir",
  errorCount: 0,
  maxErrors: 4,
  confidence: 0.9,
  audioPath: null,
  durationMs: 1200,
  readAt: "2026-11-01T10:00:00.000Z",
  ...overrides,
});

describe("roleScores", () => {
  const results = [
    line({ id: "1", attemptId: "attempt-1", errorCount: 2, transcript: "wie geht" }),
    line({ id: "2", attemptId: "attempt-1", roleId: "jonas", errorCount: 0 }),
    line({ id: "3", attemptId: "attempt-2", errorCount: 0, readAt: "2026-11-02T10:00:00.000Z", audioPath: "user/attempt-2/r1-lena.webm" }),
    line({ id: "4", conversationId: "other", errorCount: 4 }),
  ];

  it("keeps each role's attempts, last, best and average score separate", () => {
    const lena = roleScores(results, "de-a2-cafe", "de").find((score) => score.roleId === "lena")!;
    expect(lena).toMatchObject({ attemptCount: 2, lastScore: 1, bestScore: 1, averageScore: 0.75, latestAttemptId: "attempt-2" });
    expect(lena.missedWords).toEqual(["es", "dir"]);
    const jonas = roleScores(results, "de-a2-cafe", "de").find((score) => score.roleId === "jonas")!;
    expect(jonas).toMatchObject({ attemptCount: 1, lastScore: 1 });
  });

  it("finds the recordings of a role's latest attempt", () => {
    expect(latestRecordings(results, "attempt-2", "lena").map((result) => result.id)).toEqual(["3"]);
  });
});

describe("conversationProgress", () => {
  const parsed = parseConversation(cafeFile);
  if (!("content" in parsed)) throw new Error("the cafe sample must parse");
  const cafe = { ...parsed.content, id: "de-a2-cafe" } as Conversation;

  it("scores each dialogue of the library, newest first, and leaves out dialogues no longer in it", () => {
    const progress = conversationProgress(
      [
        line({ id: "1", attemptId: "attempt-1", errorCount: 2, transcript: "wie geht" }),
        line({ id: "2", attemptId: "attempt-2", errorCount: 0, readAt: "2026-11-02T10:00:00.000Z" }),
        line({ id: "3", conversationId: "removed", errorCount: 4 }),
      ],
      [cafe]
    );
    expect(progress).toMatchObject({ attemptCount: 2, lineCount: 2, score: 0.75, missedWords: ["es", "dir"] });
    expect(progress.byConversation).toEqual([
      { conversation: cafe, attemptCount: 2, lastScore: 1, score: 0.75, lastReadAt: "2026-11-02T10:00:00.000Z" },
    ]);
  });
});

describe("followSpokenLine", () => {
  const follow = (heard: string) => followSpokenLine("Ich nehme 2 Stück Kuchen, bitte.", heard, "de");
  const states = (heard: string) => follow(heard).words.map((word) => word.state);

  it("fills the words in order as they are heard, number words included", () => {
    expect(states("ich nehme zwei")).toEqual(["heard", "heard", "heard", "pending", "pending", "pending"]);
    expect(follow("ich nehme zwei").isComplete).toBe(false);
  });

  it("ignores words that aren't next, passes over one misheard word, and completes on the last word", () => {
    expect(states("also ich nehme zwei stück kuchen danke bitte")).toEqual(["heard", "heard", "heard", "heard", "heard", "heard"]);
    expect(states("ich nimm zwei stück kuchen bitte")[1]).toBe("skipped");
    expect(follow("ich nimm zwei stück kuchen bitte").isComplete).toBe(true);
    expect(follow("ich").words[5].text).toBe("bitte.");
  });
});
