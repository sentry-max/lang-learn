import { describe, it, expect } from "vitest";
import { SentenceExercise } from "@domain/entities/SentenceExercise";
import { SentenceAttempt } from "@domain/entities/SentencePractice";
import { createSeededRandomSource } from "@domain/services/Random";
import {
  buildTiles,
  draftToAnswer,
  emptyDraft,
  isDraftComplete,
  placeTile,
  removeTileAt,
  selectSentences,
  moveTile,
} from "@domain/services/SentenceSelectionService";
import { NOW } from "../../test/fixtures";

const DAY_MS = 24 * 3600 * 1000;

function exercise(id: string, tags: string[] = []): SentenceExercise {
  return {
    id,
    collectionId: "v1",
    externalId: null,
    content: { kind: "jumble", sentence: "Ich gehe heute.", alternatives: [], distractors: ["geht"] },
    translations: {},
    hint: "",
    level: null,
    tags,
  };
}

function attempt(exerciseId: string, errorCount: number, daysAgo: number): SentenceAttempt {
  const answeredAt = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
  return {
    id: `${exerciseId}-${daysAgo}-${errorCount}`,
    exerciseId,
    sessionId: "s",
    kind: "jumble",
    timerMode: "none",
    errorCount,
    maxErrors: 4,
    timedOut: false,
    answer: { kind: "jumble", placed: [] },
    shownAt: answeredAt,
    answeredAt,
    responseMs: 5000,
  };
}

function pickCounts(exercises: SentenceExercise[], attempts: SentenceAttempt[]): Map<string, number> {
  const randomSource = createSeededRandomSource(7);
  const counts = new Map<string, number>();
  for (let run = 0; run < 400; run++) {
    const [picked] = selectSentences({ exercises, attempts, count: 1, now: NOW, randomSource });
    counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
  }
  return counts;
}

describe("selectSentences", () => {
  it("offers a sentence the user scored low on far more often than one they mastered", () => {
    const attempts = [attempt("weak", 3, 2), attempt("mastered", 0, 3), attempt("mastered", 0, 1)];
    const counts = pickCounts([exercise("weak"), exercise("mastered")], attempts);
    expect(counts.get("weak")!).toBeGreaterThan(4 * (counts.get("mastered") ?? 0));
  });

  it("favours untried sentences of a grammar topic the user scores low on", () => {
    const attempts = [attempt("tried-dative", 4, 1)];
    const exercises = [exercise("tried-dative", ["dative"]), exercise("new-dative", ["dative"]), exercise("new-other", ["other"])];
    const counts = pickCounts(exercises, attempts);
    expect(counts.get("new-dative")!).toBeGreaterThan(counts.get("new-other")!);
  });

  it("almost never repeats a sentence answered a few minutes ago", () => {
    const justNow = { ...attempt("recent", 2, 0), answeredAt: new Date(NOW.getTime() - 60_000).toISOString() };
    const counts = pickCounts([exercise("recent"), exercise("other")], [justNow, attempt("other", 2, 1)]);
    expect(counts.get("recent") ?? 0).toBeLessThan(counts.get("other")! / 5);
  });
});

describe("buildTiles", () => {
  it("adds a jumbled sentence's distractors only when asked, and never the final full stop", () => {
    const randomSource = createSeededRandomSource(1);
    expect(buildTiles(exercise("e"), false, randomSource).map((tile) => tile.text).sort()).toEqual(["Ich", "gehe", "heute"]);
    expect(buildTiles(exercise("e"), true, randomSource).map((tile) => tile.text).sort()).toEqual(["Ich", "gehe", "geht", "heute"]);
  });
});

describe("answer drafts", () => {
  const fillItem = {
    key: "k",
    exercise: { ...exercise("f"), content: { kind: "fill_blank" as const, sentence: "Ich ___ in die ___.", answers: ["gehe", "Schule"], distractors: ["geht"] } },
    tiles: [{ id: "t1", text: "gehe" }, { id: "t2", text: "Schule" }, { id: "t3", text: "geht" }],
  };

  it("fills the first empty blank, empties a blank sent back, and is complete only when every blank is filled", () => {
    let draft = emptyDraft(fillItem);
    draft = placeTile(fillItem, draft, "t3");
    draft = placeTile(fillItem, draft, "t2");
    expect(isDraftComplete(fillItem, draft)).toBe(true);
    draft = removeTileAt(fillItem, draft, 0);
    expect(isDraftComplete(fillItem, draft)).toBe(false);
    draft = placeTile(fillItem, draft, "t1");
    expect(draftToAnswer(fillItem, draft)).toEqual({ kind: "fill_blank", chosen: ["gehe", "Schule"] });
  });

  it("replaces the word in a full blank: the chosen blank, else the last one", () => {
    const oneBlank = { ...fillItem, exercise: { ...fillItem.exercise, content: { kind: "fill_blank" as const, sentence: "Ich ___.", answers: ["gehe"], distractors: ["geht"] } } };
    let draft = placeTile(oneBlank, emptyDraft(oneBlank), "t3");
    draft = placeTile(oneBlank, draft, "t1");
    expect(draft.tileIds).toEqual(["t1"]);

    let twoBlanks = placeTile(fillItem, placeTile(fillItem, emptyDraft(fillItem), "t1"), "t3");
    twoBlanks = placeTile(fillItem, twoBlanks, "t2", 0);
    expect(twoBlanks.tileIds).toEqual(["t2", "t3"]);
    expect(placeTile(fillItem, twoBlanks, "t3", 0).tileIds).toEqual(["t3", null]);
  });

  it("appends jumble words in tap order and moves a dragged word, shifting the others", () => {
    const item = { key: "k", exercise: exercise("j"), tiles: [{ id: "a", text: "heute" }, { id: "b", text: "Ich" }, { id: "c", text: "gehe" }] };
    let draft = ["a", "b", "c"].reduce((current, tileId) => placeTile(item, current, tileId), emptyDraft(item));
    draft = moveTile(draft, 0, 2);
    expect(draftToAnswer(item, draft)).toEqual({ kind: "jumble", placed: ["Ich", "gehe", "heute"] });
    expect(isDraftComplete(item, removeTileAt(item, draft, 0))).toBe(false);
  });
});
