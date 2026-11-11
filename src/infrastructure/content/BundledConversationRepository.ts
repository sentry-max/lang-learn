import { Conversation } from "@domain/entities/Conversation";
import { ConversationRepository } from "@domain/repositories/ConversationRepository";
import { parseConversation } from "@domain/services/ConversationParser";
import { CEFR_LEVELS } from "@domain/entities/Word";

// shortcut: dialogues ship as JSON files with the app; move them to a table with publishing when users write their own.
const DIALOGUE_FILES = import.meta.glob<unknown>(["/data/dialogue/*.json", "!/data/dialogue/*.schema.json"], { import: "default" });

/** Loads every dialogue file on first use (one chunk each) and keeps the valid ones; a bad file is skipped. */
export class BundledConversationRepository implements ConversationRepository {
  private loaded: Promise<Conversation[]> | null = null;

  constructor(private readonly files: Record<string, () => Promise<unknown>> = DIALOGUE_FILES) {}

  list(): Promise<Conversation[]> {
    this.loaded ??= this.load();
    return this.loaded;
  }

  private async load(): Promise<Conversation[]> {
    const entries = await Promise.all(Object.entries(this.files).map(async ([path, read]) => [path, await read()] as const));
    const conversations: Conversation[] = [];
    for (const [path, value] of entries) {
      const result = parseConversation(value);
      if ("conversation" in result) conversations.push(result.conversation);
      else console.warn(`Skipping the dialogue ${path}:`, result.problems);
    }
    return conversations.sort(
      (a, b) => a.language.localeCompare(b.language) || CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level) || a.title.localeCompare(b.title)
    );
  }
}
