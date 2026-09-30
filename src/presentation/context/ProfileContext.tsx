import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Profile, ProfilePatch } from "@domain/entities/Profile";
import { useCurrentUser } from "@presentation/context/AuthContext";
import { useServices } from "@presentation/context/ServicesContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useErrorMessage } from "@presentation/hooks/useErrorMessage";
import ErrorBanner from "@presentation/components/ErrorBanner";
import { applyAppearance } from "@presentation/appearance";
import { Preferences } from "@domain/entities/Preferences";
import { PageLoader } from "@presentation/components/ui/Loader";

interface ProfileState {
  profile: Profile;
  preferences: Preferences;
  updateProfile: (patch: ProfilePatch) => Promise<Profile>;
}

const ProfileContext = createContext<ProfileState | null>(null);

/** Loads the signed-in user's profile (stored in Supabase) and keeps the UI language in sync with it. */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const { profiles } = useServices();
  const { language, setLanguage } = useLanguage();
  const errorMessage = useErrorMessage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    profiles
      .load(user.id, user.email)
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
        setLanguage(loaded.uiLanguage);
        applyAppearance(loaded.preferences);
      })
      .catch((err) => active && setError(errorMessage(err, "profileLoadError")));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, attempt]);

  // Switching the UI language from the nav bar is remembered in the profile too.
  useEffect(() => {
    if (!profile || profile.uiLanguage === language) return;
    profiles
      .update(user.id, { uiLanguage: language })
      .then(setProfile)
      .catch(() => {
        // Non-critical: the choice is still stored locally.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      const updated = await profiles.update(user.id, patch);
      setProfile(updated);
      if (patch.preferences) applyAppearance(updated.preferences);
      return updated;
    },
    [profiles, user.id]
  );

  const value = useMemo(
    () => (profile ? { profile, preferences: profile.preferences, updateProfile } : null),
    [profile, updateProfile]
  );

  if (error) {
    return (
      <div className="app-main">
        <ErrorBanner message={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }
  if (!value) return <PageLoader />;
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
