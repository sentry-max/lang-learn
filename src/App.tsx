import { useEffect } from "react";
import { BrowserRouter, NavLink, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@presentation/context/AuthContext";
import { ServicesProvider, useServices } from "@presentation/context/ServicesContext";
import { LanguageProvider, useLanguage } from "@presentation/context/LanguageContext";
import { LANGUAGE_LABELS } from "@domain/entities/Language";
import { getAppMode } from "@infrastructure/config/appMode";
import AppErrorBoundary from "@presentation/components/AppErrorBoundary";
import ConnectivityBanner from "@presentation/components/ConnectivityBanner";
import LoginPage from "@presentation/pages/LoginPage";
import QuizPage from "@presentation/pages/QuizPage";
import DashboardPage from "@presentation/pages/DashboardPage";
import VocabulariesPage from "@presentation/pages/VocabulariesPage";

function LanguageSwitcher() {
  const { language, setLanguage, supportedLanguages, t } = useLanguage();
  return (
    <select
      className="lang-select"
      aria-label={t("languageLabel")}
      value={language}
      onChange={(e) => setLanguage(e.target.value as typeof language)}
    >
      {supportedLanguages.map((code) => (
        <option key={code} value={code}>
          {LANGUAGE_LABELS[code]}
        </option>
      ))}
    </select>
  );
}

/**
 * Fetches vocabulary from the remote once on first run, and again whenever
 * the browser regains connectivity — both silent/best-effort, since the
 * Vocabularies page's own "re-sync" button surfaces errors explicitly.
 */
function VocabularySyncBootstrapper() {
  const { vocabularySync } = useServices();

  useEffect(() => {
    if (!vocabularySync) return;
    vocabularySync.resync().catch(() => {});

    function handleOnline() {
      vocabularySync?.resync().catch(() => {});
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function AuthedApp() {
  const { session, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const isOffline = getAppMode() === "offline";

  if (loading) return <div className="app-main center-text muted">{t("loading")}</div>;
  if (!session) return <LoginPage />;

  return (
    <ServicesProvider>
      <VocabularySyncBootstrapper />
      <BrowserRouter>
        <div className="app-shell">
          <ConnectivityBanner />
          <nav className="nav-bar">
            <NavLink to="/quiz" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              {t("navQuiz")}
            </NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              {t("navDashboard")}
            </NavLink>
            <NavLink to="/vocabularies" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              {t("navVocabularies")}
            </NavLink>
            <span className="nav-spacer" />
            {isOffline && <span className="offline-badge">{t("offlineModeBadge")}</span>}
            <LanguageSwitcher />
            {!isOffline && (
              <button
                className="nav-link"
                style={{ border: "none", background: "none" }}
                onClick={signOut}
              >
                {t("signOut")}
              </button>
            )}
          </nav>
          <AppErrorBoundary>
            <Routes>
              <Route path="/quiz" element={<QuizPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/vocabularies" element={<VocabulariesPage />} />
              <Route path="*" element={<Navigate to="/quiz" replace />} />
            </Routes>
          </AppErrorBoundary>
        </div>
      </BrowserRouter>
    </ServicesProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppErrorBoundary>
        <AuthProvider>
          <AuthedApp />
        </AuthProvider>
      </AppErrorBoundary>
    </LanguageProvider>
  );
}
