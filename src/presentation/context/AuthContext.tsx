import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@infrastructure/supabase/client";
import { toAppError } from "@domain/errors/AppError";

export interface AuthUser {
  id: string;
  email: string | null;
}

export type SignUpResult = { error: string } | { error: null; needsConfirmation: boolean };

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** `uiLanguage` becomes the new profile's initial app language */
  signUp: (email: string, password: string, uiLanguage: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function toUser(session: Session | null): AuthUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? null } : null;
}

/** Supabase email/password auth. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUser(toUser(data.session));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Only replace the user object when the identity actually changes, so
      // token refreshes don't re-render the whole app.
      setUser((previous) => {
        const next = toUser(session);
        return previous?.id === next?.id ? previous : next;
      });
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        try {
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          return error ? error.message : null;
        } catch (err) {
          return toAppError(err, "Could not sign in.").message;
        }
      },
      signUp: async (email, password, uiLanguage) => {
        try {
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { ui_language: uiLanguage } },
          });
          if (error) return { error: error.message };
          return { error: null, needsConfirmation: !data.session };
        } catch (err) {
          return { error: toAppError(err, "Could not create your account.").message };
        }
      },
      signOut: async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          setUser(null);
        }
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** For pages rendered only when signed in. */
export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser used outside a signed-in area");
  return user;
}
