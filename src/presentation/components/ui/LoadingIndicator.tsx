import { useSyncExternalStore } from "react";
import { isLoadingAnything, subscribeLoading } from "@presentation/loadingActivity";
import { useLanguage } from "@presentation/context/LanguageContext";
import { Spinner } from "@presentation/components/ui/Loader";

/** The spinner in the top bar while any data loads. It appears after a short delay, so quick loads never flash it. */
export default function LoadingIndicator() {
  const { t } = useLanguage();
  const isLoading = useSyncExternalStore(subscribeLoading, isLoadingAnything);
  // Keeps its space when hidden, so the top bar never shifts.
  return (
    <span className={`loading-indicator${isLoading ? " active" : ""}`} aria-hidden={!isLoading}>
      <Spinner size={20} label={isLoading ? t("loadingData") : undefined} isPaused={!isLoading} />
    </span>
  );
}
