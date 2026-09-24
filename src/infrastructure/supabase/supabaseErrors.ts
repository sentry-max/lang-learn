import { AppError } from "@domain/errors/AppError";

interface SupabaseLikeError {
  message: string;
  code?: string;
}

/** Throws a normalized AppError if `error` is set; does nothing otherwise. */
export function throwIfSupabaseError(
  error: SupabaseLikeError | null | undefined,
  fallbackMessage: string
): void {
  if (!error) return;

  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("failed to fetch") || message.includes("network")) {
    throw new AppError(
      "network",
      "Can't reach the server. Check your internet connection and try again.",
      error
    );
  }

  if (message.includes("jwt") || error.code === "PGRST301" || message.includes("not authenticated")) {
    throw new AppError("auth", "Your session has expired. Please sign in again.", error);
  }

  if (error.code === "23505") {
    throw new AppError("validation", "That item already exists.", error);
  }

  throw new AppError("unknown", fallbackMessage, error);
}
