import { Profile, ProfilePatch } from "@domain/entities/Profile";

export interface ProfileRepository {
  get(userId: string): Promise<Profile | null>;
  /** Creates the profile if it does not exist yet (e.g. the sign-up trigger was missing). */
  ensure(userId: string, fallbackDisplayName: string): Promise<Profile>;
  update(userId: string, patch: ProfilePatch): Promise<Profile>;
}
