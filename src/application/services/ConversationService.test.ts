import { describe, it, expect } from "vitest";
import { Conversation, ConversationContent, ConversationStatus } from "@domain/entities/Conversation";
import { ConversationRepository } from "@domain/repositories/ConversationRepository";
import { gradeSpokenLine } from "@domain/services/SpeechGrading";
import { ConversationService } from "@application/services/ConversationService";
import { InMemoryLearningRepository } from "../../test/inMemoryRepositories";
import cafeFile from "../../../data/dialogue/de-a2-cafe.json";
import interviewFile from "../../../data/dialogue/en-b1-job-interview.json";

const USER = "u1";
const OTHER_USER = "u2";

class InMemoryConversationRepository implements ConversationRepository {
  readonly conversations = new Map<string, Conversation>();
  readonly downloads = new Set<string>();

  async listOwned(userId: string) {
    return [...this.conversations.values()].filter((conversation) => conversation.ownerId === userId);
  }
  async listDownloaded() {
    return [...this.downloads].map((id) => this.conversations.get(id)!).filter((conversation) => conversation.status === "published");
  }
  async listPublished(userId: string) {
    return [...this.conversations.values()].filter((conversation) => conversation.status === "published" && conversation.ownerId !== userId);
  }
  async create(ownerId: string, id: string, content: ConversationContent) {
    const conversation: Conversation = {
      ...content,
      id,
      ownerId,
      ownerName: null,
      status: "draft",
      createdAt: "2026-11-11T09:00:00.000Z",
      updatedAt: "2026-11-11T09:00:00.000Z",
      publishedAt: null,
    };
    this.conversations.set(id, conversation);
    return conversation;
  }
  async update(id: string, content: ConversationContent) {
    const updated = { ...this.conversations.get(id)!, ...content };
    this.conversations.set(id, updated);
    return updated;
  }
  async setStatus(id: string, status: ConversationStatus) {
    const updated = { ...this.conversations.get(id)!, status };
    this.conversations.set(id, updated);
    return updated;
  }
  async softDelete(id: string) {
    this.conversations.delete(id);
  }
  async download(_userId: string, conversationId: string) {
    this.downloads.add(conversationId);
  }
  async removeDownload(_userId: string, conversationId: string) {
    this.downloads.delete(conversationId);
  }
}

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
  const conversations = new InMemoryConversationRepository();
  const learning = new InMemoryLearningRepository();
  const recordings = new FakeRecordings();
  const service = new ConversationService(conversations, learning, recordings, () => new Date("2026-11-11T09:00:00.000Z"));
  return { conversations, learning, recordings, service };
}

async function importedCafe(service: ConversationService): Promise<Conversation> {
  await service.importFile(USER, cafeFile);
  return (await service.listLibrary(USER))[0];
}

describe("importing conversations", () => {
  it("imports a file with one dialogue or a list of them as drafts", async () => {
    const { service } = setup();
    expect(await service.importFile(USER, cafeFile)).toEqual({ importedCount: 1, updatedCount: 0, problems: [] });
    expect(await service.importFile(USER, [interviewFile])).toEqual({ importedCount: 1, updatedCount: 0, problems: [] });
    const library = await service.listLibrary(USER);
    expect(library.map((conversation) => [conversation.key, conversation.status])).toEqual([
      ["en-b1-job-interview", "draft"],
      ["de-a2-cafe", "draft"],
    ]);
  });

  it("updates a conversation imported again with the same id instead of adding a copy", async () => {
    const { service } = setup();
    await service.importFile(USER, cafeFile);
    const result = await service.importFile(USER, { ...cafeFile, version: 2, title: "Im Café am Markt" });
    expect(result).toMatchObject({ importedCount: 0, updatedCount: 1 });
    const library = await service.listLibrary(USER);
    expect(library.map((conversation) => [conversation.title, conversation.version])).toEqual([["Im Café am Markt", 2]]);
  });

  it("reports each invalid dialogue of a list with its number and keeps the valid ones", async () => {
    const { service } = setup();
    const result = await service.importFile(USER, [cafeFile, { id: "broken", title: "Broken" }]);
    expect(result.importedCount).toBe(1);
    expect(result.problems).toEqual([{ entryNumber: 2, title: "Broken", codes: expect.arrayContaining(["version_invalid", "role_count"]) }]);
  });
});

describe("sharing conversations", () => {
  it("lets another user download a published conversation, and only its owner change it", async () => {
    const { service } = setup();
    const cafe = await importedCafe(service);
    await expect(service.publish(OTHER_USER, cafe)).rejects.toMatchObject({ code: "forbidden" });
    const published = await service.publish(USER, cafe);

    expect(await service.browse(OTHER_USER, "")).toEqual([published]);
    await expect(service.download(USER, published)).rejects.toMatchObject({ reason: "invalid_input" });
    await service.download(OTHER_USER, published);
    expect((await service.listLibrary(OTHER_USER)).map((conversation) => conversation.id)).toEqual([published.id]);
  });
});

describe("reading a conversation", () => {
  it("refuses to start with an invalid setup and stores nothing", async () => {
    const { learning, service } = setup();
    const cafe = await importedCafe(service);
    await expect(service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: null, turnsPerSpeaker: 5 })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(learning.conversationAttempts).toEqual([]);
  });

  it("stores the attempt under the conversation's id and returns the planned lines", async () => {
    const { learning, service } = setup();
    const cafe = await importedCafe(service);
    const { attempt, plan } = await service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 3 });
    expect(learning.conversationAttempts).toEqual([attempt]);
    expect(attempt).toMatchObject({ conversationId: cafe.id, conversationVersion: 1 });
    expect(plan).toHaveLength(6);
  });

  it("saves a line with its grade and uploads its recording under the user's folder", async () => {
    const { learning, recordings, service } = setup();
    const cafe = await importedCafe(service);
    const { attempt, plan } = await service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 3 });
    const graded = gradeSpokenLine(plan[0].line.text, ["hallo jonas ist der platz hier frei"], "de");
    const result = await service.saveLine(USER, attempt, plan[0], { graded, confidence: 0.8, audio: new Blob(["a"], { type: "audio/mp4" }), durationMs: 2000 });

    expect(result).toMatchObject({ roleId: "lena", lineId: "r1-lena", errorCount: 1, maxErrors: 8, audioPath: `u1/${attempt.id}/r1-lena.m4a` });
    expect(learning.conversationLines).toEqual([result]);
    expect(recordings.uploads).toEqual([{ path: `u1/${attempt.id}/r1-lena.m4a`, type: "audio/mp4" }]);
  });

  it("saves a line without a recording when the browser couldn't record", async () => {
    const { recordings, service } = setup();
    const cafe = await importedCafe(service);
    const { attempt, plan } = await service.start(USER, cafe, { humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 3 });
    const graded = gradeSpokenLine(plan[0].line.text, [], "de");
    const result = await service.saveLine(USER, attempt, plan[0], { graded, confidence: null, audio: null, durationMs: null });
    expect(result.audioPath).toBeNull();
    expect(recordings.uploads).toEqual([]);
  });
});
