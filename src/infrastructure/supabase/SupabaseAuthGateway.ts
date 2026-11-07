import { Session, SupabaseClient } from "@supabase/supabase-js";
import { AuthFailure, AuthGateway, AuthUser, SignUpResult } from "@application/ports/AuthGateway";

function toUser(session: Session | null): AuthUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? null } : null;
}

/** Maps Supabase's error codes (https://supabase.com/docs/guides/auth/debugging/error-codes) to the app's reasons. */
export function toAuthFailure(error: unknown): AuthFailure {
  const { code, name } = (error ?? {}) as { code?: string; name?: string };
  if (error instanceof TypeError || name === "AuthRetryableFetchError") return "network";
  switch (code) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "user_already_exists":
    case "email_exists":
      return "email_taken";
    case "weak_password":
      return "weak_password";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rate_limited";
    default:
      return "unknown";
  }
}

export class SupabaseAuthGateway implements AuthGateway {
  constructor(private readonly client: SupabaseClient) {}

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getSession();
    return toUser(data.session);
  }

  onUserChanged(listener: (user: AuthUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(toUser(session)));
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<AuthFailure | null> {
    try {
      const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
      return error ? toAuthFailure(error) : null;
    } catch (error) {
      return toAuthFailure(error);
    }
  }

  async signUp(email: string, password: string, uiLanguage: string): Promise<SignUpResult> {
    try {
      const { data, error } = await this.client.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { ui_language: uiLanguage } },
      });
      if (error) return { failure: toAuthFailure(error) };
      return { failure: null, needsConfirmation: !data.session };
    } catch (error) {
      return { failure: toAuthFailure(error) };
    }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
