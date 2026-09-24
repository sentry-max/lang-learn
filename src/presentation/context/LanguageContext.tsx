import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  LanguageCode,
  SUPPORTED_LANGUAGES,
  isRtl,
} from "@domain/entities/Language";
import { translate, UiStringKey } from "@presentation/i18n/translations";

const STORAGE_KEY = "b1-vocab-trainer:language";

interface LanguageState {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  supportedLanguages: LanguageCode[];
  isRtl: boolean;
  t: (key: UiStringKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageState | null>(null);

function readStoredLanguage(): LanguageCode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as LanguageCode)) {
      return stored as LanguageCode;
    }
  } catch {
    // localStorage unavailable (e.g. private mode) — fall through to default
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl(language) ? "rtl" : "ltr";
  }, [language]);

  const setLanguage = (next: LanguageCode) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore write failures, the in-memory state still updates
    }
  };

  const value = useMemo<LanguageState>(
    () => ({
      language,
      setLanguage,
      supportedLanguages: SUPPORTED_LANGUAGES,
      isRtl: isRtl(language),
      t: (key, vars) => translate(language, key, vars),
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
