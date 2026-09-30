import { AppError, AppErrorReason, toAppError } from "@domain/errors/AppError";

interface SupabaseLikeError {
  message: string;
  code?: string;
}

/** Business-rule exceptions raised by the database triggers (see supabase/schema.sql). */
const DATABASE_RULES: Record<string, { reason: AppErrorReason; message: string }> = {
  VOCABULARY_PUBLISH_LIMIT: {
    reason: "publish_word_limit",
    message: "A vocabulary needs 50 to 5000 words to be published.",
  },
  VOCABULARY_WORD_LIMIT: { reason: "vocabulary_word_limit", message: "A vocabulary can hold at most 5000 words." },
  VOCABULARY_LANGUAGE_LOCKED: {
    reason: "vocabulary_language_locked",
    message: "The language can't be changed once the vocabulary has words.",
  },
  VOCABULARY_NOT_FOUND: { reason: "vocabulary_not_found", message: "That vocabulary no longer exists." },
  VOCABULARY_INVALID_LANGUAGE: { reason: "invalid_input", message: "That language isn't supported." },
};

/** Converts a Supabase/PostgREST error into an AppError the UI can show. */
export function toSupabaseAppError(error: SupabaseLikeError, fallbackMessage: string): AppError {
  const message = error.message ?? "";
  const lower = message.toLowerCase();

  for (const [marker, rule] of Object.entries(DATABASE_RULES)) {
    if (message.includes(marker)) return new AppError("validation", rule.message, { reason: rule.reason, cause: error });
  }
  if (lower.includes("failed to fetch") || lower.includes("fetch failed") || lower.includes("load failed") || lower.includes("network")) {
    return new AppError("network", "Can't reach the server. Check your internet connection and try again.", {
      cause: error,
    });
  }
  if (lower.includes("jwt") || error.code === "PGRST301" || error.code === "28000" || lower.includes("not authenticated")) {
    return new AppError("auth", "Your session has expired. Please sign in again.", { cause: error });
  }
  if (error.code === "42501" || lower.includes("row-level security") || lower.includes("permission denied")) {
    return new AppError("forbidden", "You don't have permission to do that.", { cause: error });
  }
  if (error.code === "23505") {
    return new AppError("conflict", "That item already exists.", { reason: "duplicate_word", cause: error });
  }
  if (error.code === "23514" || error.code === "22P02") {
    return new AppError("validation", "Some of the data is invalid.", { reason: "invalid_input", cause: error });
  }
  if (error.code === "PGRST116") return new AppError("not_found", "Not found.", { cause: error });
  return new AppError("unknown", fallbackMessage, { cause: error });
}

export function throwIfSupabaseError(error: SupabaseLikeError | null | undefined, fallbackMessage: string): void {
  if (error) throw toSupabaseAppError(error, fallbackMessage);
}

/** Runs a repository operation, normalizing anything it throws. */
export async function guard<T>(fallbackMessage: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    throw toAppError(err, fallbackMessage);
  }
}
