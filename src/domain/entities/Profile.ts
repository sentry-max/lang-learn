import { LanguageCode, UiLanguage } from "@domain/entities/Language";
import { Preferences } from "@domain/entities/Preferences";
import { QuizSettings } from "@domain/entities/QuizSettings";

export const DISPLAY_NAME_MAX = 60;

export interface Profile {
  id: string;
  displayName: string;
  /** The user's own language: translations are shown in it */
  primaryLanguage: LanguageCode;
  uiLanguage: UiLanguage;
  quizSettings: QuizSettings;
  preferences: Preferences;
}

export type ProfilePatch = Partial<Omit<Profile, "id">>;
