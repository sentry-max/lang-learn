import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthFailure, AuthUser, SignUpResult } from "@application/ports/AuthGateway";
import { SupabaseAuthGateway } from "@infrastructure/supabase/SupabaseAuthGateway";
import { supabase } from "@infrastructure/supabase/client";

export type { AuthUser, SignUpResult };

const authGateway = new SupabaseAuthGateway(supabase);

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthFailure | null>;
  /** `uiLanguage` becomes the new profile's initial app language */
  signUp: (email: string, password: string, uiLanguage: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Email/password auth state for the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authGateway
      .getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const stopListening = authGateway.onUserChanged((next) => {
      // Only replace the user object when the identity actually changes, so
      // token refreshes don't re-render the whole app.
      setUser((previous) => (previous?.id === next?.id ? previous : next));
    });
    return () => {
      active = false;
      stopListening();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn: (email, password) => authGateway.signIn(email, password),
      signUp: (email, password, uiLanguage) => authGateway.signUp(email, password, uiLanguage),
      signOut: async () => {
        try {
          await authGateway.signOut();
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
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

/** For pages rendered only when signed in. */
export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser used outside a signed-in area");
  return user;
}
