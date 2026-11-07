import { PrincipalPart, TenseTable, WordInflection } from "@domain/entities/Inflection";
import { VerbForms } from "@domain/entities/Word";
import { expandPlural } from "@domain/services/PluralNotation";

const PERSONS = ["I", "you", "he/she/it", "we", "you", "they"];

/** Past and past participle of irregular verbs. */
const IRREGULAR_VERBS = new Map<string, [string, string]>(
  Object.entries<[string, string]>({
  arise: ["arose", "arisen"], awake: ["awoke", "awoken"], bear: ["bore", "borne"], beat: ["beat", "beaten"],
  become: ["became", "become"], begin: ["began", "begun"], bend: ["bent", "bent"], bet: ["bet", "bet"],
  bind: ["bound", "bound"], bite: ["bit", "bitten"], bleed: ["bled", "bled"], blow: ["blew", "blown"],
  break: ["broke", "broken"], breed: ["bred", "bred"], bring: ["brought", "brought"], build: ["built", "built"],
  burst: ["burst", "burst"], buy: ["bought", "bought"], cast: ["cast", "cast"], catch: ["caught", "caught"],
  choose: ["chose", "chosen"], cling: ["clung", "clung"], come: ["came", "come"], cost: ["cost", "cost"],
  creep: ["crept", "crept"], cut: ["cut", "cut"], deal: ["dealt", "dealt"], dig: ["dug", "dug"],
  do: ["did", "done"], draw: ["drew", "drawn"], drink: ["drank", "drunk"], drive: ["drove", "driven"],
  eat: ["ate", "eaten"], fall: ["fell", "fallen"], feed: ["fed", "fed"], feel: ["felt", "felt"],
  fight: ["fought", "fought"], find: ["found", "found"], flee: ["fled", "fled"], fly: ["flew", "flown"],
  forbid: ["forbade", "forbidden"], forget: ["forgot", "forgotten"], forgive: ["forgave", "forgiven"],
  freeze: ["froze", "frozen"], get: ["got", "got"], give: ["gave", "given"], go: ["went", "gone"],
  grind: ["ground", "ground"], grow: ["grew", "grown"], hang: ["hung", "hung"], have: ["had", "had"],
  hear: ["heard", "heard"], hide: ["hid", "hidden"], hit: ["hit", "hit"], hold: ["held", "held"],
  hurt: ["hurt", "hurt"], keep: ["kept", "kept"], kneel: ["knelt", "knelt"], know: ["knew", "known"],
  lay: ["laid", "laid"], lead: ["led", "led"], leave: ["left", "left"], lend: ["lent", "lent"],
  let: ["let", "let"], lie: ["lay", "lain"], light: ["lit", "lit"], lose: ["lost", "lost"],
  make: ["made", "made"], mean: ["meant", "meant"], meet: ["met", "met"], pay: ["paid", "paid"],
  put: ["put", "put"], quit: ["quit", "quit"], read: ["read", "read"], ride: ["rode", "ridden"],
  ring: ["rang", "rung"], rise: ["rose", "risen"], run: ["ran", "run"], say: ["said", "said"],
  see: ["saw", "seen"], seek: ["sought", "sought"], sell: ["sold", "sold"], send: ["sent", "sent"],
  set: ["set", "set"], shake: ["shook", "shaken"], shine: ["shone", "shone"], shoot: ["shot", "shot"],
  show: ["showed", "shown"], shrink: ["shrank", "shrunk"], shut: ["shut", "shut"], sing: ["sang", "sung"],
  sink: ["sank", "sunk"], sit: ["sat", "sat"], sleep: ["slept", "slept"], slide: ["slid", "slid"],
  speak: ["spoke", "spoken"], spend: ["spent", "spent"], spin: ["spun", "spun"], split: ["split", "split"],
  spread: ["spread", "spread"], spring: ["sprang", "sprung"], stand: ["stood", "stood"], steal: ["stole", "stolen"],
  stick: ["stuck", "stuck"], sting: ["stung", "stung"], strike: ["struck", "struck"], swear: ["swore", "sworn"],
  sweep: ["swept", "swept"], swim: ["swam", "swum"], swing: ["swung", "swung"], take: ["took", "taken"],
  teach: ["taught", "taught"], tear: ["tore", "torn"], tell: ["told", "told"], think: ["thought", "thought"],
  throw: ["threw", "thrown"], wake: ["woke", "woken"], wear: ["wore", "worn"], weep: ["wept", "wept"],
  win: ["won", "won"], wind: ["wound", "wound"], write: ["wrote", "written"],
  })
);

const IRREGULAR_PREFIXES = /^(under|over|with|out|mis|fore|for|un|re|be)(.+)$/;

/** Modal verbs have no participles; null means no past form either. */
const MODAL_PAST = new Map<string, string | null>(
  Object.entries<string | null>({
    can: "could",
    may: "might",
    must: "had to",
    shall: "should",
    will: "would",
    should: null,
    could: null,
    might: null,
    would: null,
  })
);

const IRREGULAR_PLURALS = new Map<string, string>(
  Object.entries({
  child: "children", foot: "feet", tooth: "teeth", goose: "geese", mouse: "mice",
  person: "people", ox: "oxen", knife: "knives", wife: "wives", life: "lives", leaf: "leaves", loaf: "loaves",
  half: "halves", shelf: "shelves", wolf: "wolves", thief: "thieves", calf: "calves", self: "selves",
  sheep: "sheep", fish: "fish", deer: "deer", series: "series", species: "species", aircraft: "aircraft",
  potato: "potatoes", tomato: "tomatoes", hero: "heroes", echo: "echoes", veto: "vetoes",
  })
);

// shortcut: only common uncountable nouns are known, others get a plural; upgrade by storing "uncountable" on the word.
const UNCOUNTABLE_NOUNS = new Set([
  "advice", "equipment", "furniture", "homework", "information", "knowledge", "luggage", "money", "music", "news", "progress",
  "rice", "research", "traffic", "water", "weather", "work",
]);

// One-vowel verbs double by rule; these longer ones are stressed on the last syllable.
const DOUBLING_VERBS = /^(admit|commit|omit|permit|submit|occur|prefer|refer|regret|control|equip|upset)$/;

function doublesFinalConsonant(verb: string): boolean {
  if (DOUBLING_VERBS.test(verb)) return true;
  const vowelGroups = verb.match(/[aeiouy]+/g) ?? [];
  return vowelGroups.length === 1 && /[^aeiou][aeiou][^aeiouwxy]$/.test(verb);
}

function regularThirdPerson(verb: string): string {
  if (verb === "have") return "has";
  if (/(s|x|z|ch|sh|o)$/.test(verb)) return `${verb}es`;
  return /[^aeiou]y$/.test(verb) ? `${verb.slice(0, -1)}ies` : `${verb}s`;
}

function regularPast(verb: string): string {
  if (verb.endsWith("e")) return `${verb}d`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ied`;
  return doublesFinalConsonant(verb) ? `${verb}${verb.slice(-1)}ed` : `${verb}ed`;
}

function presentParticiple(verb: string): string {
  if (verb === "be") return "being";
  if (verb.endsWith("ie")) return `${verb.slice(0, -2)}ying`;
  if (/[^eoy]e$/.test(verb)) return `${verb.slice(0, -1)}ing`;
  return doublesFinalConsonant(verb) ? `${verb}${verb.slice(-1)}ing` : `${verb}ing`;
}

function irregularParts(verb: string): [string, string] | null {
  const exact = IRREGULAR_VERBS.get(verb);
  if (exact) return exact;
  // "behave" only looks like be + have.
  const prefixed = verb === "behave" ? null : IRREGULAR_PREFIXES.exec(verb);
  const parts = prefixed && IRREGULAR_VERBS.get(prefixed[2]);
  if (!prefixed || !parts) return null;
  const [past, participle] = parts;
  return [`${prefixed[1]}${past}`, `${prefixed[1]}${participle}`];
}

const PERFECT_AUXILIARY = /^(has|have|had)\s+/;

export function inflectEnglishVerb(headword: string, verbForms: VerbForms | undefined): WordInflection {
  const infinitive = (verbForms?.infinitive || headword).trim().replace(/^to\s+/i, "");
  const [verb, ...particleWords] = infinitive.split(/\s+/);
  const particle = particleWords.join(" ");
  const withParticle = (form: string) => (particle ? `${form} ${particle}` : form);

  if (MODAL_PAST.has(verb)) {
    const past = MODAL_PAST.get(verb);
    const tables: TenseTable[] = [{ tense: "presentSimple", rows: PERSONS.map((person) => ({ person, form: verb })) }];
    if (past) tables.push({ tense: "pastSimple", rows: PERSONS.map((person) => ({ person, form: past })) });
    return { kind: "verb", principalParts: [{ name: "infinitive", form: verb }], tables, pronouns: [] };
  }

  const isBe = verb === "be";
  const irregular = isBe ? (["was", "been"] as [string, string]) : irregularParts(verb);
  const thirdPerson = verbForms?.presentThirdPerson || withParticle(isBe ? "is" : regularThirdPerson(verb));
  const simplePast = verbForms?.simplePast || withParticle(irregular?.[0] ?? regularPast(verb));
  const pastParticiple = (verbForms?.perfect || withParticle(irregular?.[1] ?? regularPast(verb))).replace(PERFECT_AUXILIARY, "");
  const ingForm = withParticle(presentParticiple(verb));

  const rows = (forms: string[]): TenseTable["rows"] => PERSONS.map((person, index) => ({ person, form: forms[index] }));
  const fixed = (form: string) => rows(PERSONS.map(() => form));
  const bePresent = ["am", "are", "is", "are", "are", "are"];
  const bePast = ["was", "were", "was", "were", "were", "were"];
  const havePresent = ["have", "have", "has", "have", "have", "have"];
  const after = (auxiliaries: string[], tail: string) => rows(auxiliaries.map((auxiliary) => `${auxiliary} ${tail}`));

  const presentSimple = isBe ? bePresent : PERSONS.map((_, index) => (index === 2 ? thirdPerson : infinitive));
  const pastSimple = isBe ? bePast : PERSONS.map(() => simplePast);

  const tables: TenseTable[] = [
    { tense: "presentSimple", rows: rows(presentSimple) },
    { tense: "presentContinuous", rows: after(bePresent, ingForm) },
    { tense: "pastSimple", rows: rows(pastSimple) },
    { tense: "pastContinuous", rows: after(bePast, ingForm) },
    { tense: "presentPerfect", rows: after(havePresent, pastParticiple) },
    { tense: "presentPerfectContinuous", rows: after(havePresent, `been ${ingForm}`) },
    { tense: "pastPerfect", rows: fixed(`had ${pastParticiple}`) },
    { tense: "pastPerfectContinuous", rows: fixed(`had been ${ingForm}`) },
    { tense: "futureSimple", rows: fixed(`will ${infinitive}`) },
    { tense: "futureContinuous", rows: fixed(`will be ${ingForm}`) },
    { tense: "futurePerfect", rows: fixed(`will have ${pastParticiple}`) },
    { tense: "futurePerfectContinuous", rows: fixed(`will have been ${ingForm}`) },
    { tense: "conditional", rows: fixed(`would ${infinitive}`) },
    { tense: "conditionalPerfect", rows: fixed(`would have ${pastParticiple}`) },
    {
      tense: "imperative",
      rows: [
        { person: "you", form: `${infinitive}!` },
        { person: "we", form: `let's ${infinitive}!` },
      ],
    },
  ];

  if (verbForms?.passive) {
    tables.push(
      { tense: "passivePresent", rows: after(bePresent, pastParticiple) },
      { tense: "passivePast", rows: after(bePast, pastParticiple) },
      { tense: "passivePerfect", rows: after(havePresent, `been ${pastParticiple}`) }
    );
  }

  const principalParts: PrincipalPart[] = [
    { name: "infinitive", form: infinitive },
    { name: "thirdPerson", form: thirdPerson },
    { name: "simplePast", form: simplePast },
    { name: "pastParticiple", form: pastParticiple },
    { name: "presentParticiple", form: ingForm },
  ];
  return { kind: "verb", principalParts, tables, pronouns: [] };
}

function regularPlural(noun: string): string | null {
  const lastWord = noun.toLowerCase().split(/[\s-]/).pop() ?? noun;
  if (UNCOUNTABLE_NOUNS.has(lastWord)) return null;
  const irregular = IRREGULAR_PLURALS.get(lastWord);
  if (irregular) return `${noun.slice(0, noun.length - lastWord.length)}${irregular}`;
  // Compounds of "man" change too (policeman → policemen), unlike human, German, Roman.
  if (/man$/.test(lastWord) && !/^(hu|ger|ro|sha|otto)man$/.test(lastWord)) return `${noun.slice(0, -2)}en`;
  if (/(s|x|z|ch|sh)$/.test(lastWord)) return `${noun}es`;
  return /[^aeiou]y$/.test(lastWord) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
}

export function inflectEnglishNoun(headword: string, storedPlural: string | null): WordInflection {
  return {
    kind: "noun",
    plural: expandPlural(headword, storedPlural) ?? regularPlural(headword),
    singularCases: [],
    pluralCases: [],
  };
}
