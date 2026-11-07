import { describe, expect, it } from "vitest";
import { TenseName, WordInflection } from "@domain/entities/Inflection";
import { Word } from "@domain/entities/Word";
import { expandPlural } from "@domain/services/PluralNotation";
import { inflectWord } from "@domain/services/WordInflectionService";
import { parseWordInput } from "@domain/services/WordParser";
import englishSampleWords from "../../../data/vocabulary.sample.en.json";
import germanSampleWords from "../../../data/vocabulary.sample.json";

function verb(headword: string, verbForms?: Partial<NonNullable<Word["verbForms"]>>) {
  const forms = verbForms && {
    infinitive: headword,
    presentThirdPerson: "",
    simplePast: "",
    perfect: "",
    passive: null,
    auxiliaryIsSein: false,
    separable: false,
    ...verbForms,
  };
  return { wordType: "verb" as const, headword, verbForms: forms };
}

function forms(inflection: WordInflection | null, tense: TenseName): string[] {
  if (inflection?.kind !== "verb") throw new Error("not a verb");
  const table = inflection.tables.find((candidate) => candidate.tense === tense);
  if (!table) throw new Error(`no ${tense} table`);
  return table.rows.map((row) => row.form);
}

/** Spreads ich, du, er/sie/es, wir, ihr, sie/Sie over the nine persons shown. */
const ninePersons = ([ich, du, er, wir, ihr, sie]: string[]) => [ich, du, er, er, er, wir, ihr, sie, sie];

function nounCases(inflection: WordInflection | null) {
  if (inflection?.kind !== "noun") throw new Error("not a noun");
  return inflection;
}

describe("German verbs", () => {
  const anfangen = verb("anfangen", {
    presentThirdPerson: "fängt an",
    simplePast: "fing an",
    perfect: "hat angefangen",
    passive: "wird angefangen",
    separable: true,
  });

  it("splits a separable verb in every simple tense and keeps it whole in compound ones", () => {
    const inflection = inflectWord(anfangen, "de");
    expect(forms(inflection, "present")).toEqual(ninePersons(["fange an", "fängst an", "fängt an", "fangen an", "fangt an", "fangen an"]));
    expect(forms(inflection, "preterite")).toEqual(ninePersons(["fing an", "fingst an", "fing an", "fingen an", "fingt an", "fingen an"]));
    expect(forms(inflection, "perfect")[0]).toBe("habe angefangen");
    expect(forms(inflection, "pluperfect")[1]).toBe("hattest angefangen");
    expect(forms(inflection, "futureOne")[5]).toBe("werden anfangen");
    expect(forms(inflection, "futureTwo")[0]).toBe("werde angefangen haben");
    expect(forms(inflection, "subjunctiveOne")[1]).toBe("fangest an");
    expect(forms(inflection, "subjunctiveTwo")[0]).toBe("würde anfangen");
    expect(forms(inflection, "imperative")).toEqual(["fang an!", "fangt an!", "fangen Sie an!"]);
    expect(forms(inflection, "passivePerfect")[2]).toBe("ist angefangen worden");
  });

  it("uses sein as the auxiliary when the verb takes it", () => {
    const inflection = inflectWord(verb("fahren", { presentThirdPerson: "fährt", simplePast: "fuhr", perfect: "ist gefahren" }), "de");
    expect(forms(inflection, "perfect")[0]).toBe("bin gefahren");
    expect(forms(inflection, "futureTwo")[0]).toBe("werde gefahren sein");
    expect(forms(inflection, "imperative")[0]).toBe("fahr!");
  });

  it.each([
    ["arbeiten", "arbeitet", "arbeitete", ["arbeite", "arbeitest", "arbeitet", "arbeiten", "arbeitet", "arbeiten"], "arbeite!"],
    ["lesen", "liest", "las", ["lese", "liest", "liest", "lesen", "lest", "lesen"], "lies!"],
    ["nehmen", "nimmt", "nahm", ["nehme", "nimmst", "nimmt", "nehmen", "nehmt", "nehmen"], "nimm!"],
    ["halten", "hält", "hielt", ["halte", "hältst", "hält", "halten", "haltet", "halten"], "halte!"],
    ["laden", "lädt", "lud", ["lade", "lädst", "lädt", "laden", "ladet", "laden"], "lade!"],
    ["sammeln", "sammelt", "sammelte", ["sammle", "sammelst", "sammelt", "sammeln", "sammelt", "sammeln"], "sammle!"],
    ["öffnen", "öffnet", "öffnete", ["öffne", "öffnest", "öffnet", "öffnen", "öffnet", "öffnen"], "öffne!"],
    ["tanzen", "tanzt", "tanzte", ["tanze", "tanzt", "tanzt", "tanzen", "tanzt", "tanzen"], "tanz!"],
  ])("conjugates %s", (headword, presentThirdPerson, simplePast, present, imperative) => {
    const inflection = inflectWord(verb(headword, { presentThirdPerson, simplePast }), "de");
    expect(forms(inflection, "present")).toEqual(ninePersons(present));
    expect(forms(inflection, "imperative")[0]).toBe(imperative);
  });

  it("adds the linking e to past stems ending in t or d", () => {
    const inflection = inflectWord(verb("finden", { presentThirdPerson: "findet", simplePast: "fand" }), "de");
    expect(forms(inflection, "preterite")).toEqual(ninePersons(["fand", "fandest", "fand", "fanden", "fandet", "fanden"]));
  });

  it("uses the stored table for irregular and modal verbs, also with a prefix", () => {
    expect(forms(inflectWord(verb("sein", { presentThirdPerson: "ist", simplePast: "war", perfect: "ist gewesen" }), "de"), "present")).toEqual(
      ninePersons(["bin", "bist", "ist", "sind", "seid", "sind"])
    );
    const können = inflectWord(verb("können", { presentThirdPerson: "kann", simplePast: "konnte", perfect: "hat gekonnt" }), "de");
    expect(forms(können, "subjunctiveTwo")[0]).toBe("könnte");
    expect(() => forms(können, "imperative")).toThrow();
    expect(forms(inflectWord(verb("anhaben", { presentThirdPerson: "hat an" }), "de"), "present")[0]).toBe("habe an");
  });

  it("places the reflexive pronoun for every person", () => {
    const inflection = inflectWord(
      verb("sich amüsieren", {
        infinitive: "sich amüsieren",
        presentThirdPerson: "amüsiert sich",
        simplePast: "amüsierte sich",
        perfect: "hat sich amüsiert",
      }),
      "de"
    );
    expect(forms(inflection, "present").slice(0, 2)).toEqual(["amüsiere mich", "amüsierst dich"]);
    expect(forms(inflection, "perfect")[5]).toBe("haben uns amüsiert");
    expect(forms(inflection, "futureOne")[6]).toBe("werdet euch amüsieren");
    expect(forms(inflection, "imperative")).toEqual(["amüsier dich!", "amüsiert euch!", "amüsieren Sie sich!"]);
  });

  it("shows every person, with er, sie and es and both sie forms on their own rows", () => {
    const inflection = inflectWord(verb("machen"), "de");
    if (inflection?.kind !== "verb") throw new Error("not a verb");
    expect(inflection.tables[0].rows.map((row) => row.person)).toEqual(["ich", "du", "er", "sie", "es", "wir", "ihr", "sie", "Sie"]);
  });

  it("gives every personal pronoun in the nominative, accusative and dative", () => {
    const inflection = inflectWord(verb("helfen"), "de");
    if (inflection?.kind !== "verb") throw new Error("not a verb");
    expect(inflection.pronouns.map((pronoun) => `${pronoun.nominative} ${pronoun.accusative} ${pronoun.dative}`)).toEqual([
      "ich mich mir",
      "du dich dir",
      "er ihn ihm",
      "sie sie ihr",
      "es es ihm",
      "wir uns uns",
      "ihr euch euch",
      "sie sie ihnen",
      "Sie Sie Ihnen",
    ]);
  });

  it("uses the dative reflexive when the verb also takes an object", () => {
    const inflection = inflectWord(
      verb("sich etwas merken", { infinitive: "sich etwas merken", presentThirdPerson: "merkt sich etwas", perfect: "hat sich etwas gemerkt" }),
      "de"
    );
    expect(forms(inflection, "present").slice(0, 3)).toEqual(["merke mir etwas", "merkst dir etwas", "merkt sich etwas"]);
    expect(forms(inflection, "perfect")[1]).toBe("hast dir etwas gemerkt");
    expect(forms(inflection, "imperative")[0]).toBe("merk dir etwas!");
  });

  it("still gives the derivable tenses when only the headword is known", () => {
    const inflection = inflectWord(verb("machen"), "de");
    expect(forms(inflection, "present")).toEqual(ninePersons(["mache", "machst", "macht", "machen", "macht", "machen"]));
    expect(() => forms(inflection, "perfect")).toThrow();
  });
});

describe("German nouns", () => {
  const noun = (headword: string, article: string | null, plural: string | null) => ({
    wordType: "noun" as const,
    headword,
    nounForms: { article, plural },
  });

  it("declines with definite, indefinite and negative articles in three cases", () => {
    const { singularCases, pluralCases, plural } = nounCases(inflectWord(noun("Tag", "der", "-e"), "de"));
    expect(plural).toBe("Tage");
    expect(singularCases).toEqual([
      { grammaticalCase: "nominative", definite: "der Tag", indefinite: "ein Tag", negative: "kein Tag" },
      { grammaticalCase: "accusative", definite: "den Tag", indefinite: "einen Tag", negative: "keinen Tag" },
      { grammaticalCase: "dative", definite: "dem Tag", indefinite: "einem Tag", negative: "keinem Tag" },
    ]);
    expect(pluralCases[2]).toEqual({ grammaticalCase: "dative", definite: "den Tagen", indefinite: null, negative: "keinen Tagen" });
  });

  it("uses the feminine and neuter articles", () => {
    expect(nounCases(inflectWord(noun("Nacht", "die", "¨-e"), "de")).singularCases[2].definite).toBe("der Nacht");
    expect(nounCases(inflectWord(noun("Jahr", "das", "-e"), "de")).singularCases[1].indefinite).toBe("ein Jahr");
  });

  it("does not add a dative -n to plurals ending in n or s", () => {
    expect(nounCases(inflectWord(noun("Woche", "die", "-n"), "de")).pluralCases[2].definite).toBe("den Wochen");
    expect(nounCases(inflectWord(noun("Auto", "das", "-s"), "de")).pluralCases[2].definite).toBe("den Autos");
  });

  it.each([
    ["Student", "-en", "den Studenten"],
    ["Junge", "-n", "den Jungen"],
    ["Herr", "-en", "den Herrn"],
    ["Mensch", "-en", "den Menschen"],
    ["Staat", "-en", "den Staat"],
    ["See", "-n", "den See"],
    ["Monat", "-e", "den Monat"],
  ])("handles the n-declension of %s", (headword, plural, accusative) => {
    expect(nounCases(inflectWord(noun(headword, "der", plural), "de")).singularCases[1].definite).toBe(accusative);
  });

  it("has no plural table for a noun with no plural", () => {
    const { plural, pluralCases, singularCases } = nounCases(inflectWord(noun("Obst", "das", null), "de"));
    expect(plural).toBeNull();
    expect(pluralCases).toEqual([]);
    expect(singularCases).toHaveLength(3);
  });
});

describe("plural notation", () => {
  it.each([
    ["Tag", "-e", "Tage"],
    ["Morgen", "-", "Morgen"],
    ["Haus", "¨-er", "Häuser"],
    ["Apfel", "¨", "Äpfel"],
    ["Mutter", "¨", "Mütter"],
    ["Bahnhof", "¨-e", "Bahnhöfe"],
    ["Baum", "¨-e", "Bäume"],
    ["Kind", "Kinder", "Kinder"],
    ["Kind", "die Kinder", "Kinder"],
  ])("expands %s %s", (headword, notation, plural) => {
    expect(expandPlural(headword, notation)).toBe(plural);
  });

  it("is null without a plural", () => {
    expect(expandPlural("Obst", null)).toBeNull();
    expect(expandPlural("Obst", " ")).toBeNull();
  });
});

describe("English verbs", () => {
  it("derives every tense of a regular verb", () => {
    const inflection = inflectWord(verb("work"), "en");
    expect(forms(inflection, "presentSimple")).toEqual(["work", "work", "works", "work", "work", "work"]);
    expect(forms(inflection, "presentContinuous")[0]).toBe("am working");
    expect(forms(inflection, "pastSimple")[0]).toBe("worked");
    expect(forms(inflection, "pastContinuous")[4]).toBe("were working");
    expect(forms(inflection, "presentPerfect")[2]).toBe("has worked");
    expect(forms(inflection, "presentPerfectContinuous")[0]).toBe("have been working");
    expect(forms(inflection, "pastPerfect")[0]).toBe("had worked");
    expect(forms(inflection, "pastPerfectContinuous")[0]).toBe("had been working");
    expect(forms(inflection, "futureSimple")[0]).toBe("will work");
    expect(forms(inflection, "futureContinuous")[0]).toBe("will be working");
    expect(forms(inflection, "futurePerfect")[0]).toBe("will have worked");
    expect(forms(inflection, "futurePerfectContinuous")[0]).toBe("will have been working");
    expect(forms(inflection, "conditional")[0]).toBe("would work");
    expect(forms(inflection, "conditionalPerfect")[0]).toBe("would have worked");
  });

  it.each([
    ["go", "goes", "went", "gone", "going"],
    ["stop", "stops", "stopped", "stopped", "stopping"],
    ["study", "studies", "studied", "studied", "studying"],
    ["make", "makes", "made", "made", "making"],
    ["die", "dies", "died", "died", "dying"],
    ["see", "sees", "saw", "seen", "seeing"],
    ["understand", "understands", "understood", "understood", "understanding"],
    ["behave", "behaves", "behaved", "behaved", "behaving"],
    ["visit", "visits", "visited", "visited", "visiting"],
    ["prefer", "prefers", "preferred", "preferred", "preferring"],
    ["watch", "watches", "watched", "watched", "watching"],
  ])("derives the parts of %s", (headword, thirdPerson, simplePast, pastParticiple, presentParticiple) => {
    const inflection = inflectWord(verb(headword), "en");
    if (inflection?.kind !== "verb") throw new Error("not a verb");
    const parts = Object.fromEntries(inflection.principalParts.map((part) => [part.name, part.form]));
    expect(parts).toMatchObject({ thirdPerson, simplePast, pastParticiple, presentParticiple });
  });

  it("conjugates be", () => {
    const inflection = inflectWord(verb("be"), "en");
    expect(forms(inflection, "presentSimple")).toEqual(["am", "are", "is", "are", "are", "are"]);
    expect(forms(inflection, "pastSimple")[1]).toBe("were");
    expect(forms(inflection, "presentPerfect")[0]).toBe("have been");
    expect(forms(inflection, "presentContinuous")[0]).toBe("am being");
  });

  it("prefers forms stored on the word and strips their auxiliary", () => {
    const inflection = inflectWord(verb("dream", { simplePast: "dreamt", perfect: "has dreamt" }), "en");
    expect(forms(inflection, "pastSimple")[0]).toBe("dreamt");
    expect(forms(inflection, "pastPerfect")[0]).toBe("had dreamt");
  });

  it("keeps a particle after the verb and accepts a leading to", () => {
    const inflection = inflectWord(verb("to give up"), "en");
    expect(forms(inflection, "pastSimple")[0]).toBe("gave up");
    expect(forms(inflection, "presentContinuous")[0]).toBe("am giving up");
    expect(forms(inflection, "presentSimple")[2]).toBe("gives up");
  });

  it("gives modal verbs only the tenses they have", () => {
    const inflection = inflectWord(verb("can"), "en");
    expect(forms(inflection, "presentSimple")[2]).toBe("can");
    expect(forms(inflection, "pastSimple")[0]).toBe("could");
    expect(() => forms(inflection, "presentPerfect")).toThrow();
  });
});

describe("English nouns", () => {
  it.each([
    ["book", "books"],
    ["box", "boxes"],
    ["city", "cities"],
    ["day", "days"],
    ["child", "children"],
    ["knife", "knives"],
    ["policeman", "policemen"],
    ["human", "humans"],
    ["sheep", "sheep"],
    ["post office", "post offices"],
  ])("pluralises %s", (headword, plural) => {
    const inflection = inflectWord({ wordType: "noun", headword }, "en");
    expect(nounCases(inflection).plural).toBe(plural);
  });

  it("gives uncountable nouns no plural", () => {
    expect(inflectWord({ wordType: "noun", headword: "information" }, "en")).toBeNull();
  });

  it("prefers the stored plural", () => {
    const inflection = inflectWord({ wordType: "noun", headword: "cactus", nounForms: { article: null, plural: "cacti" } }, "en");
    expect(nounCases(inflection).plural).toBe("cacti");
  });
});

describe("other words", () => {
  it("has no inflection for other word types or Persian verbs", () => {
    expect(inflectWord({ wordType: "adverb", headword: "heute" }, "de")).toBeNull();
    expect(inflectWord(verb("رفتن"), "fa")).toBeNull();
  });

  it("shows nothing for a blank word or blank stored forms", () => {
    expect(inflectWord(verb("  "), "de")).toBeNull();
    expect(inflectWord({ wordType: "noun", headword: "", nounForms: { article: "der", plural: "-e" } }, "de")).toBeNull();
    expect(inflectWord({ wordType: "noun", headword: "کتاب", nounForms: { article: null, plural: " " } }, "fa")).toBeNull();
    expect(inflectWord({ wordType: "noun", headword: "Obst", nounForms: { article: null, plural: null } }, "de")).toBeNull();
  });

  it("keeps the tenses it can derive when stored verb forms are blank", () => {
    const inflection = inflectWord(verb("machen", { presentThirdPerson: " ", simplePast: "", perfect: "" }), "de");
    expect(forms(inflection, "present")[2]).toBe("macht");
    expect(() => forms(inflection, "preterite")).toThrow();
    expect(() => forms(inflection, "perfect")).toThrow();
  });

  it("shows a stored Persian plural as it is", () => {
    const inflection = inflectWord({ wordType: "noun", headword: "کتاب", nounForms: { article: null, plural: "کتاب‌ها" } }, "fa");
    expect(nounCases(inflection).plural).toBe("کتاب‌ها");
  });
});

describe("the sample vocabularies", () => {
  it.each([
    ["German", "de", germanSampleWords],
    ["English", "en", englishSampleWords],
  ] as const)("%s: every entry imports and inflects without blank forms", (_name, language, samples: readonly unknown[]) => {
    samples.forEach((sample, index) => {
      const parsed = parseWordInput(sample, index, language);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      expect(JSON.stringify(inflectWord(parsed.word, language)), parsed.word.headword).not.toMatch(/undefined|"form":"\s*"|  /);
    });
  });

  it("are large enough to publish and use in a quiz", () => {
    expect(germanSampleWords.length).toBeGreaterThanOrEqual(50);
    expect(englishSampleWords.length).toBeGreaterThanOrEqual(50);
  });

  it("derive the forms their tags promise", () => {
    const find = (samples: readonly unknown[], language: "de" | "en", headword: string) => {
      const index = samples.findIndex((sample) => (sample as Word).headword === headword);
      const parsed = parseWordInput(samples[index], index, language);
      if (!parsed.ok) throw new Error(headword);
      return inflectWord(parsed.word, language);
    };
    expect(nounCases(find(germanSampleWords, "de", "Student")).singularCases[1].definite).toBe("den Studenten");
    expect(nounCases(find(germanSampleWords, "de", "Kind")).pluralCases[2].definite).toBe("den Kindern");
    expect(forms(find(germanSampleWords, "de", "wissen"), "present")[0]).toBe("weiß");
    expect(forms(find(germanSampleWords, "de", "sammeln"), "present")[0]).toBe("sammle");
    expect(forms(find(englishSampleWords, "en", "write"), "passivePast")[0]).toBe("was written");
    expect(forms(find(englishSampleWords, "en", "dream"), "pastSimple")[0]).toBe("dreamt");
    expect(nounCases(find(englishSampleWords, "en", "cactus")).plural).toBe("cacti");
    expect(find(englishSampleWords, "en", "advice")).toBeNull();
  });
});
