import { describe, it, expect } from "vitest";
import { ConversationLineResult } from "@domain/entities/Conversation";
import { gradeSpokenLine, lastScoreByConversation, latestRecordings, normalizeSpoken, roleScores } from "@domain/services/SpeechGrading";

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

  it("finds the recordings of a role's latest attempt and each dialogue's latest score", () => {
    expect(latestRecordings(results, "attempt-2", "lena").map((result) => result.id)).toEqual(["3"]);
    expect(lastScoreByConversation(results).get("de-a2-cafe")).toBe(1);
    expect(lastScoreByConversation(results).get("other")).toBe(0);
  });
});
