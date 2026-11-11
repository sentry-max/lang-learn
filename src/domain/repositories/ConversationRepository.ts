import { Conversation } from "@domain/entities/Conversation";

/** The ready-made dialogues the app can offer. */
export interface ConversationRepository {
  list(): Promise<Conversation[]>;
}
