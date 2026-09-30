import { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRIMARY_LANGUAGE, DEFAULT_UI_LANGUAGE, isLanguageCode, isUiLanguage } from "@domain/entities/Language";
import { Profile, ProfilePatch } from "@domain/entities/Profile";
import { normalizePreferences } from "@domain/entities/Preferences";
import { normalizeQuizSettings } from "@domain/entities/QuizSettings";
import { ProfileRepository } from "@domain/repositories/ProfileRepository";
import { guard, throwIfSupabaseError } from "@infrastructure/supabase/supabaseErrors";

const PROFILE_COLUMNS = "id, display_name, primary_language, ui_language, quiz_settings, preferences";

interface ProfileRow {
  id: string;
  display_name: string;
  primary_language: string;
  ui_language: string;
  quiz_settings: unknown;
  preferences: unknown;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    primaryLanguage: isLanguageCode(row.primary_language) ? row.primary_language : DEFAULT_PRIMARY_LANGUAGE,
    uiLanguage: isUiLanguage(row.ui_language) ? row.ui_language : DEFAULT_UI_LANGUAGE,
    quizSettings: normalizeQuizSettings(row.quiz_settings),
    preferences: normalizePreferences(row.preferences),
  };
}

function patchToRow(patch: ProfilePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.primaryLanguage !== undefined) row.primary_language = patch.primaryLanguage;
  if (patch.uiLanguage !== undefined) row.ui_language = patch.uiLanguage;
  if (patch.quizSettings !== undefined) row.quiz_settings = patch.quizSettings;
  if (patch.preferences !== undefined) row.preferences = patch.preferences;
  return row;
}

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: SupabaseClient) {}

  get(userId: string): Promise<Profile | null> {
    return guard("Failed to load your profile.", async () => {
      const { data, error } = await this.client
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", userId)
        .returns<ProfileRow[]>()
        .maybeSingle();
      throwIfSupabaseError(error, "Failed to load your profile.");
      return data ? rowToProfile(data as ProfileRow) : null;
    });
  }

  ensure(userId: string, fallbackDisplayName: string): Promise<Profile> {
    return guard("Failed to create your profile.", async () => {
      const { error } = await this.client
        .from("profiles")
        .upsert({ id: userId, display_name: fallbackDisplayName }, { onConflict: "id", ignoreDuplicates: true });
      throwIfSupabaseError(error, "Failed to create your profile.");
      const profile = await this.get(userId);
      if (!profile) throw new Error("Failed to create your profile.");
      return profile;
    });
  }

  update(userId: string, patch: ProfilePatch): Promise<Profile> {
    return guard("Failed to save your profile.", async () => {
      const { data, error } = await this.client
        .from("profiles")
        .update(patchToRow(patch))
        .eq("id", userId)
        .select(PROFILE_COLUMNS)
        .returns<ProfileRow[]>()
        .single();
      throwIfSupabaseError(error, "Failed to save your profile.");
      return rowToProfile(data as ProfileRow);
    });
  }
}
