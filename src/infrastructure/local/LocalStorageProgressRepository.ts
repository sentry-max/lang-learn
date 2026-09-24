import { ProgressState, ReviewRecord } from "@domain/entities/Review";
import { ProgressRepository } from "@domain/repositories/ProgressRepository";
import { AppError, toAppError } from "@domain/errors/AppError";

const PROGRESS_KEY_PREFIX = "b1-vocab-trainer:offline:progress:";
const REVIEW_KEY_PREFIX = "b1-vocab-trainer:offline:reviews:";

function readJson<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    throw new AppError("storage", "Could not read locally stored progress.", err);
  }
}

function writeJson<T>(key: string, value: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    throw new AppError(
      "storage",
      "Could not save progress locally — your browser's storage may be full.",
      err
    );
  }
}

/**
 * Offline counterpart to SupabaseProgressRepository. Data is scoped per
 * userId in the storage key, same as row-level security scopes it by
 * user_id in the cloud version — so the same interface behaves the same
 * way regardless of which one is wired up.
 */
export class LocalStorageProgressRepository implements ProgressRepository {
  async getAllProgress(userId: string): Promise<ProgressState[]> {
    try {
      return readJson<ProgressState>(PROGRESS_KEY_PREFIX + userId);
    } catch (err) {
      throw toAppError(err, "Failed to load progress.");
    }
  }

  async getProgress(userId: string, vocabularyEntryId: string): Promise<ProgressState | null> {
    try {
      const all = readJson<ProgressState>(PROGRESS_KEY_PREFIX + userId);
      return all.find((p) => p.vocabularyEntryId === vocabularyEntryId) ?? null;
    } catch (err) {
      throw toAppError(err, "Failed to load progress.");
    }
  }

  async saveProgress(userId: string, progress: ProgressState): Promise<void> {
    try {
      const key = PROGRESS_KEY_PREFIX + userId;
      const all = readJson<ProgressState>(key);
      const index = all.findIndex((p) => p.vocabularyEntryId === progress.vocabularyEntryId);
      if (index >= 0) all[index] = progress;
      else all.push(progress);
      writeJson(key, all);
    } catch (err) {
      throw toAppError(err, "Failed to save progress.");
    }
  }

  async addReviewRecord(userId: string, record: ReviewRecord): Promise<void> {
    try {
      const key = REVIEW_KEY_PREFIX + userId;
      const all = readJson<ReviewRecord>(key);
      all.push(record);
      writeJson(key, all);
    } catch (err) {
      throw toAppError(err, "Failed to save review record.");
    }
  }

  async getReviewHistory(userId: string, vocabularyEntryId: string): Promise<ReviewRecord[]> {
    try {
      const all = readJson<ReviewRecord>(REVIEW_KEY_PREFIX + userId);
      return all
        .filter((r) => r.vocabularyEntryId === vocabularyEntryId)
        .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
    } catch (err) {
      throw toAppError(err, "Failed to load review history.");
    }
  }

  async getAllReviewHistory(userId: string): Promise<ReviewRecord[]> {
    try {
      const all = readJson<ReviewRecord>(REVIEW_KEY_PREFIX + userId);
      return [...all].sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
    } catch (err) {
      throw toAppError(err, "Failed to load review history.");
    }
  }
}
