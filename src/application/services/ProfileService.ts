import { AppError } from "@domain/errors/AppError";
import { DISPLAY_NAME_MAX, Profile, ProfilePatch } from "@domain/entities/Profile";
import { ProfileRepository } from "@domain/repositories/ProfileRepository";

export class ProfileService {
  constructor(private readonly profiles: ProfileRepository) {}

  async load(userId: string, email: string | null): Promise<Profile> {
    const existing = await this.profiles.get(userId);
    if (existing) return existing;
    const fallbackName = (email?.split("@")[0] || "user").slice(0, DISPLAY_NAME_MAX);
    return this.profiles.ensure(userId, fallbackName);
  }

  async update(userId: string, patch: ProfilePatch): Promise<Profile> {
    if (patch.displayName !== undefined) {
      const name = patch.displayName.trim();
      if (!name || name.length > DISPLAY_NAME_MAX) {
        throw new AppError("validation", "Display name must be 1 to 60 characters.", { reason: "invalid_input" });
      }
      patch = { ...patch, displayName: name };
    }
    return this.profiles.update(userId, patch);
  }
}
