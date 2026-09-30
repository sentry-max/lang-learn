import { Suspense, lazy } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { UiLanguage, languageLabel } from "@domain/entities/Language";
import { isSupabaseConfigured } from "@infrastructure/supabase/client";
import { AuthProvider, useAuth } from "@presentation/context/AuthContext";
import { ServicesProvider } from "@presentation/context/ServicesContext";
import { LanguageProvider, useLanguage } from "@presentation/context/LanguageContext";
import { ProfileProvider } from "@presentation/context/ProfileContext";
import { FeedbackProvider, useConfirm } from "@presentation/context/FeedbackContext";
import AppErrorBoundary from "@presentation/components/AppErrorBoundary";
import SyncIndicator from "@presentation/components/SyncIndicator";
import Icon, { IconName } from "@presentation/components/ui/Icon";
import MenuSelect from "@presentation/components/ui/MenuSelect";
import LoginPage from "@presentation/pages/LoginPage";
import QuizPage from "@presentation/pages/QuizPage";
import { UiStringKey } from "@presentation/i18n/translations";
import { PageLoader } from "@presentation/components/ui/Loader";

// The quiz is the landing page; everything else is loaded on demand.
const HistoryPage = lazy(() => import("@presentation/pages/HistoryPage"));
const DashboardPage = lazy(() => import("@presentation/pages/DashboardPage"));
const VocabulariesPage = lazy(() => import("@presentation/pages/VocabulariesPage"));
const VocabularyDetailPage = lazy(() => import("@presentation/pages/VocabularyDetailPage"));
const VocabularyEditorPage = lazy(() => import("@presentation/pages/VocabularyEditorPage"));
const FeedPage = lazy(() => import("@presentation/pages/FeedPage"));
const SettingsPage = lazy(() => import("@presentation/pages/SettingsPage"));

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
      className="lang-menu"
      ariaLabel={t("uiLanguageLabel")}
      value={language}
      onChange={setLanguage}
      options={supportedLanguages.map((code) => ({ value: code, label: languageLabel(code) }))}
    />
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const confirm = useConfirm();
  return (
    <button
      type="button"
      className="icon-btn"
      title={t("signOut")}
      aria-label={t("signOut")}
      onClick={async () => {
        const ok = await confirm({
          title: t("signOutConfirmTitle"),
          message: t("signOutConfirmBody"),
          confirmLabel: t("signOut"),
          danger: true,
        });
        if (ok) await signOut();
      }}
    >
      <Icon name="logout" />
    </button>
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
  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? " active" : ""}`;

  return (
    <ServicesProvider>
      <ProfileProvider>
        <div className="app-shell">
          <header className="topbar">
            <Link to="/quiz" className="brand">
              <img className="brand-mark" src="/icons/logo-128.png" alt="" width={32} height={32} />
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
            <NavLink
              to="/settings"
              className={({ isActive }) => `icon-btn mobile-only${isActive ? " active" : ""}`}
              aria-label={t("navSettings")}
            >
              <Icon name="settings" />
            </NavLink>
            <SyncIndicator />
            <LanguageSwitcher />
            <SignOutButton />
          </header>
          <AppErrorBoundary>
            <AnimatedRoutes />
          </AppErrorBoundary>
          <nav className="bottom-nav" aria-label={t("mainNavigation")}>
            {NAV_ITEMS.filter((item) => item.mobile).map(({ to, key, icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon name={icon} size={22} />
                <span>{t(key)}</span>
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
  if (!user) return <LoginPage />;
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
