import { SupabaseClient } from "@supabase/supabase-js";
import {
  ModeStats,
  ReviewEvent,
  WordProgress,
  isDifficultyRating,
  isQuestionMode,
} from "@domain/entities/Learning";
import { LearningRepository, QuizSessionRecord } from "@domain/repositories/LearningRepository";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";
import { ID_CHUNK_SIZE, chunk, fetchAllPages, nowIso, unique } from "@infrastructure/supabase/queryHelpers";

const PROGRESS_COLUMNS =
  "word_id, ease_factor, interval_days, repetitions, lapses, times_seen, total_correct, total_incorrect, streak, " +
  "last_rating, last_reviewed_at, next_review_at, avg_response_ms, seen_in_cycle, mode_stats";

const EVENT_COLUMNS = "id, word_id, session_id, mode, rating, shown_at, answered_at, response_ms";

/** Word ids per RPC call when restarting a round (sent in the POST body). */
const RPC_ID_CHUNK_SIZE = 2000;

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
  seen_in_cycle: boolean;
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
    seenInCycle: row.seen_in_cycle,
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
    seen_in_cycle: progress.seenInCycle,
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
      return results.flat().map(rowToEvent).filter((e): e is ReviewEvent => e !== null);
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

  restartCycle(_userId: string, wordIds: string[]): Promise<void> {
    return guard("Failed to start a new round.", async () => {
      for (const ids of chunk(unique(wordIds), RPC_ID_CHUNK_SIZE)) {
        const { error } = await this.client.rpc("restart_quiz_cycle", { p_word_ids: ids });
        throwIfSupabaseError(error, "Failed to start a new round.");
      }
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
}
