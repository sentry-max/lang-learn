import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, UiLanguage, isRtl, isUiLanguage } from "@domain/entities/Language";
import { translate, UiStringKey } from "@presentation/i18n/translations";

const STORAGE_KEY = "lang-learn:ui-language";

interface LanguageState {
  /** Language of the interface itself */
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  supportedLanguages: UiLanguage[];
  isRtl: boolean;
  t: (key: UiStringKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageState | null>(null);

function readStoredLanguage(): UiLanguage {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isUiLanguage(stored)) return stored;
  } catch {
    // Storage unavailable (private mode) — use the default.
  }
  return DEFAULT_UI_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(readStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl(language) ? "rtl" : "ltr";
  }, [language]);

  const setLanguage = useCallback((next: UiLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The in-memory state still updates.
    }
  }, []);

  const value = useMemo<LanguageState>(
    () => ({
      language,
      setLanguage,
      supportedLanguages: UI_LANGUAGES,
      isRtl: isRtl(language),
      t: (key, vars) => translate(language, key, vars),
    }),
    [language, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
