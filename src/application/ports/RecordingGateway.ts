/** Stores and plays back the audio of lines read aloud. Recordings are never replaced or deleted. */
export interface RecordingGateway {
  /** Sending the same path again succeeds without changing the stored file. */
  upload(path: string, audio: Blob): Promise<void>;
  /** A URL an audio element can play, valid for a short time. */
  playbackUrl(path: string): Promise<string>;
}
