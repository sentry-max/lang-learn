import { SupabaseClient } from "@supabase/supabase-js";
import {
  ModeStats,
  ReviewEvent,
  WordProgress,
  isDifficultyRating,
  isQuestionMode,
} from "@domain/entities/Learning";
import { LearningRepository, QuizSessionRecord } from "@domain/repositories/LearningRepository";
import { TIMER_MODES, TimerMode } from "@domain/entities/QuizSettings";
import { isSentenceExerciseKind } from "@domain/entities/SentenceExercise";
import { SentenceAttempt, normalizeSentenceAnswer } from "@domain/entities/SentencePractice";
import { ConversationAttempt, ConversationLineResult } from "@domain/entities/Conversation";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import { ID_CHUNK_SIZE, chunk, fetchAllPages, nowIso, unique } from "@infrastructure/supabase/queryHelpers";

const PROGRESS_COLUMNS =
  "word_id, ease_factor, interval_days, repetitions, lapses, times_seen, total_correct, total_incorrect, streak, " +
  "last_rating, last_reviewed_at, next_review_at, avg_response_ms, mode_stats";

const EVENT_COLUMNS = "id, word_id, session_id, mode, rating, shown_at, answered_at, response_ms, collection_key";

interface ProgressRow {
  word_id: string;
  ease_factor: number | string;
  interval_days: number;
  repetitions: number;
  lapses: number;
  times_seen: number;
  total_correct: number;
  total_incorrect: number;
  streak: number;
  last_rating: string | null;
  last_reviewed_at: string | null;
  next_review_at: string;
  avg_response_ms: number | null;
  mode_stats: unknown;
}

interface EventRow {
  id: string;
  word_id: string;
  session_id: string | null;
  mode: string;
  rating: string;
  shown_at: string;
  answered_at: string;
  response_ms: number | null;
  collection_key: string | null;
}

function rowToProgress(row: ProgressRow): WordProgress {
  return {
    wordId: row.word_id,
    easeFactor: Number(row.ease_factor) || 2.5,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    lapses: row.lapses,
    timesSeen: row.times_seen,
    totalCorrect: row.total_correct,
    totalIncorrect: row.total_incorrect,
    streak: row.streak,
    lastRating: isDifficultyRating(row.last_rating) ? row.last_rating : null,
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt: row.next_review_at,
    avgResponseMs: row.avg_response_ms,
    modeStats: normalizeModeStats(row.mode_stats),
  };
}

function progressToRpcPayload(progress: WordProgress) {
  return {
    ease_factor: progress.easeFactor,
    interval_days: progress.intervalDays,
    repetitions: progress.repetitions,
    lapses: progress.lapses,
    times_seen: progress.timesSeen,
    total_correct: progress.totalCorrect,
    total_incorrect: progress.totalIncorrect,
    streak: progress.streak,
    last_rating: progress.lastRating,
    last_reviewed_at: progress.lastReviewedAt,
    next_review_at: progress.nextReviewAt,
    avg_response_ms: progress.avgResponseMs,
    mode_stats: progress.modeStats,
  };
}

function rowToEvent(row: EventRow): ReviewEvent | null {
  if (!isQuestionMode(row.mode) || !isDifficultyRating(row.rating)) return null;
  return {
    id: row.id,
    wordId: row.word_id,
    sessionId: row.session_id,
    mode: row.mode,
    rating: row.rating,
    shownAt: row.shown_at,
    answeredAt: row.answered_at,
    responseMs: row.response_ms,
    collectionKey: row.collection_key,
  };
}

const ATTEMPT_COLUMNS =
  "id, exercise_id, session_id, kind, timer_mode, error_count, max_errors, timed_out, answer, shown_at, answered_at, response_ms";

interface AttemptRow {
  id: string;
  exercise_id: string;
  session_id: string;
  kind: string;
  timer_mode: string;
  error_count: number;
  max_errors: number;
  timed_out: boolean;
  answer: unknown;
  shown_at: string;
  answered_at: string;
  response_ms: number | null;
}

function rowToAttempt(row: AttemptRow): SentenceAttempt | null {
  if (!isSentenceExerciseKind(row.kind)) return null;
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    sessionId: row.session_id,
    kind: row.kind,
    timerMode: TIMER_MODES.includes(row.timer_mode as TimerMode) ? (row.timer_mode as TimerMode) : "none",
    errorCount: row.error_count,
    maxErrors: row.max_errors,
    timedOut: row.timed_out,
    answer: normalizeSentenceAnswer(row.answer, row.kind),
    shownAt: row.shown_at,
    answeredAt: row.answered_at,
    responseMs: row.response_ms,
  };
}

const CONVERSATION_LINE_COLUMNS =
  "id, attempt_id, conversation_id, role_id, line_id, expected_text, transcript, error_count, max_errors, confidence, audio_path, duration_ms, read_at";

interface ConversationLineRow {
  id: string;
  attempt_id: string;
  conversation_id: string;
  role_id: string;
  line_id: string;
  expected_text: string;
  transcript: string;
  error_count: number | string;
  max_errors: number;
  confidence: number | null;
  audio_path: string | null;
  duration_ms: number | null;
  read_at: string;
}

function rowToConversationLine(row: ConversationLineRow): ConversationLineResult {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    conversationId: row.conversation_id,
    roleId: row.role_id,
    lineId: row.line_id,
    expectedText: row.expected_text,
    transcript: row.transcript,
    // numeric columns arrive as strings
    errorCount: Number(row.error_count) || 0,
    maxErrors: row.max_errors,
    confidence: row.confidence,
    audioPath: row.audio_path,
    durationMs: row.duration_ms,
    readAt: row.read_at,
  };
}

function normalizeModeStats(value: unknown): ModeStats {
  if (typeof value !== "object" || value === null) return {};
  const stats: ModeStats = {};
  for (const [mode, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isQuestionMode(mode) || typeof raw !== "object" || raw === null) continue;
    const { correct, incorrect } = raw as Record<string, unknown>;
    stats[mode] = { correct: Number(correct) || 0, incorrect: Number(incorrect) || 0 };
  }
  return stats;
}

export class SupabaseLearningRepository implements LearningRepository {
  constructor(private readonly client: SupabaseClient) {}

  getAllProgress(userId: string): Promise<WordProgress[]> {
    return guard("Failed to load your progress.", async () => {
      const rows = await fetchAllPages<ProgressRow>(
        (from, to) =>
          this.client
            .from("word_progress")
            .select(PROGRESS_COLUMNS)
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("word_id")
            .range(from, to)
            .returns<ProgressRow[]>(),
        "Failed to load your progress."
      );
      return rows.map(rowToProgress);
    });
  }

  getProgress(userId: string, wordId: string): Promise<WordProgress | null> {
    return guard("Failed to load your progress.", async () => {
      const { data, error } = await this.client
        .from("word_progress")
        .select(PROGRESS_COLUMNS)
        .eq("user_id", userId)
        .eq("word_id", wordId)
        .is("deleted_at", null)
        .returns<ProgressRow[]>()
        .maybeSingle();
      throwIfSupabaseError(error, "Failed to load your progress.");
      return data ? rowToProgress(data as ProgressRow) : null;
    });
  }

  recordReview(_userId: string, event: ReviewEvent, progress: WordProgress): Promise<void> {
    return guard("Failed to save your answer.", async () => {
      const { error } = await this.client.rpc("record_review", {
        p_event_id: event.id,
        p_word_id: event.wordId,
        p_session_id: event.sessionId,
        p_mode: event.mode,
        p_rating: event.rating,
        p_shown_at: event.shownAt,
        p_answered_at: event.answeredAt,
        p_response_ms: event.responseMs,
        p_progress: progressToRpcPayload(progress),
        p_collection_key: event.collectionKey,
      });
      throwIfSupabaseError(error, "Failed to save your answer.");
    });
  }

  getEvents(userId: string, wordIds: string[]): Promise<ReviewEvent[]> {
    return guard("Failed to load your answer history.", async () => {
      const results = await Promise.all(
        chunk(unique(wordIds), ID_CHUNK_SIZE).map((ids) =>
          fetchAllPages<EventRow>(
            (from, to) =>
              this.client
                .from("review_events")
                .select(EVENT_COLUMNS)
                .eq("user_id", userId)
                .in("word_id", ids)
                .is("deleted_at", null)
                .order("answered_at", { ascending: false })
                .order("id")
                .range(from, to)
                .returns<EventRow[]>(),
            "Failed to load your answer history."
          )
        )
      );
      return results.flat().map(rowToEvent).filter((reviewEvent): reviewEvent is ReviewEvent => reviewEvent !== null);
    });
  }

  resetProgress(_userId: string, wordIds: string[] | null): Promise<number> {
    return guard("Failed to reset your history.", async () => {
      const { data, error } = await this.client.rpc("reset_learning_progress", {
        p_word_ids: wordIds === null ? null : unique(wordIds),
      });
      throwIfSupabaseError(error, "Failed to reset your history.");
      return typeof data === "number" ? data : 0;
    });
  }

  getAskedInRound(userId: string, collectionKey: string): Promise<string[]> {
    return guard("Failed to load your quiz round.", async () => {
      const { data: round, error } = await this.client
        .from("quiz_collection_rounds")
        .select("started_at")
        .eq("user_id", userId)
        .eq("collection_key", collectionKey)
        .is("deleted_at", null)
        .returns<{ started_at: string }[]>()
        .maybeSingle();
      throwIfSupabaseError(error, "Failed to load your quiz round.");
      const startedAt = (round as { started_at: string } | null)?.started_at ?? null;
      const rows = await fetchAllPages<{ word_id: string }>((from, to) => {
        const query = this.client
          .from("review_events")
          .select("word_id")
          .eq("user_id", userId)
          .eq("collection_key", collectionKey)
          .is("deleted_at", null);
        // shortcut: compares device clocks (round start vs answer time); a device with a wrong clock may count a few answers in the wrong round.
        return (startedAt ? query.gte("answered_at", startedAt) : query).order("id").range(from, to).returns<{ word_id: string }[]>();
      }, "Failed to load your quiz round.");
      return unique(rows.map((row) => row.word_id));
    });
  }

  startRound(userId: string, collectionKey: string, startedAt: string): Promise<void> {
    return guard("Failed to start a new round.", async () => {
      // Upsert so a round queued while offline can safely be re-sent.
      const { error } = await this.client
        .from("quiz_collection_rounds")
        .upsert({ user_id: userId, collection_key: collectionKey, started_at: startedAt, deleted_at: null }, { onConflict: "user_id,collection_key" });
      throwIfSupabaseError(error, "Failed to start a new round.");
    });
  }

  startSession(userId: string, session: QuizSessionRecord): Promise<void> {
    return guard("Failed to start the quiz.", async () => {
      // Upsert-ignore so a session queued while offline can safely be re-sent.
      const { error } = await this.client.from("quiz_sessions").upsert(
        {
          id: session.id,
          user_id: userId,
          settings: session.settings,
          vocabulary_ids: session.vocabularyIds,
          planned_count: session.plannedCount,
          cycle_restarted: session.cycleRestarted,
          started_at: session.startedAt,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
      throwIfSupabaseError(error, "Failed to start the quiz.");
    });
  }

  recordSentenceAttempt(userId: string, attempt: SentenceAttempt): Promise<void> {
    return guard("Failed to save your answer.", async () => {
      // Upsert-ignore: an attempt queued while offline may be sent twice.
      const { error } = await this.client.from("sentence_attempts").upsert(
        {
          id: attempt.id,
          user_id: userId,
          exercise_id: attempt.exerciseId,
          session_id: attempt.sessionId,
          kind: attempt.kind,
          timer_mode: attempt.timerMode,
          error_count: attempt.errorCount,
          max_errors: attempt.maxErrors,
          timed_out: attempt.timedOut,
          answer: attempt.answer,
          shown_at: attempt.shownAt,
          answered_at: attempt.answeredAt,
          response_ms: attempt.responseMs,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
      throwIfSupabaseError(error, "Failed to save your answer.");
    });
  }

  getSentenceAttempts(userId: string): Promise<SentenceAttempt[]> {
    return guard("Failed to load your sentence history.", async () => {
      // shortcut: reads every attempt the user ever made; upgrade to a per-exercise summary table past ~50k attempts.
      const rows = await fetchAllPages<AttemptRow>(
        (from, to) =>
          this.client
            .from("sentence_attempts")
            .select(ATTEMPT_COLUMNS)
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("answered_at")
            .order("id")
            .range(from, to)
            .returns<AttemptRow[]>(),
        "Failed to load your sentence history."
      );
      return rows.flatMap((row) => rowToAttempt(row) ?? []);
    });
  }

  completeSession(userId: string, sessionId: string): Promise<void> {
    return guard("Failed to finish the quiz.", async () => {
      const { error } = await this.client
        .from("quiz_sessions")
        .update({ completed_at: nowIso() })
        .eq("id", sessionId)
        .eq("user_id", userId);
      throwIfSupabaseError(error, "Failed to finish the quiz.");
    });
  }

  recordConversationAttempt(userId: string, attempt: ConversationAttempt): Promise<void> {
    return guard("Failed to save the conversation.", async () => {
      // Upsert-ignore: an attempt queued while offline may be sent twice.
      const { error } = await this.client.from("conversation_attempts").upsert(
        {
          id: attempt.id,
          user_id: userId,
          conversation_id: attempt.conversationId,
          conversation_version: attempt.conversationVersion,
          human_role_ids: attempt.humanRoleIds,
          bot_role_id: attempt.botRoleId,
          turns_per_speaker: attempt.turnsPerSpeaker,
          started_at: attempt.startedAt,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
      throwIfSupabaseError(error, "Failed to save the conversation.");
    });
  }

  recordConversationLine(userId: string, result: ConversationLineResult): Promise<void> {
    return guard("Failed to save the line.", async () => {
      const { error } = await this.client.from("conversation_line_results").upsert(
        {
          id: result.id,
          user_id: userId,
          attempt_id: result.attemptId,
          conversation_id: result.conversationId,
          role_id: result.roleId,
          line_id: result.lineId,
          expected_text: result.expectedText,
          transcript: result.transcript,
          error_count: result.errorCount,
          max_errors: result.maxErrors,
          confidence: result.confidence,
          audio_path: result.audioPath,
          duration_ms: result.durationMs,
          read_at: result.readAt,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
      throwIfSupabaseError(error, "Failed to save the line.");
    });
  }

  getConversationLines(userId: string): Promise<ConversationLineResult[]> {
    return guard("Failed to load the conversation history.", async () => {
      // shortcut: reads every line the user ever read; upgrade to a per-role summary when histories grow past ~50k lines.
      const rows = await fetchAllPages<ConversationLineRow>(
        (from, to) =>
          this.client
            .from("conversation_line_results")
            .select(CONVERSATION_LINE_COLUMNS)
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("read_at")
            .order("id")
            .range(from, to)
            .returns<ConversationLineRow[]>(),
        "Failed to load the conversation history."
      );
      return rows.map(rowToConversationLine);
    });
  }
}
