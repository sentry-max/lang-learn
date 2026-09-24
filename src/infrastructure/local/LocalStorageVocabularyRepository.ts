import { VocabularyEntry } from "@domain/entities/VocabularyEntry";
import { VocabularyRepository } from "@domain/repositories/VocabularyRepository";
import { AppError, toAppError } from "@domain/errors/AppError";

const STORAGE_KEY = "b1-vocab-trainer:offline:vocabulary";

function readAll(): VocabularyEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VocabularyEntry[]) : [];
  } catch (err) {
    throw new AppError("storage", "Could not read locally stored vocabulary.", err);
  }
}

function writeAll(entries: VocabularyEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    throw new AppError(
      "storage",
      "Could not save vocabulary locally — your browser's storage may be full.",
      err
    );
  }
}

/**
 * Offline counterpart to SupabaseVocabularyRepository. Same interface,
 * so the application layer (use cases) never knows or cares which one
 * is wired up — see presentation/context/ServicesContext.tsx.
 */
export class LocalStorageVocabularyRepository implements VocabularyRepository {
  async getAll(): Promise<VocabularyEntry[]> {
    try {
      return readAll();
    } catch (err) {
      throw toAppError(err, "Failed to load vocabulary.");
    }
  }

  async getById(id: string): Promise<VocabularyEntry | null> {
    try {
      return readAll().find((e) => e.id === id) ?? null;
    } catch (err) {
      throw toAppError(err, "Failed to load vocabulary entry.");
    }
  }

  async saveMany(entries: VocabularyEntry[]): Promise<void> {
    try {
      const current = readAll();
      const byId = new Map(current.map((e) => [e.id, e]));
      for (const entry of entries) byId.set(entry.id, entry);
      writeAll(Array.from(byId.values()));
    } catch (err) {
      throw toAppError(err, "Failed to save vocabulary.");
    }
  }

  async count(): Promise<number> {
    try {
      return readAll().length;
    } catch (err) {
      throw toAppError(err, "Failed to count vocabulary.");
    }
  }

  async deleteById(id: string): Promise<void> {
    try {
      writeAll(readAll().filter((e) => e.id !== id));
    } catch (err) {
      throw toAppError(err, "Failed to delete that vocabulary entry.");
    }
  }

  async deleteAll(): Promise<void> {
    try {
      writeAll([]);
    } catch (err) {
      throw toAppError(err, "Failed to delete vocabulary.");
    }
  }
}
