/**
 * A small, framework-free error type the whole app normalizes into.
 * Infrastructure translates raw exceptions into these before they reach the
 * UI, so presentation code always has a `code` to branch on, an optional
 * `reason` it can translate, and a `message` that is safe to show as-is.
 */
export type AppErrorCode =
  | "network"
  | "auth"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "storage"
  | "unknown";

/** Known business-rule failures the UI shows a translated message for. */
export type AppErrorReason =
  | "publish_word_limit"
  | "vocabulary_word_limit"
  | "vocabulary_language_locked"
  | "vocabulary_not_found"
  | "duplicate_word"
  | "not_quiz_eligible"
  | "invalid_input"
  | "offline";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly reason?: AppErrorReason;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, options: { reason?: AppErrorReason; cause?: unknown } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.reason = options.reason;
    this.cause = options.cause;
  }
}

/**
 * Converts any thrown value into an AppError. Already-normalized errors
 * pass through unchanged; browser network failures get a clear message;
 * anything else falls back to its own message or the supplied default.
 */
export function toAppError(error: unknown, fallbackMessage = "Something went wrong."): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return new AppError("network", "Can't reach the server. Check your internet connection and try again.", {
      cause: error,
    });
  }

  if (error instanceof Error) {
    return new AppError("unknown", error.message || fallbackMessage, { cause: error });
  }

  return new AppError("unknown", fallbackMessage, { cause: error });
}

export function isNetworkError(error: unknown): boolean {
  return toAppError(error).code === "network";
}

/** Thrown when something needs the server and the app is offline with nothing cached. */
export function offlineError(): AppError {
  return new AppError("network", "You're offline. This will be available again when you reconnect.", {
    reason: "offline",
  });
}
