import { Profile, ProfilePatch } from "@domain/entities/Profile";
import { ProfileRepository } from "@domain/repositories/ProfileRepository";
import { QueryCache } from "@infrastructure/cache/QueryCache";

/**
 * Keeps the signed-in user's profile in the shared cache, so the app opens at once with the profile from the last
 * visit and refreshes it in the background. Writes go to the server and replace the cached copy.
 */
export class OfflineProfileRepository implements ProfileRepository {
  constructor(
    private readonly inner: ProfileRepository,
    private readonly cache: QueryCache
  ) {}

  get(userId: string): Promise<Profile | null> {
    return this.cache.read(`profile:${userId}`, () => this.inner.get(userId));
  }

  async ensure(userId: string, fallbackDisplayName: string): Promise<Profile> {
    const profile = await this.inner.ensure(userId, fallbackDisplayName);
    this.cache.put(`profile:${userId}`, profile);
    return profile;
  }

  async update(userId: string, patch: ProfilePatch): Promise<Profile> {
    const profile = await this.inner.update(userId, patch);
    this.cache.put(`profile:${userId}`, profile);
    return profile;
  }
}
