import { describe, it, expect } from "vitest";
import { Conversation } from "@domain/entities/Conversation";
import { parseConversation } from "@domain/services/ConversationParser";
import { gradeSpokenLine } from "@domain/services/SpeechGrading";
import { ConversationService } from "@application/services/ConversationService";
import { InMemoryLearningRepository } from "../../test/inMemoryRepositories";
import cafeFile from "../../../data/dialogue/de-a2-cafe.json";

const USER = "u1";
const parsed = parseConversation(cafeFile);
if (!("conversation" in parsed)) throw new Error("the café sample must parse");
const cafe: Conversation = parsed.conversation;

class FakeRecordings {
  readonly uploads: { path: string; type: string }[] = [];
  async upload(path: string, audio: Blob) {
    this.uploads.push({ path, type: audio.type });
  }
  async playbackUrl(path: string) {
    return `https://storage/${path}`;
  }
}

function setup() {
  const learning = new InMemoryLearningRepository();
  const recordings = new FakeRecordings();
  const service = new ConversationService({ list: async () => [cafe] }, learning, recordings, () => new Date("2026-11-11T09:00:00.000Z"));
  return { learning, recordings, service };
}

describe("ConversationService", () => {
  it("refuses to start with an invalid setup and stores nothing", async () => {
    const { learning, service } = setup();
    await expect(service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: null, turnsPerSpeaker: 5 })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(learning.conversationAttempts).toEqual([]);
  });

  it("stores the attempt and returns the planned lines", async () => {
    const { learning, service } = setup();
    const { attempt, plan } = await service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 3 });
    expect(learning.conversationAttempts).toEqual([attempt]);
    expect(plan).toHaveLength(6);
  });

  it("saves a line with its grade and uploads its recording under the user's folder", async () => {
    const { learning, recordings, service } = setup();
    const { attempt, plan } = await service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 3 });
    const graded = gradeSpokenLine(plan[0].line.text, ["hallo jonas ist der platz hier frei"], "de");
    const result = await service.saveLine(USER, attempt, plan[0], { graded, confidence: 0.8, audio: new Blob(["a"], { type: "audio/mp4" }), durationMs: 2000 });

    expect(result).toMatchObject({ roleId: "lena", lineId: "r1-lena", errorCount: 1, maxErrors: 8, audioPath: `u1/${attempt.id}/r1-lena.m4a` });
    expect(learning.conversationLines).toEqual([result]);
    expect(recordings.uploads).toEqual([{ path: `u1/${attempt.id}/r1-lena.m4a`, type: "audio/mp4" }]);
  });

  it("saves a line without a recording when the browser couldn't record", async () => {
    const { recordings, service } = setup();
    const { attempt, plan } = await service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 3 });
    const graded = gradeSpokenLine(plan[0].line.text, [], "de");
    const result = await service.saveLine(USER, attempt, plan[0], { graded, confidence: null, audio: null, durationMs: null });
    expect(result.audioPath).toBeNull();
    expect(recordings.uploads).toEqual([]);
  });
});
