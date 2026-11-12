import { LanguageCode } from "@domain/entities/Language";
import { RoleGender } from "@domain/entities/Conversation";

export const VOICE_LANG: Record<LanguageCode, string> = { de: "de-DE", en: "en-US", fa: "fa-IR" };

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Reads text aloud with the browser's built-in speech synthesis, if available. */
export function speak(text: string, language: LanguageCode, rate = 0.9): void {
  if (!canSpeak() || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = VOICE_LANG[language];
    utterance.rate = rate;
    const voice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(language));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech unavailable.
  }
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

// shortcut: browsers don't report a voice's gender, so it is guessed from common voice names; when no name
// matches, two different voices (or one voice at two pitches) keep the speakers apart.
const VOICE_NAME_PATTERNS: Record<RoleGender, RegExp> = {
  female: /female|woman|frau|anna|helena|katja|marlene|petra|vicki|hedda|zira|aria|jenny|samantha|karen|moira|tessa|fiona|serena|victoria|susan|libby|sonia|dilara|maryam/i,
  male: /\bmale\b|\bman\b|mann|hans|markus|stefan|conrad|yannick|daniel|david|mark|guy|alex|fred|tom|george|james|ryan|thomas|farid|reza/i,
};

function voicesFor(language: LanguageCode): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(language));
}

/** Voices load asynchronously in some browsers: waits briefly for the first list. */
function voicesReady(): Promise<void> {
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, 1000);
    function done() {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    }
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

/**
 * Reads one line of a dialogue with a female or male voice and resolves when it has been spoken (or stopped).
 * Resolves at once when speech synthesis is unavailable.
 */
export async function speakLine(text: string, language: LanguageCode, gender: RoleGender): Promise<void> {
  if (!canSpeak() || !text.trim()) return;
  await voicesReady();
  const voices = voicesFor(language);
  const otherGender: RoleGender = gender === "female" ? "male" : "female";
  const named = voices.find((voice) => VOICE_NAME_PATTERNS[gender].test(voice.name) && !VOICE_NAME_PATTERNS[otherGender].test(voice.name));
  const fallback = voices[gender === "female" ? 0 : Math.min(1, voices.length - 1)];
  const voice = named ?? fallback;
  const sharesVoice = !named && voices.length < 2;

  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = VOICE_LANG[language];
      utterance.rate = 0.9;
      if (voice) utterance.voice = voice;
      if (sharesVoice) utterance.pitch = gender === "female" ? 1.15 : 0.85;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}
