import { useState } from "react";
import { useAuth } from "@presentation/context/AuthContext";
import { useLanguage } from "@presentation/context/LanguageContext";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = mode === "sign_in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result) setError(result);
  };

  return (
    <div className="app-main">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>{t("appName")}</h1>
        <p className="muted">{mode === "sign_in" ? t("signInTitle") : t("signUpTitle")}</p>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder={t("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder={t("password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
          <button className="btn btn-block" type="submit" disabled={busy}>
            {mode === "sign_in" ? t("signInButton") : t("signUpButton")}
          </button>
        </form>
        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: 8 }}
          onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
        >
          {mode === "sign_in" ? t("switchToSignUp") : t("switchToSignIn")}
        </button>
      </div>
    </div>
  );
}
