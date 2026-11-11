import { Conversation, ConversationAttempt, ConversationLineResult, ConversationSetup } from "@domain/entities/Conversation";
import { AppError } from "@domain/errors/AppError";
import { ConversationRepository } from "@domain/repositories/ConversationRepository";
import { LearningRepository } from "@domain/repositories/LearningRepository";
import { PlannedLine, planConversation, validateSetup } from "@domain/services/ConversationPlanner";
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

/** Dialogues, runs through them, the lines read aloud and their recordings. Results go through the outbox. */
export class ConversationService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly learning: LearningRepository,
    private readonly recordings: RecordingGateway,
    private readonly clock: () => Date = () => new Date()
  ) {}

  list(): Promise<Conversation[]> {
    return this.conversations.list();
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

function audioExtension(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
