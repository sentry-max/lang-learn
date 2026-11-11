import {
  Conversation,
  ConversationLine,
  ConversationProblem,
  ConversationRole,
  ConversationRound,
  ConversationText,
  LINE_TEXT_MAX,
  MAX_ROLES,
  MIN_ROLES,
  ROUND_COUNT,
} from "@domain/entities/Conversation";
import { LanguageCode, isLanguageCode } from "@domain/entities/Language";
import { CEFR_LEVELS, CefrLevel, normalizeSentenceTranslationsMap } from "@domain/entities/Word";

export type ConversationParseResult = { conversation: Conversation } | { problems: ConversationProblem[] };

type Fields = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks a dialogue file (untrusted JSON) and turns it into a Conversation, or lists every problem found. */
export function parseConversation(value: unknown): ConversationParseResult {
  if (!isObject(value)) return { problems: ["not_an_object"] };
  const problems = new Set<ConversationProblem>();

  const id = text(value.id);
  if (!id) problems.add("id_missing");
  const version = value.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) problems.add("version_invalid");
  if (!isLanguageCode(value.language)) problems.add("language_invalid");
  if (!CEFR_LEVELS.includes(value.level as CefrLevel)) problems.add("level_invalid");
  const title = text(value.title);
  if (!title) problems.add("title_missing");

  const roles = parseRoles(value.roles, problems);
  const rounds = parseRounds(value.rounds, roles, problems);

  if (problems.size > 0) return { problems: Array.from(problems) };
  return {
    conversation: {
      id,
      version: version as number,
      language: value.language as LanguageCode,
      level: value.level as CefrLevel,
      title,
      description: text(value.description),
      translations: parseTextTranslations(value.translations),
      tags: Array.isArray(value.tags) ? value.tags.map(text).filter(Boolean) : [],
      roles,
      rounds,
    },
  };
}

function parseRoles(value: unknown, problems: Set<ConversationProblem>): ConversationRole[] {
  const list = Array.isArray(value) ? value : [];
  if (list.length < MIN_ROLES || list.length > MAX_ROLES) problems.add("role_count");
  const roles: ConversationRole[] = [];
  for (const raw of list) {
    const fields = isObject(raw) ? raw : {};
    const role = { id: text(fields.id), name: text(fields.name), gender: fields.gender, optional: fields.optional === true };
    if (!role.id || !role.name || (role.gender !== "female" && role.gender !== "male")) {
      problems.add("role_invalid");
      continue;
    }
    if (roles.some((existing) => existing.id === role.id)) problems.add("role_duplicate");
    roles.push(role as ConversationRole);
  }
  if (roles.filter((role) => !role.optional).length < MIN_ROLES) problems.add("required_roles_too_few");
  return roles;
}

function parseRounds(value: unknown, roles: ConversationRole[], problems: Set<ConversationProblem>): ConversationRound[] {
  const list = Array.isArray(value) ? value : [];
  if (list.length !== ROUND_COUNT) problems.add("round_count");
  const roleIds = new Set(roles.map((role) => role.id));
  const lineIds = new Set<string>();

  const rounds = list.map((raw): ConversationRound => {
    const fields = isObject(raw) ? raw : {};
    const lines: ConversationLine[] = [];
    for (const rawLine of Array.isArray(fields.lines) ? fields.lines : []) {
      const lineFields = isObject(rawLine) ? rawLine : {};
      const line = { id: text(lineFields.id), roleId: text(lineFields.role), text: text(lineFields.text) };
      if (!line.id || !line.text || line.text.length > LINE_TEXT_MAX) {
        problems.add("line_invalid");
        continue;
      }
      if (lineIds.has(line.id)) problems.add("line_duplicate");
      lineIds.add(line.id);
      if (!roleIds.has(line.roleId)) problems.add("line_role_unknown");
      lines.push({ ...line, translations: normalizeSentenceTranslationsMap(lineFields.translations) });
    }
    // Every role speaks exactly once per round, so each speaker gets one turn per kept round.
    const speakers = lines.map((line) => line.roleId);
    if (speakers.length !== roleIds.size || new Set(speakers).size !== speakers.length) problems.add("round_roles_mismatch");
    return { priority: typeof fields.priority === "number" ? fields.priority : -1, lines };
  });

  const priorities = rounds.map((round) => round.priority);
  const middle = priorities.slice(1, -1).sort((a, b) => a - b);
  const validPriorities =
    priorities.length === ROUND_COUNT && priorities[0] === 0 && priorities[ROUND_COUNT - 1] === 0 && middle.every((priority, index) => priority === index + 1);
  if (list.length === ROUND_COUNT && !validPriorities) problems.add("round_priorities");
  return rounds;
}

function parseTextTranslations(value: unknown): Partial<Record<LanguageCode, ConversationText>> {
  if (!isObject(value)) return {};
  const result: Partial<Record<LanguageCode, ConversationText>> = {};
  for (const [language, raw] of Object.entries(value)) {
    if (!isLanguageCode(language) || !isObject(raw)) continue;
    const title = text(raw.title);
    if (title) result[language] = { title, description: text(raw.description) };
  }
  return result;
}
