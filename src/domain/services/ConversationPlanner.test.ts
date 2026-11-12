import { describe, it, expect } from "vitest";
import { ConversationContent, MAX_TURNS, MIN_TURNS } from "@domain/entities/Conversation";
import { parseConversation } from "@domain/services/ConversationParser";
import {
  assignRole,
  canAddBot,
  canSkipBot,
  defaultSetup,
  humanCountOptions,
  planConversation,
  speakerRange,
  validateSetup,
} from "@domain/services/ConversationPlanner";

const dialogueFiles = import.meta.glob<unknown>(["/data/dialogue/*.json", "!/data/dialogue/*.schema.json"], { eager: true, import: "default" });

function parsed(value: unknown): ConversationContent {
  const result = parseConversation(value);
  if (!("content" in result)) throw new Error(`invalid dialogue: ${result.problems.join(", ")}`);
  return result.content;
}

const cafe = parsed(dialogueFiles["/data/dialogue/de-a2-cafe.json"]);
const turnCounts = Array.from({ length: MAX_TURNS - MIN_TURNS + 1 }, (_, offset) => MIN_TURNS + offset);

describe("planConversation", () => {
  it.each(turnCounts)("gives every speaker exactly %i turns", (turnsPerSpeaker) => {
    const plan = planConversation(cafe, { humanRoleIds: ["lena", "jonas"], botRoleId: "waitress", turnsPerSpeaker });
    for (const roleId of ["lena", "jonas", "waitress"]) {
      expect(plan.filter((planned) => planned.roleId === roleId)).toHaveLength(turnsPerSpeaker);
    }
  });

  it("keeps the opening, the closing and the most important middle rounds in their original order", () => {
    const plan = planConversation(cafe, { humanRoleIds: ["lena", "jonas"], botRoleId: null, turnsPerSpeaker: 4 });
    // Priorities of rounds 1–5 (0-based 1..5) are 1, 3, 2, 4, 5: turns 4 keeps priorities 1 and 2.
    expect([...new Set(plan.map((planned) => planned.roundIndex))]).toEqual([0, 1, 3, 6]);
  });

  it("drops the lines of an optional role that is not in the cast", () => {
    const plan = planConversation(cafe, { humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 7 });
    expect(plan.some((planned) => planned.roleId === "waitress")).toBe(false);
    expect(plan).toHaveLength(14);
  });

  it("marks who reads each line", () => {
    const plan = planConversation(cafe, { humanRoleIds: ["jonas", "lena"], botRoleId: "waitress", turnsPerSpeaker: 3 });
    expect(plan.slice(0, 3).map((planned) => [planned.speaker, planned.readerNumber])).toEqual([
      ["human", 2],
      ["human", 1],
      ["bot", null],
    ]);
  });
});

describe("setup rules", () => {
  it("allows one to three people for a dialogue with two required roles and one optional", () => {
    expect(speakerRange(cafe)).toEqual({ min: 2, max: 3 });
    expect(humanCountOptions(cafe)).toEqual([1, 2, 3]);
    expect(canAddBot(cafe, 3)).toBe(false);
    expect(canSkipBot(cafe, 1)).toBe(false);
  });

  it("builds a valid default setup and adds the bot only where the range needs or allows it", () => {
    expect(defaultSetup(cafe, 1, false, 5)).toEqual({ humanRoleIds: ["lena"], botRoleId: "jonas", turnsPerSpeaker: 5 });
    expect(defaultSetup(cafe, 2, true, 5)).toEqual({ humanRoleIds: ["lena", "jonas"], botRoleId: "waitress", turnsPerSpeaker: 5 });
    expect(defaultSetup(cafe, 3, true, 5)).toEqual({ humanRoleIds: ["lena", "jonas", "waitress"], botRoleId: null, turnsPerSpeaker: 5 });
  });

  it("swaps roles when a seat takes a role another seat holds", () => {
    const setup = { humanRoleIds: ["lena", "jonas"], botRoleId: "waitress", turnsPerSpeaker: 5 };
    expect(assignRole(setup, 0, "waitress")).toEqual({ humanRoleIds: ["waitress", "jonas"], botRoleId: "lena", turnsPerSpeaker: 5 });
    expect(assignRole(setup, "bot", "jonas")).toEqual({ humanRoleIds: ["lena", "waitress"], botRoleId: "jonas", turnsPerSpeaker: 5 });
  });

  it("reports every broken rule of a setup", () => {
    expect(validateSetup(cafe, { humanRoleIds: [], botRoleId: "lena", turnsPerSpeaker: 2 })).toEqual(["human_count", "turn_count", "required_role_missing"]);
    expect(validateSetup(cafe, { humanRoleIds: ["lena", "lena"], botRoleId: "ghost", turnsPerSpeaker: 3 })).toEqual([
      "role_unknown",
      "role_taken_twice",
      "required_role_missing",
    ]);
  });
});

describe("the sample dialogues", () => {
  it("includes at least the two samples", () => {
    expect(Object.keys(dialogueFiles).length).toBeGreaterThanOrEqual(2);
  });

  it.each(Object.entries(dialogueFiles))("%s parses and plans every valid setup without blank lines", (_path, file) => {
    const conversation = parsed(file);
    for (const humanCount of humanCountOptions(conversation)) {
      for (const wantsBot of [true, false]) {
        for (const turnsPerSpeaker of turnCounts) {
          const setup = defaultSetup(conversation, humanCount, wantsBot, turnsPerSpeaker);
          expect(validateSetup(conversation, setup)).toEqual([]);
          const plan = planConversation(conversation, setup);
          const speakers = setup.humanRoleIds.length + (setup.botRoleId ? 1 : 0);
          expect(plan).toHaveLength(speakers * turnsPerSpeaker);
          for (const planned of plan) expect(planned.line.text.trim()).not.toBe("");
        }
      }
    }
  });
});
