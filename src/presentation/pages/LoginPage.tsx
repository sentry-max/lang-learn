import { FormEvent, useState } from "react";
import { useAuth } from "@presentation/context/AuthContext";
import { useLanguage } from "@presentation/context/LanguageContext";

const MIN_PASSWORD_LENGTH = 8;

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { t, language } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "sign_up" && password.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordTooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign_in") {
        const result = await signIn(email, password);
        if (result) setError(result);
      } else {
        const result = await signUp(email, password, language);
        if (result.error !== null) setError(result.error);
        else if (result.needsConfirmation) setInfo(t("checkEmailToConfirm"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-main login-page">
      <div className="card">
        <div className="login-brand">
          <img src="/icons/logo-128.png" alt="" width={64} height={64} decoding="async" />
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
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="feedback-incorrect" role="alert">
              {error}
            </p>
          )}
          {info && <p className="feedback-correct">{info}</p>}
          <button className="btn btn-block" type="submit" disabled={busy}>
            {mode === "sign_in" ? t("signInButton") : t("signUpButton")}
          </button>
        </form>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ marginTop: 8 }}
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "sign_in" ? t("switchToSignUp") : t("switchToSignIn")}
        </button>
      </div>
    </div>
  );
}
