import {
  ConversationContent,
  ConversationLine,
  ConversationSetup,
  MAX_BOTS,
  MAX_HUMANS,
  MAX_TURNS,
  MIN_HUMANS,
  MIN_TURNS,
  SetupProblem,
  SpeakerKind,
} from "@domain/entities/Conversation";

export interface PlannedLine {
  line: ConversationLine;
  roleId: string;
  speaker: SpeakerKind;
  /** 1-based reader number for a human line ("Reader 2"); null for the bot */
  readerNumber: number | null;
  roundIndex: number;
}

/** How many speakers (people plus bot) the dialogue works with: all required roles, up to every role. */
export function speakerRange(conversation: ConversationContent): { min: number; max: number } {
  return {
    min: conversation.roles.filter((role) => !role.optional).length,
    max: Math.min(conversation.roles.length, MAX_HUMANS + MAX_BOTS),
  };
}

/** The numbers of people that can read this dialogue, with or without the bot. */
export function humanCountOptions(conversation: ConversationContent): number[] {
  const { min, max } = speakerRange(conversation);
  const counts: number[] = [];
  for (let count = MIN_HUMANS; count <= Math.min(MAX_HUMANS, max); count++) {
    if (count + MAX_BOTS >= min) counts.push(count);
  }
  return counts;
}

export function canAddBot(conversation: ConversationContent, humanCount: number): boolean {
  const { min, max } = speakerRange(conversation);
  return humanCount + 1 >= min && humanCount + 1 <= max;
}

export function canSkipBot(conversation: ConversationContent, humanCount: number): boolean {
  const { min, max } = speakerRange(conversation);
  return humanCount >= min && humanCount <= max;
}

/**
 * A valid setup for this many people: required roles first, then optional roles in file order; the bot takes the
 * last role in the cast. The bot is added or left out when the wish would break the speaker range.
 */
export function defaultSetup(conversation: ConversationContent, humanCount: number, wantsBot: boolean, turnsPerSpeaker: number): ConversationSetup {
  const withBot = wantsBot ? canAddBot(conversation, humanCount) || !canSkipBot(conversation, humanCount) : !canSkipBot(conversation, humanCount);
  const ordered = [...conversation.roles.filter((role) => !role.optional), ...conversation.roles.filter((role) => role.optional)];
  const cast = ordered.slice(0, humanCount + (withBot ? 1 : 0)).map((role) => role.id);
  return {
    humanRoleIds: withBot ? cast.slice(0, -1) : cast,
    botRoleId: withBot ? (cast[cast.length - 1] ?? null) : null,
    turnsPerSpeaker,
  };
}

/** Gives a seat (a reader index or the bot) another role; whoever held that role takes the seat's old one. */
export function assignRole(setup: ConversationSetup, seat: number | "bot", roleId: string): ConversationSetup {
  const humanRoleIds = [...setup.humanRoleIds];
  let botRoleId = setup.botRoleId;
  const previous = seat === "bot" ? botRoleId : humanRoleIds[seat];
  if (previous === undefined || previous === null) return setup;

  const holder = humanRoleIds.indexOf(roleId);
  if (holder >= 0) humanRoleIds[holder] = previous;
  else if (botRoleId === roleId) botRoleId = previous;

  if (seat === "bot") botRoleId = roleId;
  else humanRoleIds[seat] = roleId;
  return { ...setup, humanRoleIds, botRoleId };
}

export function validateSetup(conversation: ConversationContent, setup: ConversationSetup): SetupProblem[] {
  const problems: SetupProblem[] = [];
  const { humanRoleIds, botRoleId, turnsPerSpeaker } = setup;
  if (humanRoleIds.length < MIN_HUMANS || humanRoleIds.length > MAX_HUMANS) problems.push("human_count");
  if (!Number.isInteger(turnsPerSpeaker) || turnsPerSpeaker < MIN_TURNS || turnsPerSpeaker > MAX_TURNS) problems.push("turn_count");

  const cast = botRoleId === null ? humanRoleIds : [...humanRoleIds, botRoleId];
  const roleIds = new Set(conversation.roles.map((role) => role.id));
  if (cast.some((roleId) => !roleIds.has(roleId))) problems.push("role_unknown");
  if (new Set(cast).size !== cast.length) problems.push("role_taken_twice");
  if (conversation.roles.some((role) => !role.optional && !cast.includes(role.id))) problems.push("required_role_missing");
  return problems;
}

/**
 * The lines to read, in order. Roles outside the cast are dropped; the opening and closing rounds stay, plus the
 * `turnsPerSpeaker − 2` most important middle rounds in their original order. Every round has one line per role,
 * so every speaker gets exactly `turnsPerSpeaker` turns. Expects a setup that passes `validateSetup`.
 */
export function planConversation(conversation: ConversationContent, setup: ConversationSetup): PlannedLine[] {
  const { rounds } = conversation;
  const middle = rounds
    .slice(1, -1)
    .map((round, offset) => ({ round, index: offset + 1 }))
    .sort((a, b) => a.round.priority - b.round.priority)
    .slice(0, setup.turnsPerSpeaker - 2)
    .sort((a, b) => a.index - b.index);
  const kept = [{ round: rounds[0], index: 0 }, ...middle, { round: rounds[rounds.length - 1], index: rounds.length - 1 }];

  return kept.flatMap(({ round, index }) =>
    round.lines.flatMap((line): PlannedLine[] => {
      const readerIndex = setup.humanRoleIds.indexOf(line.roleId);
      if (readerIndex >= 0) return [{ line, roleId: line.roleId, speaker: "human", readerNumber: readerIndex + 1, roundIndex: index }];
      if (line.roleId === setup.botRoleId) return [{ line, roleId: line.roleId, speaker: "bot", readerNumber: null, roundIndex: index }];
      return [];
    })
  );
}
