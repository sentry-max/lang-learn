import { ReactNode } from "react";
import { ErrorBoundary } from "@presentation/components/ErrorBoundary";
import { useLanguage } from "@presentation/context/LanguageContext";

export default function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <ErrorBoundary title={t("errorBoundaryTitle")} body={t("errorBoundaryBody")} reloadLabel={t("reload")}>
      {children}
    </ErrorBoundary>
  );
}
