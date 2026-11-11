import { ConversationLineResult } from "@domain/entities/Conversation";
import { LanguageCode } from "@domain/entities/Language";
import { totalScore } from "@domain/entities/SentencePractice";
import { SentenceGrade, TokenMark, alignTokens, isTypo, tokenizeSentence } from "@domain/services/SentenceGrading";

/** A near miss (the right word heard slightly off) counts this much of an error. */
const TYPO_WEIGHT = 0.5;

// shortcut: number words only up to 100; extend when dialogues use larger spoken numbers.
const NUMBER_WORDS: Record<LanguageCode, string[]> = {
  de: [
    "null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
    "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn", "zwanzig",
  ],
  en: [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  ],
  fa: [
    "صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", "یازده", "دوازده",
    "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده", "بیست",
  ],
};
const TENS_WORDS: Record<LanguageCode, string[]> = {
  de: ["dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig", "hundert"],
  en: ["thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred"],
  fa: ["سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود", "صد"],
};
const FILLERS: Record<LanguageCode, string[]> = {
  de: ["äh", "ähm", "öhm", "hm", "hmm"],
  en: ["uh", "um", "erm", "er", "hmm", "uhm"],
  fa: ["اوم", "امم", "هوم"],
};

const digitsByWord = new Map<string, string>(
  (Object.keys(NUMBER_WORDS) as LanguageCode[]).flatMap((language) => [
    ...NUMBER_WORDS[language].map((word, value) => [`${language}:${normalizeWord(word)}`, String(value)] as const),
    ...TENS_WORDS[language].map((word, index) => [`${language}:${normalizeWord(word)}`, String((index + 3) * 10)] as const),
  ])
);

/** One word as compared: lower case, ß as ss, Persian letters and digits unified, diacritics and tatweel removed. */
function normalizeWord(word: string): string {
  return word
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/ß/gu, "ss")
    .replace(/ي/gu, "ی")
    .replace(/ك/gu, "ک")
    .replace(/[ً-ٰٟـ]/gu, "")
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

/** The words of a spoken or written line as compared keys; a ZWNJ counts as a space and number words as digits. */
export function normalizeSpoken(text: string, language: LanguageCode): string[] {
  return tokenizeSentence(text.replace(/‌/gu, " "))
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .map((token) => {
      const key = normalizeWord(token);
      return digitsByWord.get(`${language}:${key}`) ?? key;
    });
}

interface ExpectedWord {
  key: string;
  /** The word as written, with the punctuation that follows it */
  display: string;
}

function expectedWords(text: string, language: LanguageCode): ExpectedWord[] {
  const words: ExpectedWord[] = [];
  // The tokenizer splits at a ZWNJ (می‌شود), as normalizeSpoken does, so both sides have the same words.
  for (const token of tokenizeSentence(text)) {
    if (token === "‌") continue;
    const keys = normalizeSpoken(token, language);
    if (keys.length > 0) words.push({ key: keys[0], display: token });
    else if (words.length > 0) words[words.length - 1].display += token;
  }
  return words;
}

/**
 * Lines up heard words with the expected ones: fillers are dropped, two heard words that join into an expected
 * one are merged (Kaffee tasse = Kaffeetasse), and a heard word made of two neighbouring expected ones is split.
 */
function matchCompounds(heard: string[], expected: string[], language: LanguageCode): string[] {
  const fillers = new Set(FILLERS[language].map(normalizeWord));
  const words = heard.filter((word) => !fillers.has(word));
  const expectedSet = new Set(expected);
  const pairs = new Map(expected.slice(1).map((word, index) => [expected[index] + word, [expected[index], word]]));

  const result: string[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const joined = word + (words[index + 1] ?? "");
    if (index + 1 < words.length && expectedSet.has(joined) && !(expectedSet.has(word) && expectedSet.has(words[index + 1]))) {
      result.push(joined);
      index++;
    } else if (!expectedSet.has(word) && pairs.has(word)) {
      result.push(...pairs.get(word)!);
    } else {
      result.push(word);
    }
  }
  return result;
}

function gradeTranscript(expectedText: string, transcript: string, language: LanguageCode): SentenceGrade {
  const expected = expectedWords(expectedText, language);
  const expectedKeys = expected.map((word) => word.key);
  const heard = matchCompounds(normalizeSpoken(transcript, language), expectedKeys, language);

  let expectedIndex = 0;
  const marks: TokenMark[] = alignTokens(heard, expectedKeys).map((mark) => {
    const display = mark.expected === null ? null : expected[expectedIndex++].display;
    if (mark.status === "correct") return { status: "correct", actual: display, expected: display };
    if (mark.status === "wrong" && isTypo(mark.actual!, mark.expected!, false)) return { status: "typo", actual: mark.actual, expected: display };
    return { ...mark, expected: display };
  });
  const errorCount = marks.reduce((sum, mark) => sum + (mark.status === "typo" ? TYPO_WEIGHT : mark.status === "correct" ? 0 : 1), 0);
  return { errorCount, maxErrors: Math.max(1, expected.length), marks, correctSentence: expectedText };
}

export interface SpokenLineGrade {
  grade: SentenceGrade;
  /** The recognised alternative the grade is based on */
  transcript: string;
}

/** Grades every alternative the recogniser heard and keeps the kindest, so a misheard homophone isn't counted. */
export function gradeSpokenLine(expectedText: string, alternatives: readonly string[], language: LanguageCode): SpokenLineGrade {
  const candidates = alternatives.length > 0 ? alternatives : [""];
  return candidates
    .map((transcript) => ({ grade: gradeTranscript(expectedText, transcript, language), transcript }))
    .reduce((best, candidate) => (candidate.grade.errorCount < best.grade.errorCount ? candidate : best));
}

export interface RoleScore {
  roleId: string;
  attemptCount: number;
  lastScore: number | null;
  bestScore: number | null;
  averageScore: number | null;
  /** Expected words read wrong or left out, most often first */
  missedWords: string[];
  /** The latest attempt with this role, for playing back its recordings */
  latestAttemptId: string | null;
}

/** Scores per role of one dialogue: someone who always takes the same role sees that role's own progress. */
export function roleScores(results: readonly ConversationLineResult[], conversationId: string, language: LanguageCode): RoleScore[] {
  const byRole = new Map<string, ConversationLineResult[]>();
  for (const result of results) {
    if (result.conversationId !== conversationId) continue;
    byRole.set(result.roleId, [...(byRole.get(result.roleId) ?? []), result]);
  }

  return Array.from(byRole, ([roleId, roleResults]) => {
    const attempts = groupByAttempt(roleResults);
    const scores = attempts.map((attempt) => totalScore(attempt.results)).filter((score): score is number => score !== null);
    return {
      roleId,
      attemptCount: attempts.length,
      lastScore: scores[scores.length - 1] ?? null,
      bestScore: scores.length > 0 ? Math.max(...scores) : null,
      averageScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      missedWords: missedWords(roleResults, language),
      latestAttemptId: attempts[attempts.length - 1]?.attemptId ?? null,
    };
  });
}

/** The latest score of each dialogue, over every role read in its latest attempt. */
export function lastScoreByConversation(results: readonly ConversationLineResult[]): Map<string, number> {
  const byConversation = new Map<string, ConversationLineResult[]>();
  for (const result of results) byConversation.set(result.conversationId, [...(byConversation.get(result.conversationId) ?? []), result]);
  const scores = new Map<string, number>();
  for (const [conversationId, conversationResults] of byConversation) {
    const latest = groupByAttempt(conversationResults).pop();
    const score = latest ? totalScore(latest.results) : null;
    if (score !== null) scores.set(conversationId, score);
  }
  return scores;
}

/** The lines of the latest attempt that has recordings of this role, in reading order. */
export function latestRecordings(results: readonly ConversationLineResult[], attemptId: string, roleId: string): ConversationLineResult[] {
  return results.filter((result) => result.attemptId === attemptId && result.roleId === roleId && result.audioPath !== null).sort(byReadAt);
}

function groupByAttempt(results: readonly ConversationLineResult[]): { attemptId: string; results: ConversationLineResult[] }[] {
  const byAttempt = new Map<string, ConversationLineResult[]>();
  for (const result of [...results].sort(byReadAt)) byAttempt.set(result.attemptId, [...(byAttempt.get(result.attemptId) ?? []), result]);
  return Array.from(byAttempt, ([attemptId, attemptResults]) => ({ attemptId, results: attemptResults }));
}

function missedWords(results: readonly ConversationLineResult[], language: LanguageCode): string[] {
  const counts = new Map<string, number>();
  for (const result of results) {
    const { grade } = gradeSpokenLine(result.expectedText, [result.transcript], language);
    for (const mark of grade.marks) {
      if ((mark.status === "wrong" || mark.status === "missing") && mark.expected) {
        const word = mark.expected.replace(/[^\p{L}\p{N}\p{M}'-]/gu, "");
        if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts).sort((a, b) => b[1] - a[1]).map(([word]) => word).slice(0, 8);
}

function byReadAt(a: ConversationLineResult, b: ConversationLineResult): number {
  return a.readAt.localeCompare(b.readAt);
}
