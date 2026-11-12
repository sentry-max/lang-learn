import { useCallback, useEffect, useRef, useState } from "react";
import { LanguageCode } from "@domain/entities/Language";
import { VOICE_LANG } from "@presentation/speech";

// The Web Speech recognition API isn't in TypeScript's DOM types yet: the parts used here.
interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

const MAX_ALTERNATIVES = 5;

/** Why a take could not be heard. */
export type RecorderFailure = "unsupported" | "microphone_denied" | "offline" | "failed";

export class RecorderError extends Error {
  constructor(readonly failure: RecorderFailure) {
    super(`The line could not be heard: ${failure}`);
  }
}

export interface RecordedTake {
  /** What the recogniser heard, most likely first */
  alternatives: string[];
  confidence: number | null;
  /** The recording, or null when the browser can't record */
  audio: Blob | null;
  durationMs: number;
}

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function canRecognizeSpeech(): boolean {
  return recognitionConstructor() !== null && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function recorderOptions(): MediaRecorderOptions | undefined {
  const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported?.(type));
  return mimeType ? { mimeType, audioBitsPerSecond: 24_000 } : undefined;
}

/** Joins the recogniser's results (one per pause) into whole-line alternatives. */
function alternativesOf(event: RecognitionEvent): { alternatives: string[]; confidence: number | null } {
  const results = Array.from({ length: event.results.length }, (_, index) => event.results[index]);
  const count = Math.max(1, ...results.map((result) => result.length));
  const alternatives = Array.from({ length: count }, (_, rank) =>
    results.map((result) => (result[rank] ?? result[0])?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim()
  ).filter(Boolean);
  const confidences = results.map((result) => result[0]?.confidence).filter((value): value is number => typeof value === "number" && value > 0);
  return { alternatives: Array.from(new Set(alternatives)), confidence: confidences.length > 0 ? Math.min(...confidences) : null };
}

interface Session {
  recognition: Recognition;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
}

/**
 * Listens to one line read aloud and records it on the same microphone stream. `listen` resolves with the take when
 * the reader stops (`stop`, or the browser ending recognition after a long silence), or rejects with a RecorderError. Everything stops when the screen closes.
 */
export function useLineRecorder() {
  const [isListening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const sessionRef = useRef<Session | null>(null);

  const release = useCallback((session: Session) => {
    session.stream?.getTracks().forEach((track) => track.stop());
    if (sessionRef.current === session) sessionRef.current = null;
  }, []);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) return;
      session.recognition.abort();
      if (session.recorder?.state === "recording") session.recorder.stop();
      release(session);
    },
    [release]
  );

  const listen = useCallback(
    async (language: LanguageCode): Promise<RecordedTake> => {
      const RecognitionClass = recognitionConstructor();
      if (!RecognitionClass || sessionRef.current) throw new RecorderError("unsupported");

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) throw new RecorderError("microphone_denied");
        // No recording possible; recognition may still hear the line.
      }

      const recorder = stream && typeof MediaRecorder !== "undefined" ? new MediaRecorder(stream, recorderOptions()) : null;
      const chunks: Blob[] = [];
      if (recorder) recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);

      const recognition = new RecognitionClass();
      recognition.lang = VOICE_LANG[language];
      recognition.interimResults = true;
      // Pauses between words don't end the take; it ends when the line is complete or the reader stops.
      recognition.continuous = true;
      recognition.maxAlternatives = MAX_ALTERNATIVES;
      const session: Session = { recognition, recorder, stream };
      sessionRef.current = session;
      const startedAt = Date.now();

      return new Promise<RecordedTake>((resolve, reject) => {
        let heard: { alternatives: string[]; confidence: number | null } = { alternatives: [], confidence: null };
        let failure: RecorderFailure | null = null;

        const finish = () => {
          release(session);
          setListening(false);
          setInterimText("");
          if (failure) {
            reject(new RecorderError(failure));
            return;
          }
          const audio = chunks.length > 0 ? new Blob(chunks, { type: recorder?.mimeType || chunks[0].type }) : null;
          resolve({ ...heard, audio, durationMs: Date.now() - startedAt });
        };

        recognition.onresult = (event) => {
          heard = alternativesOf(event);
          setInterimText(heard.alternatives[0] ?? "");
        };
        recognition.onerror = (event) => {
          if (event.error === "not-allowed" || event.error === "service-not-allowed") failure = "microphone_denied";
          else if (event.error === "network") failure = "offline";
          else if (event.error !== "no-speech" && event.error !== "aborted") failure = "failed";
        };
        recognition.onend = () => {
          if (recorder && recorder.state === "recording") {
            recorder.onstop = finish;
            recorder.stop();
          } else {
            finish();
          }
        };

        try {
          recorder?.start();
          recognition.start();
          setListening(true);
        } catch {
          failure = "failed";
          if (recorder?.state === "recording") recorder.stop();
          finish();
        }
      });
    },
    [release]
  );

  const stop = useCallback(() => sessionRef.current?.recognition.stop(), []);

  return { isListening, interimText, listen, stop };
}
