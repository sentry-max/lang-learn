import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { UiLanguage, languageLabel } from "@domain/entities/Language";
import { isSupabaseConfigured } from "@infrastructure/supabase/client";
import { AuthProvider, useAuth } from "@presentation/context/AuthContext";
import { ServicesProvider } from "@presentation/context/ServicesContext";
import { LanguageProvider, useLanguage } from "@presentation/context/LanguageContext";
import { ProfileProvider } from "@presentation/context/ProfileContext";
import { FeedbackProvider } from "@presentation/context/FeedbackContext";
import AppErrorBoundary from "@presentation/components/AppErrorBoundary";
import SyncIndicator from "@presentation/components/SyncIndicator";
import SignOutButton from "@presentation/components/SignOutButton";
import Icon, { IconName } from "@presentation/components/ui/Icon";
import MenuSelect from "@presentation/components/ui/MenuSelect";
import QuizPage from "@presentation/pages/QuizPage";
import { UiStringKey } from "@presentation/i18n/translations";
import { PageLoader } from "@presentation/components/ui/Loader";

// The quiz is the landing page; everything else is loaded on demand.
const pageLoaders = {
  history: () => import("@presentation/pages/HistoryPage"),
  dashboard: () => import("@presentation/pages/DashboardPage"),
  vocabularies: () => import("@presentation/pages/VocabulariesPage"),
  vocabularyDetail: () => import("@presentation/pages/VocabularyDetailPage"),
  vocabularyEditor: () => import("@presentation/pages/VocabularyEditorPage"),
  feed: () => import("@presentation/pages/FeedPage"),
  settings: () => import("@presentation/pages/SettingsPage"),
};
const HistoryPage = lazy(pageLoaders.history);
const DashboardPage = lazy(pageLoaders.dashboard);
const VocabulariesPage = lazy(pageLoaders.vocabularies);
const VocabularyDetailPage = lazy(pageLoaders.vocabularyDetail);
const VocabularyEditorPage = lazy(pageLoaders.vocabularyEditor);
const FeedPage = lazy(pageLoaders.feed);
const SettingsPage = lazy(pageLoaders.settings);
// Signed-in visits (the common case) never need the sign-in form.
const LoginPage = lazy(() => import("@presentation/pages/LoginPage"));

/**
 * Once the first screen is up and the device is idle, fetch the other pages
 * in the background so tapping a tab opens it instantly — unless the user
 * asked to save data or the connection is slow.
 */
function usePreloadPages() {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
    const preload = () => Object.values(pageLoaders).forEach((load) => load().catch(() => {}));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(preload, 2500);
    return () => window.clearTimeout(timer);
  }, []);
}

const NAV_ITEMS: { to: string; key: UiStringKey; icon: IconName; mobile: boolean }[] = [
  { to: "/quiz", key: "navQuiz", icon: "quiz", mobile: true },
  { to: "/history", key: "navHistory", icon: "history", mobile: true },
  { to: "/vocabularies", key: "navVocabularies", icon: "book", mobile: true },
  { to: "/feed", key: "navFeed", icon: "compass", mobile: true },
  { to: "/dashboard", key: "navDashboard", icon: "chart", mobile: true },
  { to: "/settings", key: "navSettings", icon: "settings", mobile: false },
];

function LanguageSwitcher() {
  const { language, setLanguage, supportedLanguages, t } = useLanguage();
  return (
    <MenuSelect<UiLanguage>
      icon="globe"
      className="lang-menu hide-mobile"
      ariaLabel={t("uiLanguageLabel")}
      value={language}
      onChange={setLanguage}
      options={supportedLanguages.map((code) => ({ value: code, label: languageLabel(code) }))}
    />
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div className="page" key={location.pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes location={location}>
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/vocabularies" element={<VocabulariesPage />} />
          <Route path="/vocabularies/new" element={<VocabularyEditorPage />} />
          <Route path="/vocabularies/:id" element={<VocabularyDetailPage />} />
          <Route path="/vocabularies/:id/edit" element={<VocabularyEditorPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/quiz" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function SignedInApp() {
  const { t } = useLanguage();
  usePreloadPages();
  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? " active" : ""}`;

  return (
    <ServicesProvider>
      <ProfileProvider>
        <div className="app-shell">
          <header className="topbar">
            <Link to="/quiz" className="brand">
              <img className="brand-mark" src="/icons/logo-128.png" alt="" width={32} height={32} decoding="async" />
              <span className="brand-name">{t("appName")}</span>
            </Link>
            <nav className="nav-links" aria-label={t("mainNavigation")}>
              {NAV_ITEMS.map(({ to, key, icon }) => (
                <NavLink key={to} to={to} className={linkClass}>
                  <Icon name={icon} size={18} />
                  <span>{t(key)}</span>
                </NavLink>
              ))}
            </nav>
            <span className="nav-spacer" />
            <SyncIndicator />
            <NavLink
              to="/settings"
              className={({ isActive }) => `icon-btn mobile-only${isActive ? " active" : ""}`}
              aria-label={t("navSettings")}
            >
              <Icon name="settings" />
            </NavLink>
            <LanguageSwitcher />
            <SignOutButton className="icon-btn hide-mobile" />
          </header>
          <AppErrorBoundary>
            <AnimatedRoutes />
          </AppErrorBoundary>
          <nav className="bottom-nav" aria-label={t("mainNavigation")}>
            {NAV_ITEMS.filter((item) => item.mobile).map(({ to, key, icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <span className="nav-icon">
                  <Icon name={icon} size={22} />
                </span>
                <span className="nav-label">{t(key)}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </ProfileProvider>
    </ServicesProvider>
  );
}

function Root() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  if (!isSupabaseConfigured) {
    return (
      <div className="app-main">
        <div className="card">
          <h2 className="card-title">{t("setupRequiredTitle")}</h2>
          <p className="muted">{t("setupRequiredBody")}</p>
        </div>
      </div>
    );
  }
  if (loading) return <PageLoader />;
  if (!user)
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    );
  // Keyed by user so nothing from a previous account survives a sign-in switch.
  return <SignedInApp key={user.id} />;
}

export default function App() {
  return (
    <LanguageProvider>
      <FeedbackProvider>
        <AppErrorBoundary>
          <AuthProvider>
            <BrowserRouter>
              <Root />
            </BrowserRouter>
          </AuthProvider>
        </AppErrorBoundary>
      </FeedbackProvider>
    </LanguageProvider>
  );
}
