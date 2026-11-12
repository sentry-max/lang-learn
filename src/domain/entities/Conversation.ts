import { LanguageCode } from "@domain/entities/Language";
import { CefrLevel, SentenceTranslationMap } from "@domain/entities/Word";

export type RoleGender = "female" | "male";

/** Who speaks a planned line: a person reading aloud or the app's voice. */
export type SpeakerKind = "human" | "bot";

export interface ConversationRole {
  id: string;
  name: string;
  gender: RoleGender;
  /** Left out when fewer people take part; the dialogue still flows without its lines */
  optional: boolean;
}

export interface ConversationLine {
  id: string;
  roleId: string;
  text: string;
  translations: SentenceTranslationMap;
}

/** One exchange: every role speaks exactly once. */
export interface ConversationRound {
  /** 0 for the opening and closing rounds (always kept); 1–5 ranks the middle rounds, 1 kept first */
  priority: number;
  lines: ConversationLine[];
}

export interface ConversationText {
  title: string;
  description: string;
}

/** A dialogue as written in its JSON file (`data/dialogue/dialogue.schema.json`). */
export interface ConversationContent {
  /** The file's own id: importing the same key again updates the conversation */
  key: string;
  /** Raised when lines change; stored with each attempt */
  version: number;
  language: LanguageCode;
  level: CefrLevel;
  title: string;
  description: string;
  translations: Partial<Record<LanguageCode, ConversationText>>;
  tags: string[];
  roles: ConversationRole[];
  rounds: ConversationRound[];
}

/** Drafts are private to their owner; published conversations can be found on Explore and downloaded. */
export type ConversationStatus = "draft" | "published";

/** A stored conversation: its content plus who owns it and whether it is published. */
export interface Conversation extends ConversationContent {
  id: string;
  ownerId: string;
  ownerName: string | null;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export const MIN_ROLES = 2;
export const MAX_ROLES = 6;
export const ROUND_COUNT = 7;
export const LINE_TEXT_MAX = 300;
export const MIN_HUMANS = 1;
export const MAX_HUMANS = 5;
export const MAX_BOTS = 1;
export const MIN_TURNS = 3;
export const MAX_TURNS = 7;
/** Dialogues one imported file may hold */
export const MAX_CONVERSATIONS_PER_FILE = 50;

/** Why a dialogue file can't be used. */
export type ConversationProblem =
  | "not_an_object"
  | "file_too_many"
  | "id_missing"
  | "version_invalid"
  | "language_invalid"
  | "level_invalid"
  | "title_missing"
  | "role_count"
  | "role_invalid"
  | "role_duplicate"
  | "required_roles_too_few"
  | "round_count"
  | "round_priorities"
  | "line_invalid"
  | "line_duplicate"
  | "line_role_unknown"
  | "round_roles_mismatch";

/** Who reads which role. The number of people is the number of human roles; the bot is optional. */
export interface ConversationSetup {
  /** One role per person, in reader order (Reader 1, Reader 2 …) */
  humanRoleIds: string[];
  botRoleId: string | null;
  turnsPerSpeaker: number;
}

export type SetupProblem = "human_count" | "turn_count" | "role_unknown" | "role_taken_twice" | "required_role_missing";

/** One run through a dialogue. */
export interface ConversationAttempt {
  id: string;
  conversationId: string;
  conversationVersion: number;
  humanRoleIds: string[];
  botRoleId: string | null;
  turnsPerSpeaker: number;
  startedAt: string;
}

/** One line a person read aloud. Its score is worked out from the errors, never stored. */
export interface ConversationLineResult {
  id: string;
  attemptId: string;
  conversationId: string;
  roleId: string;
  lineId: string;
  /** Kept because the shipped text may change in a later version */
  expectedText: string;
  transcript: string;
  /** Half points for near misses */
  errorCount: number;
  maxErrors: number;
  confidence: number | null;
  audioPath: string | null;
  durationMs: number | null;
  readAt: string;
}

/** The title with the CEFR level, as lists and the picker show it: "Im Café (A2)". */
export function conversationTitle(conversation: ConversationContent): string {
  return `${conversation.title} (${conversation.level})`;
}

export function conversationText(conversation: ConversationContent, language: LanguageCode): ConversationText {
  return conversation.translations[language] ?? { title: conversation.title, description: conversation.description };
}

export function roleOf(conversation: Pick<ConversationContent, "roles">, roleId: string): ConversationRole | undefined {
  return conversation.roles.find((role) => role.id === roleId);
}
