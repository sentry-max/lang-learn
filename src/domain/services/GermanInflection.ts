import { CaseForms, GrammaticalCase, PrincipalPart, PronounCases, TenseTable, WordInflection } from "@domain/entities/Inflection";
import { VerbForms } from "@domain/entities/Word";
import { expandPlural } from "@domain/services/PluralNotation";

/** Verb forms for ich, du, er/sie/es, wir, ihr, sie/Sie. */
type SixForms = [string, string, string, string, string, string];

/** Every person shown, with the index of its form in SixForms. */
const PERSONS: [string, number][] = [
  ["ich", 0],
  ["du", 1],
  ["er", 2],
  ["sie", 2],
  ["es", 2],
  ["wir", 3],
  ["ihr", 4],
  ["sie", 5],
  ["Sie", 5],
];

export const GERMAN_PRONOUNS: PronounCases[] = [
  { nominative: "ich", accusative: "mich", dative: "mir" },
  { nominative: "du", accusative: "dich", dative: "dir" },
  { nominative: "er", accusative: "ihn", dative: "ihm" },
  { nominative: "sie", accusative: "sie", dative: "ihr" },
  { nominative: "es", accusative: "es", dative: "ihm" },
  { nominative: "wir", accusative: "uns", dative: "uns" },
  { nominative: "ihr", accusative: "euch", dative: "euch" },
  { nominative: "sie", accusative: "sie", dative: "ihnen" },
  { nominative: "Sie", accusative: "Sie", dative: "Ihnen" },
];

const REFLEXIVE_ACCUSATIVE: SixForms = ["mich", "dich", "sich", "uns", "euch", "sich"];
const REFLEXIVE_DATIVE: SixForms = ["mir", "dir", "sich", "uns", "euch", "sich"];
// shortcut: the reflexive is dative only when the headword names an object ("sich etwas merken"); upgrade by storing the case on the word.
const NAMES_AN_OBJECT = /(^|\s)(etwas|etw\.)(\s|$)/;

const HABEN: SixForms = ["habe", "hast", "hat", "haben", "habt", "haben"];
const SEIN: SixForms = ["bin", "bist", "ist", "sind", "seid", "sind"];
const WERDEN: SixForms = ["werde", "wirst", "wird", "werden", "werdet", "werden"];
const HATTE: SixForms = ["hatte", "hattest", "hatte", "hatten", "hattet", "hatten"];
const WAR: SixForms = ["war", "warst", "war", "waren", "wart", "waren"];
const WURDE: SixForms = ["wurde", "wurdest", "wurde", "wurden", "wurdet", "wurden"];
const WUERDE: SixForms = ["würde", "würdest", "würde", "würden", "würdet", "würden"];
const HAETTE: SixForms = ["hätte", "hättest", "hätte", "hätten", "hättet", "hätten"];
const WAERE: SixForms = ["wäre", "wärest", "wäre", "wären", "wäret", "wären"];

function subjunctiveEndings(stem: string): SixForms {
  return [stem, `${stem}st`, stem, `${stem}n`, `${stem}t`, `${stem}n`];
}

interface IrregularVerb {
  present: SixForms;
  subjunctiveTwo: SixForms;
  /** du, ihr, Sie; null for modal verbs, which have no imperative */
  imperative: [string, string, string] | null;
}

/** Verbs whose present tense can't be derived from the infinitive and the third person. */
const IRREGULAR_VERBS = new Map<string, IrregularVerb>(
  Object.entries<IrregularVerb>({
  sein: { present: SEIN, subjunctiveTwo: WAERE, imperative: ["sei", "seid", "seien"] },
  haben: { present: HABEN, subjunctiveTwo: HAETTE, imperative: ["hab", "habt", "haben"] },
  werden: { present: WERDEN, subjunctiveTwo: WUERDE, imperative: ["werde", "werdet", "werden"] },
  tun: {
    present: ["tue", "tust", "tut", "tun", "tut", "tun"],
    subjunctiveTwo: subjunctiveEndings("täte"),
    imperative: ["tu", "tut", "tun"],
  },
  wissen: {
    present: ["weiß", "weißt", "weiß", "wissen", "wisst", "wissen"],
    subjunctiveTwo: subjunctiveEndings("wüsste"),
    imperative: ["wisse", "wisst", "wissen"],
  },
  können: {
    present: ["kann", "kannst", "kann", "können", "könnt", "können"],
    subjunctiveTwo: subjunctiveEndings("könnte"),
    imperative: null,
  },
  müssen: {
    present: ["muss", "musst", "muss", "müssen", "müsst", "müssen"],
    subjunctiveTwo: subjunctiveEndings("müsste"),
    imperative: null,
  },
  dürfen: {
    present: ["darf", "darfst", "darf", "dürfen", "dürft", "dürfen"],
    subjunctiveTwo: subjunctiveEndings("dürfte"),
    imperative: null,
  },
  sollen: {
    present: ["soll", "sollst", "soll", "sollen", "sollt", "sollen"],
    subjunctiveTwo: subjunctiveEndings("sollte"),
    imperative: null,
  },
  wollen: {
    present: ["will", "willst", "will", "wollen", "wollt", "wollen"],
    subjunctiveTwo: subjunctiveEndings("wollte"),
    imperative: null,
  },
  mögen: {
    present: ["mag", "magst", "mag", "mögen", "mögt", "mögen"],
    subjunctiveTwo: subjunctiveEndings("möchte"),
    imperative: null,
  },
  })
);

const words = (text: string) => text.trim().split(/\s+/).filter((part) => part && part !== "sich");

/** Stems like "arbeit" or "öffn" need an extra e before -st and -t endings. */
const needsLinkingE = (stem: string) => /[td]$|[^aeiouäöülrmnh][mn]$/.test(stem);

function stemOf(baseInfinitive: string): string {
  if (/[^e]e[lr]n$/.test(baseInfinitive)) return baseInfinitive.slice(0, -1);
  return baseInfinitive.replace(/e?n$/, "");
}

function firstPersonForm(baseInfinitive: string, stem: string): string {
  return baseInfinitive.endsWith("eln") ? `${stem.slice(0, -2)}le` : `${stem}e`;
}

function regularEnding(stem: string, ending: "st" | "t"): string {
  if (needsLinkingE(stem)) return `${stem}e${ending}`;
  return ending === "st" && /[sßzx]$/.test(stem) ? `${stem}t` : `${stem}${ending}`;
}

/** The du form follows the er form's vowel change: fängt → fängst, liest → liest, hält → hältst. */
function secondPersonFromThird(thirdPerson: string, stem: string): string {
  if (/[td]$/.test(stem) && !thirdPerson.endsWith("et") && thirdPerson.endsWith("t") && !thirdPerson.endsWith("dt")) {
    return `${thirdPerson}st`;
  }
  const withoutEnding = thirdPerson.replace(/t$/, "");
  return /[sßzx]$/.test(withoutEnding) ? `${withoutEnding}t` : `${withoutEnding}st`;
}

function presentForms(baseInfinitive: string, stem: string, thirdPerson: string): SixForms {
  const third = thirdPerson || regularEnding(stem, "t");
  return [
    firstPersonForm(baseInfinitive, stem),
    thirdPerson ? secondPersonFromThird(thirdPerson, stem) : regularEnding(stem, "st"),
    third,
    baseInfinitive,
    regularEnding(stem, "t"),
    baseInfinitive,
  ];
}

function preteriteForms(simplePast: string): SixForms {
  const endsInE = simplePast.endsWith("e");
  const second = endsInE ? `${simplePast}st` : /[tdsßzx]$/.test(simplePast) ? `${simplePast}est` : `${simplePast}st`;
  const plural = endsInE ? `${simplePast}n` : `${simplePast}en`;
  const secondPlural = !endsInE && /[td]$/.test(simplePast) ? `${simplePast}et` : `${simplePast}t`;
  return [simplePast, second, simplePast, plural, secondPlural, plural];
}

function imperativeSingular(baseInfinitive: string, stem: string, thirdPerson: string): string {
  const regularThird = regularEnding(stem, "t");
  // Verbs that change e to i keep that vowel: nimmt → nimm, liest → lies.
  if (thirdPerson && thirdPerson !== regularThird && stem.includes("e") && /i/.test(thirdPerson)) {
    return /[td]$/.test(stem) ? thirdPerson : thirdPerson.replace(/t$/, "");
  }
  if (baseInfinitive.endsWith("eln") || baseInfinitive.endsWith("ern") || needsLinkingE(stem)) {
    return firstPersonForm(baseInfinitive, stem);
  }
  return stem;
}

export function inflectGermanVerb(headword: string, verbForms: VerbForms | undefined): WordInflection {
  const infinitive = (verbForms?.infinitive || headword).replace(/^sich\s+/, "").trim();
  const isReflexive = /(^|\s)sich(\s|$)/.test(`${headword} ${verbForms?.presentThirdPerson ?? ""}`);
  const reflexivePronouns = NAMES_AN_OBJECT.test(`${headword} ${verbForms?.infinitive ?? ""}`) ? REFLEXIVE_DATIVE : REFLEXIVE_ACCUSATIVE;

  const [thirdPerson = "", ...trailingWords] = words(verbForms?.presentThirdPerson ?? "");
  const trailing = trailingWords.join(" ");
  const baseInfinitive = trailing && infinitive.startsWith(trailing) ? infinitive.slice(trailing.length).trimStart() : infinitive;
  const stem = stemOf(baseInfinitive);
  const irregular = IRREGULAR_VERBS.get(baseInfinitive);

  // finite verb, then the reflexive pronoun, then whatever closes the clause
  const build = (finiteForms: SixForms, closing: string): TenseTable["rows"] =>
    PERSONS.map(([person, index]) => ({
      person,
      form: [finiteForms[index], isReflexive ? reflexivePronouns[index] : "", closing].filter(Boolean).join(" "),
    }));

  const present = irregular?.present ?? presentForms(baseInfinitive, stem, thirdPerson);
  const subjunctiveStem = firstPersonForm(baseInfinitive, stem);
  const subjunctiveOne: SixForms =
    baseInfinitive === "sein"
      ? ["sei", "seiest", "sei", "seien", "seiet", "seien"]
      : [subjunctiveStem, `${subjunctiveStem}st`, subjunctiveStem, baseInfinitive, `${subjunctiveStem}t`, baseInfinitive];

  const tables: TenseTable[] = [{ tense: "present", rows: build(present, trailing) }];

  const [simplePast, ...simplePastTrailing] = words(verbForms?.simplePast ?? "");
  if (simplePast) tables.push({ tense: "preterite", rows: build(preteriteForms(simplePast), simplePastTrailing.join(" ")) });

  const perfectWords = words(verbForms?.perfect ?? "");
  const usesSein = perfectWords[0]?.startsWith("ist") || (verbForms?.auxiliaryIsSein ?? false);
  const participle = perfectWords.filter((part) => !/^(hat|ist)(\/(hat|ist))?$/.test(part)).join(" ");
  const auxiliaryInfinitive = usesSein ? "sein" : "haben";
  if (participle) {
    tables.push(
      { tense: "perfect", rows: build(usesSein ? SEIN : HABEN, participle) },
      { tense: "pluperfect", rows: build(usesSein ? WAR : HATTE, participle) }
    );
  }

  tables.push({ tense: "futureOne", rows: build(WERDEN, infinitive) });
  if (participle) tables.push({ tense: "futureTwo", rows: build(WERDEN, `${participle} ${auxiliaryInfinitive}`) });

  tables.push({ tense: "subjunctiveOne", rows: build(subjunctiveOne, trailing) });
  tables.push({
    tense: "subjunctiveTwo",
    rows: irregular ? build(irregular.subjunctiveTwo, trailing) : build(WUERDE, infinitive),
  });
  if (participle) tables.push({ tense: "subjunctiveTwoPast", rows: build(usesSein ? WAERE : HAETTE, participle) });

  if (!irregular || irregular.imperative) {
    const [singular, plural, polite] = irregular?.imperative ?? [
      imperativeSingular(baseInfinitive, stem, thirdPerson),
      regularEnding(stem, "t"),
      baseInfinitive,
    ];
    const clause = (finite: string, pronoun: string) => [finite, isReflexive ? pronoun : "", trailing].filter(Boolean).join(" ");
    tables.push({
      tense: "imperative",
      rows: [
        { person: "du", form: `${clause(singular, reflexivePronouns[1])}!` },
        { person: "ihr", form: `${clause(plural, reflexivePronouns[4])}!` },
        { person: "Sie", form: `${[polite, "Sie", isReflexive ? "sich" : "", trailing].filter(Boolean).join(" ")}!` },
      ],
    });
  }

  if (verbForms?.passive && participle) {
    tables.push(
      { tense: "passivePresent", rows: build(WERDEN, participle) },
      { tense: "passivePast", rows: build(WURDE, participle) },
      { tense: "passivePerfect", rows: build(SEIN, `${participle} worden`) }
    );
  }

  const principalParts: PrincipalPart[] = [
    { name: "infinitive", form: isReflexive ? `sich ${infinitive}` : infinitive },
    { name: "thirdPerson", form: [present[2], isReflexive ? "sich" : "", trailing].filter(Boolean).join(" ") },
  ];
  if (verbForms?.simplePast) principalParts.push({ name: "simplePast", form: verbForms.simplePast });
  if (participle) {
    principalParts.push({ name: "pastParticiple", form: participle }, { name: "auxiliary", form: auxiliaryInfinitive });
  }
  const hasLinkingEnd = baseInfinitive === "sein" || baseInfinitive === "tun";
  principalParts.push({ name: "presentParticiple", form: hasLinkingEnd ? `${infinitive.slice(0, -1)}end` : `${infinitive}d` });

  return { kind: "verb", principalParts, tables, pronouns: GERMAN_PRONOUNS };
}

const CASES: GrammaticalCase[] = ["nominative", "accusative", "dative"];

const DEFINITE_BY_ARTICLE: Record<string, string[]> = {
  der: ["der", "den", "dem"],
  die: ["die", "die", "der"],
  das: ["das", "das", "dem"],
};
const INDEFINITE_BY_ARTICLE: Record<string, string[]> = {
  der: ["ein", "einen", "einem"],
  die: ["eine", "eine", "einer"],
  das: ["ein", "ein", "einem"],
};
const PLURAL_DEFINITE = ["die", "die", "den"];
const PLURAL_NEGATIVE = ["keine", "keine", "keinen"];

const WEAK_NOUN_ENDINGS = /(mensch|herr|bär|nachbar|bauer|held|fürst|prinz|graf|hirt|narr|spatz)$/i;
const WEAK_NOUN_ENDINGS_WITH_N_ONLY = /(herr|nachbar|bauer)$/i;

/**
 * Masculine n-declension nouns take -n/-en outside the nominative: den Studenten, dem Jungen.
 * shortcut: recognised by ending and plural, so a rare weak noun outside these patterns stays
 * uninflected; upgrade by storing the genitive on the word.
 */
function isWeakNoun(headword: string, plural: string | null): boolean {
  if (!plural) return false;
  if (WEAK_NOUN_ENDINGS.test(headword)) return true;
  if (/[^e]e$/.test(headword)) return plural === `${headword}n`;
  return /(ent|ant|ist|[^a]at)$/.test(headword) && plural === `${headword}en`;
}

function weakObjectForm(headword: string): string {
  return headword.endsWith("e") || WEAK_NOUN_ENDINGS_WITH_N_ONLY.test(headword) ? `${headword}n` : `${headword}en`;
}

/** shortcut: adjectival nouns (der Angestellte) use the plain table, wrong after "ein"; upgrade with a word flag. */
export function inflectGermanNoun(headword: string, article: string | null, pluralNotation: string | null): WordInflection {
  const plural = expandPlural(headword, pluralNotation);
  const definiteArticles = article ? DEFINITE_BY_ARTICLE[article] : undefined;
  const indefiniteArticles = article ? INDEFINITE_BY_ARTICLE[article] : undefined;

  let singularCases: CaseForms[] = [];
  if (definiteArticles && indefiniteArticles) {
    const objectForm = article === "der" && isWeakNoun(headword, plural) ? weakObjectForm(headword) : headword;
    singularCases = CASES.map((grammaticalCase, index) => {
      const noun = index === 0 ? headword : objectForm;
      return {
        grammaticalCase,
        definite: `${definiteArticles[index]} ${noun}`,
        indefinite: `${indefiniteArticles[index]} ${noun}`,
        negative: `k${indefiniteArticles[index]} ${noun}`,
      };
    });
  }

  let pluralCases: CaseForms[] = [];
  if (plural) {
    const dativePlural = /[ns]$/.test(plural) ? plural : `${plural}n`;
    pluralCases = CASES.map((grammaticalCase, index) => {
      const noun = index === 2 ? dativePlural : plural;
      return {
        grammaticalCase,
        definite: `${PLURAL_DEFINITE[index]} ${noun}`,
        indefinite: null,
        negative: `${PLURAL_NEGATIVE[index]} ${noun}`,
      };
    });
  }

  return { kind: "noun", plural, singularCases, pluralCases };
}
