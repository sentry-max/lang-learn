import {
  Conversation,
  ConversationAttempt,
  ConversationLineResult,
  ConversationProblem,
  ConversationSetup,
} from "@domain/entities/Conversation";
import { AppError } from "@domain/errors/AppError";
import { ConversationRepository } from "@domain/repositories/ConversationRepository";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { PlannedLine, planConversation, validateSetup } from "@domain/services/ConversationPlanner";
import { parseConversationFile } from "@domain/services/ConversationParser";
import { SpokenLineGrade } from "@domain/services/SpeechGrading";
import { RecordingGateway } from "@application/ports/RecordingGateway";
import { randomId } from "@application/util/randomId";

/** One take of a line read aloud, already graded. */
export interface LineTake {
  graded: SpokenLineGrade;
  confidence: number | null;
  audio: Blob | null;
  durationMs: number | null;
}

export interface ConversationImportResult {
  importedCount: number;
  updatedCount: number;
  /** Dialogues of the file that could not be imported; `entryNumber` is 1-based, null for the whole file */
  problems: { entryNumber: number | null; title: string | null; codes: ConversationProblem[] }[];
}

/**
 * Conversations (import, publish, delete, download) and reading them: runs, the lines read aloud and their
 * recordings. Reading results go through the outbox.
 */
export class ConversationService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly learning: LearningRepository,
    private readonly recordings: RecordingGateway,
    private readonly clock: () => Date = () => new Date()
  ) {}

  listOwned(userId: string): Promise<Conversation[]> {
    return this.conversations.listOwned(userId);
  }

  listDownloaded(userId: string): Promise<Conversation[]> {
    return this.conversations.listDownloaded(userId);
  }

  browse(userId: string, search: string): Promise<Conversation[]> {
    return this.conversations.listPublished(userId, search);
  }

  /** Conversations to read: every own one (drafts too) and the downloaded ones. */
  async listLibrary(userId: string): Promise<Conversation[]> {
    const [owned, downloaded] = await Promise.all([this.conversations.listOwned(userId), this.conversations.listDownloaded(userId)]);
    const byId = new Map([...owned, ...downloaded].map((conversation) => [conversation.id, conversation]));
    return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Imports a parsed file of one or more dialogues as drafts; a dialogue whose key the user already owns is updated. */
  async importFile(userId: string, parsed: unknown): Promise<ConversationImportResult> {
    const results = parseConversationFile(parsed);
    const isList = Array.isArray(parsed);
    const ownedByKey = new Map((await this.conversations.listOwned(userId)).map((conversation) => [conversation.key, conversation]));
    const outcome: ConversationImportResult = { importedCount: 0, updatedCount: 0, problems: [] };

    for (const [index, result] of results.entries()) {
      if (!("content" in result)) {
        const isWholeFile = !isList || result.problems[0] === "file_too_many";
        const title = titleOf(isList ? (parsed as unknown[])[index] : parsed);
        outcome.problems.push({ entryNumber: isWholeFile ? null : index + 1, title: isWholeFile ? null : title, codes: result.problems });
        continue;
      }
      const existing = ownedByKey.get(result.content.key);
      const saved = existing
        ? await this.conversations.update(existing.id, result.content)
        : await this.conversations.create(userId, randomId(), result.content);
      if (existing) outcome.updatedCount += 1;
      else outcome.importedCount += 1;
      ownedByKey.set(saved.key, saved);
    }
    return outcome;
  }

  async publish(userId: string, conversation: Conversation): Promise<Conversation> {
    assertOwner(userId, conversation);
    return this.conversations.setStatus(conversation.id, "published");
  }

  async unpublish(userId: string, conversation: Conversation): Promise<Conversation> {
    assertOwner(userId, conversation);
    return this.conversations.setStatus(conversation.id, "draft");
  }

  async delete(userId: string, conversation: Conversation): Promise<void> {
    assertOwner(userId, conversation);
    return this.conversations.softDelete(conversation.id);
  }

  async download(userId: string, conversation: Conversation): Promise<void> {
    if (conversation.ownerId === userId) {
      throw new AppError("validation", "You can't download your own conversation.", { reason: "invalid_input" });
    }
    return this.conversations.download(userId, conversation.id);
  }

  removeDownload(userId: string, conversationId: string): Promise<void> {
    return this.conversations.removeDownload(userId, conversationId);
  }

  /** Every line the user has read, in every dialogue and role. */
  history(userId: string): Promise<ConversationLineResult[]> {
    return this.learning.getConversationLines(userId);
  }

  async start(userId: string, conversation: Conversation, setup: ConversationSetup): Promise<{ attempt: ConversationAttempt; plan: PlannedLine[] }> {
    if (validateSetup(conversation, setup).length > 0) throw new AppError("validation", "The conversation setup is invalid.", { reason: "invalid_input" });
    const attempt: ConversationAttempt = {
      id: randomId(),
      conversationId: conversation.id,
      conversationVersion: conversation.version,
      humanRoleIds: setup.humanRoleIds,
      botRoleId: setup.botRoleId,
      turnsPerSpeaker: setup.turnsPerSpeaker,
      startedAt: this.clock().toISOString(),
    };
    await this.learning.recordConversationAttempt(userId, attempt);
    return { attempt, plan: planConversation(conversation, setup) };
  }

  /** Saves the final take of a line. Its recording uploads in the background and never holds up the result. */
  async saveLine(userId: string, attempt: ConversationAttempt, planned: PlannedLine, take: LineTake): Promise<ConversationLineResult> {
    const audioPath = take.audio ? `${userId}/${attempt.id}/${planned.line.id}.${audioExtension(take.audio.type)}` : null;
    const result: ConversationLineResult = {
      id: randomId(),
      attemptId: attempt.id,
      conversationId: attempt.conversationId,
      roleId: planned.roleId,
      lineId: planned.line.id,
      expectedText: planned.line.text,
      transcript: take.graded.transcript,
      errorCount: take.graded.grade.errorCount,
      maxErrors: take.graded.grade.maxErrors,
      confidence: take.confidence,
      audioPath,
      durationMs: take.durationMs,
      readAt: this.clock().toISOString(),
    };
    await this.learning.recordConversationLine(userId, result);
    if (take.audio && audioPath) void this.recordings.upload(audioPath, take.audio);
    return result;
  }

  playbackUrl(audioPath: string): Promise<string> {
    return this.recordings.playbackUrl(audioPath);
  }
}

function titleOf(raw: unknown): string | null {
  const title = typeof raw === "object" && raw !== null ? (raw as { title?: unknown }).title : null;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function assertOwner(userId: string, conversation: Conversation): void {
  if (conversation.ownerId !== userId) throw new AppError("forbidden", "Only the owner can change this conversation.");
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
