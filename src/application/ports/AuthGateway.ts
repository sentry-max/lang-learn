export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthFailure =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "rate_limited"
  | "network"
  | "unknown";

export type SignUpResult = { failure: AuthFailure } | { failure: null; needsConfirmation: boolean };

export interface AuthGateway {
  getCurrentUser(): Promise<AuthUser | null>;
  /** Returns a function that stops listening. */
  onUserChanged(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthFailure | null>;
  /** `uiLanguage` becomes the new profile's initial app language */
  signUp(email: string, password: string, uiLanguage: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
}
