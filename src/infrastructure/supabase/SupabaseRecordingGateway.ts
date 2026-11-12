import { SupabaseClient } from "@supabase/supabase-js";
import { RecordingGateway } from "@application/ports/RecordingGateway";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";

export const RECORDINGS_BUCKET = "conversation-recordings";
const PLAYBACK_URL_SECONDS = 10 * 60;

/** Recordings in a private Storage bucket, one folder per user (see supabase/schema.sql). */
export class SupabaseRecordingGateway implements RecordingGateway {
  constructor(private readonly client: SupabaseClient) {}

  upload(path: string, audio: Blob): Promise<void> {
    return guard("Failed to save the recording.", async () => {
      const { error } = await this.client.storage.from(RECORDINGS_BUCKET).upload(path, audio, { upsert: false, contentType: audio.type.split(";")[0] || undefined });
      // The same take sent twice (a retry after a lost answer): the file is already there.
      if (error && (String((error as { statusCode?: unknown }).statusCode) === "409" || /already exists/i.test(error.message))) return;
      throwIfSupabaseError(error, "Failed to save the recording.");
    });
  }

  playbackUrl(path: string): Promise<string> {
    return guard("Failed to load the recording.", async () => {
      const { data, error } = await this.client.storage.from(RECORDINGS_BUCKET).createSignedUrl(path, PLAYBACK_URL_SECONDS);
      throwIfSupabaseError(error, "Failed to load the recording.");
      return data!.signedUrl;
    });
  }
}
