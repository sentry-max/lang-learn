import { describe, it, expect } from "vitest";
import { parseConversation } from "@domain/services/ConversationParser";

const round = (priority: number, number: number) => ({
  priority,
  lines: [
    { id: `r${number}-a`, role: "a", text: `Line ${number} of A.`, translations: { fa: "  ", en: `Translation ${number}` } },
    { id: `r${number}-b`, role: "b", text: `Line ${number} of B.` },
  ],
});

const validDialogue = () => ({
  id: "en-a1-test",
  version: 1,
  language: "en",
  level: "A1",
  title: " Test ",
  roles: [
    { id: "a", name: "Anna", gender: "female" },
    { id: "b", name: "Ben", gender: "male" },
  ],
  rounds: [round(0, 1), round(1, 2), round(2, 3), round(3, 4), round(4, 5), round(5, 6), round(0, 7)],
});

describe("parseConversation", () => {
  it("accepts a valid dialogue, trims text and drops blank translations", () => {
    const result = parseConversation(validDialogue());
    if (!("conversation" in result)) throw new Error(result.problems.join(", "));
    expect(result.conversation.title).toBe("Test");
    expect(result.conversation.description).toBe("");
    expect(result.conversation.tags).toEqual([]);
    expect(result.conversation.rounds[0].lines[0].translations).toEqual({ en: "Translation 1" });
  });

  it("rejects something that is not a dialogue", () => {
    expect(parseConversation(null)).toEqual({ problems: ["not_an_object"] });
  });

  it("rejects a round where a role speaks twice or not at all", () => {
    const dialogue = validDialogue();
    dialogue.rounds[2].lines[1] = { ...dialogue.rounds[2].lines[1], role: "a" };
    expect(parseConversation(dialogue)).toEqual({ problems: ["round_roles_mismatch"] });
  });

  it("rejects priorities that don't rank the middle rounds 1 to 5", () => {
    const dialogue = validDialogue();
    dialogue.rounds[3].priority = 1;
    expect(parseConversation(dialogue)).toEqual({ problems: ["round_priorities"] });
  });

  it("rejects too few required roles, an unknown speaker and a duplicate line id", () => {
    const dialogue = validDialogue();
    dialogue.roles[1] = { ...dialogue.roles[1], optional: true } as (typeof dialogue.roles)[number];
    dialogue.rounds[0].lines[1] = { ...dialogue.rounds[0].lines[1], role: "ghost" };
    dialogue.rounds[1].lines[0] = { ...dialogue.rounds[1].lines[0], id: "r1-a" };
    const result = parseConversation(dialogue);
    expect("problems" in result && result.problems.sort()).toEqual(["line_duplicate", "line_role_unknown", "required_roles_too_few"]);
  });
});
