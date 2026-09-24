import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@infrastructure/supabase/client";
import { getAppMode } from "@infrastructure/config/appMode";
import { getOrCreateLocalUserId } from "@infrastructure/local/localIdentity";
import { toAppError } from "@domain/errors/AppError";

/** Only `session.user.id` is used anywhere in the app, so both auth backends can share this minimal shape. */
interface MinimalSession {
  user: { id: string };
}

interface AuthState {
  session: MinimalSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Normal cloud mode: real Supabase email/password auth. */
function CloudAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MinimalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    } catch (err) {
      return toAppError(err, "Could not sign in.").message;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      return error ? error.message : null;
    } catch (err) {
      return toAppError(err, "Could not create your account.").message;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Sign-out failing offline isn't worth surfacing — the local session state still clears below.
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Offline mode: no accounts, no network — a stable local id stands in for a session. */
function OfflineAuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthState>(
    () => ({
      session: { user: { id: getOrCreateLocalUserId() } },
      loading: false,
      signIn: async () => null,
      signUp: async () => null,
      signOut: async () => {},
    }),
    []
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return getAppMode() === "offline" ? (
    <OfflineAuthProvider>{children}</OfflineAuthProvider>
  ) : (
    <CloudAuthProvider>{children}</CloudAuthProvider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
