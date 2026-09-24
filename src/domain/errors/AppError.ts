/**
 * A small, framework-free error type the whole app normalizes into.
 * Infrastructure (Supabase, local storage) translates its raw exceptions
 * into these before they reach the UI, so presentation code never has to
 * guess what shape an error is — it always has a `code` to branch on and
 * a `message` that's safe to show the user directly.
 */
export type AppErrorCode = "network" | "auth" | "not_found" | "validation" | "storage" | "unknown";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Converts any thrown value into an AppError. Already-normalized errors
 * pass through unchanged; recognizable network failures (e.g. a fetch
 * TypeError, which is what a browser throws when there's genuinely no
 * connection) get a clear, actionable message; anything else falls back
 * to its own message or the supplied default.
 */
export function toAppError(error: unknown, fallbackMessage = "Something went wrong."): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return new AppError(
      "network",
      "Can't reach the server. Check your internet connection and try again.",
      error
    );
  }

  if (error instanceof Error) {
    return new AppError("unknown", error.message || fallbackMessage, error);
  }

  return new AppError("unknown", fallbackMessage, error);
}
