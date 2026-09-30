import { LanguageCode } from "@domain/entities/Language";

const VOICE_LANG: Record<LanguageCode, string> = { de: "de-DE", en: "en-US", fa: "fa-IR" };

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
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(language));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech unavailable.
  }
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
