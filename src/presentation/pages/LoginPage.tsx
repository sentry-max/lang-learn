import { FormEvent, useState } from "react";
import { useAuth } from "@presentation/context/AuthContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { AuthFailure } from "@application/ports/AuthGateway";
import { UiStringKey } from "@presentation/i18n/translations";
import AppLogo from "@presentation/components/ui/AppLogo";
import { Spinner } from "@presentation/components/ui/Loader";

const MIN_PASSWORD_LENGTH = 8;

const AUTH_FAILURE_KEYS: Record<AuthFailure, UiStringKey> = {
  invalid_credentials: "authInvalidCredentials",
  email_not_confirmed: "authEmailNotConfirmed",
  email_taken: "authEmailTaken",
  weak_password: "authWeakPassword",
  rate_limited: "authRateLimited",
  network: "errorNetwork",
  unknown: "authFailed",
};

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { t, language } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [error, setError] = useState<string | null>(null);
  const [information, setInformation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInformation(null);
    if (mode === "sign_up" && password.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordTooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign_in") {
        const failure = await signIn(email, password);
        if (failure) setError(t(AUTH_FAILURE_KEYS[failure]));
      } else {
        const result = await signUp(email, password, language);
        if (result.failure) setError(t(AUTH_FAILURE_KEYS[result.failure]));
        else if (result.needsConfirmation) setInformation(t("checkEmailToConfirm"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-main login-page">
      <div className="card">
        <div className="login-brand">
          <AppLogo size={64} />
          <h1>{t("appName")}</h1>
        </div>
        <p className="muted">{mode === "sign_in" ? t("signInTitle") : t("signUpTitle")}</p>
        <form onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="login-email">{t("email")}</label>
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="login-password">{t("password")}</label>
            <input
              id="login-password"
              type="password"
              dir="ltr"
              enterKeyHint="go"
              autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              minLength={mode === "sign_up" ? MIN_PASSWORD_LENGTH : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && (
            <p className="feedback-incorrect" role="alert">
              {error}
            </p>
          )}
          {information && <p className="feedback-correct">{information}</p>}
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy && <Spinner />} {mode === "sign_in" ? t("signInButton") : t("signUpButton")}
          </button>
        </form>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ marginTop: 8 }}
          disabled={busy}
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
            setInformation(null);
          }}
        >
          {mode === "sign_in" ? t("switchToSignUp") : t("switchToSignIn")}
        </button>
      </div>
    </div>
  );
}
